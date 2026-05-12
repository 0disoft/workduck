export const TITLEBAR_DRAG_THRESHOLD_PX = 4;

export function hasExceededTitlebarDragThreshold(
	startX: number,
	startY: number,
	currentX: number,
	currentY: number
) {
	const deltaX = currentX - startX;
	const deltaY = currentY - startY;
	const thresholdSquared = TITLEBAR_DRAG_THRESHOLD_PX * TITLEBAR_DRAG_THRESHOLD_PX;

	return deltaX * deltaX + deltaY * deltaY >= thresholdSquared;
}
