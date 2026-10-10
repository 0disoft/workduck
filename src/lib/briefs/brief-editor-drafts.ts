/* llmnav/1 module
id=workduck.briefs.editor-drafts
role=Retain page-owned brief editor drafts and save operations across workspace locking.
owns=workspace-scoped draft memory|original edit revision|pending save identity|draft disposal
excludes=persistent storage|workspace unlocking|registry validation
search=brief draft lost on lock|restore unsaved instructions|save completes while locked
invariant=Drafts stay isolated by workspace identity and path; only the matching save completion can dispose its draft.
stability=contract
*/
import type { WorkspaceResourceScope } from '#lib/workspaces/workspace-scoped-resource.ts';

export interface BriefEditorDraft {
	readonly id: string;
	readonly title: string;
	readonly repositoryId: string;
	readonly instructions: string;
	readonly baseline: string;
	readonly baseRevision: number;
}

type SaveError = 'conflict' | 'save-failed';

interface DraftState {
	readonly draft: BriefEditorDraft | null;
	readonly saving: boolean;
	readonly error: SaveError | null;
	readonly savedBriefId?: string;
}

interface DraftEntry {
	draft: BriefEditorDraft;
	pending: symbol | null;
	error: SaveError | null;
}

interface SaveOperation {
	readonly key: string;
	readonly token: symbol;
	readonly draft: BriefEditorDraft;
}

export function createBriefEditorDraftStore() {
	const entries = new Map<string, DraftEntry>();
	const listeners = new Map<string, Set<(state: DraftState) => void>>();
	const keyFor = (scope: WorkspaceResourceScope) => JSON.stringify([scope.workspaceId, scope.workspacePath]);

	function snapshot(key: string): DraftState {
		const entry = entries.get(key);
		return entry === undefined
			? { draft: null, saving: false, error: null }
			: { draft: { ...entry.draft }, saving: entry.pending !== null, error: entry.error };
	}

	function publish(key: string, state = snapshot(key)) {
		for (const listener of listeners.get(key) ?? []) listener(state);
	}

	function put(scope: WorkspaceResourceScope, draft: BriefEditorDraft) {
		const key = keyFor(scope);
		if (entries.get(key)?.pending != null) return false;
		entries.set(key, { draft: { ...draft }, pending: null, error: null });
		publish(key);
		return true;
	}

	function discard(scope: WorkspaceResourceScope) {
		const key = keyFor(scope);
		if (entries.get(key)?.pending != null) return false;
		entries.delete(key);
		publish(key);
		return true;
	}

	function beginSave(scope: WorkspaceResourceScope): SaveOperation | null {
		const key = keyFor(scope);
		const entry = entries.get(key);
		if (entry === undefined || entry.pending !== null) return null;
		const token = Symbol('brief-save');
		entry.pending = token;
		entry.error = null;
		publish(key);
		return { key, token, draft: { ...entry.draft } };
	}

	function finishSave(operation: SaveOperation, error: SaveError | null) {
		const entry = entries.get(operation.key);
		if (entry?.pending !== operation.token) return false;
		if (error === null) {
			entries.delete(operation.key);
			publish(operation.key, { draft: null, saving: false, error: null, savedBriefId: operation.draft.id });
		} else {
			entry.pending = null;
			entry.error = error;
			publish(operation.key);
		}
		return true;
	}

	function subscribe(scope: WorkspaceResourceScope, listener: (state: DraftState) => void) {
		const key = keyFor(scope);
		const subscribers = listeners.get(key) ?? new Set<(state: DraftState) => void>();
		subscribers.add(listener);
		listeners.set(key, subscribers);
		listener(snapshot(key));
		return () => {
			subscribers.delete(listener);
			if (subscribers.size === 0) listeners.delete(key);
		};
	}

	return { read: (scope: WorkspaceResourceScope) => snapshot(keyFor(scope)), put, discard, beginSave, finishSave, subscribe };
}

export type BriefEditorDraftStore = ReturnType<typeof createBriefEditorDraftStore>;
