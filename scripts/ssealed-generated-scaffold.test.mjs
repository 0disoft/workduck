import { describe, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { collectGeneratedSsealedScaffold } from './ssealed-generated-scaffold.mjs';

const selection = { version: '0.7.79', scope: 'backend', profile: 'generic' };
const content = '# User-facing instructions\r\n';

async function withScaffold(run) {
	const root = await mkdtemp(join(tmpdir(), 'workduck-generated-scaffold-'));
	try {
		const scaffold = join(root, 'scaffold');
		await mkdir(join(scaffold, '.ssealed'), { recursive: true });
		await writeFile(join(scaffold, 'AGENTS.md'), content);
		const manifest = {
			tool: 'ssealed', schemaVersion: 1, version: selection.version,
			generatorVersion: selection.version, scope: selection.scope, profile: selection.profile,
			density: 'standard', runner: 'none', addons: [],
			files: [{ path: 'AGENTS.md', kind: 'agent',
				checksum: 'sha256:' + createHash('sha256').update(content).digest('hex') }]
		};
		const save = () => writeFile(join(scaffold, '.ssealed/manifest.json'), JSON.stringify(manifest));
		await save();
		await run({ root, scaffold, manifest, save });
	} finally {
		await rm(root, { recursive: true, force: true });
	}
}

describe('generated ssealed scaffold import', () => {
	test('imports the exact contents and kinds registered by the CLI', async () => {
		await withScaffold(async ({ scaffold }) => {
			expect(await collectGeneratedSsealedScaffold(scaffold, selection))
				.toEqual([{ path: 'AGENTS.md', kind: 'agent', content }]);
		});
	});

	test('rejects mismatched CLI builds and settings', async () => {
		for (const [key, value] of [
			['version', '0.7.0'], ['generatorVersion', '0.7.0'], ['scope', 'frontend'],
			['profile', 'library'], ['density', 'strict'], ['runner', 'npm'], ['addons', ['sdk']]
		]) {
			await withScaffold(async ({ scaffold, manifest, save }) => {
				manifest[key] = value;
				await save();
				await expect(collectGeneratedSsealedScaffold(scaffold, selection)).rejects.toThrow('does not match');
			});
		}
	});

	test('rejects invalid or duplicate file records', async () => {
		for (const mutate of [
			(manifest) => { manifest.files = undefined; },
			(manifest) => { manifest.files.push({ ...manifest.files[0] }); },
			(manifest) => { manifest.files[0].kind = null; }
		]) {
			await withScaffold(async ({ scaffold, manifest, save }) => {
				mutate(manifest);
				await save();
				await expect(collectGeneratedSsealedScaffold(scaffold, selection)).rejects.toThrow();
			});
		}
	});

	test('rejects missing, unregistered, and modified generated files', async () => {
		for (const mutate of [
			async (scaffold) => rm(join(scaffold, 'AGENTS.md')),
			async (scaffold) => writeFile(join(scaffold, 'extra.md'), 'unregistered'),
			async (scaffold) => writeFile(join(scaffold, 'AGENTS.md'), 'changed after generation')
		]) {
			await withScaffold(async ({ scaffold }) => {
				await mutate(scaffold);
				await expect(collectGeneratedSsealedScaffold(scaffold, selection)).rejects.toThrow();
			});
		}
	});

	test('rejects generated directory links instead of silently skipping or following them', async () => {
		await withScaffold(async ({ root, scaffold }) => {
			const external = join(root, 'external');
			await mkdir(external);
			await writeFile(join(external, 'outside.md'), 'external content');
			await symlink(external, join(scaffold, 'linked'), process.platform === 'win32' ? 'junction' : 'dir');
			await expect(collectGeneratedSsealedScaffold(scaffold, selection)).rejects.toThrow('unsupported entry');
		});
	});
});
