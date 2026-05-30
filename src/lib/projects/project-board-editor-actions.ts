import type { ProjectFormError } from './project-board-errors';
import { validateTagsInput } from './project-board-selectors';
import type { ProjectTagEditorTarget } from './project-board-types';
import {
	setProjectNodeDescription,
	setProjectNodeName,
	setProjectNodePath,
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

export async function saveProjectNodeDetails(
	input: {
		readonly editor: ProjectNodeRecord | null;
		readonly name: string;
		readonly path: string;
		readonly registry: ProjectRegistry;
		readonly isSaving: boolean;
	},
	context: ProjectEditorActionContext & {
		readonly savedStatus: string;
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

	const nameResult = setProjectNodeName(input.registry, {
		nodeId: input.editor.id,
		name: input.name
	});

	if (!nameResult.ok) {
		context.setFormError(nameResult.error);
		context.setIsSaving(false);
		return;
	}

	const pathResult = setProjectNodePath(nameResult.registry, {
		nodeId: input.editor.id,
		path: input.path
	});

	if (!pathResult.ok) {
		context.setFormError(pathResult.error);
		context.setIsSaving(false);
		return;
	}

	if (await context.persistRegistry(pathResult.registry)) {
		context.setStatus(context.savedStatus);
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

	const tagsResult = validateTagsInput(input.tagInput);

	if (!tagsResult.ok) {
		context.setFormError(tagsResult.error);
		context.setIsSaving(false);
		return;
	}

	const result =
		input.editor.type === 'repository'
			? setProjectRepositoryTags(input.registry, {
					nodeId: input.editor.node.id,
					repositoryId: input.editor.repository.id,
					tags: tagsResult.tags
				})
			: setProjectNodeTags(input.registry, {
					nodeId: input.editor.node.id,
					tags: tagsResult.tags
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
