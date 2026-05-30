import { enMessages } from './locales/en';
import { koMessages } from './locales/ko';
import { esMessages } from './locales/es';
import { frMessages } from './locales/fr';
import { zhMessages } from './locales/zh';
import { hiMessages } from './locales/hi';
import { normalizeWorkduckLanguageId, type WorkduckLanguageId } from './workduck-language-options';
import type { WorkduckMessages } from './workduck-message-contract';

export const workduckMessages = {
	en: enMessages,
	ko: koMessages,
	es: esMessages,
	fr: frMessages,
	zh: zhMessages,
	hi: hiMessages
} as const satisfies Record<WorkduckLanguageId, WorkduckMessages>;

export function getWorkduckMessages(languageId: WorkduckLanguageId) {
	return workduckMessages[normalizeWorkduckLanguageId(languageId)];
}
