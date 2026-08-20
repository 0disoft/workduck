import {
	createAppearanceSettingsCssVariables,
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
import {
	isWorkduckAppStateBrowserStorageActive,
	readWorkduckAppStateValue,
	subscribeWorkduckAppStateValue,
	WORKDUCK_APPEARANCE_APP_STATE_KEY,
	writeWorkduckAppStateValue
} from '$lib/app-state/app-state-storage';

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
	const result = readWorkduckAppStateValue(
		WORKDUCK_APPEARANCE_APP_STATE_KEY,
		WORKDUCK_APPEARANCE_SETTINGS_STORAGE_KEY
	);
	const settings = parseAppearanceSettings(result.valueJson);

	return result.ok
		? { ok: true, settings }
		: {
				ok: false,
				settings,
				error: 'appearance-settings-storage-unavailable'
			};
}

export function writeAppearanceSettingsToBrowser(
	settings: AppearanceSettings
): AppearanceSettingsStorageResult {
	const normalizedSettings = normalizeAppearanceSettings(settings);
	const result = writeWorkduckAppStateValue(
		WORKDUCK_APPEARANCE_APP_STATE_KEY,
		WORKDUCK_APPEARANCE_SETTINGS_STORAGE_KEY,
		serializeAppearanceSettings(normalizedSettings)
	);

	if (!result.ok) {
		return {
			ok: false,
			settings: normalizedSettings,
			error: 'appearance-settings-storage-unavailable'
		};
	}

	applyAppearanceSettingsToBrowserDocument(normalizedSettings);

	if (typeof window !== 'undefined') {
		window.dispatchEvent(
			new CustomEvent<AppearanceSettingsChangedDetail>(WORKDUCK_APPEARANCE_SETTINGS_CHANGED_EVENT, {
				detail: { settings: normalizedSettings }
			})
		);
	}

	return { ok: true, settings: normalizedSettings };
}

export function subscribeAppearanceSettings(
	callback: (settings: AppearanceSettings) => void
) {
	if (typeof window === 'undefined') {
		return () => undefined;
	}

	function applyAndNotify(settings: AppearanceSettings) {
		applyAppearanceSettingsToBrowserDocument(settings);
		callback(settings);
	}

	function handleAppearanceSettingsChanged(event: Event) {
		const detail = (event as CustomEvent<AppearanceSettingsChangedDetail>).detail;

		if (detail === undefined) {
			applyAndNotify(readAppearanceSettingsFromBrowser().settings);
			return;
		}

		applyAndNotify(normalizeAppearanceSettings(detail.settings));
	}

	function handleStorage(event: StorageEvent) {
		if (
			!isWorkduckAppStateBrowserStorageActive() ||
			event.storageArea !== window.localStorage ||
			event.key !== WORKDUCK_APPEARANCE_SETTINGS_STORAGE_KEY
		) {
			return;
		}

		applyAndNotify(parseAppearanceSettings(event.newValue));
	}

	function handleWorkduckMessagesLoaded() {
		applyAndNotify(readAppearanceSettingsFromBrowser().settings);
	}

	const unsubscribeAppState = subscribeWorkduckAppStateValue(
		WORKDUCK_APPEARANCE_APP_STATE_KEY,
		(valueJson) => {
			applyAndNotify(parseAppearanceSettings(valueJson));
		}
	);

	window.addEventListener(WORKDUCK_APPEARANCE_SETTINGS_CHANGED_EVENT, handleAppearanceSettingsChanged);
	window.addEventListener('storage', handleStorage);
	window.addEventListener(WORKDUCK_MESSAGES_LOADED_EVENT, handleWorkduckMessagesLoaded);

	return () => {
		unsubscribeAppState();
		window.removeEventListener(
			WORKDUCK_APPEARANCE_SETTINGS_CHANGED_EVENT,
			handleAppearanceSettingsChanged
		);
		window.removeEventListener('storage', handleStorage);
		window.removeEventListener(WORKDUCK_MESSAGES_LOADED_EVENT, handleWorkduckMessagesLoaded);
	};
}
