<script lang="ts">
	import type { WorkspaceRecord } from '$lib/workspaces/workspace-registry';
	import type { ProjectFolderError } from './project-folder';
	import type { ProjectRepositoryOperation } from './project-board-operations';
	import {
		createFolderRepairSignature,
		createRepositoryGitInspectionSignature,
		ensureProjectFoldersForBoard,
		pruneRepositoryGitStatusRecord,
		pruneRepositoryOperationRecord,
		refreshProjectRepositoryGitStatusForBoard
	} from './project-board-runtime-state';
	import {
		listRegisteredRepositories,
		type ProjectRepositoryGitStatus
	} from './project-board-selectors';
	import type { ProjectRegistry, ProjectTreeRow } from './project-registry';

	interface Props {
		readonly workspace: WorkspaceRecord;
		readonly projectRows: readonly ProjectTreeRow[];
		readonly registry: ProjectRegistry;
		folderRepairError: ProjectFolderError | null;
		folderRepairSignature: string;
		repositoryGitInspectionSignature: string;
		repositoryGitStatusById: Record<string, ProjectRepositoryGitStatus>;
		repositoryOperationById: Record<string, ProjectRepositoryOperation>;
		readonly persistRegistry: (nextRegistry: ProjectRegistry) => Promise<boolean>;
	}

	let {
		workspace,
		projectRows,
		registry,
		folderRepairError = $bindable(),
		folderRepairSignature = $bindable(),
		repositoryGitInspectionSignature = $bindable(),
		repositoryGitStatusById = $bindable(),
		repositoryOperationById = $bindable(),
		persistRegistry
	}: Props = $props();

	async function ensureProjectFoldersForRegistry(
		expectedSignature: string,
		workspacePath: string,
		registrySnapshot: ProjectRegistry,
		rows: readonly ProjectTreeRow[]
	) {
		await ensureProjectFoldersForBoard(
			{ expectedSignature, workspacePath, registrySnapshot, rows },
			{
				getFolderRepairSignature: () => folderRepairSignature,
				setFolderRepairError: (error) => { folderRepairError = error; },
				persistRegistry
			}
		);
	}

	async function refreshRepositoryGitStatus(
		repositoryId: string,
		path: string | null,
		expectedSignature = repositoryGitInspectionSignature
	) {
		await refreshProjectRepositoryGitStatusForBoard(
			{ repositoryId, path, expectedSignature },
			{
				getRepositoryGitInspectionSignature: () => repositoryGitInspectionSignature,
				updateRepositoryGitStatus: (nextRepositoryId, gitStatus) => {
					repositoryGitStatusById = {
						...repositoryGitStatusById,
						[nextRepositoryId]: gitStatus
					};
				}
			}
		);
	}

	$effect(() => {
		const registeredRepositories = listRegisteredRepositories(registry.nodes);
		const repositoriesToInspect = registeredRepositories.filter(
			(repository) => repository.path !== null
		);
		const nextSignature = createRepositoryGitInspectionSignature(
			workspace.id,
			repositoriesToInspect
		);

		if (repositoryGitInspectionSignature === nextSignature) {
			return;
		}

		repositoryGitInspectionSignature = nextSignature;
		const registeredRepositoryIds = new Set(registeredRepositories.map((repository) => repository.id));
		repositoryGitStatusById = pruneRepositoryGitStatusRecord(
			repositoryGitStatusById,
			new Set(repositoriesToInspect.map((repository) => repository.id))
		);
		repositoryOperationById = pruneRepositoryOperationRecord(
			repositoryOperationById,
			registeredRepositoryIds
		);

		for (const repository of repositoriesToInspect) {
			void refreshRepositoryGitStatus(repository.id, repository.path, nextSignature);
		}
	});

	$effect(() => {
		const rows = projectRows;
		const nextSignature = createFolderRepairSignature(workspace.id, rows);

		if (folderRepairSignature === nextSignature) {
			return;
		}

		folderRepairSignature = nextSignature;

		if (rows.length === 0) {
			folderRepairError = null;
			return;
		}

		void ensureProjectFoldersForRegistry(nextSignature, workspace.path, registry, rows);
	});
</script>
