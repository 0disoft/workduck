import { readFileSync } from 'node:fs';
import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

interface WorkduckPackageManifest {
	version?: string;
}

const workduckPackageManifest = JSON.parse(
	readFileSync(new URL('./package.json', import.meta.url), 'utf8')
) as WorkduckPackageManifest;

const workduckVersion = workduckPackageManifest.version ?? '0.0.0';

const devWatchIgnoredPaths = [
	'**/.git/**',
	'**/.mustflow/backups/**',
	'**/.svelte-kit/**',
	'**/build/**',
	'**/node_modules/**',
	'**/src-tauri/target/**'
];

export default defineConfig({
	plugins: [
		sveltekit({
			compilerOptions: {
				runes: ({ filename }) => (filename.split(/[/\\]/).includes('node_modules') ? undefined : true)
			},
			adapter: adapter({ fallback: 'index.html' }),
			version: { pollInterval: 0 }
		})
	],
	define: {
		__WORKDUCK_VERSION__: JSON.stringify(workduckVersion)
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
