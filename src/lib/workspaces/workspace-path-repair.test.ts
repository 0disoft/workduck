import { afterEach, expect, test } from 'bun:test';
import { setTauriInvokeForTest } from '#lib/tauri/tauri-invoke.ts';
import {
	initializeWorkduckAppState, refreshWorkduckAppStateValues, resetWorkduckAppStateStorageForTest,
	setWorkduckAppStateBrowserStorageForTest, WORKDUCK_WORKSPACE_REGISTRY_APP_STATE_KEY
} from '#lib/app-state/app-state-storage.ts';
import { WORKDUCK_WORKSPACE_REGISTRY_STORAGE_KEY, type WorkspaceRegistry } from './workspace-registry';
import { repairWorkspacePath } from './workspace-path-repair';

const original: WorkspaceRegistry = { activeWorkspaceId: 'a', workspaces: ['a', 'b'].map((id) => ({
	id, name: id.toUpperCase(), path: `C:/original/${id}`, lock: null, createdAt: '', updatedAt: ''
})) };
function deferred() {
	let release!: () => void;
	const promise = new Promise<void>((resolve) => { release = resolve; });
	return { promise, release };
}

afterEach(() => { setTauriInvokeForTest(undefined); resetWorkduckAppStateStorageForTest(); });

async function setup(validation: Promise<void> = Promise.resolve(), rejectWrite = false) {
	const values = new Map<string, string>();
	setWorkduckAppStateBrowserStorageForTest({ getItem: (key) => values.get(key) ?? null,
		setItem: (key, value) => { values.set(key, value); }, removeItem: (key) => { values.delete(key); } });
	const state = { stored: JSON.stringify(original), writes: 0, validations: 0 };
	setTauriInvokeForTest(async <T>(command: string, args?: Record<string, unknown>) => {
		if (command === 'read_app_state_records') return { ok: true, records: { [WORKDUCK_WORKSPACE_REGISTRY_APP_STATE_KEY]: state.stored } } as T;
		if (command === 'validate_workspace_path') {
			state.validations += 1;
			expect(args?.path).toBe('C:/selected');
			await validation;
			return { ok: true, normalizedPath: 'C:/canonical-selected' } as T;
		}
		expect(command).toBe('compare_and_write_app_state_record');
		state.writes += 1;
		if (rejectWrite || args?.expectedValueJson !== state.stored) return { ok: false, error: 'app-state-conflict' } as T;
		state.stored = (args?.record as { valueJson: string }).valueJson;
		return { ok: true } as T;
	});
	await initializeWorkduckAppState([{ key: WORKDUCK_WORKSPACE_REGISTRY_APP_STATE_KEY,
		legacyStorageKey: WORKDUCK_WORKSPACE_REGISTRY_STORAGE_KEY, valueJson: JSON.stringify(original) }]);
	return state;
}

test('repair retains the original target even if caller data changes while validation waits', async () => {
	const waiting = deferred();
	const state = await setup(waiting.promise);
	const target = { ...original.workspaces[0]! };
	const repairing = repairWorkspacePath(target, 'C:/selected');
	Object.assign(target, original.workspaces[1]);
	waiting.release();
	expect(await repairing).toEqual({ ok: true, path: 'C:/canonical-selected' });
	const saved = JSON.parse(state.stored) as WorkspaceRegistry;
	expect(saved.workspaces[0]?.path).toBe('C:/canonical-selected');
	expect(saved.workspaces[1]).toEqual(original.workspaces[1]);
});

test('closing the repair owner during validation prevents registry writes', async () => {
	const waiting = deferred();
	const state = await setup(waiting.promise);
	const owner = new AbortController();
	const repairing = repairWorkspacePath(original.workspaces[0]!, 'C:/selected', owner.signal);
	owner.abort();
	waiting.release();
	expect(await repairing).toEqual({ ok: false, error: 'workspace-path-repair-cancelled' });
	expect(state.writes).toBe(0);
	expect(JSON.parse(state.stored)).toEqual(original);
});

test('a changed registered path cannot be overwritten after validation', async () => {
	const waiting = deferred();
	const state = await setup(waiting.promise);
	const repairing = repairWorkspacePath(original.workspaces[0]!, 'C:/selected');
	const peer = { ...original, workspaces: original.workspaces.map((record) => record.id === 'a'
		? { ...record, path: 'C:/peer-new-path' } : record) };
	state.stored = JSON.stringify(peer);
	expect(await refreshWorkduckAppStateValues()).toBe(true);
	waiting.release();
	expect(await repairing).toEqual({ ok: false, error: 'workspace-registry-conflict' });
	expect(state.writes).toBe(0);
	expect(JSON.parse(state.stored)).toEqual(peer);
});

test('an already cancelled repair does not validate or save', async () => {
	const state = await setup();
	const owner = new AbortController();
	owner.abort();
	expect(await repairWorkspacePath(original.workspaces[0]!, 'C:/selected', owner.signal))
		.toEqual({ ok: false, error: 'workspace-path-repair-cancelled' });
	expect(state.validations).toBe(0);
	expect(state.writes).toBe(0);
});

test('a native conflict retains both registered directories', async () => {
	const state = await setup(undefined, true);
	expect(await repairWorkspacePath(original.workspaces[0]!, 'C:/selected'))
		.toEqual({ ok: false, error: 'workspace-registry-conflict' });
	expect(JSON.parse(state.stored)).toEqual(original);
});
