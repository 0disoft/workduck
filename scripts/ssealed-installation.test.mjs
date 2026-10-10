import { describe, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readSsealedInstallation } from './ssealed-installation.mjs';

async function withInstallation(metadata, run) {
	const root = await mkdtemp(join(tmpdir(), 'workduck ssealed install '));
	try {
		const packageRoot = join(root, 'node_modules', 'ssealed');
		await mkdir(join(packageRoot, 'dist'), { recursive: true });
		await writeFile(join(packageRoot, 'package.json'), JSON.stringify(metadata === null ? null : { name: 'ssealed', ...metadata }));
		await writeFile(join(packageRoot, 'dist', 'cli.js'),
			'console.log(JSON.stringify(process.argv.slice(2)));');
		await mkdir(join(root, 'node_modules', '.bin'));
		await writeFile(join(root, 'node_modules', '.bin', 'ssealed.cmd'), 'exit /b 99');
		await run(root);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
}

describe('installed ssealed CLI', () => {
	test('uses the package entrypoint with spaces and literal arguments instead of a shim', async () => {
		await withInstallation({ version: '0.7.79', bin: { ssealed: 'dist/cli.js' } }, async (root) => {
			const { cliPath, version } = await readSsealedInstallation(root);
			const args = ['init', 'a folder & another', '--scope', 'backend'];
			for (const runtime of new Set([process.execPath, 'node'])) {
				const result = spawnSync(runtime, [cliPath, ...args], { encoding: 'utf8' });
				expect(result.error).toBeUndefined();
				expect(result.status).toBe(0);
				expect(JSON.parse(result.stdout)).toEqual(args);
			}
			expect(version).toBe('0.7.79');
		});
	});

	test('rejects incomplete installations', async () => {
		await withInstallation({ version: '0.7.79' }, async (root) => {
			await expect(readSsealedInstallation(root)).rejects.toThrow('CLI entrypoint');
		});
		await withInstallation({ version: '0.7.79', bin: { ssealed: 'dist/missing.js' } }, async (root) => {
			await expect(readSsealedInstallation(root)).rejects.toThrow();
		});
	});

	test('rejects package entrypoints outside the installed package', async () => {
		await withInstallation({ version: '0.7.79', bin: { ssealed: '../another/cli.js' } }, async (root) => {
			await expect(readSsealedInstallation(root)).rejects.toThrow('inside its package');
		});
	});

	test('rejects a directory masquerading as the CLI entrypoint', async () => {
		await withInstallation({ version: '0.7.79', bin: { ssealed: 'dist' } }, async (root) => {
			await expect(readSsealedInstallation(root)).rejects.toThrow('regular file');
		});
	});

	test('reports an actionable reinstall command for damaged metadata', async () => {
		for (const metadata of [null, { name: 'another-package', version: '0.7.79', bin: { ssealed: 'dist/cli.js' } }]) {
			await withInstallation(metadata, async (root) => {
				await expect(readSsealedInstallation(root)).rejects.toThrow('bun install --force --frozen-lockfile --backend copyfile --cache-dir <new-empty-directory>');
			});
		}
	});
});
