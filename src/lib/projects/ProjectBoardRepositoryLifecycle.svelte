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
		refreshProjectRepositoryGitStatusesForBoard
	} from './project-board-runtime-state';
	import type {
		ProjectBoardSelectionIndex,
		ProjectRepositoryGitStatus
	} from './project-board-selectors';
	import type { ProjectRegistry, ProjectTreeRow } from './project-registry';

	interface Props {
		readonly workspace: WorkspaceRecord;
		readonly projectRows: readonly ProjectTreeRow[];
		readonly selectionIndex: ProjectBoardSelectionIndex;
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
		selectionIndex,
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

	$effect(() => {
		const nextSignature = createRepositoryGitInspectionSignature(
			workspace.id,
			selectionIndex.repositoriesToInspect
		);

		repositoryGitStatusById = pruneRepositoryGitStatusRecord(
			repositoryGitStatusById,
			selectionIndex.inspectableRepositoryIds
		);
		repositoryOperationById = pruneRepositoryOperationRecord(
			repositoryOperationById,
			selectionIndex.registeredRepositoryIds
		);

		if (repositoryGitInspectionSignature === nextSignature) {
			return;
		}

		repositoryGitInspectionSignature = nextSignature;

		void refreshProjectRepositoryGitStatusesForBoard(
			{ repositories: selectionIndex.repositoriesToInspect, expectedSignature: nextSignature },
			{
				getRepositoryGitInspectionSignature: () => repositoryGitInspectionSignature,
				updateRepositoryGitStatuses: (gitStatuses) => {
					repositoryGitStatusById = {
						...repositoryGitStatusById,
						...gitStatuses
					};
				}
			}
		);
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
