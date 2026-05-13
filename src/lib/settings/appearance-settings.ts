export const WORKDUCK_APPEARANCE_SETTINGS_STORAGE_KEY = 'workduck.appearanceSettings.v1';

export const INTERFACE_FONT_SIZE_MIN_PX = 12;
export const INTERFACE_FONT_SIZE_MAX_PX = 18;
export const INTERFACE_FONT_SIZE_DEFAULT_PX = 14;

export const EDITOR_FONT_SIZE_MIN_PX = 11;
export const EDITOR_FONT_SIZE_MAX_PX = 24;
export const EDITOR_FONT_SIZE_DEFAULT_PX = 14;

export const EDITOR_TAB_SIZE_MIN = 2;
export const EDITOR_TAB_SIZE_MAX = 8;
export const EDITOR_TAB_SIZE_DEFAULT = 4;

export const editorFontOptions = [
	{
		id: 'jetbrains-mono',
		label: 'JetBrains Mono',
		fontFamily:
			'"JetBrains Mono", "Cascadia Code", "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace'
	},
	{
		id: 'cascadia-code',
		label: 'Cascadia Code',
		fontFamily:
			'"Cascadia Code", "JetBrains Mono", "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace'
	},
	{
		id: 'system-mono',
		label: 'System Mono',
		fontFamily:
			'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace'
	},
	{
		id: 'consolas',
		label: 'Consolas',
		fontFamily:
			'Consolas, "Cascadia Code", "JetBrains Mono", "Liberation Mono", Menlo, monospace'
	}
] as const;

export type EditorFontId = (typeof editorFontOptions)[number]['id'];

export interface AppearanceSettings {
	readonly fontSizePx: number;
	readonly editorFontSizePx: number;
	readonly editorFontId: EditorFontId;
	readonly editorTabSize: number;
}

export function createDefaultAppearanceSettings(): AppearanceSettings {
	return {
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
		fontSizePx: normalizeInteger(
			value.fontSizePx,
			INTERFACE_FONT_SIZE_MIN_PX,
			INTERFACE_FONT_SIZE_MAX_PX,
			INTERFACE_FONT_SIZE_DEFAULT_PX
		),
		editorFontSizePx: normalizeInteger(
			value.editorFontSizePx,
			EDITOR_FONT_SIZE_MIN_PX,
			EDITOR_FONT_SIZE_MAX_PX,
			EDITOR_FONT_SIZE_DEFAULT_PX
		),
		editorFontId: normalizeEditorFontId(value.editorFontId),
		editorTabSize: normalizeInteger(
			value.editorTabSize,
			EDITOR_TAB_SIZE_MIN,
			EDITOR_TAB_SIZE_MAX,
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

export function createAppearanceSettingsStyle(settings: AppearanceSettings) {
	const normalizedSettings = normalizeAppearanceSettings(settings);
	const editorFont = getEditorFontOption(normalizedSettings.editorFontId).fontFamily;

	return [
		`--workduck-ui-font-size: ${normalizedSettings.fontSizePx}px`,
		`--workduck-editor-font-size: ${normalizedSettings.editorFontSizePx}px`,
		`--workduck-editor-font-family: ${editorFont}`,
		`--workduck-editor-tab-size: ${normalizedSettings.editorTabSize}`
	].join('; ');
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

function normalizeInteger(value: unknown, min: number, max: number, fallback: number) {
	const numericValue = typeof value === 'number' ? value : Number(value);

	if (!Number.isFinite(numericValue)) {
		return fallback;
	}

	return Math.min(max, Math.max(min, Math.round(numericValue)));
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}
