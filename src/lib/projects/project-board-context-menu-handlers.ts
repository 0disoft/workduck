import type { ProjectFormError } from './project-board-errors';
import { CONTEXT_MENU_MARGIN_PX } from './project-board-context-menu-position';
import {
	openProjectContextFolder,
	resolveContextDeleteCandidate,
	resolveContextDescriptionEditorTarget,
	resolveContextGithubCredentialEditorTarget,
	resolveContextTagEditorTarget
} from './project-board-context-actions';
import {
	cloneProjectRepositoryForTarget,
	initializeProjectRepositoryForTarget,
	type ProjectRepositoryActionContext
} from './project-board-repository-actions';
import type { ProjectNodeRecord, ProjectRepositoryLinkRecord } from './project-registry';
import type {
	ProjectContextMenuState,
	ProjectContextMenuTarget,
	ProjectDeleteCandidate,
	ProjectGithubCredentialEditorTarget,
	ProjectRepositoryTarget,
	ProjectTagEditorTarget
} from './project-board-types';

export function createProjectBoardContextMenuHandlers(context: {
	readonly getContextMenuTarget: () => ProjectContextMenuTarget | null;
	readonly getContextMenuRepository: () => ProjectRepositoryTarget | null;
	readonly getRegistryNodes: () => readonly ProjectNodeRecord[];
	readonly getWorkspacePath: () => string;
	readonly getIsOpeningFolder: () => boolean;
	readonly createRepositoryActionContext: () => ProjectRepositoryActionContext;
	readonly setContextMenu: (contextMenu: ProjectContextMenuState | null) => void;
	readonly setFormError: (error: ProjectFormError | null) => void;
	readonly setStatus: (status: string | null) => void;
	readonly setDeleteCandidate: (candidate: ProjectDeleteCandidate | null) => void;
	readonly setShouldDeleteLocalFolder: (shouldDelete: boolean) => void;
	readonly setDescriptionEditor: (editor: ProjectNodeRecord | null) => void;
	readonly setIsOpeningFolder: (isOpening: boolean) => void;
	readonly openTagEditor: (target: ProjectTagEditorTarget) => void;
	readonly openGithubCredentialEditor: (target: ProjectGithubCredentialEditorTarget) => void;
	readonly openDescriptionEditor: (node: ProjectNodeRecord) => void;
	readonly openPublishRepositoryDialog: (
		node: ProjectNodeRecord,
		repository: ProjectRepositoryLinkRecord
	) => void;
}) {
	function closeContextMenu() {
		context.setContextMenu(null);
	}

	function openContextMenu(x: number, y: number, target: ProjectContextMenuTarget) {
		context.setContextMenu({
			x: Math.max(CONTEXT_MENU_MARGIN_PX, x),
			y: Math.max(CONTEXT_MENU_MARGIN_PX, y),
			target
		});
		context.setFormError(null);
		context.setStatus(null);
		context.setDeleteCandidate(null);
		context.setDescriptionEditor(null);
	}

	return {
		closeContextMenu,
		openBoardContextMenu(event: MouseEvent) {
			event.preventDefault();
			closeContextMenu();
		},
		openProjectContextMenu(event: MouseEvent, node: ProjectNodeRecord) {
			event.preventDefault();
			event.stopPropagation();
			openContextMenu(event.clientX, event.clientY, {
				type: 'node',
				nodeId: node.id
			});
		},
		openRepositoryContextMenu(
			event: MouseEvent,
			node: ProjectNodeRecord,
			repository: ProjectRepositoryLinkRecord
		) {
			event.preventDefault();
			event.stopPropagation();
			openContextMenu(event.clientX, event.clientY, {
				type: 'repository',
				nodeId: node.id,
				repositoryId: repository.id
			});
		},
		async openContextFolder() {
			const target = context.getContextMenuTarget();

			closeContextMenu();

			await openProjectContextFolder(
				{
					workspacePath: context.getWorkspacePath(),
					nodes: context.getRegistryNodes(),
					target,
					isOpening: context.getIsOpeningFolder()
				},
				{
					setIsOpening: context.setIsOpeningFolder,
					setFormError: context.setFormError,
					setStatus: context.setStatus
				}
			);
		},
		openContextDeleteDialog() {
			const result = resolveContextDeleteCandidate(
				context.getRegistryNodes(),
				context.getContextMenuTarget()
			);

			closeContextMenu();

			if (!result.ok) {
				context.setFormError(result.error);
				return;
			}

			context.setDeleteCandidate(result.value);
			context.setShouldDeleteLocalFolder(false);
			context.setFormError(null);
			context.setStatus(null);
		},
		openContextTagEditor() {
			const result = resolveContextTagEditorTarget(
				context.getRegistryNodes(),
				context.getContextMenuTarget()
			);

			closeContextMenu();

			if (!result.ok) {
				context.setFormError(result.error);
				return;
			}

			context.openTagEditor(result.value);
		},
		openContextGithubCredentialEditor() {
			const result = resolveContextGithubCredentialEditorTarget(
				context.getRegistryNodes(),
				context.getContextMenuTarget()
			);

			closeContextMenu();

			if (!result.ok) {
				context.setFormError(result.error);
				return;
			}

			context.openGithubCredentialEditor(result.value);
		},
		openContextDescriptionEditor() {
			const result = resolveContextDescriptionEditorTarget(
				context.getRegistryNodes(),
				context.getContextMenuTarget()
			);

			closeContextMenu();

			if (!result.ok) {
				context.setFormError(result.error);
				return;
			}

			context.openDescriptionEditor(result.value);
		},
		async openContextCloneRepository() {
			const target = context.getContextMenuRepository();

			closeContextMenu();

			await cloneProjectRepositoryForTarget(target, context.createRepositoryActionContext());
		},
		async openContextCloneRepositoryForTarget(
			node: ProjectNodeRecord,
			repository: ProjectRepositoryLinkRecord
		) {
			await cloneProjectRepositoryForTarget(
				{ node, repository },
				context.createRepositoryActionContext()
			);
		},
		async openContextInitializeRepository() {
			const target = context.getContextMenuRepository();

			closeContextMenu();

			await initializeProjectRepositoryForTarget(target, context.createRepositoryActionContext());
		},
		openContextPublishRepository() {
			const target = context.getContextMenuRepository();

			closeContextMenu();

			if (target === null) {
				context.setFormError('project-repository-not-found');
				return;
			}

			context.openPublishRepositoryDialog(target.node, target.repository);
		},
		async openInitializeRepositoryForTarget(
			node: ProjectNodeRecord,
			repository: ProjectRepositoryLinkRecord
		) {
			await initializeProjectRepositoryForTarget(
				{ node, repository },
				context.createRepositoryActionContext()
			);
		}
	};
}
