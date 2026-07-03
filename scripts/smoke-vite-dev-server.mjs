import { spawn } from 'node:child_process';

const devUrl = 'http://127.0.0.1:5173/';
const startupTimeoutMs = 100000;
const probeIntervalMs = 500;
const requestTimeoutMs = 90000;
const outputTailLimit = 12000;

let outputTail = '';
let isClosing = false;

function appendOutput(chunk) {
	outputTail += chunk.toString();
	if (outputTail.length > outputTailLimit) {
		outputTail = outputTail.slice(outputTail.length - outputTailLimit);
	}
}

function delay(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

const devProcess = spawn(process.execPath, ['run', 'dev:tauri'], {
	stdio: ['ignore', 'pipe', 'pipe'],
	windowsHide: true
});

devProcess.stdout.on('data', appendOutput);
devProcess.stderr.on('data', appendOutput);

function closeDevProcess() {
	if (isClosing) {
		return;
	}

	isClosing = true;
	if (devProcess.exitCode === null && !devProcess.killed) {
		devProcess.kill('SIGTERM');
	}
}

process.once('SIGINT', () => {
	closeDevProcess();
	process.exit(130);
});

process.once('SIGTERM', () => {
	closeDevProcess();
	process.exit(143);
});

async function probeDevServer() {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);

	try {
		const response = await fetch(devUrl, { signal: controller.signal });
		if (!response.ok) {
			return false;
		}

		const body = await response.text();
		return body.includes('workduck-svelte-root') || body.includes('__sveltekit_dev');
	} catch {
		return false;
	} finally {
		clearTimeout(timeout);
	}
}

try {
	const startedAt = Date.now();
	let isReady = false;

	while (Date.now() - startedAt < startupTimeoutMs) {
		if (devProcess.exitCode !== null) {
			throw new Error(`dev server exited early with code ${devProcess.exitCode}`);
		}

		if (await probeDevServer()) {
			isReady = true;
			break;
		}

		await delay(probeIntervalMs);
	}

	if (!isReady) {
		throw new Error(`dev server did not answer ${devUrl} within ${startupTimeoutMs}ms`);
	}

	console.log(`Vite dev server answered ${devUrl}`);
} catch (error) {
	console.error(error instanceof Error ? error.message : String(error));
	if (outputTail.trim().length > 0) {
		console.error('--- dev server output tail ---');
		console.error(outputTail.trim());
	}
	process.exitCode = 1;
} finally {
	closeDevProcess();
}
