import { describe, expect, test } from 'bun:test';
import { mkdtemp, mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { publishSsealedArtifacts } from './ssealed-artifact-publication.mjs';

async function withArtifacts(run) {
	const root = await mkdtemp(join(tmpdir(), 'workduck-artifact-publication-'));
	try {
		const paths = ['archive.json', 'index.rs', 'options.ts'].map((name) => join(root, name));
		for (const path of paths) await writeFile(path, 'original');
		const artifacts = paths.map((path) => ({ path, content: 'next content' }));
		await run({ root, paths, artifacts });
	} finally {
		await rm(root, { recursive: true, force: true });
	}
}

async function assertClean(root) {
	expect((await readdir(root)).filter((name) =>
		name.startsWith('.workduck-ssealed-stage-') || name.endsWith('.workduck-ssealed-publish.lock'))).toEqual([]);
}

describe('ssealed artifact publication', () => {
	test('preserves an existing lock and releases locks acquired before it', async () => {
		await withArtifacts(async ({ root, paths, artifacts }) => {
			const lockPath = `${paths[1]}.workduck-ssealed-publish.lock`;
			await writeFile(lockPath, 'another publisher');
			await expect(publishSsealedArtifacts(artifacts)).rejects.toThrow('publication lock');
			for (const path of paths) expect(await readFile(path, 'utf8')).toBe('original');
			expect(await readFile(lockPath, 'utf8')).toBe('another publisher');
			await rm(lockPath);
			await assertClean(root);
		});
	});

	test('does not remove a lock replaced by another owner', async () => {
		await withArtifacts(async ({ root, paths, artifacts }) => {
			const lockPath = `${paths[0]}.workduck-ssealed-publish.lock`;
			await expect(publishSsealedArtifacts(artifacts, {
				renameFile: async (from, to) => {
					await rename(from, to);
					if (to === paths[0]) {
						await rename(lockPath, join(root, 'original-owner.lock'));
						await writeFile(lockPath, 'replacement owner');
					}
				}
			})).rejects.toThrow('Preserved a replaced ssealed publication lock');
			expect(await readFile(lockPath, 'utf8')).toBe('replacement owner');
			for (const path of paths) expect(await readFile(path, 'utf8')).toBe('next content');
		});
	});

	test('rejects a competing publisher before it can overwrite a paused publication', async () => {
		await withArtifacts(async ({ root, paths, artifacts }) => {
			let signalStarted;
			let resume;
			const started = new Promise((resolve) => { signalStarted = resolve; });
			const paused = new Promise((resolve) => { resume = resolve; });
			const first = publishSsealedArtifacts(artifacts, {
				renameFile: async (from, to) => {
					if (to === paths[0] && from.endsWith('next')) {
						signalStarted();
						await paused;
					}
					await rename(from, to);
				}
			});
			first.catch(signalStarted);
			try {
				await started;
				const competing = artifacts.map((artifact) => ({ ...artifact, content: 'competing content' }));
				await expect(publishSsealedArtifacts(competing)).rejects.toThrow('publication lock');
			} finally {
				resume();
				await first;
			}
			for (const path of paths) expect(await readFile(path, 'utf8')).toBe('next content');
			await assertClean(root);
		});
	});

	test('publishes staged outputs and avoids rewriting identical outputs', async () => {
		await withArtifacts(async ({ root, paths, artifacts }) => {
			await rm(paths[2]);
			await publishSsealedArtifacts(artifacts);
			for (const path of paths) expect(await readFile(path, 'utf8')).toBe('next content');
			await publishSsealedArtifacts(artifacts, { renameFile: () => { throw new Error('unexpected rewrite'); } });
			await assertClean(root);
		});
	});

	test('preparation failure leaves all existing outputs intact', async () => {
		await withArtifacts(async ({ root, paths, artifacts }) => {
			await rm(paths[1]);
			await mkdir(paths[1]);
			await expect(publishSsealedArtifacts(artifacts)).rejects.toThrow('not a regular file');
			expect(await readFile(paths[0], 'utf8')).toBe('original');
			expect(await readFile(paths[2], 'utf8')).toBe('original');
			await assertClean(root);
		});
	});

	test('a later publication failure restores old outputs and removes newly created outputs', async () => {
		for (const firstMissing of [false, true]) {
			await withArtifacts(async ({ root, paths, artifacts }) => {
				if (firstMissing) await rm(paths[0]);
				await expect(publishSsealedArtifacts(artifacts, {
					renameFile: async (from, to) => {
						if (to === paths[1]) throw new Error('simulated locked target');
						await rename(from, to);
					}
				})).rejects.toThrow('simulated locked target');
				if (firstMissing) await expect(readFile(paths[0])).rejects.toThrow();
				else expect(await readFile(paths[0], 'utf8')).toBe('original');
				expect(await readFile(paths[1], 'utf8')).toBe('original');
				expect(await readFile(paths[2], 'utf8')).toBe('original');
				await assertClean(root);
			});
		}
	});

	test('a concurrent edit is preserved and earlier outputs are rolled back', async () => {
		await withArtifacts(async ({ root, paths, artifacts }) => {
			await expect(publishSsealedArtifacts(artifacts, {
				renameFile: async (from, to) => {
					await rename(from, to);
					if (from.endsWith('next')) await writeFile(paths[1], 'user edit');
				}
			})).rejects.toThrow('changed during publication');
			expect(await readFile(paths[0], 'utf8')).toBe('original');
			expect(await readFile(paths[1], 'utf8')).toBe('user edit');
			expect(await readFile(paths[2], 'utf8')).toBe('original');
			await assertClean(root);
		});
	});

	test('rollback preserves later edits and reports retained original backups', async () => {
		await withArtifacts(async ({ root, paths, artifacts }) => {
			await expect(publishSsealedArtifacts(artifacts, {
				renameFile: async (from, to) => {
					if (to === paths[1]) {
						await writeFile(paths[0], 'user edit after publication');
						throw new Error('publication failed');
					}
					await rename(from, to);
				}
			})).rejects.toThrow('Retained backups:');
			expect(await readFile(paths[0], 'utf8')).toBe('user edit after publication');
			const backups = (await readdir(root)).filter((name) => name.startsWith('.workduck-ssealed-stage-'));
			expect(backups.length).toBe(1);
			expect(backups[0]).toContain('archive.json');
			expect(await readFile(join(root, backups[0], 'previous'), 'utf8')).toBe('original');
		});
	});
});
