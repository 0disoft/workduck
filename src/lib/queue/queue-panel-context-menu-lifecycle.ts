import type { QueueCardEntry, QueueContextMenuState } from './queue-panel-types';

const QUEUE_CONTEXT_MENU_MARGIN_PX = 12;

export function canOpenQueueContextMenu(file: QueueCardEntry, isWriting: boolean) {
	return file.kind !== 'unsupported' && !isWriting;
}

export function createQueueContextMenuState(
	event: MouseEvent,
	file: QueueCardEntry
): QueueContextMenuState {
	event.preventDefault();
	event.stopPropagation();

	return {
		x: event.clientX,
		y: event.clientY,
		file
	};
}

export async function createViewportAlignedQueueContextMenu(input: {
	readonly menuSnapshot: QueueContextMenuState;
	readonly menuElement: HTMLElement;
	readonly window: Window;
	readonly waitForDomUpdate: () => Promise<void>;
	readonly isCurrent: () => boolean;
}): Promise<QueueContextMenuState | null> {
	await input.waitForDomUpdate();

	if (!input.isCurrent()) {
		return null;
	}

	const menuRect = input.menuElement.getBoundingClientRect();
	const maxX = Math.max(
		QUEUE_CONTEXT_MENU_MARGIN_PX,
		input.window.innerWidth - menuRect.width - QUEUE_CONTEXT_MENU_MARGIN_PX
	);
	const maxY = Math.max(
		QUEUE_CONTEXT_MENU_MARGIN_PX,
		input.window.innerHeight - menuRect.height - QUEUE_CONTEXT_MENU_MARGIN_PX
	);
	const nextX = Math.min(Math.max(QUEUE_CONTEXT_MENU_MARGIN_PX, input.menuSnapshot.x), maxX);
	const nextY = Math.min(Math.max(QUEUE_CONTEXT_MENU_MARGIN_PX, input.menuSnapshot.y), maxY);

	if (nextX === input.menuSnapshot.x && nextY === input.menuSnapshot.y) {
		return null;
	}

	return {
		...input.menuSnapshot,
		x: nextX,
		y: nextY
	};
}

export function subscribeQueueContextMenuDismissal(input: {
	readonly window: Window;
	readonly getMenuElement: () => HTMLElement | undefined;
	readonly close: () => void;
}) {
	function handleGlobalPointerDown(event: PointerEvent) {
		const menuElement = input.getMenuElement();

		if (
			menuElement !== undefined &&
			event.target instanceof Node &&
			menuElement.contains(event.target)
		) {
			return;
		}

		input.close();
	}

	function handleGlobalContextKey(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			input.close();
		}
	}

	input.window.addEventListener('pointerdown', handleGlobalPointerDown);
	input.window.addEventListener('keydown', handleGlobalContextKey);

	return () => {
		input.window.removeEventListener('pointerdown', handleGlobalPointerDown);
		input.window.removeEventListener('keydown', handleGlobalContextKey);
	};
}
