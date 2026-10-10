import { access, readFile } from 'node:fs/promises';
import { isAbsolute, relative, resolve } from 'node:path';

export async function readSsealedInstallation(repositoryRoot) {
	const packageRoot = resolve(repositoryRoot, 'node_modules', 'ssealed');
	const metadata = JSON.parse(await readFile(resolve(packageRoot, 'package.json'), 'utf8'));
	const entrypoint = metadata.bin?.ssealed;
	if (typeof metadata.version !== 'string' || !metadata.version ||
		typeof entrypoint !== 'string' || !entrypoint) {
		throw new Error('Installed ssealed is missing its version or CLI entrypoint; reinstall dependencies.');
	}
	const cliPath = resolve(packageRoot, entrypoint);
	const relativePath = relative(packageRoot, cliPath);
	if (isAbsolute(entrypoint) || relativePath === '..' ||
		relativePath.startsWith('../') || relativePath.startsWith('..\\')) {
		throw new Error('Installed ssealed CLI entrypoint must remain inside its package.');
	}
	await access(cliPath);
	return { version: metadata.version, cliPath };
}
