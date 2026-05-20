<script lang="ts">
	import type { EnvironmentVault } from '$lib/environment/environment-vault';
	import {
		readEnvironmentVaultEnvelopeForWorkspace,
		subscribeEnvironmentVaultEnvelopeForWorkspace
	} from '$lib/environment/environment-vault-storage';
	import type { SecretVaultEnvelope } from '$lib/environment/secret-vault-crypto';
	import type { WorkspaceRecord } from '$lib/workspaces/workspace-registry';
	import type { ProjectFolderError } from './project-folder';
	import type { ProjectRepositoryOperation } from './project-board-operations';
	import {
		readProjectRegistryForBoard,
		readProjectRepositoryOperationRecordsForBoard
	} from './project-board-storage-actions';
	import { createEmptyProjectRegistry, type ProjectRegistry } from './project-registry';
	import {
		subscribeProjectRegistry,
		type ProjectRegistryStorageError
	} from './project-storage';
	import type { ProjectRepositoryOperationStorageError } from './project-operation-storage';

	interface Props {
		readonly workspace: WorkspaceRecord;
		registry: ProjectRegistry;
		storageError: ProjectRegistryStorageError | null;
		operationStorageError: ProjectRepositoryOperationStorageError | null;
		folderRepairError: ProjectFolderError | null;
		folderRepairSignature: string;
		selectedProjectId: string | null;
		selectedGroupId: string | null;
		environmentVaultEnvelope: SecretVaultEnvelope | null;
		environmentVault: EnvironmentVault | null;
		environmentVaultPassword: string;
		environmentVaultError: string | null;
		repositoryOperationById: Record<string, ProjectRepositoryOperation>;
	}

	let {
		workspace,
		registry = $bindable(createEmptyProjectRegistry('')),
		storageError = $bindable(),
		operationStorageError = $bindable(),
		folderRepairError = $bindable(),
		folderRepairSignature = $bindable(),
		selectedProjectId = $bindable(),
		selectedGroupId = $bindable(),
		environmentVaultEnvelope = $bindable(),
		environmentVault = $bindable(),
		environmentVaultPassword = $bindable(),
		environmentVaultError = $bindable(),
		repositoryOperationById = $bindable()
	}: Props = $props();

	$effect(() => {
		const workspaceId = workspace.id;
		const workspacePath = workspace.path;
		let isCurrentWorkspace = true;

		folderRepairError = null;
		storageError = null;
		operationStorageError = null;
		folderRepairSignature = '';
		selectedProjectId = null;
		selectedGroupId = null;
		environmentVaultEnvelope = null;
		environmentVault = null;
		environmentVaultPassword = '';
		environmentVaultError = null;

		void readEnvironmentVaultEnvelopeForWorkspace(workspaceId, workspacePath).then((result) => {
			if (!isCurrentWorkspace || !result.ok) {
				return;
			}

			environmentVaultEnvelope = result.envelope;
		});
		void readProjectRegistryForBoard(workspaceId, createEmptyProjectRegistry(workspaceId), (next) => {
			registry = next.registry;
			storageError = next.storageError;
		});
		void readProjectRepositoryOperationRecordsForBoard(workspaceId, (next) => {
			operationStorageError = next.operationStorageError;
			if (next.repositoryOperationById !== undefined) {
				repositoryOperationById = next.repositoryOperationById;
			}
		});

		const unsubscribeProjectRegistry = subscribeProjectRegistry(workspaceId, (nextRegistry) => {
			registry = nextRegistry;
			storageError = null;
		});
		const unsubscribeEnvironmentVault = subscribeEnvironmentVaultEnvelopeForWorkspace(
			workspaceId,
			workspacePath,
			(nextEnvelope) => {
				environmentVaultEnvelope = nextEnvelope;
				environmentVault = null;
				environmentVaultPassword = '';
				environmentVaultError = null;
			}
		);

		return () => {
			isCurrentWorkspace = false;
			unsubscribeProjectRegistry();
			unsubscribeEnvironmentVault();
		};
	});
</script>
