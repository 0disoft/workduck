import type { WorkspaceRecord } from '#lib/workspaces/workspace-registry.ts';
import { createEmptyProjectRegistry } from './project-registry';
import type { ProjectRegistryStorageError } from './project-storage';
import { createProjectBoardRegistryWriter } from './project-board-registry-writer.svelte';

export function createProjectBoardRegistryWriterHarness(initialWorkspace: WorkspaceRecord) {
	let workspace = $state(initialWorkspace);
	const state = $state({ registry: createEmptyProjectRegistry(workspace.id), registryReady: true, storageError: null as ProjectRegistryStorageError | null });
	let persistRegistry!: ReturnType<typeof createProjectBoardRegistryWriter>;
	let readVisibleRegistry!: () => ReturnType<typeof createEmptyProjectRegistry>;
	const dispose = $effect.root(() => {
		persistRegistry = createProjectBoardRegistryWriter({
			workspace: () => workspace,
			registry: () => state.registry,
			registryReady: () => state.registryReady,
			update: (next) => {
				state.registry = next.registry;
				state.storageError = next.storageError;
				if (next.storageError === null) state.registryReady = true;
				else if (next.storageError === 'project-registry-read-failed' || next.storageError === 'project-registry-version-unsupported') state.registryReady = false;
			}
		});
		const visibleRegistry = $derived(persistRegistry.getRegistry());
		readVisibleRegistry = () => visibleRegistry;
	});
	return {
		state, persistRegistry, dispose,
		getRegistry() { return persistRegistry.getRegistry(); },
		get visibleRegistry() { return readVisibleRegistry(); },
		get visibleError() { return persistRegistry.getSaveError() ?? state.storageError; },
		setWorkspace(next: WorkspaceRecord) { workspace = next; },
	};
}
