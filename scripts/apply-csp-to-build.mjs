import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const indexHtmlPath = resolve(repoRoot, 'build', 'index.html');

const contentSecurityPolicyMetaPattern =
	/\s*<meta\s+http-equiv=(["'])Content-Security-Policy\1[\s\S]*?>/i;

const hashInlineTagBodies = (html, tagName) => {
	const hashes = new Set();
	const inlineTagPattern = new RegExp(`<${tagName}\\b([^>]*)>([\\s\\S]*?)<\\/${tagName}>`, 'gi');

	for (const match of html.matchAll(inlineTagPattern)) {
		const [, attributes, tagBody] = match;

		if (/\bsrc\s*=/.test(attributes)) {
			continue;
		}

		if (tagBody.length === 0) {
			continue;
		}

		const digest = createHash('sha256').update(tagBody, 'utf8').digest('base64');
		hashes.add(`'sha256-${digest}'`);
	}

	return [...hashes].sort();
};

const escapeAttribute = (value) => value.replace(/&/g, '&amp;').replace(/"/g, '&quot;');

const buildDirective = (directiveName, values) =>
	[directiveName, ...values].filter((value) => value.length > 0).join(' ');

const buildContentSecurityPolicy = ({ scriptHashes, styleHashes }) =>
	[
		"default-src 'self'",
		"base-uri 'self'",
		"object-src 'none'",
		"frame-src 'none'",
		"form-action 'self'",
		buildDirective('script-src', ["'self'", ...scriptHashes]),
		"script-src-attr 'none'",
		buildDirective('style-src', ["'self'", ...styleHashes]),
		"style-src-attr 'none'",
		"img-src 'self' data: blob:",
		"font-src 'self' data:",
		"connect-src 'self' ipc: http://ipc.localhost https://api.github.com"
	].join('; ');

const formatMeta = (contentSecurityPolicy) =>
	[
		'\t\t<meta',
		'\t\t\thttp-equiv="Content-Security-Policy"',
		`\t\t\tcontent="${escapeAttribute(contentSecurityPolicy)}"`,
		'\t\t/>'
	].join('\n');

const injectContentSecurityPolicy = (html, meta) => {
	if (contentSecurityPolicyMetaPattern.test(html)) {
		return html.replace(contentSecurityPolicyMetaPattern, `\n${meta}`);
	}

	const faviconMarker = '\n\t\t<link rel="icon"';
	if (html.includes(faviconMarker)) {
		return html.replace(faviconMarker, `\n${meta}${faviconMarker}`);
	}

	const headEndMarker = '\n\t</head>';
	if (html.includes(headEndMarker)) {
		return html.replace(headEndMarker, `\n${meta}${headEndMarker}`);
	}

	throw new Error('Unable to inject Content-Security-Policy: build/index.html has no </head>.');
};

const html = await readFile(indexHtmlPath, 'utf8');
const scriptHashes = hashInlineTagBodies(html, 'script');
const styleHashes = hashInlineTagBodies(html, 'style');
const contentSecurityPolicy = buildContentSecurityPolicy({ scriptHashes, styleHashes });
const nextHtml = injectContentSecurityPolicy(html, formatMeta(contentSecurityPolicy));

await writeFile(indexHtmlPath, nextHtml, 'utf8');

console.log(
	`Applied Content-Security-Policy with ${scriptHashes.length} inline script hash(es) and ${styleHashes.length} inline style hash(es).`
);
