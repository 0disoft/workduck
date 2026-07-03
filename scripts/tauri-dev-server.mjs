import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const viteCliPath = fileURLToPath(new URL('../node_modules/vite/bin/vite.js', import.meta.url));
const devServerUrl = 'http://127.0.0.1:5173/';
const prewarmRetryDelayMs = 500;
const prewarmRequestTimeoutMs = 90000;

const viteProcess = spawn(
	'node',
	[
		viteCliPath,
		'dev',
		'--host',
		'127.0.0.1',
		'--port',
		'5173',
		'--strictPort'
	],
	{
		stdio: 'inherit',
		windowsHide: true
	}
);

let isClosing = false;

function closeServer(signal) {
	if (isClosing) {
		return;
	}

	isClosing = true;
	if (viteProcess.exitCode === null && !viteProcess.killed) {
		viteProcess.kill(signal);
	}
}

process.once('SIGINT', () => {
	closeServer('SIGINT');
});
process.once('SIGTERM', () => {
	closeServer('SIGTERM');
});

viteProcess.once('exit', (code, signal) => {
	process.exit(code ?? (signal ? 0 : 1));
});

function delay(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

async function prewarmDevServer() {
	while (viteProcess.exitCode === null) {
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), prewarmRequestTimeoutMs);

		try {
			const response = await fetch(devServerUrl, { signal: controller.signal });
			if (response.ok) {
				await response.arrayBuffer();
				console.log(`Prewarmed ${devServerUrl}`);
				return;
			}

			await delay(prewarmRetryDelayMs);
		} catch {
			await delay(prewarmRetryDelayMs);
		} finally {
			clearTimeout(timeout);
		}
	}
}

void prewarmDevServer();
