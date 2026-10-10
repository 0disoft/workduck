import { describe, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import {
	archiveSchemaVersion, renderGeneratedRust, renderGeneratedTypeScript,
	verifyEmbeddedSsealedArtifacts
} from './ssealed-scaffold-artifacts.mjs';

const installation = { version: '0.7.79', scopes: ['backend'], profiles: ['generic', 'api-service'] };
const archiveRelativePath = 'src-tauri/resources/ssealed-scaffolds-v1.json';
const rustRelativePath = 'src-tauri/src/ssealed_scaffold_generated.rs';
const tsRelativePath = 'src/lib/projects/ssealed-scaffold-generated.ts';

async function writeArtifacts(root, mutate = () => {}) {
	const archive = {
		schemaVersion: archiveSchemaVersion, toolVersion: installation.version,
		density: 'standard', runner: 'none', contents: ['# Example'],
		scaffolds: installation.profiles.map((profile) => ({
			scope: 'backend', profile, files: [{ path: 'AGENTS.md', kind: 'agent', content: 0 }]
		}))
	};
	mutate(archive);
	const raw = JSON.stringify(archive) + '\n';
	const checksum = createHash('sha256').update(raw).digest('hex');
	const artifacts = [
		[archiveRelativePath, raw],
		[rustRelativePath, renderGeneratedRust({ version: installation.version, archiveChecksum: checksum })],
		[tsRelativePath, renderGeneratedTypeScript(installation)]
	];
	for (const [path, content] of artifacts) {
		await mkdir(dirname(join(root, path)), { recursive: true });
		await writeFile(join(root, path), content);
	}
	return checksum;
}

async function withArtifacts(run) {
	const root = await mkdtemp(join(tmpdir(), 'workduck-ssealed-artifacts-'));
	try {
		const checksum = await writeArtifacts(root);
		await run(root, checksum);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
}

describe('embedded ssealed build guard', () => {
	test('accepts a consistent archive and frontend/native indexes', async () => {
		await withArtifacts(async (root, checksum) => {
			expect(await verifyEmbeddedSsealedArtifacts(root, installation)).toBe(checksum);
		});
	});

	test('requires regeneration after changing the installed dependency version', async () => {
		await withArtifacts(async (root) => {
			await expect(verifyEmbeddedSsealedArtifacts(root, { ...installation, version: '0.7.80' }))
				.rejects.toThrow('does not match installed ssealed');
		});
	});

	test('rejects modified archive contents before a build can embed them', async () => {
		await withArtifacts(async (root) => {
			const path = join(root, archiveRelativePath);
			const archive = JSON.parse(await readFile(path, 'utf8'));
			archive.contents[0] = 'unexpected modification';
			await writeFile(path, JSON.stringify(archive) + '\n');
			await expect(verifyEmbeddedSsealedArtifacts(root, installation)).rejects.toThrow('is stale');
		});
	});

	test('rejects missing and duplicate scope/profile combinations even with a matching checksum', async () => {
		await withArtifacts(async (root) => {
			await writeArtifacts(root, (archive) => { archive.scaffolds.pop(); });
			await expect(verifyEmbeddedSsealedArtifacts(root, installation)).rejects.toThrow('incomplete');
			await writeArtifacts(root, (archive) => { archive.scaffolds[1] = archive.scaffolds[0]; });
			await expect(verifyEmbeddedSsealedArtifacts(root, installation)).rejects.toThrow('invalid');
		});
	});

	test('rejects a stale frontend index and missing native index', async () => {
		await withArtifacts(async (root) => {
			await writeFile(join(root, tsRelativePath), renderGeneratedTypeScript({
				...installation, profiles: ['generic']
			}));
			await expect(verifyEmbeddedSsealedArtifacts(root, installation)).rejects.toThrow('is stale');
			await writeArtifacts(root);
			await rm(join(root, rustRelativePath));
			await expect(verifyEmbeddedSsealedArtifacts(root, installation)).rejects.toThrow('is missing');
		});
	});
});
