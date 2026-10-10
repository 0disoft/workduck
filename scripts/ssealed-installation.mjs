import { readFile, stat } from 'node:fs/promises';
import { isAbsolute, relative, resolve } from 'node:path';

export async function readSsealedInstallation(repositoryRoot) {
	try {
		const packageRoot = resolve(repositoryRoot, 'node_modules', 'ssealed');
		const metadata = JSON.parse(await readFile(resolve(packageRoot, 'package.json'), 'utf8'));
		if (metadata?.name !== 'ssealed') {
			throw new Error('Installed package metadata does not identify ssealed.');
		}
		const entrypoint = metadata.bin?.ssealed;
		if (typeof metadata.version !== 'string' || !metadata.version.trim() ||
			metadata.version !== metadata.version.trim() ||
			typeof entrypoint !== 'string' || !entrypoint) {
			throw new Error('Installed ssealed is missing its version or CLI entrypoint.');
		}
		const cliPath = resolve(packageRoot, entrypoint);
		const relativePath = relative(packageRoot, cliPath);
		if (isAbsolute(entrypoint) || relativePath === '..' ||
			relativePath.startsWith('../') || relativePath.startsWith('..\\')) {
			throw new Error('Installed ssealed CLI entrypoint must remain inside its package.');
		}
		if (!(await stat(cliPath)).isFile()) {
			throw new Error('Installed ssealed CLI entrypoint must be a regular file.');
		}
		return { version: metadata.version, cliPath };
	} catch (error) {
		throw new Error(`Unable to use installed ssealed: ${error.message} Reinstall dependencies with bun install --force --frozen-lockfile --backend copyfile --cache-dir <new-empty-directory>.`,
			{ cause: error });
	}
}
