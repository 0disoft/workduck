import {
	createDefaultAppearanceSettings,
	normalizeAppearanceSettings,
	parseAppearanceSettings,
	serializeAppearanceSettings,
	WORKDUCK_APPEARANCE_SETTINGS_STORAGE_KEY,
	type AppearanceSettings
} from './appearance-settings';

export const WORKDUCK_APPEARANCE_SETTINGS_CHANGED_EVENT = 'workduck:appearance-settings-changed';

export type AppearanceSettingsStorageError = 'appearance-settings-storage-unavailable';

export type AppearanceSettingsStorageResult =
	| {
			readonly ok: true;
			readonly settings: AppearanceSettings;
	  }
	| {
			readonly ok: false;
			readonly settings: AppearanceSettings;
			readonly error: AppearanceSettingsStorageError;
	  };

interface AppearanceSettingsChangedDetail {
	readonly settings: AppearanceSettings;
}

export function readAppearanceSettingsFromBrowser(): AppearanceSettingsStorageResult {
	if (typeof window === 'undefined') {
		return { ok: true, settings: createDefaultAppearanceSettings() };
	}

	try {
		return {
			ok: true,
			settings: parseAppearanceSettings(
				window.localStorage.getItem(WORKDUCK_APPEARANCE_SETTINGS_STORAGE_KEY)
			)
		};
	} catch {
		return {
			ok: false,
			settings: createDefaultAppearanceSettings(),
			error: 'appearance-settings-storage-unavailable'
		};
	}
}

export function writeAppearanceSettingsToBrowser(
	settings: AppearanceSettings
): AppearanceSettingsStorageResult {
	const normalizedSettings = normalizeAppearanceSettings(settings);

	if (typeof window === 'undefined') {
		return { ok: true, settings: normalizedSettings };
	}

	try {
		window.localStorage.setItem(
			WORKDUCK_APPEARANCE_SETTINGS_STORAGE_KEY,
			serializeAppearanceSettings(normalizedSettings)
		);
		window.dispatchEvent(
			new CustomEvent<AppearanceSettingsChangedDetail>(WORKDUCK_APPEARANCE_SETTINGS_CHANGED_EVENT, {
				detail: { settings: normalizedSettings }
			})
		);
		return { ok: true, settings: normalizedSettings };
	} catch {
		return {
			ok: false,
			settings: normalizedSettings,
			error: 'appearance-settings-storage-unavailable'
		};
	}
}

export function subscribeAppearanceSettings(
	callback: (settings: AppearanceSettings) => void
) {
	if (typeof window === 'undefined') {
		return () => undefined;
	}

	function handleAppearanceSettingsChanged(event: Event) {
		const detail = (event as CustomEvent<AppearanceSettingsChangedDetail>).detail;

		if (detail === undefined) {
			callback(readAppearanceSettingsFromBrowser().settings);
			return;
		}

		callback(normalizeAppearanceSettings(detail.settings));
	}

	function handleStorage(event: StorageEvent) {
		if (
			event.storageArea !== window.localStorage ||
			event.key !== WORKDUCK_APPEARANCE_SETTINGS_STORAGE_KEY
		) {
			return;
		}

		callback(parseAppearanceSettings(event.newValue));
	}

	window.addEventListener(WORKDUCK_APPEARANCE_SETTINGS_CHANGED_EVENT, handleAppearanceSettingsChanged);
	window.addEventListener('storage', handleStorage);

	return () => {
		window.removeEventListener(
			WORKDUCK_APPEARANCE_SETTINGS_CHANGED_EVENT,
			handleAppearanceSettingsChanged
		);
		window.removeEventListener('storage', handleStorage);
	};
}
