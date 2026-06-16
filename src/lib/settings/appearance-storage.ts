import {
	createAppearanceSettingsCssVariables,
	createDefaultAppearanceSettings,
	normalizeAppearanceSettings,
	parseAppearanceSettings,
	serializeAppearanceSettings,
	WORKDUCK_APPEARANCE_SETTINGS_STORAGE_KEY,
	type AppearanceSettings
} from './appearance-settings';
import {
	getWorkduckLanguageOption,
	WORKDUCK_MESSAGES_LOADED_EVENT
} from '$lib/i18n/workduck-language';

export const WORKDUCK_APPEARANCE_SETTINGS_CHANGED_EVENT = 'workduck:appearance-settings-changed';
const WORKDUCK_APPEARANCE_SETTINGS_SCOPE_SELECTOR = '.workduck-window-frame';

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

export function applyAppearanceSettingsToBrowserDocument(settings: AppearanceSettings) {
	if (typeof document === 'undefined') {
		return;
	}

	const cssVariables = createAppearanceSettingsCssVariables(settings);
	document.documentElement.lang = getWorkduckLanguageOption(settings.languageId).htmlLang;
	const targets = [
		document.documentElement,
		...document.querySelectorAll<HTMLElement>(WORKDUCK_APPEARANCE_SETTINGS_SCOPE_SELECTOR)
	];

	for (const target of targets) {
		for (const [name, value] of Object.entries(cssVariables)) {
			target.style.setProperty(name, value);
		}
	}
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
		applyAppearanceSettingsToBrowserDocument(normalizedSettings);
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
			const storedSettings = readAppearanceSettingsFromBrowser().settings;

			applyAppearanceSettingsToBrowserDocument(storedSettings);
			callback(storedSettings);
			return;
		}

		const normalizedSettings = normalizeAppearanceSettings(detail.settings);

		applyAppearanceSettingsToBrowserDocument(normalizedSettings);
		callback(normalizedSettings);
	}

	function handleStorage(event: StorageEvent) {
		if (
			event.storageArea !== window.localStorage ||
			event.key !== WORKDUCK_APPEARANCE_SETTINGS_STORAGE_KEY
		) {
			return;
		}

		const storedSettings = parseAppearanceSettings(event.newValue);

		applyAppearanceSettingsToBrowserDocument(storedSettings);
		callback(storedSettings);
	}

	function handleWorkduckMessagesLoaded() {
		const storedSettings = readAppearanceSettingsFromBrowser().settings;

		applyAppearanceSettingsToBrowserDocument(storedSettings);
		callback(storedSettings);
	}

	window.addEventListener(WORKDUCK_APPEARANCE_SETTINGS_CHANGED_EVENT, handleAppearanceSettingsChanged);
	window.addEventListener('storage', handleStorage);
	window.addEventListener(WORKDUCK_MESSAGES_LOADED_EVENT, handleWorkduckMessagesLoaded);

	return () => {
		window.removeEventListener(
			WORKDUCK_APPEARANCE_SETTINGS_CHANGED_EVENT,
			handleAppearanceSettingsChanged
		);
		window.removeEventListener('storage', handleStorage);
		window.removeEventListener(WORKDUCK_MESSAGES_LOADED_EVENT, handleWorkduckMessagesLoaded);
	};
}
