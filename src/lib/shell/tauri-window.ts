import { readSystemSettingsFromBrowser } from '$lib/settings/system-storage';
import { hideWorkduckWindowToTray } from '$lib/system/tray';

interface TauriWindowController {
	close: () => Promise<void>;
	hide: () => Promise<void>;
	innerSize: () => Promise<TauriPhysicalSize>;
	isMaximized: () => Promise<boolean>;
	maximize: () => Promise<void>;
	minimize: () => Promise<void>;
	onResized: (handler: (event: { payload: TauriPhysicalSize }) => void) => Promise<() => void>;
	setFocus: () => Promise<void>;
	startDragging: () => Promise<void>;
	setSize: (size: TauriWindowSize) => Promise<void>;
	show: () => Promise<void>;
	toggleMaximize: () => Promise<void>;
	unminimize: () => Promise<void>;
}

interface TauriWindowApi {
	getCurrentWindow: () => TauriWindowController;
}

declare global {
	interface Window {
		__TAURI__?: {
			window?: TauriWindowApi;
		};
	}
}

interface TauriPhysicalSize {
	readonly width: number;
	readonly height: number;
}

interface TauriWindowSize extends TauriPhysicalSize {
	readonly type: 'Physical';
}

interface WorkduckWindowState {
	readonly version: 1;
	readonly maximized: boolean;
	readonly size?: TauriPhysicalSize;
}

const WINDOW_STATE_STORAGE_KEY = 'workduck:window-state:v1';
const WINDOW_STATE_MIN_WIDTH_PX = 900;
const WINDOW_STATE_MIN_HEIGHT_PX = 600;
const WINDOW_STATE_MAX_DIMENSION_PX = 20000;

function getCurrentTauriWindow() {
	if (typeof window === 'undefined') {
		return undefined;
	}

	return window.__TAURI__?.window?.getCurrentWindow?.();
}

function isUsableWindowSize(value: unknown): value is TauriPhysicalSize {
	if (typeof value !== 'object' || value === null) {
		return false;
	}

	const candidate = value as Record<string, unknown>;

	return (
		typeof candidate.width === 'number' &&
		typeof candidate.height === 'number' &&
		Number.isFinite(candidate.width) &&
		Number.isFinite(candidate.height) &&
		candidate.width >= WINDOW_STATE_MIN_WIDTH_PX &&
		candidate.height >= WINDOW_STATE_MIN_HEIGHT_PX &&
		candidate.width <= WINDOW_STATE_MAX_DIMENSION_PX &&
		candidate.height <= WINDOW_STATE_MAX_DIMENSION_PX
	);
}

function readWindowState(): WorkduckWindowState | null {
	if (typeof window === 'undefined') {
		return null;
	}

	try {
		const rawState = window.localStorage.getItem(WINDOW_STATE_STORAGE_KEY);

		if (rawState === null) {
			return null;
		}

		const parsedState = JSON.parse(rawState) as unknown;

		if (typeof parsedState !== 'object' || parsedState === null) {
			return null;
		}

		const candidate = parsedState as Record<string, unknown>;

		if (candidate.version !== 1 || typeof candidate.maximized !== 'boolean') {
			return null;
		}

		const state: WorkduckWindowState = {
			version: 1,
			maximized: candidate.maximized
		};

		if (!isUsableWindowSize(candidate.size)) {
			return state;
		}

		const stateWithSize: WorkduckWindowState = {
			...state,
			size: candidate.size
		};

		return stateWithSize;
	} catch {
		return null;
	}
}

function writeWindowState(state: WorkduckWindowState) {
	if (typeof window === 'undefined') {
		return;
	}

	try {
		window.localStorage.setItem(WINDOW_STATE_STORAGE_KEY, JSON.stringify(state));
	} catch {
		return;
	}
}

async function captureWindowState(appWindow: TauriWindowController) {
	const previousState = readWindowState();
	const maximized = await appWindow.isMaximized();

	if (maximized) {
		const state: WorkduckWindowState = {
			version: 1,
			maximized: true
		};

		writeWindowState(
			previousState?.size === undefined
				? state
				: {
						...state,
						size: previousState.size
					}
		);
		return;
	}

	const size = await appWindow.innerSize();

	if (!isUsableWindowSize(size)) {
		return;
	}

	writeWindowState({
		version: 1,
		maximized: false,
		size
	});
}

async function applyInitialWindowState(appWindow: TauriWindowController) {
	const state = readWindowState();

	if (state === null) {
		await appWindow.maximize();
		await captureWindowState(appWindow);
		return;
	}

	if (state.maximized) {
		await appWindow.maximize();
		return;
	}

	if (state.size !== undefined) {
		await appWindow.setSize({
			type: 'Physical',
			width: state.size.width,
			height: state.size.height
		});
	}
}

function createWindowStateCapture(appWindow: TauriWindowController) {
	let timeoutId: number | undefined;

	function clearPendingCapture() {
		if (timeoutId === undefined) {
			return;
		}

		window.clearTimeout(timeoutId);
		timeoutId = undefined;
	}

	function scheduleCapture() {
		clearPendingCapture();
		timeoutId = window.setTimeout(() => {
			timeoutId = undefined;
			void captureWindowState(appWindow);
		}, 250);
	}

	function captureBeforeUnload() {
		clearPendingCapture();
		void captureWindowState(appWindow);
	}

	return {
		captureBeforeUnload,
		scheduleCapture,
		destroy() {
			clearPendingCapture();
		}
	};
}

async function runWindowAction(action: (appWindow: TauriWindowController) => Promise<void>) {
	const appWindow = getCurrentTauriWindow();

	if (appWindow === undefined) {
		return;
	}

	try {
		await action(appWindow);
	} catch {
		return;
	}
}

export function closeTauriWindow() {
	return runWindowAction(async (appWindow) => {
		await captureWindowState(appWindow);
		await appWindow.close();
	});
}

export function minimizeTauriWindow() {
	return runWindowAction(async (appWindow) => {
		if (readSystemSettingsFromBrowser().settings.minimizeToTray) {
			await captureWindowState(appWindow);

			if (await hideWorkduckWindowToTray()) {
				return;
			}
		}

		await appWindow.minimize();
	});
}

export function startTauriWindowDrag() {
	return runWindowAction((appWindow) => appWindow.startDragging());
}

export function toggleTauriWindowMaximize() {
	return runWindowAction(async (appWindow) => {
		await appWindow.toggleMaximize();
		await captureWindowState(appWindow);
	});
}

export async function initializeTauriWindowState() {
	const appWindow = getCurrentTauriWindow();

	if (appWindow === undefined || typeof window === 'undefined') {
		return () => {};
	}

	try {
		await applyInitialWindowState(appWindow);
	} catch {
		return () => {};
	}

	const stateCapture = createWindowStateCapture(appWindow);
	let removeResizeListener: (() => void) | undefined;

	try {
		removeResizeListener = await appWindow.onResized(() => {
			stateCapture.scheduleCapture();
		});
	} catch {
		// Window state restore should not block the shell when native events are unavailable.
	}

	window.addEventListener('beforeunload', stateCapture.captureBeforeUnload);

	return () => {
		removeResizeListener?.();
		window.removeEventListener('beforeunload', stateCapture.captureBeforeUnload);
		stateCapture.destroy();
	};
}
