import type { WorkspaceRecord } from '#lib/workspaces/workspace-registry.ts';
import { createEmptyProjectRegistry } from './project-registry';
import type { ProjectRegistryStorageError } from './project-storage';
import { createProjectBoardRegistryWriter } from './project-board-registry-writer.svelte';

export function createProjectBoardRegistryWriterHarness(initialWorkspace: WorkspaceRecord) {
	let workspace = $state(initialWorkspace);
	const state = $state({ registry: createEmptyProjectRegistry(workspace.id), storageError: null as ProjectRegistryStorageError | null });
	let persistRegistry!: ReturnType<typeof createProjectBoardRegistryWriter>;
	let readVisibleRegistry!: () => ReturnType<typeof createEmptyProjectRegistry>;
	const dispose = $effect.root(() => {
		persistRegistry = createProjectBoardRegistryWriter({
			workspace: () => workspace,
			registry: () => state.registry,
			update: (next) => { state.registry = next.registry; state.storageError = next.storageError; }
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
