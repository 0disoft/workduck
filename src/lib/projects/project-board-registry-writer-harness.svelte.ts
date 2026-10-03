import type { WorkspaceRecord } from '#lib/workspaces/workspace-registry.ts';
import { createEmptyProjectRegistry } from './project-registry';
import type { ProjectRegistryStorageError } from './project-storage';
import { createProjectBoardRegistryWriter } from './project-board-registry-writer.svelte';

export function createProjectBoardRegistryWriterHarness(initialWorkspace: WorkspaceRecord) {
	let workspace = $state(initialWorkspace);
	const state = $state({ registry: createEmptyProjectRegistry(workspace.id), storageError: null as ProjectRegistryStorageError | null });
	let persistRegistry!: ReturnType<typeof createProjectBoardRegistryWriter>;
	const dispose = $effect.root(() => {
		persistRegistry = createProjectBoardRegistryWriter({
			workspace: () => workspace,
			update: (next) => { state.registry = next.registry; state.storageError = next.storageError; }
		});
	});
	return {
		state, persistRegistry, dispose,
		setWorkspace(next: WorkspaceRecord) { workspace = next; },
	};
}
