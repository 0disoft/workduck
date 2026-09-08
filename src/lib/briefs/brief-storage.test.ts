import assert from 'node:assert/strict';
import { afterEach, describe, test } from 'node:test';
import { setTauriInvokeForTest, type TauriInvoke } from '$lib/tauri/tauri-invoke';
import { createEmptyBriefRegistry, saveBriefDraft } from './brief-registry';
import { readBriefRegistry, writeBriefRegistry } from './brief-storage';

const registry = saveBriefDraft(createEmptyBriefRegistry('ws-1'), {
	id: 'brief-1', title: 'Brief', instructions: 'Keep this draft',
	project: { kind: 'project', id: 'p-1', label: 'Project' },
	repository: { kind: 'repo', id: 'r-1', label: 'Repository' }, repositoryPath: null
}, '2026-09-08T00:00:00.000Z')!;

describe('brief storage boundary', () => {
	afterEach(() => setTauriInvokeForTest(undefined));

	test('writes with a revision and reads the native result in a new session', async () => {
		let content: string | null = null;
		setTauriInvokeForTest((async (command, args) => {
			assert.equal(args?.workspacePath, 'C:/workspace');
			assert.equal(args?.fileName, 'briefs.json');
			if (command === 'read_workspace_data_file') return { ok: true, content };
			assert.equal(command, 'write_workspace_registry_file');
			assert.equal(args?.expectedRevision, 0);
			content = JSON.stringify({ ...JSON.parse(String(args?.content)), revision: 1 });
			return { ok: true, content };
		}) as TauriInvoke);
		assert.deepEqual(await readBriefRegistry('ws-1', 'C:/workspace'), { ok: true, registry: createEmptyBriefRegistry('ws-1') });
		const saved = await writeBriefRegistry(registry, 'C:/workspace');
		assert.equal(saved.ok, true);
		assert.deepEqual(await readBriefRegistry('ws-1', 'C:/workspace'), saved);
		assert.equal(registry.revision, 0);
	});

	test('does not overwrite unreadable or future data', async () => {
		let writes = 0;
		setTauriInvokeForTest((async (command) => {
			if (command !== 'read_workspace_data_file') writes += 1;
			return { ok: true, content: JSON.stringify({ version: 99 }) };
		}) as TauriInvoke);
		assert.deepEqual(await readBriefRegistry('ws-1', 'C:/workspace'), { ok: false, error: 'brief-registry-invalid' });
		assert.equal(writes, 0);
	});

	test('returns conflicts without retrying or destroying the caller draft', async () => {
		let calls = 0;
		setTauriInvokeForTest((async () => { calls += 1; return { ok: false, error: 'workspace-data-revision-conflict' }; }) as TauriInvoke);
		assert.deepEqual(await writeBriefRegistry(registry, 'C:/workspace'), { ok: false, error: 'workspace-data-revision-conflict' });
		assert.equal(calls, 1);
		assert.equal(registry.briefs[0]?.instructions, 'Keep this draft');
	});

	test('does not treat a malformed successful write as saved', async () => {
		setTauriInvokeForTest((async () => ({ ok: true, content: JSON.stringify(registry) })) as TauriInvoke);
		assert.deepEqual(await writeBriefRegistry(registry, 'C:/workspace'), { ok: false, error: 'brief-registry-invalid' });
	});
});
