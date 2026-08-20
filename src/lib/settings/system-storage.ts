import {
	normalizeSystemSettings,
	parseSystemSettings,
	serializeSystemSettings,
	WORKDUCK_SYSTEM_SETTINGS_STORAGE_KEY,
	type SystemSettings
} from './system-settings';
import {
	readWorkduckAppStateValue,
	subscribeWorkduckAppStateValue,
	WORKDUCK_SYSTEM_APP_STATE_KEY,
	writeWorkduckAppStateValue
} from '$lib/app-state/app-state-storage';

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
	const result = readWorkduckAppStateValue(
		WORKDUCK_SYSTEM_APP_STATE_KEY,
		WORKDUCK_SYSTEM_SETTINGS_STORAGE_KEY
	);
	const settings = parseSystemSettings(result.valueJson);

	return result.ok
		? { ok: true, settings }
		: {
				ok: false,
				settings,
				error: 'system-settings-storage-unavailable'
			};
}

export function writeSystemSettingsToBrowser(
	settings: SystemSettings
): SystemSettingsStorageResult {
	const normalizedSettings = normalizeSystemSettings(settings);
	const result = writeWorkduckAppStateValue(
		WORKDUCK_SYSTEM_APP_STATE_KEY,
		WORKDUCK_SYSTEM_SETTINGS_STORAGE_KEY,
		serializeSystemSettings(normalizedSettings)
	);

	if (!result.ok) {
		return {
			ok: false,
			settings: normalizedSettings,
			error: 'system-settings-storage-unavailable'
		};
	}

	if (typeof window !== 'undefined') {
		window.dispatchEvent(
			new CustomEvent<SystemSettingsChangedDetail>(WORKDUCK_SYSTEM_SETTINGS_CHANGED_EVENT, {
				detail: { settings: normalizedSettings }
			})
		);
	}

	return { ok: true, settings: normalizedSettings };
}

export function subscribeSystemSettings(callback: (settings: SystemSettings) => void) {
	if (typeof window === 'undefined') {
		return () => undefined;
	}

	function handleSystemSettingsChanged(event: Event) {
		const detail = (event as CustomEvent<SystemSettingsChangedDetail>).detail;

		callback(
			detail === undefined
				? readSystemSettingsFromBrowser().settings
				: normalizeSystemSettings(detail.settings)
		);
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

	const unsubscribeAppState = subscribeWorkduckAppStateValue(
		WORKDUCK_SYSTEM_APP_STATE_KEY,
		(valueJson) => {
			callback(parseSystemSettings(valueJson));
		}
	);

	window.addEventListener(WORKDUCK_SYSTEM_SETTINGS_CHANGED_EVENT, handleSystemSettingsChanged);
	window.addEventListener('storage', handleStorage);

	return () => {
		unsubscribeAppState();
		window.removeEventListener(WORKDUCK_SYSTEM_SETTINGS_CHANGED_EVENT, handleSystemSettingsChanged);
		window.removeEventListener('storage', handleStorage);
	};
}
