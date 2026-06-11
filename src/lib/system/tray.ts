import { defaultWindowIcon } from '@tauri-apps/api/app';
import { TrayIcon, type TrayIconEvent, type TrayIconOptions } from '@tauri-apps/api/tray';
import { getCurrentWindow } from '@tauri-apps/api/window';

import { getTauriInvoke, isTauriRuntimeAvailable } from '$lib/tauri/tauri-invoke';

const WORKDUCK_TRAY_ID = 'workduck-main-tray';

export async function ensureWorkduckTrayIcon(): Promise<boolean> {
	if (!isTauriRuntimeAvailable()) {
		return false;
	}

	try {
		const existingTrayIcon = await TrayIcon.getById(WORKDUCK_TRAY_ID);

		if (existingTrayIcon !== null) {
			await existingTrayIcon.setVisible?.(true);
			return true;
		}

		const trayIconOptions: TrayIconOptions = {
			id: WORKDUCK_TRAY_ID,
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
		};
		const icon = await readDefaultWindowIcon();

		if (icon !== undefined) {
			trayIconOptions.icon = icon;
		}

		const trayIcon = await TrayIcon.new(trayIconOptions);

		await trayIcon.setVisible?.(true);
		return true;
	} catch {
		return false;
	}
}

export async function removeWorkduckTrayIcon(): Promise<void> {
	if (!isTauriRuntimeAvailable()) {
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

	if (appWindow === undefined) {
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
		await appWindow.show();
		await appWindow.unminimize();
		await appWindow.setFocus();
	} catch {
		return;
	}
}

async function showWorkduckTrayMenu(event: TrayIconEvent) {
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
	try {
		return (await defaultWindowIcon()) ?? undefined;
	} catch {
		return undefined;
	}
}

function getCurrentTauriWindow() {
	if (!isTauriRuntimeAvailable()) {
		return undefined;
	}

	return getCurrentWindow();
}

function normalizeTrayPosition(position: TrayIconEvent['position']) {
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
