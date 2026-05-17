import {
	DEFAULT_WORKDUCK_LANGUAGE_ID,
	normalizeWorkduckLanguageId,
	type WorkduckLanguageId
} from '$lib/i18n/workduck-language';

export const WORKDUCK_APPEARANCE_SETTINGS_STORAGE_KEY = 'workduck.appearanceSettings.v1';

export const FONT_SIZE_STEP_VALUES = [14, 15, 16, 17, 18] as const;
export const EDITOR_TAB_SIZE_STEP_VALUES = [2, 4] as const;

export const INTERFACE_FONT_SIZE_MIN_PX = FONT_SIZE_STEP_VALUES[0];
export const INTERFACE_FONT_SIZE_MAX_PX = 18;
export const INTERFACE_FONT_SIZE_DEFAULT_PX = 16;

export const EDITOR_FONT_SIZE_MIN_PX = FONT_SIZE_STEP_VALUES[0];
export const EDITOR_FONT_SIZE_MAX_PX = 18;
export const EDITOR_FONT_SIZE_DEFAULT_PX = 16;

export const EDITOR_TAB_SIZE_MIN = EDITOR_TAB_SIZE_STEP_VALUES[0];
export const EDITOR_TAB_SIZE_MAX = 4;
export const EDITOR_TAB_SIZE_DEFAULT = 2;

const bundledEditorFontStack = [
	'"JetBrains Mono Variable"',
	'"JetBrains Mono"',
	'"Cascadia Code Variable"',
	'"Cascadia Code"',
	'"Fira Code Variable"',
	'"Fira Code"',
	'"Source Code Pro Variable"',
	'"Source Code Pro"',
	'"Geist Mono Variable"',
	'"Geist Mono"'
].join(', ');

const systemEditorFontStack =
	'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace';

function createBundledEditorFontStack(primaryFontStack: string) {
	return `${primaryFontStack}, ${bundledEditorFontStack}, ${systemEditorFontStack}`;
}

export const editorFontOptions = [
	{
		id: 'jetbrains-mono',
		label: 'JetBrains Mono (bundled)',
		fontFamily: createBundledEditorFontStack('"JetBrains Mono Variable", "JetBrains Mono"')
	},
	{
		id: 'cascadia-code',
		label: 'Cascadia Code (bundled)',
		fontFamily: createBundledEditorFontStack('"Cascadia Code Variable", "Cascadia Code"')
	},
	{
		id: 'fira-code',
		label: 'Fira Code (bundled)',
		fontFamily: createBundledEditorFontStack('"Fira Code Variable", "Fira Code"')
	},
	{
		id: 'source-code-pro',
		label: 'Source Code Pro (bundled)',
		fontFamily: createBundledEditorFontStack('"Source Code Pro Variable", "Source Code Pro"')
	},
	{
		id: 'geist-mono',
		label: 'Geist Mono (bundled)',
		fontFamily: createBundledEditorFontStack('"Geist Mono Variable", "Geist Mono"')
	},
	{
		id: 'system-mono',
		label: 'System Mono (system)',
		fontFamily: systemEditorFontStack
	},
	{
		id: 'consolas',
		label: 'Consolas (system)',
		fontFamily: createBundledEditorFontStack('Consolas')
	}
] as const;

export type EditorFontId = (typeof editorFontOptions)[number]['id'];

export interface AppearanceSettings {
	readonly languageId: WorkduckLanguageId;
	readonly fontSizePx: number;
	readonly editorFontSizePx: number;
	readonly editorFontId: EditorFontId;
	readonly editorTabSize: number;
}

type AppearanceSettingsCssVariableName =
	| '--workduck-ui-font-size'
	| '--workduck-editor-font-size'
	| '--workduck-editor-font-family'
	| '--workduck-editor-tab-size';

export type AppearanceSettingsCssVariables = Readonly<
	Record<AppearanceSettingsCssVariableName, string>
>;

export function createDefaultAppearanceSettings(): AppearanceSettings {
	return {
		languageId: DEFAULT_WORKDUCK_LANGUAGE_ID,
		fontSizePx: INTERFACE_FONT_SIZE_DEFAULT_PX,
		editorFontSizePx: EDITOR_FONT_SIZE_DEFAULT_PX,
		editorFontId: 'jetbrains-mono',
		editorTabSize: EDITOR_TAB_SIZE_DEFAULT
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
		),
		editorFontSizePx: normalizeAllowedInteger(
			value.editorFontSizePx,
			FONT_SIZE_STEP_VALUES,
			EDITOR_FONT_SIZE_DEFAULT_PX
		),
		editorFontId: normalizeEditorFontId(value.editorFontId),
		editorTabSize: normalizeAllowedInteger(
			value.editorTabSize,
			EDITOR_TAB_SIZE_STEP_VALUES,
			EDITOR_TAB_SIZE_DEFAULT
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
	const editorFont = getEditorFontOption(normalizedSettings.editorFontId).fontFamily;

	return {
		'--workduck-ui-font-size': `${normalizedSettings.fontSizePx}px`,
		'--workduck-editor-font-size': `${normalizedSettings.editorFontSizePx}px`,
		'--workduck-editor-font-family': editorFont,
		'--workduck-editor-tab-size': String(normalizedSettings.editorTabSize)
	};
}

export function createAppearanceSettingsStyle(settings: AppearanceSettings) {
	return Object.entries(createAppearanceSettingsCssVariables(settings))
		.map(([name, value]) => `${name}: ${value}`)
		.join('; ');
}

export function getEditorFontOption(editorFontId: EditorFontId) {
	return (
		editorFontOptions.find((option) => option.id === editorFontId) ??
		editorFontOptions[0]
	);
}

function normalizeEditorFontId(value: unknown): EditorFontId {
	return editorFontOptions.some((option) => option.id === value)
		? (value as EditorFontId)
		: createDefaultAppearanceSettings().editorFontId;
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

function isObjectRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}
