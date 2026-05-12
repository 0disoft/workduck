export const SIDEBAR_DEFAULT_WIDTH_PX = 280;
export const SIDEBAR_MIN_WIDTH_PX = 220;
export const SIDEBAR_MAX_WIDTH_PX = 480;
export const SIDEBAR_KEYBOARD_STEP_PX = 16;
export const SIDEBAR_KEYBOARD_LARGE_STEP_PX = 48;
export const SHELL_MOBILE_BREAKPOINT_PX = 760;
export const SIDEBAR_WIDTH_STORAGE_KEY = "workduck.sidebar.width.px";

export function clampSidebarWidthPx(widthPx: number) {
	if (!Number.isFinite(widthPx)) {
		return SIDEBAR_DEFAULT_WIDTH_PX;
	}

	return Math.min(SIDEBAR_MAX_WIDTH_PX, Math.max(SIDEBAR_MIN_WIDTH_PX, Math.round(widthPx)));
}

export function parseStoredSidebarWidthPx(storedWidth: string | null) {
	if (storedWidth === null) {
		return SIDEBAR_DEFAULT_WIDTH_PX;
	}

	return clampSidebarWidthPx(Number.parseInt(storedWidth, 10));
}
