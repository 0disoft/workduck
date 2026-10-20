import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, test } from 'node:test';

import { setTauriInvokeForTest } from '#lib/tauri/tauri-invoke.ts';
import { readReferenceRegistry, writeReferenceRegistry } from '#lib/references/reference-registry-storage.ts';
import { readSkillRegistry, writeSkillRegistry } from '#lib/skills/skill-registry-storage.ts';
import type { ReferenceRegistry } from '#lib/references/reference-registry.ts';
import type { SkillRegistry } from '#lib/skills/skill-registry.ts';

const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');

beforeEach(() => {
	const values = new Map<string, string>();
	const browser = Object.assign(new EventTarget(), {
		localStorage: {
			getItem: (key: string) => values.get(key) ?? null,
			setItem: (key: string, value: string) => values.set(key, value),
			removeItem: (key: string) => values.delete(key)
		}
	});
	Object.defineProperty(globalThis, 'window', { configurable: true, value: browser });
});

afterEach(() => {
	setTauriInvokeForTest(undefined);
	if (originalWindow === undefined) Reflect.deleteProperty(globalThis, 'window');
	else Object.defineProperty(globalThis, 'window', originalWindow);
});

for (const registry of [
	{ name: 'references', version: 1, read: readReferenceRegistry },
	{ name: 'skills', version: 3, read: readSkillRegistry }
]) {
	describe(`${registry.name} registry read safety`, () => {
		test('rejects corrupt or unrelated files without replacing them with fallback data', async () => {
			for (const content of [
				'{',
				'{}',
				JSON.stringify({ version: registry.version, workspaceId: 'other', [registry.name]: [] }),
				JSON.stringify({ version: 999, workspaceId: 'workspace', [registry.name]: [] }),
				JSON.stringify({ version: registry.version, workspaceId: 'workspace' }),
				...[null, -1, Number.MAX_SAFE_INTEGER + 1].map((revision) => JSON.stringify({
					version: registry.version, workspaceId: 'workspace', [registry.name]: [], revision
				}))
			]) {
				const commands: string[] = [];
				setTauriInvokeForTest(async <T>(command: string) => {
					commands.push(command);
					return { ok: true, content } as T;
				});
				const result = await registry.read('workspace', 'C:/workspace');
				assert.equal(result.ok, false, content);
				assert.deepEqual(commands, ['read_workspace_data_file']);
			}
		});

		test('reports native read failures instead of treating them as first-time creation', async () => {
			const commands: string[] = [];
			setTauriInvokeForTest(async <T>(command: string) => {
				commands.push(command);
				return { ok: false, error: 'workspace-data-file-read-failed' } as T;
			});
			const result = await registry.read('workspace', 'C:/workspace');
			assert.equal(result.ok, false);
			assert.deepEqual(commands, ['read_workspace_data_file']);
		});

		test('allows a genuinely missing registry to initialize normally', async () => {
			setTauriInvokeForTest(async <T>(command: string, args?: Record<string, unknown>) =>
				(command === 'read_workspace_data_file' ? { ok: true, content: null } : {
					ok: true, content: JSON.stringify({ ...JSON.parse(args?.content as string), revision: 1 })
				}) as T
			);
			const result = await registry.read('workspace', 'C:/workspace');
			assert.equal(result.ok, true);
			assert.equal(result.registry.workspaceId, 'workspace');
		});

		test('retains the persisted revision and refuses stale edits without publishing them', async () => {
			let content = JSON.stringify({
				version: registry.version, workspaceId: 'workspace', [registry.name]: [], updatedAt: ''
			});
			let revision = 0;
			let events = 0;
			const eventName = `workduck:${registry.name === 'references' ? 'reference' : 'skill'}-registry-changed`;
			window.addEventListener(eventName, () => { events += 1; });
			setTauriInvokeForTest(async <T>(command: string, args?: Record<string, unknown>) => {
				if (command === 'read_workspace_data_file') return { ok: true, content } as T;
				assert.equal(command, 'write_workspace_registry_file');
				assert.equal(args?.fileName, `${registry.name}.json`);
				if (args?.expectedRevision !== revision) {
					return { ok: false, error: 'workspace-data-revision-conflict' } as T;
				}
				const value = JSON.parse(args.content as string);
				assert.equal(value.revision, revision);
				revision += 1;
				content = JSON.stringify({ ...value, revision });
				return { ok: true, content } as T;
			});
			const original = await registry.read('workspace', 'C:/workspace');
			assert.equal(original.ok, true);
			assert.equal(original.registry.revision, 0);
			const save = (value: ReferenceRegistry | SkillRegistry) => registry.name === 'references'
				? writeReferenceRegistry(value as ReferenceRegistry, 'C:/workspace')
				: writeSkillRegistry(value as SkillRegistry, 'C:/workspace');
			const saved = await save(original.registry);
			assert.equal(saved.ok, true);
			assert.equal(saved.registry.revision, 1);
			const persisted = content;
			const stale = await save(original.registry);
			assert.equal(stale.ok, false);
			assert.equal(content, persisted);
			assert.equal(events, 1);
			const next = await save(saved.registry);
			assert.equal(next.ok, true);
			assert.equal(next.registry.revision, 2);
			assert.equal(events, 2);
		});
	});
}
