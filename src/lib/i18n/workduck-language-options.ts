export const workduckLanguageOptions = [
	{ id: 'en', label: 'English', htmlLang: 'en' },
	{ id: 'ko', label: '한국어', htmlLang: 'ko' }
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
