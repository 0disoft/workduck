import { afterEach, expect, test } from 'bun:test';
import { setTauriInvokeForTest } from '#lib/tauri/tauri-invoke.ts';
import { addProjectNode, createEmptyProjectRegistry } from '#lib/projects/project-registry.ts';
import { addWorkspace, createEmptyWorkspaceRegistry } from './workspace-registry';
import { decryptWorkspaceDataFromSync, decryptWorkspaceRegistryFromSync, type WorkspaceSyncEnvelope } from './workspace-sync';

// The native decryption port is replaced: these tests prove plaintext admission,
// not password verification or cryptographic authentication.
const envelope = {} as WorkspaceSyncEnvelope;
afterEach(() => setTauriInvokeForTest(undefined));

function fixture() {
	const added = addWorkspace(createEmptyWorkspaceRegistry(), { name: 'Sample', path: 'C:\\sample' });
	if (!added.ok) throw Error('fixture workspace');
	const project = addProjectNode(createEmptyProjectRegistry(added.workspace.id), {
		kind: 'project', parentId: null, name: 'Tools', path: 'projects/tools'
	});
	if (!project.ok) throw Error('fixture project');
	return { format: 'workduck.sync-data', version: 1, workspaceRegistry: added.registry,
		projectRegistries: { [added.workspace.id]: project.registry } };
}

async function decrypt(value: unknown) {
	setTauriInvokeForTest(async <T>(command: string) => {
		expect(command).toBe('decrypt_workspace_sync_payload');
		return { ok: true, plaintext: JSON.stringify(value) } as T;
	});
	return decryptWorkspaceDataFromSync(envelope, 'test-only-password');
}

test('current and legacy workspace snapshots remain importable, including intentional empty data', async () => {
	const current = fixture();
	const result = await decrypt(current);
	expect(result.ok).toBe(true);
	if (result.ok) expect(result.data.projectRegistries[current.workspaceRegistry.workspaces[0]!.id]!.nodes).toHaveLength(1);
	expect((await decrypt(current.workspaceRegistry)).ok).toBe(true);
	expect((await decrypt({ format: 'workduck.sync-data', version: 1,
		workspaceRegistry: createEmptyWorkspaceRegistry(), projectRegistries: {} })).ok).toBe(true);
});

test('malformed workspace lists and invalid or duplicate workspace records are rejected', async () => {
	for (const edit of [
		(value: any) => { delete value.workspaceRegistry; },
		(value: any) => { value.workspaceRegistry = null; },
		(value: any) => { value.workspaceRegistry.workspaces = {}; },
		(value: any) => { value.workspaceRegistry.workspaces.push({ id: 'broken' }); },
		(value: any) => { value.workspaceRegistry.workspaces.push(value.workspaceRegistry.workspaces[0]); },
		(value: any) => { value.workspaceRegistry.workspaces[0].lock = { kind: 'password', passwordHash: '' }; },
		(value: any) => { value.version = 999; value.workspaces = []; },
	]) {
		const value = fixture(); edit(value);
		expect(await decrypt(value)).toEqual({ ok: false, error: 'workspace-sync-registry-invalid' });
	}
});

test('missing, mismatched, unsupported, or lossy project snapshots are rejected as a whole', async () => {
	for (const edit of [
		(value: any, id: string) => { delete value.projectRegistries[id]; },
		(value: any, id: string) => { value.projectRegistries[id] = null; },
		(value: any, id: string) => { value.projectRegistries[id].version = 999; },
		(value: any, id: string) => { value.projectRegistries[id].workspaceId = 'other'; },
		(value: any, id: string) => { value.projectRegistries[id].nodes = {}; },
		(value: any, id: string) => { value.projectRegistries[id].nodes.push({ id: 'broken' }); },
		(value: any, id: string) => { value.projectRegistries[id].nodes.push(value.projectRegistries[id].nodes[0]); },
		(value: any, id: string) => { value.projectRegistries[id].nodes[0].kind = 'group'; value.projectRegistries[id].nodes[0].parentId = 'missing'; },
		(value: any, id: string) => { value.projectRegistries[id].nodes[0].repositories = [{}]; },
		(value: any) => { value.projectRegistries.extra = {}; },
	]) {
		const value = fixture(); const id = value.workspaceRegistry.workspaces[0]!.id; edit(value, id);
		expect(await decrypt(value)).toEqual({ ok: false, error: 'workspace-sync-registry-invalid' });
	}
});

test('legacy registry-only import rejects records that normalization would silently discard', async () => {
	const value = fixture().workspaceRegistry;
	const invalid = { ...value, workspaces: [...value.workspaces, { id: 'broken' }] };
	expect(await decrypt(invalid)).toEqual({ ok: false, error: 'workspace-sync-registry-invalid' });
	expect(await decryptWorkspaceRegistryFromSync(envelope, 'test-only-password'))
		.toEqual({ ok: false, error: 'workspace-sync-registry-invalid' });
});
