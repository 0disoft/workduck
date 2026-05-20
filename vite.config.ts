import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

const devWatchIgnoredPaths = [
	'**/.git/**',
	'**/.mustflow/backups/**',
	'**/.svelte-kit/**',
	'**/build/**',
	'**/node_modules/**',
	'**/src-tauri/target/**'
];

export default defineConfig({
	plugins: [sveltekit()],
	build: {
		rollupOptions: {
			output: {
				manualChunks(id) {
					const normalizedId = id.replace(/\\/g, '/');

					if (normalizedId.includes('/node_modules/@tauri-apps/')) {
						return 'tauri';
					}
				}
			}
		}
	},
	server: {
		host: '127.0.0.1',
		port: 5173,
		strictPort: true,
		watch: {
			ignored: devWatchIgnoredPaths
		}
	}
});
