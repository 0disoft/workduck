import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readSsealedInstallation } from './ssealed-installation.mjs';
import {
	archiveSchemaVersion, scaffoldDensity, scaffoldRunner, assertCurrentArtifact,
	renderGeneratedRust, renderGeneratedTypeScript, verifyEmbeddedSsealedArtifacts
} from './ssealed-scaffold-artifacts.mjs';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = dirname(scriptDirectory);
const generatedRustPath = resolve(repositoryRoot, 'src-tauri', 'src', 'ssealed_scaffold_generated.rs');
const archivePath = resolve(repositoryRoot, 'src-tauri', 'resources', 'ssealed-scaffolds-v1.json');
const generatedTypeScriptPath = resolve(
	repositoryRoot,
	'src',
	'lib',
	'projects',
	'ssealed-scaffold-generated.ts'
);
const checkOnly = process.argv.includes('--check');
const checkEmbedded = process.argv.includes('--check-embedded');
const writeOutput = process.argv.includes('--write');

if ([checkOnly, checkEmbedded, writeOutput].filter(Boolean).length !== 1) {
	throw new Error('Choose exactly one mode: --check, --check-embedded, or --write.');
}

const rustKeywordKinds = new Set([
	'agent',
	'checklist',
	'contract',
	'diagram',
	'document',
	'github',
	'hygiene',
	'validation'
]);

async function readSsealedOptionList(name) {
	const typesPath = resolve(repositoryRoot, 'node_modules', 'ssealed', 'dist', 'core', 'types.js');
	const typesModule = await import(pathToFileURL(typesPath).href);
	const values = typesModule[name];
	if (
		!Array.isArray(values) ||
		values.length === 0 ||
		values.some((value) => typeof value !== 'string' || value.trim().length === 0)
	) {
		throw new Error(`Unable to read ssealed ${name}.`);
	}
	return [...values];
}

async function collectFiles(rootPath) {
	const entries = [];
	async function visit(directoryPath) {
		for (const entry of await readdir(directoryPath, { withFileTypes: true })) {
			const absolutePath = join(directoryPath, entry.name);
			if (entry.isDirectory()) {
				await visit(absolutePath);
			} else if (entry.isFile()) {
				const relativePath = relative(rootPath, absolutePath).split(sep).join('/');
				if (relativePath !== '.ssealed/manifest.json') entries.push({ path: relativePath, absolutePath });
			}
		}
	}

	await visit(rootPath);
	return entries.sort((left, right) => left.path.localeCompare(right.path));
}

function normalizeKind(value) {
	return typeof value === 'string' && rustKeywordKinds.has(value) ? value : 'document';
}

async function readManifestKindMap(scaffoldPath) {
	const manifest = JSON.parse(await readFile(join(scaffoldPath, '.ssealed', 'manifest.json'), 'utf8'));
	const kindsByPath = new Map();
	if (!Array.isArray(manifest.files)) return kindsByPath;

	for (const file of manifest.files) {
		if (typeof file?.path === 'string' && !kindsByPath.has(file.path)) {
			kindsByPath.set(file.path, normalizeKind(file.kind));
		}
	}
	return kindsByPath;
}

async function runSsealedInit(cliPath, temporaryRoot, scope, profile) {
	const verbose = process.env.SSEALED_SYNC_VERBOSE === '1';
	const result = spawnSync(process.execPath, [
		cliPath,
		'init', 'scaffold', '--scope', scope, '--profile', profile,
		'--density', scaffoldDensity, '--runner', scaffoldRunner, '--yes'
	], {
		cwd: temporaryRoot,
		env: process.env,
		encoding: 'utf8',
		stdio: verbose ? 'inherit' : ['ignore', 'pipe', 'pipe'],
		windowsHide: true
	});

	if (result.error) throw result.error;
	if (result.status !== 0) {
		if (!verbose) {
			if (result.stdout) console.error(result.stdout);
			if (result.stderr) console.error(result.stderr);
		}
		throw new Error(`ssealed init failed with exit code ${result.status ?? 1}.`);
	}
}

function buildArchive(version, scaffolds) {
	const contents = [];
	const contentIndexes = new Map();
	const archivedScaffolds = scaffolds.map((scaffold) => ({
		scope: scaffold.scope,
		profile: scaffold.profile,
		files: scaffold.files.map((file) => {
			let content = contentIndexes.get(file.content);
			if (content === undefined) {
				content = contents.length;
				contents.push(file.content);
				contentIndexes.set(file.content, content);
			}
			return { path: file.path, kind: file.kind, content };
		})
	}));

	return `${JSON.stringify({
		schemaVersion: archiveSchemaVersion,
		toolVersion: version,
		density: scaffoldDensity,
		runner: scaffoldRunner,
		contents,
		scaffolds: archivedScaffolds
	})}\n`;
}

async function main() {
	const { version, cliPath } = await readSsealedInstallation(repositoryRoot);
	const scaffoldScopes = await readSsealedOptionList('scopes');
	const scaffoldProfiles = await readSsealedOptionList('profiles');
	if (checkEmbedded) {
		const checksum = await verifyEmbeddedSsealedArtifacts(repositoryRoot, {
			version, scopes: scaffoldScopes, profiles: scaffoldProfiles
		});
		console.log(`Verified embedded ssealed ${version} metadata and checksum (${checksum}).`);
		return;
	}
	const scaffolds = [];

	for (const scope of scaffoldScopes) {
		for (const profile of scaffoldProfiles) {
			const temporaryRoot = await mkdtemp(join(tmpdir(), 'workduck-ssealed-sync-'));
			const scaffoldPath = join(temporaryRoot, 'scaffold');
			try {
				await runSsealedInit(cliPath, temporaryRoot, scope, profile);
				const kindsByPath = await readManifestKindMap(scaffoldPath);
				const files = [];
				for (const file of await collectFiles(scaffoldPath)) {
					files.push({
						path: file.path,
						kind: kindsByPath.get(file.path) ?? 'document',
						content: await readFile(file.absolutePath, 'utf8')
					});
				}
				scaffolds.push({ scope, profile, files });
			} finally {
				await rm(temporaryRoot, { recursive: true, force: true });
			}
		}
	}

	const archive = buildArchive(version, scaffolds);
	const archiveChecksum = createHash('sha256').update(archive).digest('hex');
	const rustIndex = renderGeneratedRust({ version, archiveChecksum });
	const typeScriptIndex = renderGeneratedTypeScript({ scopes: scaffoldScopes, profiles: scaffoldProfiles });

	if (checkOnly) {
		await assertCurrentArtifact(repositoryRoot, archivePath, archive);
		await assertCurrentArtifact(repositoryRoot, generatedRustPath, rustIndex);
		await assertCurrentArtifact(repositoryRoot, generatedTypeScriptPath, typeScriptIndex);
		console.log(`Verified embedded ssealed ${version} scaffold archive (${archiveChecksum}).`);
		return;
	}

	await mkdir(dirname(archivePath), { recursive: true });
	await writeFile(archivePath, archive, 'utf8');
	await writeFile(generatedRustPath, rustIndex, 'utf8');
	await writeFile(generatedTypeScriptPath, typeScriptIndex, 'utf8');
	console.log(
		`Synced ssealed ${version} ${scaffoldScopes.length}x${scaffoldProfiles.length} scaffolds into ${relative(repositoryRoot, archivePath)} (${archiveChecksum}).`
	);
}

await main();
