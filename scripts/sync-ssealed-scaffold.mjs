import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readSsealedInstallation } from './ssealed-installation.mjs';
import { collectGeneratedSsealedScaffold } from './ssealed-generated-scaffold.mjs';
import { publishSsealedArtifacts } from './ssealed-artifact-publication.mjs';
import {
	archiveSchemaVersion, scaffoldDensity, scaffoldRunner, assertCurrentArtifact,
	renderGeneratedRust, renderGeneratedTypeScript, verifyEmbeddedSsealedArtifacts, validateSsealedArchive
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
				const files = await collectGeneratedSsealedScaffold(scaffoldPath, { version, scope, profile });
				scaffolds.push({ scope, profile, files });
			} finally {
				await rm(temporaryRoot, { recursive: true, force: true });
			}
		}
	}

	const archive = buildArchive(version, scaffolds);
	validateSsealedArchive(JSON.parse(archive), {
		version, scopes: scaffoldScopes, profiles: scaffoldProfiles
	});
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

	await publishSsealedArtifacts([
		{ path: archivePath, content: archive },
		{ path: generatedRustPath, content: rustIndex },
		{ path: generatedTypeScriptPath, content: typeScriptIndex }
	]);
	console.log(
		`Synced ssealed ${version} ${scaffoldScopes.length}x${scaffoldProfiles.length} scaffolds into ${relative(repositoryRoot, archivePath)} (${archiveChecksum}).`
	);
}

await main();
