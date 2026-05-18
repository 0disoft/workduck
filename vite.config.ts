import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [tailwindcss(), sveltekit()],
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
		port: 5173,
		strictPort: true
	}
});
