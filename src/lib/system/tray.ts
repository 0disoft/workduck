import {
	getTauriGlobal as getWorkduckTauriGlobal,
	getTauriInvoke
} from '$lib/tauri/tauri-invoke';

const WORKDUCK_TRAY_ID = 'workduck-main-tray';

type TauriTrayIconEvent = {
	readonly type: string;
	readonly button?: string;
	readonly buttonState?: string;
	readonly position?: {
		readonly x?: number;
		readonly y?: number;
	};
};

interface TauriWindowController {
	readonly close?: () => Promise<void>;
	readonly hide?: () => Promise<void>;
	readonly setFocus?: () => Promise<void>;
	readonly show?: () => Promise<void>;
	readonly unminimize?: () => Promise<void>;
}

interface TauriWindowApi {
	readonly getCurrentWindow?: () => TauriWindowController;
}

interface TauriAppApi {
	readonly defaultWindowIcon?: () => Promise<unknown | null>;
}

interface TauriTrayIconController {
	readonly setVisible?: (visible: boolean) => Promise<void>;
}

interface TauriTrayApi {
	readonly TrayIcon?: {
		readonly getById: (id: string) => Promise<TauriTrayIconController | null>;
		readonly new: (options?: {
			readonly id?: string;
			readonly icon?: unknown;
			readonly menu?: unknown;
			readonly tooltip?: string;
			readonly showMenuOnLeftClick?: boolean;
			readonly action?: (event: TauriTrayIconEvent) => void;
		}) => Promise<TauriTrayIconController>;
		readonly removeById: (id: string) => Promise<void>;
	};
}

interface WorkduckTrayTauriGlobal {
	readonly app?: TauriAppApi;
	readonly tray?: TauriTrayApi;
	readonly window?: TauriWindowApi;
}

export async function ensureWorkduckTrayIcon(): Promise<boolean> {
	const tauri = getTauriGlobal();
	const TrayIcon = tauri?.tray?.TrayIcon;

	if (TrayIcon === undefined) {
		return false;
	}

	try {
		const existingTrayIcon = await TrayIcon.getById(WORKDUCK_TRAY_ID);

		if (existingTrayIcon !== null) {
			await existingTrayIcon.setVisible?.(true);
			return true;
		}

		const trayIcon = await TrayIcon.new({
			id: WORKDUCK_TRAY_ID,
			icon: await readDefaultWindowIcon(),
			tooltip: 'Workduck',
			showMenuOnLeftClick: false,
			action: (event) => {
				if (
					event.type === 'Click' &&
					event.button === 'Left' &&
					(event.buttonState === undefined || event.buttonState === 'Up')
				) {
					void restoreWorkduckWindowFromTray();
					return;
				}

				if (
					event.type === 'Click' &&
					event.button === 'Right' &&
					(event.buttonState === undefined || event.buttonState === 'Up')
				) {
					void showWorkduckTrayMenu(event);
				}
			}
		});

		await trayIcon.setVisible?.(true);
		return true;
	} catch {
		return false;
	}
}

export async function removeWorkduckTrayIcon(): Promise<void> {
	const TrayIcon = getTauriGlobal()?.tray?.TrayIcon;

	if (TrayIcon === undefined) {
		return;
	}

	try {
		await TrayIcon.removeById(WORKDUCK_TRAY_ID);
	} catch {
		return;
	}
}

export async function syncWorkduckTrayIconEnabled(enabled: boolean): Promise<void> {
	if (enabled) {
		await ensureWorkduckTrayIcon();
		return;
	}

	await removeWorkduckTrayIcon();
}

export async function hideWorkduckWindowToTray(): Promise<boolean> {
	const appWindow = getCurrentTauriWindow();

	if (appWindow?.hide === undefined) {
		return false;
	}

	const trayReady = await ensureWorkduckTrayIcon();

	if (!trayReady) {
		return false;
	}

	try {
		await appWindow.hide();
		return true;
	} catch {
		return false;
	}
}

async function restoreWorkduckWindowFromTray() {
	const invoke = getTauriInvoke();

	if (invoke !== undefined) {
		try {
			await invoke('show_workduck_main_window');
			return;
		} catch {
			// Fall through to the direct window API when the command is unavailable.
		}
	}

	const appWindow = getCurrentTauriWindow();

	if (appWindow === undefined) {
		return;
	}

	try {
		await appWindow.show?.();
		await appWindow.unminimize?.();
		await appWindow.setFocus?.();
	} catch {
		return;
	}
}

async function showWorkduckTrayMenu(event: TauriTrayIconEvent) {
	const invoke = getTauriInvoke();

	if (invoke === undefined) {
		return;
	}

	try {
		await invoke('show_workduck_tray_menu', {
			position: normalizeTrayPosition(event.position)
		});
	} catch {
		return;
	}
}

async function readDefaultWindowIcon() {
	const defaultWindowIcon = getTauriGlobal()?.app?.defaultWindowIcon;

	if (defaultWindowIcon === undefined) {
		return undefined;
	}

	try {
		return (await defaultWindowIcon()) ?? undefined;
	} catch {
		return undefined;
	}
}

function getCurrentTauriWindow() {
	return getTauriGlobal()?.window?.getCurrentWindow?.();
}

function normalizeTrayPosition(position: TauriTrayIconEvent['position']) {
	if (
		position === undefined ||
		typeof position.x !== 'number' ||
		typeof position.y !== 'number' ||
		!Number.isFinite(position.x) ||
		!Number.isFinite(position.y)
	) {
		return null;
	}

	return {
		x: position.x,
		y: position.y
	};
}

function getTauriGlobal() {
	return getWorkduckTauriGlobal() as WorkduckTrayTauriGlobal | undefined;
}
