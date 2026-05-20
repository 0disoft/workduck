import { createServer } from 'vite';

const server = await createServer({
	clearScreen: false,
	configFile: 'vite.config.ts'
});

await server.listen();
server.printUrls();

let isClosing = false;

async function closeServer() {
	if (isClosing) {
		return;
	}

	isClosing = true;
	await server.close();
	process.exit(0);
}

process.once('SIGINT', () => {
	void closeServer();
});
process.once('SIGTERM', () => {
	void closeServer();
});

await new Promise(() => {});
