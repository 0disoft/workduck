import type { WorkspaceRecord } from '#lib/workspaces/workspace-registry.ts';
import type { EnvironmentVault } from '#lib/environment/environment-vault.ts';
import type { SecretVaultEnvelope } from '#lib/environment/secret-vault-crypto.ts';
import type { ProjectFolderError } from './project-folder';
import type { ProjectRepositoryOperation } from './project-board-operations';
import type { ProjectRepositoryOperationStorageError } from './project-operation-storage';
import { createEmptyProjectRegistry } from './project-registry';
import type { ProjectRegistryStorageError } from './project-storage';
import ProjectBoardWorkspaceLifecycle from './ProjectBoardWorkspaceLifecycle.svelte';

// Run the actual script-only component with reactive props and normal teardown.
export function createProjectBoardWorkspaceLifecycleHarness(initialWorkspace: WorkspaceRecord) {
	let workspace = $state(initialWorkspace);
	const state = $state({
		registry: createEmptyProjectRegistry(''),
		registryReadScope: null as string | null,
		storageError: null as ProjectRegistryStorageError | null,
		operationStorageError: null as ProjectRepositoryOperationStorageError | null,
		folderRepairError: null as ProjectFolderError | null,
		folderRepairSignature: '',
		selectedProjectId: null as string | null,
		selectedGroupId: null as string | null,
		environmentVaultEnvelope: null as SecretVaultEnvelope | null,
		environmentVault: null as EnvironmentVault | null,
		environmentVaultPassword: '',
		environmentVaultError: null as string | null,
		repositoryOperationById: {} as Record<string, ProjectRepositoryOperation>
	});
	const props = Object.defineProperty({}, 'workspace', { get: () => workspace }) as
		{ readonly workspace: WorkspaceRecord } & typeof state;
	for (const field of Object.keys(state)) {
		Object.defineProperty(props, field, {
			get: () => Reflect.get(state, field),
			set: (value: unknown) => { Reflect.set(state, field, value); }
		});
	}
	const dispose = $effect.root(() => {
		ProjectBoardWorkspaceLifecycle(null as never, props);
	});
	return { state, setWorkspace(next: WorkspaceRecord) { workspace = next; }, dispose };
}
