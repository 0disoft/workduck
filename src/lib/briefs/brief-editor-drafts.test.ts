import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { createBriefEditorDraftStore, type BriefEditorDraft } from './brief-editor-drafts';

const workspace = { workspaceId: 'workspace-1', workspacePath: 'C:/workspace' };
const draft: BriefEditorDraft = {
	id: 'brief-1', title: 'Unfinished title', repositoryId: 'repo-1',
	instructions: 'Keep these unsaved instructions',
	baseline: JSON.stringify(['Original title', 'repo-1', 'Original instructions']),
	baseRevision: 4
};

describe('brief editor drafts across workspace locking', () => {
	test('retains the exact draft and original revision when the editor is removed and recreated', () => {
		const store = createBriefEditorDraftStore();
		store.put(workspace, draft);
		const unsubscribe = store.subscribe(workspace, () => {});
		unsubscribe();
		let restored: BriefEditorDraft | null = null;
		const unsubscribeRestored = store.subscribe(workspace, (state) => { restored = state.draft; });
		assert.deepEqual(restored, draft);
		assert.equal(JSON.stringify([draft.title, draft.repositoryId, draft.instructions]) === draft.baseline, false);
		unsubscribeRestored();
	});

	test('isolates drafts by both workspace identity and path, including delimiter-shaped values', () => {
		const store = createBriefEditorDraftStore();
		store.put(workspace, draft);
		assert.equal(store.read({ ...workspace, workspaceId: 'workspace-2' }).draft, null);
		assert.equal(store.read({ ...workspace, workspacePath: 'C:/other' }).draft, null);
		const first = { workspaceId: 'a:b', workspacePath: 'c' };
		const second = { workspaceId: 'a', workspacePath: 'b:c' };
		store.put(first, draft);
		assert.equal(store.read(second).draft, null);
	});

	test('clears a successful save while locked so unlocking cannot restore an already saved draft', () => {
		const store = createBriefEditorDraftStore();
		store.put(workspace, draft);
		const operation = store.beginSave(workspace)!;
		assert.equal(store.read(workspace).saving, true);
		assert.equal(store.put(workspace, { ...draft, title: 'Stale teardown snapshot' }), false);
		assert.equal(store.discard(workspace), false);
		assert.equal(store.beginSave(workspace), null);
		store.finishSave(operation, null);
		assert.deepEqual(store.read(workspace), { draft: null, saving: false, error: null });
	});

	test('notifies a recreated editor when a pending save finishes and permits retry after failure', () => {
		const store = createBriefEditorDraftStore();
		store.put(workspace, draft);
		const operation = store.beginSave(workspace)!;
		const states: { saving: boolean; error: string | null }[] = [];
		const unsubscribe = store.subscribe(workspace, (state) => {
			states.push({ saving: state.saving, error: state.error });
		});
		store.finishSave(operation, 'conflict');
		assert.deepEqual(states, [{ saving: true, error: null }, { saving: false, error: 'conflict' }]);
		assert.deepEqual(store.read(workspace).draft, draft);
		const retry = store.beginSave(workspace)!;
		store.finishSave(retry, 'save-failed');
		assert.deepEqual(store.read(workspace).draft, draft);
		assert.equal(store.read(workspace).error, 'save-failed');
		unsubscribe();
	});

	test('a late save result cannot clear a newer editor or a different workspace draft', () => {
		const store = createBriefEditorDraftStore();
		store.put(workspace, draft);
		const operation = store.beginSave(workspace)!;
		store.finishSave(operation, null);
		const next = { ...draft, id: 'brief-2', title: 'Next task' };
		const other = { ...workspace, workspacePath: 'C:/other' };
		store.put(workspace, next);
		store.put(other, draft);
		assert.equal(store.finishSave(operation, null), false);
		assert.deepEqual(store.read(workspace).draft, next);
		assert.deepEqual(store.read(other).draft, draft);
	});

	test('confirmed discard removes the draft and snapshots cannot mutate retained data', () => {
		const store = createBriefEditorDraftStore();
		const input = { ...draft };
		store.put(workspace, input);
		input.title = 'Changed after insertion';
		assert.equal(store.read(workspace).draft?.title, draft.title);
		const snapshot = store.read(workspace).draft! as { title: string };
		snapshot.title = 'Changed snapshot';
		assert.equal(store.read(workspace).draft?.title, draft.title);
		store.discard(workspace);
		assert.equal(store.read(workspace).draft, null);
	});
});
