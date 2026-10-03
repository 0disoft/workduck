import { plugin, Transpiler } from 'bun';
import { describe, expect, test } from 'bun:test';
import { compileModule } from 'svelte/compiler';
import { getWorkduckMessages } from '#lib/i18n/workduck-language.ts';
import { getDefaultSkills } from '#lib/skills/skill-registry.ts';

// Exercise the compiled runes used by the desktop, rather than mocking $state/$derived.
await plugin({
	name: 'queue-work-order-editor-runes',
	setup(build) {
		build.onLoad({ filter: /queue-panel-work-order-editor\.svelte\.ts$/ }, async ({ path }) => {
			const source = new Transpiler({ loader: 'ts' }).transformSync(await Bun.file(path).text());
			return { contents: compileModule(source, { filename: path, generate: 'client' }).js.code, loader: 'js' };
		});
	}
});

const { createQueuePanelWorkOrderEditor } = await import('./queue-panel-work-order-editor.svelte');

function createEditor(isWriting = false) {
	return createQueuePanelWorkOrderEditor({
		messages: () => getWorkduckMessages('en'),
		skills: getDefaultSkills,
		references: () => [],
		isWriting: () => isWriting,
		responseLanguage: () => 'ko',
		getSkillLabelById: (id) => id,
		getAgentLabelById: (id) => id,
		getProjectLabelById: (id) => id,
		getRepositoryLabelById: (id) => id,
		getReferenceLabelById: (id) => id,
		getSkillDisplayName: (skill) => skill.name
	});
}

describe('reactive Queue work order editor', () => {
	test('keeps bound draft values reactive and isolated between editors', () => {
		const editor = createEditor();
		const other = createEditor();
		editor.openNewWorkOrderDialog();
		expect(editor.manualWorkOrderResponseLanguage).toBe('ko');
		expect(editor.canCreateManualWorkOrder).toBe(false);
		editor.manualWorkOrderTitle = 'Review changes';
		editor.manualWorkOrderBody = 'Inspect the repository.';
		expect(editor.canCreateManualWorkOrder).toBe(true);
		expect(other.manualWorkOrderTitle).toBe('');
		expect(other.isNewWorkOrderDialogOpen).toBe(false);
		editor.manualWorkOrderKind = 'vote';
		expect(editor.canCreateManualWorkOrder).toBe(false);
		editor.updateManualVoteOption(0, 'label', 'Accept');
		editor.updateManualVoteOption(1, 'label', 'Revise');
		expect(editor.canCreateManualWorkOrder).toBe(true);
		expect(editor.createManualWorkOrderSaveDraft().kindInput.vote?.options.map((option) => option.label))
			.toEqual(['Accept', 'Revise']);
		editor.closeNewWorkOrderDialog();
		expect(editor.isNewWorkOrderDialogOpen).toBe(false);
		expect(editor.manualWorkOrderBody).toBe('');
	});

	test('reopens edit context without mutating the original task and resets workspace selections', () => {
		const task = {
			id: 'task_1', title: 'Existing task', body: 'Existing body',
			agentIds: ['agent_1'], skillIds: ['skill_1'], projectIds: ['project_1'],
			repositoryIds: ['repository_1'], referenceIds: ['reference_1']
		};
		const editor = createEditor();
		editor.openEditWorkOrderTaskDialog(task);
		expect(editor.workOrderDialogMode).toBe('edit');
		expect(editor.editingWorkOrderTaskId).toBe('task_1');
		editor.toggleManualWorkOrderAgent('agent_2', true);
		expect(editor.createManualWorkOrderSaveDraft().agentIds).toEqual(['agent_1', 'agent_2']);
		expect(task.agentIds).toEqual(['agent_1']);
		editor.clearRecordSelections();
		const saved = editor.createManualWorkOrderSaveDraft();
		expect([saved.agentIds, saved.skillIds, saved.projectIds, saved.repositoryIds, saved.referenceIds])
			.toEqual([[], [], [], [], []]);
		expect(saved.title).toBe('Existing task');
		editor.finishManualWorkOrderDialog();
		expect(editor.editingWorkOrderTaskId).toBeNull();
	});

	test('preserves skill option assembly and the writing guard on dialog close', () => {
		const editor = createEditor();
		editor.openNewWorkOrderDialog();
		editor.manualWorkOrderTitle = 'Review';
		editor.manualWorkOrderBody = 'Check this text.';
		const skill = getDefaultSkills().find((item) => item.outputTypes.includes('revision'))!;
		const group = skill.optionGroups[0];
		const option = group?.options[0];
		if (group === undefined || option === undefined) throw new Error('Revision skill options are required.');
		editor.toggleManualWorkOrderSkill(skill.id, true);
		expect(editor.manualWorkOrderResponseFormat).toBe('revision-draft');
		editor.toggleManualSkillOption(skill.id, group.id, option.id, group.selectionMode, true);
		expect(editor.createManualWorkOrderSaveDraft().body).toContain(option.label);
		editor.toggleManualWorkOrderSkill(skill.id, false);
		expect(editor.selectedManualSkillOptionIds).toEqual([]);
		expect(editor.createManualWorkOrderSaveDraft().body).toBe('Check this text.');
		const writingEditor = createEditor(true);
		writingEditor.openNewWorkOrderDialog();
		writingEditor.closeNewWorkOrderDialog();
		expect(writingEditor.isNewWorkOrderDialogOpen).toBe(true);
	});
});
