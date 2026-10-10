<script lang="ts">
	/* llmnav/1 module
	id=workduck.projects.workspace-lifecycle
	role=Load project board registries, operation history, and vault views within the active workspace lifetime.
	owns=workspace view reset|initial read ownership|workspace subscriptions|board resource teardown
	excludes=repository mutations|native vault operations|project selection rules
	search=project board workspace switch|late project registry read|workspace board subscriptions
	invariant=Initial reads yield to newer published and live state; only successful reads or published snapshots admit editing for the current workspace ID and path, and metadata changes preserve selections.
	stability=architecture
	*/
	import type { EnvironmentVault } from '#lib/environment/environment-vault.ts';
	import {
		readEnvironmentVaultSession,
		subscribeEnvironmentVaultSession
	} from '#lib/environment/environment-vault-session.ts';
	import { openEnvironmentVaultSessionFromWorkspaceUnlock } from '#lib/environment/environment-vault-session-loader.ts';
	import {
		readEnvironmentVaultEnvelopeForWorkspace,
		subscribeEnvironmentVaultEnvelopeForWorkspace
	} from '#lib/environment/environment-vault-storage.ts';
	import type { SecretVaultEnvelope } from '#lib/environment/secret-vault-crypto.ts';
	import type { WorkspaceRecord } from '#lib/workspaces/workspace-registry.ts';
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
		registryReadScope: string | null;
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
		registryReadScope = $bindable(),
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

	let environmentVaultOpenSequence = 0;
	let workspaceIdentityId = $derived(workspace.id);
	let workspaceIdentityPath = $derived(workspace.path);

	$effect(() => {
		const workspaceId = workspaceIdentityId;
		const workspacePath = workspaceIdentityPath;
		const readScope = JSON.stringify([workspaceId, workspacePath]);
		let isCurrentWorkspace = true;
		let hasPublishedRegistry = false;
		let hasPublishedVaultEnvelope = false;
		let hasPublishedVaultSession = false;
		const openSequence = ++environmentVaultOpenSequence;

		folderRepairError = null;
		registry = createEmptyProjectRegistry(workspaceId);
		registryReadScope = null;
		repositoryOperationById = {};
		storageError = null;
		operationStorageError = null;
		folderRepairSignature = '';
		selectedProjectId = null;
		selectedGroupId = null;
		environmentVaultEnvelope = null;
		environmentVault = readEnvironmentVaultSession(workspaceId);
		environmentVaultPassword = '';
		environmentVaultError = null;

		void readEnvironmentVaultEnvelopeForWorkspace(workspaceId, workspacePath).then((result) => {
			if (!isCurrentWorkspace || hasPublishedVaultEnvelope || !result.ok) {
				return;
			}

			environmentVaultEnvelope = result.envelope;
		});
		void readProjectRegistryForBoard(workspaceId, createEmptyProjectRegistry(workspaceId), (next) => {
			if (!isCurrentWorkspace || hasPublishedRegistry) return;
			registry = next.registry;
			storageError = next.storageError;
			registryReadScope = next.storageError === null ? readScope : null;
		});
		void readProjectRepositoryOperationRecordsForBoard(workspaceId, (next) => {
			if (!isCurrentWorkspace) return;
			operationStorageError = next.operationStorageError;
			if (next.repositoryOperationById !== undefined) {
				repositoryOperationById = { ...next.repositoryOperationById, ...repositoryOperationById };
			}
		});
		void openEnvironmentVaultSessionFromWorkspaceUnlock(workspaceId, workspacePath).then((result) => {
			if (
				!isCurrentWorkspace ||
				hasPublishedVaultSession ||
				openSequence !== environmentVaultOpenSequence ||
				!result.ok
			) {
				return;
			}

			environmentVault = result.vault;
		});

		const unsubscribeProjectRegistry = subscribeProjectRegistry(workspaceId, (nextRegistry) => {
			if (!isCurrentWorkspace) return;
			hasPublishedRegistry = true;
			registry = nextRegistry;
			storageError = null;
			registryReadScope = readScope;
		});
		const unsubscribeEnvironmentVaultSession = subscribeEnvironmentVaultSession(
			workspaceId,
			(nextVault) => {
				if (!isCurrentWorkspace) return;
				hasPublishedVaultSession = true;
				environmentVault = nextVault;
			}
		);
		const unsubscribeEnvironmentVault = subscribeEnvironmentVaultEnvelopeForWorkspace(
			workspaceId,
			workspacePath,
			(nextEnvelope) => {
				if (!isCurrentWorkspace) return;
				hasPublishedVaultEnvelope = true;
				environmentVaultEnvelope = nextEnvelope;
				environmentVaultPassword = '';
				environmentVaultError = null;
			}
		);

		return () => {
			isCurrentWorkspace = false;
			unsubscribeProjectRegistry();
			unsubscribeEnvironmentVaultSession();
			unsubscribeEnvironmentVault();
		};
	});
</script>
