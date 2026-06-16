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

const workduckSharedManualChunkPrefixes = [
	['/src/lib/shared/', 'workduck-shared'],
	['/src/lib/agents/agent-evaluation', 'workduck-agent-core'],
	['/src/lib/agents/agent-execution', 'workduck-agent-core'],
	['/src/lib/agents/agent-model-options', 'workduck-agent-core'],
	['/src/lib/agents/agent-registry', 'workduck-agent-core'],
	['/src/lib/personas/persona-prompt', 'workduck-persona-core'],
	['/src/lib/personas/persona-registry', 'workduck-persona-core'],
	['/src/lib/skills/skill-registry', 'workduck-skill-core'],
	['/src/lib/projects/project-folder', 'workduck-project-core'],
	['/src/lib/projects/project-registry', 'workduck-project-core'],
	['/src/lib/projects/project-repository', 'workduck-project-core'],
	['/src/lib/projects/project-storage', 'workduck-project-core']
] as const;

function getWorkduckManualChunk(normalizedId: string) {
	return getChunkFromPrefixes(normalizedId, workduckSharedManualChunkPrefixes);
}

function getChunkFromPrefixes(
	normalizedId: string,
	prefixes: readonly (readonly [string, string])[]
) {
	for (const [prefix, chunkName] of prefixes) {
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
