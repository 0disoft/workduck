export const WORKDUCK_SYSTEM_SETTINGS_STORAGE_KEY = 'workduck.systemSettings.v1';

export interface SystemSettings {
	readonly showTrayIcon: boolean;
	readonly minimizeToTray: boolean;
}

export function createDefaultSystemSettings(): SystemSettings {
	return {
		showTrayIcon: true,
		minimizeToTray: false
	};
}

export function normalizeSystemSettings(value: unknown): SystemSettings {
	if (!isObjectRecord(value)) {
		return createDefaultSystemSettings();
	}

	const minimizeToTray = value.minimizeToTray === true;

	return {
		showTrayIcon: minimizeToTray || value.showTrayIcon !== false,
		minimizeToTray
	};
}

export function parseSystemSettings(serializedSettings: string | null): SystemSettings {
	if (serializedSettings === null) {
		return createDefaultSystemSettings();
	}

	try {
		return normalizeSystemSettings(JSON.parse(serializedSettings));
	} catch {
		return createDefaultSystemSettings();
	}
}

export function serializeSystemSettings(settings: SystemSettings): string {
	return JSON.stringify(normalizeSystemSettings(settings));
}

export function shouldShowWorkduckTrayIcon(settings: SystemSettings): boolean {
	return settings.showTrayIcon || settings.minimizeToTray;
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}
