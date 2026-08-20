import {
	normalizeSyncSettings,
	parseSyncSettings,
	serializeSyncSettings,
	WORKDUCK_SYNC_SETTINGS_STORAGE_KEY,
	type SyncSettings
} from './sync-settings';
import {
	isWorkduckAppStateBrowserStorageActive,
	readWorkduckAppStateValue,
	subscribeWorkduckAppStateValue,
	WORKDUCK_SYNC_APP_STATE_KEY,
	writeWorkduckAppStateValue
} from '$lib/app-state/app-state-storage';

export const WORKDUCK_SYNC_SETTINGS_CHANGED_EVENT = 'workduck:sync-settings-changed';

export type SyncSettingsStorageError = 'sync-settings-storage-unavailable';

export type SyncSettingsStorageResult =
	| {
			readonly ok: true;
			readonly settings: SyncSettings;
	  }
	| {
			readonly ok: false;
			readonly settings: SyncSettings;
			readonly error: SyncSettingsStorageError;
	  };

interface SyncSettingsChangedDetail {
	readonly settings: SyncSettings;
}

export function readSyncSettingsFromBrowser(): SyncSettingsStorageResult {
	const result = readWorkduckAppStateValue(
		WORKDUCK_SYNC_APP_STATE_KEY,
		WORKDUCK_SYNC_SETTINGS_STORAGE_KEY
	);
	const settings = parseSyncSettings(result.valueJson);

	return result.ok
		? { ok: true, settings }
		: {
				ok: false,
				settings,
				error: 'sync-settings-storage-unavailable'
			};
}

export function writeSyncSettingsToBrowser(
	settings: SyncSettings
): SyncSettingsStorageResult {
	const normalizedSettings = normalizeSyncSettings(settings);
	const result = writeWorkduckAppStateValue(
		WORKDUCK_SYNC_APP_STATE_KEY,
		WORKDUCK_SYNC_SETTINGS_STORAGE_KEY,
		serializeSyncSettings(normalizedSettings)
	);

	if (!result.ok) {
		return {
			ok: false,
			settings: normalizedSettings,
			error: 'sync-settings-storage-unavailable'
		};
	}

	if (typeof window !== 'undefined') {
		window.dispatchEvent(
			new CustomEvent<SyncSettingsChangedDetail>(WORKDUCK_SYNC_SETTINGS_CHANGED_EVENT, {
				detail: { settings: normalizedSettings }
			})
		);
	}

	return { ok: true, settings: normalizedSettings };
}

export function subscribeSyncSettings(callback: (settings: SyncSettings) => void) {
	if (typeof window === 'undefined') {
		return () => undefined;
	}

	function handleSyncSettingsChanged(event: Event) {
		const detail = (event as CustomEvent<SyncSettingsChangedDetail>).detail;

		callback(
			detail === undefined
				? readSyncSettingsFromBrowser().settings
				: normalizeSyncSettings(detail.settings)
		);
	}

	function handleStorage(event: StorageEvent) {
		if (
			!isWorkduckAppStateBrowserStorageActive() ||
			event.storageArea !== window.localStorage ||
			event.key !== WORKDUCK_SYNC_SETTINGS_STORAGE_KEY
		) {
			return;
		}

		callback(parseSyncSettings(event.newValue));
	}

	const unsubscribeAppState = subscribeWorkduckAppStateValue(
		WORKDUCK_SYNC_APP_STATE_KEY,
		(valueJson) => {
			callback(parseSyncSettings(valueJson));
		}
	);

	window.addEventListener(WORKDUCK_SYNC_SETTINGS_CHANGED_EVENT, handleSyncSettingsChanged);
	window.addEventListener('storage', handleStorage);

	return () => {
		unsubscribeAppState();
		window.removeEventListener(WORKDUCK_SYNC_SETTINGS_CHANGED_EVENT, handleSyncSettingsChanged);
		window.removeEventListener('storage', handleStorage);
	};
}
