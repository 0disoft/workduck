import {
	parseAppearanceSettings,
	serializeAppearanceSettings,
	WORKDUCK_APPEARANCE_SETTINGS_STORAGE_KEY
} from '#lib/settings/appearance-settings.ts';
import {
	parseSyncSettings,
	serializeSyncSettings,
	WORKDUCK_SYNC_SETTINGS_STORAGE_KEY
} from '#lib/settings/sync-settings.ts';
import {
	parseSystemSettings,
	serializeSystemSettings,
	WORKDUCK_SYSTEM_SETTINGS_STORAGE_KEY
} from '#lib/settings/system-settings.ts';
import {
	parseWorkspaceRegistry,
	serializeWorkspaceRegistry,
	WORKDUCK_WORKSPACE_REGISTRY_STORAGE_KEY
} from '#lib/workspaces/workspace-registry.ts';
import {
	initializeWorkduckAppState,
	WORKDUCK_APPEARANCE_APP_STATE_KEY,
	WORKDUCK_SYNC_APP_STATE_KEY,
	WORKDUCK_SYSTEM_APP_STATE_KEY,
	WORKDUCK_WORKSPACE_REGISTRY_APP_STATE_KEY,
	type WorkduckAppStateInitializationResult
} from './app-state-storage';

let initializationPromise: Promise<WorkduckAppStateInitializationResult> | null = null;

export function initializePersistentAppState(): Promise<WorkduckAppStateInitializationResult> {
	if (initializationPromise !== null) return initializationPromise;
	const attempt = initializeWorkduckAppState([
		{
			key: WORKDUCK_APPEARANCE_APP_STATE_KEY,
			legacyStorageKey: WORKDUCK_APPEARANCE_SETTINGS_STORAGE_KEY,
			valueJson: serializeAppearanceSettings(
				parseAppearanceSettings(readLegacyStorageValue(WORKDUCK_APPEARANCE_SETTINGS_STORAGE_KEY))
			)
		},
		{
			key: WORKDUCK_SYNC_APP_STATE_KEY,
			legacyStorageKey: WORKDUCK_SYNC_SETTINGS_STORAGE_KEY,
			valueJson: serializeSyncSettings(
				parseSyncSettings(readLegacyStorageValue(WORKDUCK_SYNC_SETTINGS_STORAGE_KEY))
			)
		},
		{
			key: WORKDUCK_SYSTEM_APP_STATE_KEY,
			legacyStorageKey: WORKDUCK_SYSTEM_SETTINGS_STORAGE_KEY,
			valueJson: serializeSystemSettings(
				parseSystemSettings(readLegacyStorageValue(WORKDUCK_SYSTEM_SETTINGS_STORAGE_KEY))
			)
		},
		{
			key: WORKDUCK_WORKSPACE_REGISTRY_APP_STATE_KEY,
			legacyStorageKey: WORKDUCK_WORKSPACE_REGISTRY_STORAGE_KEY,
			valueJson: serializeWorkspaceRegistry(
				parseWorkspaceRegistry(readLegacyStorageValue(WORKDUCK_WORKSPACE_REGISTRY_STORAGE_KEY))
			)
		}
	]).then((result) => {
		if (!result.ok && initializationPromise === attempt) initializationPromise = null;
		return result;
	}, () => {
		if (initializationPromise === attempt) initializationPromise = null;
		return { ok: false, error: 'app-state-read-failed' } as const;
	});
	initializationPromise = attempt;

	return initializationPromise;
}

export function resetPersistentAppStateInitializationForTest(): void {
	initializationPromise = null;
}

function readLegacyStorageValue(key: string) {
	if (typeof window === 'undefined') {
		return null;
	}

	try {
		return window.localStorage.getItem(key);
	} catch {
		return null;
	}
}
