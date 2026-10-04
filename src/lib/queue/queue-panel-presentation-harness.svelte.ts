import { getWorkduckMessages, type WorkduckLanguageId } from '#lib/i18n/workduck-language.ts';
import { createQueuePanelPresentation } from './queue-panel-presentation.svelte';

type PresentationInput = Parameters<typeof createQueuePanelPresentation>[0];
type Catalogs = { [K in Exclude<keyof PresentationInput, 'messages'>]: ReturnType<PresentationInput[K]> };

export function createQueuePanelPresentationHarness(initial: Catalogs) {
	let catalogs = $state.raw(initial);
	let language = $state<WorkduckLanguageId>('en');
	let presentation!: ReturnType<typeof createQueuePanelPresentation>;
	const dispose = $effect.root(() => {
		presentation = createQueuePanelPresentation({
			messages: () => getWorkduckMessages(language),
			skills: () => catalogs.skills,
			agents: () => catalogs.agents,
			projects: () => catalogs.projects,
			repositories: () => catalogs.repositories,
			references: () => catalogs.references
		});
	});
	return {
		presentation, dispose,
		setCatalogs(next: Catalogs) { catalogs = next; },
		setLanguage(next: WorkduckLanguageId) { language = next; }
	};
}
