import type { ProjectFormError } from './project-board-errors';
import { parseTagsInput } from './project-board-selectors';
import type { ProjectTagEditorTarget } from './project-board-types';
import {
	setProjectNodeDescription,
	setProjectNodeTags,
	setProjectRepositoryTags,
	type ProjectNodeRecord,
	type ProjectRegistry
} from './project-registry';

export interface ProjectEditorActionContext {
	readonly persistRegistry: (nextRegistry: ProjectRegistry) => Promise<boolean>;
	readonly setFormError: (error: ProjectFormError | null) => void;
	readonly setStatus: (status: string | null) => void;
}

export async function saveProjectDescription(
	input: {
		readonly editor: ProjectNodeRecord | null;
		readonly description: string;
		readonly registry: ProjectRegistry;
		readonly isSaving: boolean;
	},
	context: ProjectEditorActionContext & {
		readonly setIsSaving: (isSaving: boolean) => void;
		readonly closeEditor: () => void;
	}
) {
	if (input.editor === null || input.isSaving) {
		return;
	}

	context.setIsSaving(true);
	context.setFormError(null);
	context.setStatus(null);

	const result = setProjectNodeDescription(input.registry, {
		nodeId: input.editor.id,
		description: input.description
	});

	if (!result.ok) {
		context.setFormError(result.error);
		context.setIsSaving(false);
		return;
	}

	if (await context.persistRegistry(result.registry)) {
		context.setStatus('Description saved.');
		context.closeEditor();
		return;
	}

	context.setIsSaving(false);
}

export async function saveProjectTags(
	input: {
		readonly editor: ProjectTagEditorTarget | null;
		readonly tagInput: string;
		readonly registry: ProjectRegistry;
		readonly isSaving: boolean;
	},
	context: ProjectEditorActionContext & {
		readonly setIsSaving: (isSaving: boolean) => void;
		readonly closeEditor: () => void;
	}
) {
	if (input.editor === null || input.isSaving) {
		return;
	}

	context.setIsSaving(true);
	context.setFormError(null);
	context.setStatus(null);

	const tags = parseTagsInput(input.tagInput);
	const result =
		input.editor.type === 'repository'
			? setProjectRepositoryTags(input.registry, {
					nodeId: input.editor.node.id,
					repositoryId: input.editor.repository.id,
					tags
				})
			: setProjectNodeTags(input.registry, {
					nodeId: input.editor.node.id,
					tags
				});

	if (!result.ok) {
		context.setFormError(result.error);
		context.setIsSaving(false);
		return;
	}

	if (await context.persistRegistry(result.registry)) {
		context.setStatus('Tags saved.');
		context.closeEditor();
		return;
	}

	context.setIsSaving(false);
}
