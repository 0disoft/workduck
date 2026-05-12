interface TauriWindowController {
	close: () => Promise<void>;
	minimize: () => Promise<void>;
	startDragging: () => Promise<void>;
	toggleMaximize: () => Promise<void>;
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

function getCurrentTauriWindow() {
	if (typeof window === 'undefined') {
		return undefined;
	}

	return window.__TAURI__?.window?.getCurrentWindow?.();
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
	return runWindowAction((appWindow) => appWindow.close());
}

export function minimizeTauriWindow() {
	return runWindowAction((appWindow) => appWindow.minimize());
}

export function startTauriWindowDrag() {
	return runWindowAction((appWindow) => appWindow.startDragging());
}

export function toggleTauriWindowMaximize() {
	return runWindowAction((appWindow) => appWindow.toggleMaximize());
}
