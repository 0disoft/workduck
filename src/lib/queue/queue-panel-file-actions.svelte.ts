/* llmnav/1 module
id=workduck.queue.file-actions
role=Own Queue context menu placement, dismissal, and workspace-scoped single or bulk file deletion.
owns=menu lifecycle|bulk delete selection|delete admission|partial deletion feedback
excludes=artifact persistence|artifact read selection|other Queue writes
search=Queue context menu deletion|bulk delete Queue files|partial Queue deletion
invariant=Deletion captures the initiating workspace and applies partial results and feedback only while that view is current; menu subscriptions are disposed when closed.
stability=architecture
*/
import { tick } from 'svelte';
import type { WorkduckMessages } from '#lib/i18n/workduck-message-contract.ts';
import type { QueueFolderError } from './queue-folder';
import type { QueueCardEntry, QueueContextMenuState } from './queue-panel-types';
import {
	canOpenQueueContextMenu,
	createQueueContextMenuState,
	createViewportAlignedQueueContextMenu,
	subscribeQueueContextMenuDismissal
} from './queue-panel-context-menu-lifecycle';
import { shouldBulkDeleteQueueFile } from './queue-panel-file-list';
import { deleteQueuePanelFiles } from './queue-panel-file-delete-workflow';
import { dispatchQueueFilesChanged } from './queue-read-state';

interface QueueFileActionWorkspaceTarget {
	readonly workspaceId: string;
	readonly workspacePath: string;
	readonly isCurrent: () => boolean;
}
interface QueuePanelFileActionsInput {
	readonly files: () => readonly QueueCardEntry[];
	readonly messages: () => WorkduckMessages;
	readonly isWriting: () => boolean;
	readonly captureWorkspaceTarget: () => QueueFileActionWorkspaceTarget;
	readonly setWriting: (value: boolean) => void;
	readonly clearFeedback: () => void;
	readonly setError: (value: QueueFolderError) => void;
	readonly setStatus: (value: string) => void;
	readonly removeFiles: (paths: readonly string[]) => void;
}

export function createQueuePanelFileActions(input: QueuePanelFileActionsInput) {
	let queueContextMenu = $state<QueueContextMenuState | null>(null);
	let queueContextMenuElement = $state<HTMLElement | undefined>(undefined);
	let bulkDeleteIncludesPending = $state(false);
	let bulkDeleteTargetFiles = $derived(
		input.files().filter((file) => shouldBulkDeleteQueueFile(file, bulkDeleteIncludesPending))
	);
	let bulkDeleteTargetCount = $derived(bulkDeleteTargetFiles.length);
	let canBulkDeleteQueueFiles = $derived(bulkDeleteTargetCount > 0 && !input.isWriting());

	$effect(() => {
		if (queueContextMenu === null || queueContextMenuElement === undefined) {
			return;
	}

		void alignQueueContextMenuToViewport({
			menuSnapshot: queueContextMenu,
			menuElement: queueContextMenuElement
		});
});

	$effect(() => {
		if (queueContextMenu === null || typeof window === 'undefined') {
			return;
	}

		return subscribeQueueContextMenuDismissal({
			window,
			getMenuElement: () => queueContextMenuElement,
			close: closeQueueContextMenu
		});
});

	function openQueueContextMenu(event: MouseEvent, file: QueueCardEntry) {
		if (!canOpenQueueContextMenu(file, input.isWriting())) {
			return;
	}

		queueContextMenu = createQueueContextMenuState(event, file);
}

	function closeQueueContextMenu() {
		queueContextMenu = null;
		queueContextMenuElement = undefined;
}

	async function alignQueueContextMenuToViewport(alignment: {
		readonly menuSnapshot: QueueContextMenuState;
		readonly menuElement: HTMLElement;
	}) {
		if (typeof window === 'undefined') {
			return;
	}

		const alignedMenu = await createViewportAlignedQueueContextMenu({
			...alignment,
			window,
			waitForDomUpdate: tick,
			isCurrent: () =>
				queueContextMenu === alignment.menuSnapshot &&
				queueContextMenuElement === alignment.menuElement
		});

		if (alignedMenu === null) {
			return;
	}

		queueContextMenu = alignedMenu;
}

	async function handleDeleteContextQueueFile() {
		const targetFile = queueContextMenu?.file ?? null;

		if (targetFile === null || targetFile.kind === 'unsupported' || input.isWriting()) {
			return;
	}

		closeQueueContextMenu();
		const target = input.captureWorkspaceTarget();
		input.setWriting(true);
		input.clearFeedback();

		try {
			const result = await deleteQueuePanelFiles({
				workspacePath: target.workspacePath,
				relativePaths: [targetFile.relativePath]
			});
			if (!target.isCurrent()) return;

			if (!result.ok) {
				applyDeletedQueueFiles(result.deletedRelativePaths, target.workspaceId);
				input.setError(result.error);
				return;
			}

			applyDeletedQueueFiles(result.deletedRelativePaths, target.workspaceId);
			input.setStatus(input.messages().queue.deletedFile.replace(
				'{relativePath}',
				result.deletedRelativePaths[0] ?? targetFile.relativePath
			));
	} finally {
			if (target.isCurrent()) input.setWriting(false);
	}
}

	async function handleBulkDeleteQueueFiles() {
		if (!canBulkDeleteQueueFiles) {
			return;
		}

		const targetFiles = bulkDeleteTargetFiles;

		if (targetFiles.length === 0) {
			return;
		}

		const target = input.captureWorkspaceTarget();
		input.setWriting(true);
		input.clearFeedback();

		try {
			const result = await deleteQueuePanelFiles({
				workspacePath: target.workspacePath,
				relativePaths: targetFiles.map((targetFile) => targetFile.relativePath)
			});
			if (!target.isCurrent()) return;

			if (!result.ok) {
				applyDeletedQueueFiles(result.deletedRelativePaths, target.workspaceId);
				input.setError(result.error);
				return;
			}

			applyDeletedQueueFiles(result.deletedRelativePaths, target.workspaceId);
			input.setStatus(input.messages().queue.bulkDeletedFiles.replace(
				'{count}',
				result.deletedRelativePaths.length.toString()
			));
	} finally {
			if (target.isCurrent()) input.setWriting(false);
	}
}

	function applyDeletedQueueFiles(deletedRelativePaths: readonly string[], workspaceId: string) {
		input.removeFiles(deletedRelativePaths);

		if (deletedRelativePaths.length > 0) {
			dispatchQueueFilesChanged(workspaceId);
		}
	}

	return {
		get queueContextMenu() { return queueContextMenu; },
		get queueContextMenuElement() { return queueContextMenuElement; },
		set queueContextMenuElement(value: HTMLElement | undefined) { queueContextMenuElement = value; },
		get bulkDeleteIncludesPending() { return bulkDeleteIncludesPending; },
		set bulkDeleteIncludesPending(value: boolean) { bulkDeleteIncludesPending = value; },
		get bulkDeleteTargetCount() { return bulkDeleteTargetCount; },
		get canBulkDeleteQueueFiles() { return canBulkDeleteQueueFiles; },
		openQueueContextMenu,
		closeQueueContextMenu,
		handleDeleteContextQueueFile,
		handleBulkDeleteQueueFiles
	};
}
