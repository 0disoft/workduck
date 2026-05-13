import {
	createDefaultSyncSettings,
	normalizeSyncSettings,
	parseSyncSettings,
	serializeSyncSettings,
	WORKDUCK_SYNC_SETTINGS_STORAGE_KEY,
	type SyncSettings
} from './sync-settings';

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
	if (typeof window === 'undefined') {
		return { ok: true, settings: createDefaultSyncSettings() };
	}

	try {
		return {
			ok: true,
			settings: parseSyncSettings(window.localStorage.getItem(WORKDUCK_SYNC_SETTINGS_STORAGE_KEY))
		};
	} catch {
		return {
			ok: false,
			settings: createDefaultSyncSettings(),
			error: 'sync-settings-storage-unavailable'
		};
	}
}

export function writeSyncSettingsToBrowser(
	settings: SyncSettings
): SyncSettingsStorageResult {
	const normalizedSettings = normalizeSyncSettings(settings);

	if (typeof window === 'undefined') {
		return { ok: true, settings: normalizedSettings };
	}

	try {
		window.localStorage.setItem(
			WORKDUCK_SYNC_SETTINGS_STORAGE_KEY,
			serializeSyncSettings(normalizedSettings)
		);
		window.dispatchEvent(
			new CustomEvent<SyncSettingsChangedDetail>(WORKDUCK_SYNC_SETTINGS_CHANGED_EVENT, {
				detail: { settings: normalizedSettings }
			})
		);
		return { ok: true, settings: normalizedSettings };
	} catch {
		return {
			ok: false,
			settings: normalizedSettings,
			error: 'sync-settings-storage-unavailable'
		};
	}
}

export function subscribeSyncSettings(callback: (settings: SyncSettings) => void) {
	if (typeof window === 'undefined') {
		return () => undefined;
	}

	function handleSyncSettingsChanged(event: Event) {
		const detail = (event as CustomEvent<SyncSettingsChangedDetail>).detail;

		callback(detail === undefined ? readSyncSettingsFromBrowser().settings : detail.settings);
	}

	function handleStorage(event: StorageEvent) {
		if (
			event.storageArea !== window.localStorage ||
			event.key !== WORKDUCK_SYNC_SETTINGS_STORAGE_KEY
		) {
			return;
		}

		callback(parseSyncSettings(event.newValue));
	}

	window.addEventListener(WORKDUCK_SYNC_SETTINGS_CHANGED_EVENT, handleSyncSettingsChanged);
	window.addEventListener('storage', handleStorage);

	return () => {
		window.removeEventListener(WORKDUCK_SYNC_SETTINGS_CHANGED_EVENT, handleSyncSettingsChanged);
		window.removeEventListener('storage', handleStorage);
	};
}
