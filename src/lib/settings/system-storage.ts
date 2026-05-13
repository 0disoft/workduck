import {
	createDefaultSystemSettings,
	normalizeSystemSettings,
	parseSystemSettings,
	serializeSystemSettings,
	WORKDUCK_SYSTEM_SETTINGS_STORAGE_KEY,
	type SystemSettings
} from './system-settings';

export const WORKDUCK_SYSTEM_SETTINGS_CHANGED_EVENT = 'workduck:system-settings-changed';

export type SystemSettingsStorageError = 'system-settings-storage-unavailable';

export type SystemSettingsStorageResult =
	| {
			readonly ok: true;
			readonly settings: SystemSettings;
	  }
	| {
			readonly ok: false;
			readonly settings: SystemSettings;
			readonly error: SystemSettingsStorageError;
	  };

interface SystemSettingsChangedDetail {
	readonly settings: SystemSettings;
}

export function readSystemSettingsFromBrowser(): SystemSettingsStorageResult {
	if (typeof window === 'undefined') {
		return { ok: true, settings: createDefaultSystemSettings() };
	}

	try {
		return {
			ok: true,
			settings: parseSystemSettings(
				window.localStorage.getItem(WORKDUCK_SYSTEM_SETTINGS_STORAGE_KEY)
			)
		};
	} catch {
		return {
			ok: false,
			settings: createDefaultSystemSettings(),
			error: 'system-settings-storage-unavailable'
		};
	}
}

export function writeSystemSettingsToBrowser(
	settings: SystemSettings
): SystemSettingsStorageResult {
	const normalizedSettings = normalizeSystemSettings(settings);

	if (typeof window === 'undefined') {
		return { ok: true, settings: normalizedSettings };
	}

	try {
		window.localStorage.setItem(
			WORKDUCK_SYSTEM_SETTINGS_STORAGE_KEY,
			serializeSystemSettings(normalizedSettings)
		);
		window.dispatchEvent(
			new CustomEvent<SystemSettingsChangedDetail>(WORKDUCK_SYSTEM_SETTINGS_CHANGED_EVENT, {
				detail: { settings: normalizedSettings }
			})
		);
		return { ok: true, settings: normalizedSettings };
	} catch {
		return {
			ok: false,
			settings: normalizedSettings,
			error: 'system-settings-storage-unavailable'
		};
	}
}

export function subscribeSystemSettings(callback: (settings: SystemSettings) => void) {
	if (typeof window === 'undefined') {
		return () => undefined;
	}

	function handleSystemSettingsChanged(event: Event) {
		const detail = (event as CustomEvent<SystemSettingsChangedDetail>).detail;

		if (detail === undefined) {
			callback(readSystemSettingsFromBrowser().settings);
			return;
		}

		callback(normalizeSystemSettings(detail.settings));
	}

	function handleStorage(event: StorageEvent) {
		if (
			event.storageArea !== window.localStorage ||
			event.key !== WORKDUCK_SYSTEM_SETTINGS_STORAGE_KEY
		) {
			return;
		}

		callback(parseSystemSettings(event.newValue));
	}

	window.addEventListener(WORKDUCK_SYSTEM_SETTINGS_CHANGED_EVENT, handleSystemSettingsChanged);
	window.addEventListener('storage', handleStorage);

	return () => {
		window.removeEventListener(WORKDUCK_SYSTEM_SETTINGS_CHANGED_EVENT, handleSystemSettingsChanged);
		window.removeEventListener('storage', handleStorage);
	};
}
