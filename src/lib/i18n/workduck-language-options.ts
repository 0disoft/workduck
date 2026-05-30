export const workduckLanguageOptions = [
	{ id: 'en', label: 'English', htmlLang: 'en' },
	{ id: 'ko', label: '한국어', htmlLang: 'ko' },
	{ id: 'es', label: 'Español', htmlLang: 'es' },
	{ id: 'fr', label: 'Français', htmlLang: 'fr' },
	{ id: 'zh', label: '简体中文', htmlLang: 'zh' },
	{ id: 'hi', label: 'हिन्दी', htmlLang: 'hi' }
] as const;

export type WorkduckLanguageOption = (typeof workduckLanguageOptions)[number];
export type WorkduckLanguageId = WorkduckLanguageOption['id'];

export const DEFAULT_WORKDUCK_LANGUAGE_ID: WorkduckLanguageId = 'en';

export function getWorkduckLanguageOption(languageId: WorkduckLanguageId) {
	return (
		workduckLanguageOptions.find((option) => option.id === languageId) ??
		workduckLanguageOptions[0]
	);
}

export function normalizeWorkduckLanguageId(value: unknown): WorkduckLanguageId {
	return workduckLanguageOptions.some((option) => option.id === value)
		? (value as WorkduckLanguageId)
		: DEFAULT_WORKDUCK_LANGUAGE_ID;
}
