import type { ProjectContextMenuState } from './project-board-types';

export const CONTEXT_MENU_MARGIN_PX = 12;

export function resolveContextMenuPosition(
	menuSnapshot: ProjectContextMenuState,
	menuRect: Pick<DOMRect, 'width' | 'height'>,
	viewportWidth: number,
	viewportHeight: number
) {
	const maxX = Math.max(
		CONTEXT_MENU_MARGIN_PX,
		viewportWidth - menuRect.width - CONTEXT_MENU_MARGIN_PX
	);
	const maxY = Math.max(
		CONTEXT_MENU_MARGIN_PX,
		viewportHeight - menuRect.height - CONTEXT_MENU_MARGIN_PX
	);

	return {
		x: Math.min(Math.max(CONTEXT_MENU_MARGIN_PX, menuSnapshot.x), maxX),
		y: Math.min(Math.max(CONTEXT_MENU_MARGIN_PX, menuSnapshot.y), maxY)
	};
}
