import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = dirname(scriptDirectory);

function localBinary(name) {
	const binaryDirectory = resolve(repositoryRoot, 'node_modules', '.bin');
	const candidates =
		process.platform === 'win32'
			? [`${name}.exe`, `${name}.cmd`, `${name}.bunx`, name]
			: [name, `${name}.bunx`];

	for (const candidate of candidates) {
		const candidatePath = resolve(binaryDirectory, candidate);

		if (existsSync(candidatePath)) {
			return candidatePath;
		}
	}

	return resolve(binaryDirectory, candidates[0]);
}

function run(command, args, options = {}) {
	const result = spawnSync(command, args, {
		cwd: repositoryRoot,
		env: process.env,
		stdio: 'inherit',
		windowsHide: true
	});

	if (result.error) {
		if (options.allowFailure) {
			console.warn(`${options.label ?? command}: ${result.error.message}`);
			return;
		}

		throw result.error;
	}

	if (result.status !== 0 && !options.allowFailure) {
		throw new Error(`${options.label ?? command} failed with exit code ${result.status ?? 1}.`);
	}
}

run(localBinary('svelte-kit'), ['sync'], {
	allowFailure: true,
	label: 'svelte-kit sync'
});
run(process.execPath, [resolve(scriptDirectory, 'sync-ssealed-scaffold.mjs')], {
	label: 'sync-ssealed-scaffold'
});
