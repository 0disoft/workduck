import { isObjectRecord } from '$lib/shared/object-record';
import {
	DEFAULT_WORKDUCK_LANGUAGE_ID,
	normalizeWorkduckLanguageId,
	type WorkduckLanguageId
} from '$lib/i18n/workduck-language';

export const WORKDUCK_APPEARANCE_SETTINGS_STORAGE_KEY = 'workduck.appearanceSettings.v1';

export const FONT_SIZE_STEP_VALUES = [14, 15, 16, 17, 18] as const;

export const INTERFACE_FONT_SIZE_MIN_PX = FONT_SIZE_STEP_VALUES[0];
export const INTERFACE_FONT_SIZE_MAX_PX = 18;
export const INTERFACE_FONT_SIZE_DEFAULT_PX = 16;

export interface AppearanceSettings {
	readonly languageId: WorkduckLanguageId;
	readonly fontSizePx: number;
}

type AppearanceSettingsCssVariableName = '--workduck-ui-font-size';

export type AppearanceSettingsCssVariables = Readonly<
	Record<AppearanceSettingsCssVariableName, string>
>;

export function createDefaultAppearanceSettings(): AppearanceSettings {
	return {
		languageId: DEFAULT_WORKDUCK_LANGUAGE_ID,
		fontSizePx: INTERFACE_FONT_SIZE_DEFAULT_PX
	};
}

export function normalizeAppearanceSettings(value: unknown): AppearanceSettings {
	if (!isObjectRecord(value)) {
		return createDefaultAppearanceSettings();
	}

	return {
		languageId: normalizeWorkduckLanguageId(value.languageId),
		fontSizePx: normalizeAllowedInteger(
			value.fontSizePx,
			FONT_SIZE_STEP_VALUES,
			INTERFACE_FONT_SIZE_DEFAULT_PX
		)
	};
}

export function parseAppearanceSettings(serializedSettings: string | null): AppearanceSettings {
	if (serializedSettings === null) {
		return createDefaultAppearanceSettings();
	}

	try {
		return normalizeAppearanceSettings(JSON.parse(serializedSettings));
	} catch {
		return createDefaultAppearanceSettings();
	}
}

export function serializeAppearanceSettings(settings: AppearanceSettings): string {
	return JSON.stringify(normalizeAppearanceSettings(settings));
}

export function createAppearanceSettingsCssVariables(
	settings: AppearanceSettings
): AppearanceSettingsCssVariables {
	const normalizedSettings = normalizeAppearanceSettings(settings);

	return {
		'--workduck-ui-font-size': `${normalizedSettings.fontSizePx}px`
	};
}

function normalizeAllowedInteger(
	value: unknown,
	allowedValues: readonly number[],
	fallback: number
) {
	const numericValue = typeof value === 'number' ? value : Number(value);

	if (!Number.isFinite(numericValue)) {
		return fallback;
	}

	const roundedValue = Math.round(numericValue);

	return allowedValues.reduce((closestValue, candidateValue) => {
		const closestDistance = Math.abs(closestValue - roundedValue);
		const candidateDistance = Math.abs(candidateValue - roundedValue);

		if (candidateDistance < closestDistance) {
			return candidateValue;
		}

		if (candidateDistance === closestDistance && candidateValue === fallback) {
			return candidateValue;
		}

		return closestValue;
	}, fallback);
}
