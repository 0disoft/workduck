import { readFileSync } from 'node:fs';
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

const workduckManualChunkPrefixes = [
	['/src/lib/projects/', 'workduck-projects'],
	['/src/lib/queue/', 'workduck-queue'],
	['/src/lib/settings/', 'workduck-settings'],
	['/src/lib/references/', 'workduck-references'],
	['/src/lib/environment/', 'workduck-environment'],
	['/src/lib/agents/', 'workduck-agents'],
	['/src/lib/personas/', 'workduck-personas'],
	['/src/lib/skills/', 'workduck-skills'],
	['/src/lib/terminals/', 'workduck-terminals'],
	['/src/lib/processes/', 'workduck-processes'],
	['/src/lib/shell/', 'workduck-shell']
] as const;

function getWorkduckManualChunk(normalizedId: string) {
	for (const [prefix, chunkName] of workduckManualChunkPrefixes) {
		if (normalizedId.includes(prefix)) {
			return chunkName;
		}
	}

	return undefined;
}

function getVendorManualChunk(normalizedId: string) {
	if (!normalizedId.includes('/node_modules/')) {
		return undefined;
	}

	if (normalizedId.includes('/node_modules/@tauri-apps/')) {
		return 'vendor-tauri';
	}

	if (
		normalizedId.includes('/node_modules/svelte/') ||
		normalizedId.includes('/node_modules/@sveltejs/')
	) {
		return 'vendor-svelte';
	}

	return 'vendor';
}

export default defineConfig({
	plugins: [sveltekit()],
	define: {
		__WORKDUCK_VERSION__: JSON.stringify(workduckVersion)
	},
	build: {
		rollupOptions: {
			output: {
				manualChunks(id) {
					const normalizedId = id.replace(/\\/g, '/');

					return getVendorManualChunk(normalizedId) ?? getWorkduckManualChunk(normalizedId);
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
