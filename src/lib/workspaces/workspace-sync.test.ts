import assert from 'node:assert/strict';
import { afterEach, describe, test } from 'node:test';
import { setTauriInvokeForTest, type TauriInvoke } from '#lib/tauri/tauri-invoke.ts';
import {
	decryptWorkspaceDataFromSync,
	decryptWorkspaceRegistryFromSync,
	encryptWorkspaceDataForSync,
	WORKSPACE_SYNC_FORMAT,
	WORKSPACE_SYNC_PAYLOAD_FORMAT,
	type WorkspaceSyncEnvelope
} from './workspace-sync';

const envelope: WorkspaceSyncEnvelope = {
	format: WORKSPACE_SYNC_FORMAT, version: 1,
	kdf: { algorithm: 'argon2id', version: 19, memoryKiB: 8192, iterations: 1, parallelism: 1, salt: 'AAAAAAAAAAAAAAAAAAAAAA==' },
	cipher: { algorithm: 'xchacha20poly1305', nonce: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' },
	ciphertext: 'AAAAAAAAAAAAAAAAAAAAAA=='
};
const workspace = {
	id: 'workspace-a', name: 'Workspace A', path: 'C:/workspace-a', lock: null,
	createdAt: '2026-10-10T00:00:00Z', updatedAt: '2026-10-10T00:00:00Z'
};
const workspaceRegistry = { activeWorkspaceId: workspace.id, workspaces: [workspace] };
const snapshot = { version: 1, workspaceId: workspace.id, nodes: [], updatedAt: workspace.updatedAt };
const payload = {
	format: WORKSPACE_SYNC_PAYLOAD_FORMAT, version: 1, workspaceRegistry,
	projectRegistries: { [workspace.id]: snapshot }
};
const project = {
	id: 'project-a', kind: 'project', parentId: null, name: 'Project A', path: 'projects/project-a',
	description: '', tags: [], githubCredentialSecretId: null,
	repositories: [{
		id: 'repo-a', name: 'Repo A', localPath: 'projects/project-a/repo-a', path: null,
		remoteUrl: 'https://github.com/example/repo-a.git', upstreamRemoteUrl: null,
		tags: [], favorite: false, githubCredentialSecretId: null,
		createdAt: workspace.createdAt, updatedAt: workspace.updatedAt
	}],
	createdAt: workspace.createdAt, updatedAt: workspace.updatedAt
};

async function decrypt(value: unknown) {
	setTauriInvokeForTest((async (command) => {
		assert.equal(command, 'decrypt_workspace_sync_payload');
		return { ok: true, plaintext: JSON.stringify(value) };
	}) as TauriInvoke);
	return decryptWorkspaceDataFromSync(envelope, 'test-password');
}

describe('workspace sync import validation', () => {
	afterEach(() => { setTauriInvokeForTest(undefined); });

	test('rejects missing workspace data and records that normalization would discard', async () => {
		for (const value of [
			undefined, {}, { workspaces: {} }, { workspaces: [null] },
			{ workspaces: [{ ...workspace, id: '' }] },
			{ workspaces: [workspace, { ...workspace, path: 'C:/other' }] },
			{ workspaces: [workspace, { ...workspace, id: 'other' }] },
			{ workspaces: [{ ...workspace, lock: { kind: 'password', passwordHash: '' } }] }
		]) {
			assert.deepEqual(await decrypt({ ...payload, workspaceRegistry: value }), {
				ok: false, error: 'workspace-sync-registry-invalid'
			});
		}
	});

	test('rejects missing, misbound, unsupported, and structurally invalid project snapshots', async () => {
		for (const projectRegistries of [
			{}, { [workspace.id]: null },
			{ [workspace.id]: { ...snapshot, version: 2 } },
			{ [workspace.id]: { ...snapshot, workspaceId: 'other' } },
			{ [workspace.id]: { ...snapshot, nodes: {} } },
			{ [workspace.id]: { ...snapshot, nodes: [null] } },
			{ [workspace.id]: { ...snapshot, nodes: [{ ...project, kind: 'group', parentId: 'missing' }] } },
			{ [workspace.id]: { ...snapshot, nodes: [project, project] } },
			{ [workspace.id]: { ...snapshot, nodes: [{ ...project, repositories: {} }] } },
			{ [workspace.id]: { ...snapshot, nodes: [{ ...project, repositories: [null] }] } },
			{ [workspace.id]: { ...snapshot, nodes: [{ ...project, repositories: [...project.repositories, project.repositories[0]] }] } },
			{ [workspace.id]: snapshot, extra: { ...snapshot, workspaceId: 'extra' } }
		]) {
			assert.deepEqual(await decrypt({ ...payload, projectRegistries }), {
				ok: false, error: 'workspace-sync-registry-invalid'
			});
		}
	});

	test('accepts explicit empty snapshots and legacy workspace-only data', async () => {
		const modern = await decrypt(payload);
		assert.equal(modern.ok, true);
		if (modern.ok) assert.equal(modern.data.projectRegistries[workspace.id]?.nodes.length, 0);
		const legacy = await decrypt(workspaceRegistry);
		assert.equal(legacy.ok, true);
		if (legacy.ok) assert.deepEqual(legacy.data.projectRegistries, {});
		assert.equal((await decrypt({ ...payload, workspaceRegistry: { workspaces: [] }, projectRegistries: {} })).ok, true);
		assert.deepEqual(await decrypt({ ...workspaceRegistry, format: 'future-format', version: 2 }), { ok: false, error: 'workspace-sync-registry-invalid' });
		assert.deepEqual(await decrypt({ ...workspaceRegistry, projectRegistries: payload.projectRegistries }), { ok: false, error: 'workspace-sync-registry-invalid' });
	});

	test('legacy registry decryption does not accept discarded or duplicate workspace records', async () => {
		for (const value of [{ workspaces: [null] }, { workspaces: [workspace, workspace] }]) {
			setTauriInvokeForTest((async () => ({ ok: true, plaintext: JSON.stringify(value) })) as TauriInvoke);
			assert.deepEqual(await decryptWorkspaceRegistryFromSync(envelope, 'test-password'), {
				ok: false, error: 'workspace-sync-registry-invalid'
			});
		}
	});

	test('restores repository paths and round-trips the current exporter without dropping records', async () => {
		const imported = await decrypt({
			...payload, projectRegistries: { [workspace.id]: { ...snapshot, nodes: [project] } }
		});
		assert.equal(imported.ok, true);
		if (!imported.ok) return;
		assert.equal(imported.data.projectRegistries[workspace.id]?.nodes[0]?.repositories[0]?.path?.replaceAll('\\', '/'), 'C:/workspace-a/projects/project-a/repo-a');
		let plaintext = '';
		setTauriInvokeForTest((async (command, args) => {
			assert.equal(command, 'encrypt_workspace_sync_payload');
			plaintext = args?.plaintext as string;
			return { ok: true, envelope };
		}) as TauriInvoke);
		assert.equal((await encryptWorkspaceDataForSync(imported.data.workspaceRegistry, imported.data.projectRegistries, 'test-password')).ok, true);
		const restored = await decrypt(JSON.parse(plaintext));
		assert.deepEqual(restored, imported);
	});
});
