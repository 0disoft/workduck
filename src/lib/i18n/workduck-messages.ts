import { enMessages } from './locales/en';
import { koMessages } from './locales/ko';
import { normalizeWorkduckLanguageId, type WorkduckLanguageId } from './workduck-language-options';
import type { WorkduckMessages } from './workduck-message-contract';

export const workduckMessages = {
	en: enMessages,
	ko: koMessages
} as const satisfies Record<WorkduckLanguageId, WorkduckMessages>;

export function getWorkduckMessages(languageId: WorkduckLanguageId) {
	return workduckMessages[normalizeWorkduckLanguageId(languageId)];
}
