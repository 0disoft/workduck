import { enMessages } from './locales/en';
import { normalizeWorkduckLanguageId, type WorkduckLanguageId } from './workduck-language-options';
import type { WorkduckMessages } from './workduck-message-contract';

export const WORKDUCK_MESSAGES_LOADED_EVENT = 'workduck:i18n-messages-loaded';

type LazyWorkduckLanguageId = Exclude<WorkduckLanguageId, 'en'>;
type WorkduckMessageLoader = () => Promise<WorkduckMessages>;

export const workduckMessages = {
	en: enMessages
} as Partial<Record<WorkduckLanguageId, WorkduckMessages>> & {
	readonly en: WorkduckMessages;
};

const workduckMessageLoaders = {
	ko: () => import('./locales/ko').then((module) => module.koMessages),
	es: () => import('./locales/es').then((module) => module.esMessages),
	fr: () => import('./locales/fr').then((module) => module.frMessages),
	zh: () => import('./locales/zh').then((module) => module.zhMessages),
	hi: () => import('./locales/hi').then((module) => module.hiMessages)
} as const satisfies Record<LazyWorkduckLanguageId, WorkduckMessageLoader>;

const pendingWorkduckMessageLoads = new Map<LazyWorkduckLanguageId, Promise<WorkduckMessages>>();

export function getWorkduckMessages(languageId: WorkduckLanguageId) {
	const normalizedLanguageId = normalizeWorkduckLanguageId(languageId);
	const cachedMessages = workduckMessages[normalizedLanguageId];

	if (cachedMessages !== undefined) {
		return cachedMessages;
	}

	void loadWorkduckMessages(normalizedLanguageId);

	return enMessages;
}

export function loadWorkduckMessages(languageId: WorkduckLanguageId): Promise<WorkduckMessages> {
	const normalizedLanguageId = normalizeWorkduckLanguageId(languageId);
	const cachedMessages = workduckMessages[normalizedLanguageId];

	if (cachedMessages !== undefined) {
		return Promise.resolve(cachedMessages);
	}

	const lazyLanguageId = normalizedLanguageId as LazyWorkduckLanguageId;
	const pendingLoad = pendingWorkduckMessageLoads.get(lazyLanguageId);

	if (pendingLoad !== undefined) {
		return pendingLoad;
	}

	const loader = workduckMessageLoaders[lazyLanguageId];
	const nextLoad = loader()
		.then((messages) => {
			workduckMessages[lazyLanguageId] = messages;
			notifyWorkduckMessagesLoaded(lazyLanguageId);
			return messages;
		})
		.catch((error) => {
			pendingWorkduckMessageLoads.delete(lazyLanguageId);
			throw error;
		});

	pendingWorkduckMessageLoads.set(lazyLanguageId, nextLoad);

	return nextLoad;
}

function notifyWorkduckMessagesLoaded(languageId: WorkduckLanguageId) {
	if (typeof window === 'undefined') {
		return;
	}

	window.dispatchEvent(
		new CustomEvent(WORKDUCK_MESSAGES_LOADED_EVENT, {
			detail: { languageId }
		})
	);
}
