import { afterEach, describe, expect, test } from 'bun:test';
import { setTauriInvokeForTest } from '#lib/tauri/tauri-invoke.ts';
import { createFolderRepairSignature, ensureProjectFoldersForBoard } from './project-board-runtime-state';
import { createEmptyProjectRegistry, type ProjectNodeRecord } from './project-registry';
import type { ProjectFolderError } from './project-folder';

const workspacePath = 'C:/workspaces/repair';
const node: ProjectNodeRecord = {
	id: 'project', kind: 'project', parentId: null, name: 'Demo', description: 'Original', path: 'projects/demo',
	githubCredentialSecretId: null, tags: ['original'], repositories: [],
	createdAt: '2026-10-04T00:00:00.000Z', updatedAt: '2026-10-04T00:00:00.000Z'
};
const rows = [{ node, depth: 0 }, { node: { ...node, id: 'other', path: 'projects/other' }, depth: 0 }];
const snapshot = { ...createEmptyProjectRegistry('workspace'), nodes: rows.map((row) => row.node) };
const expectedSignature = createFolderRepairSignature('workspace', rows);
const input = { expectedSignature, workspacePath, rows };
function deferred() {
	let resolve!: () => void;
	const promise = new Promise<void>((next) => { resolve = next; });
	return { promise, resolve };
}

afterEach(() => setTauriInvokeForTest(undefined));
describe('project folder repair', () => {
	test('ensures physical folders without rewriting the unchanged registry', async () => {
		const paths: unknown[] = [];
		let writes = 0;
		let error: ProjectFolderError | null = 'project-folder-create-failed';
		setTauriInvokeForTest(async <T>(command: string, args?: Record<string, unknown>) => {
			expect(command).toBe('ensure_project_folder_path');
			expect(args?.workspacePath).toBe(workspacePath);
			paths.push(args?.relativePath);
			return { ok: true, folderName: 'demo', relativePath: args?.relativePath } as T;
		});
		const context = {
			getFolderRepairSignature: () => expectedSignature,
			setFolderRepairError: (value: ProjectFolderError | null) => { error = value; },
			persistRegistry: async () => { writes += 1; return true; }
		};
		await ensureProjectFoldersForBoard(input, context);
		expect(paths).toEqual(rows.map((row) => row.node.path));
		expect(error).toBeNull();
		expect(writes).toBe(0);
	});

	test('keeps edited metadata while a folder repair is pending', async () => {
		const pending = deferred();
		let current = snapshot;
		setTauriInvokeForTest(async <T>(_command: string, args?: Record<string, unknown>) => {
			await pending.promise;
			return { ok: true, folderName: 'demo', relativePath: args?.relativePath } as T;
		});
		const context = {
			getFolderRepairSignature: () => expectedSignature,
			setFolderRepairError() {},
			persistRegistry: async (next: typeof snapshot) => { current = next; return true; }
		};
		const repairing = ensureProjectFoldersForBoard(input, context);
		current = { ...snapshot, nodes: snapshot.nodes.map((item) => ({ ...item, description: 'Edited', tags: ['edited'] })) };
		pending.resolve();
		await repairing;
		expect(current.nodes[0]?.description).toBe('Edited');
		expect(current.nodes[0]?.tags).toEqual(['edited']);
	});

	test('reports a current repair error and stops before another folder', async () => {
		let calls = 0;
		let error: ProjectFolderError | null = null;
		setTauriInvokeForTest(async <T>() => { calls += 1; return { ok: false, error: 'project-folder-create-failed' } as T; });
		const context = {
			getFolderRepairSignature: () => expectedSignature,
			setFolderRepairError: (value: ProjectFolderError | null) => { error = value; },
			persistRegistry: async () => true
		};
		await ensureProjectFoldersForBoard(input, context);
		expect(error as ProjectFolderError | null).toBe('project-folder-create-failed');
		expect(calls).toBe(1);
	});

	test('ignores an obsolete repair result and does not start another folder', async () => {
		const pending = deferred();
		let signature = expectedSignature;
		let calls = 0;
		let error: ProjectFolderError | null = null;
		setTauriInvokeForTest(async <T>() => {
			calls += 1; await pending.promise;
			return { ok: false, error: 'project-folder-create-failed' } as T;
		});
		const context = {
			getFolderRepairSignature: () => signature,
			setFolderRepairError: (value: ProjectFolderError | null) => { error = value; },
			persistRegistry: async () => true
		};
		const repairing = ensureProjectFoldersForBoard(input, context);
		signature = 'new-view';
		pending.resolve();
		await repairing;
		expect(error).toBeNull();
		expect(calls).toBe(1);
	});
});
