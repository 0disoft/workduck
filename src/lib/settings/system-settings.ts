export const WORKDUCK_SYSTEM_SETTINGS_STORAGE_KEY = 'workduck.systemSettings.v1';
export const WORKSPACE_IDLE_LOCK_MINUTE_OPTIONS = [0, 5, 15, 30, 60] as const;
export const WORKSPACE_IDLE_LOCK_DEFAULT_MINUTES = 15;

export interface SystemSettings {
	readonly showTrayIcon: boolean;
	readonly minimizeToTray: boolean;
	readonly workspaceIdleLockMinutes: number;
}

export function createDefaultSystemSettings(): SystemSettings {
	return {
		showTrayIcon: true,
		minimizeToTray: false,
		workspaceIdleLockMinutes: WORKSPACE_IDLE_LOCK_DEFAULT_MINUTES
	};
}

export function normalizeSystemSettings(value: unknown): SystemSettings {
	if (!isObjectRecord(value)) {
		return createDefaultSystemSettings();
	}

	const minimizeToTray = value.minimizeToTray === true;

	return {
		showTrayIcon: minimizeToTray || value.showTrayIcon !== false,
		minimizeToTray,
		workspaceIdleLockMinutes: normalizeWorkspaceIdleLockMinutes(
			value.workspaceIdleLockMinutes
		)
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

export function getWorkspaceIdleLockTimeoutMs(settings: SystemSettings) {
	const minutes = normalizeWorkspaceIdleLockMinutes(settings.workspaceIdleLockMinutes);

	return minutes === 0 ? null : minutes * 60 * 1000;
}

function normalizeWorkspaceIdleLockMinutes(value: unknown) {
	const numericValue = typeof value === 'number' ? value : Number(value);

	if (!Number.isFinite(numericValue)) {
		return WORKSPACE_IDLE_LOCK_DEFAULT_MINUTES;
	}

	const roundedValue = Math.round(numericValue);

	return WORKSPACE_IDLE_LOCK_MINUTE_OPTIONS.includes(
		roundedValue as (typeof WORKSPACE_IDLE_LOCK_MINUTE_OPTIONS)[number]
	)
		? roundedValue
		: WORKSPACE_IDLE_LOCK_DEFAULT_MINUTES;
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}
