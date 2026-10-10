import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, test } from 'node:test';

import { setTauriInvokeForTest } from '#lib/tauri/tauri-invoke.ts';
import { readReferenceRegistry } from '#lib/references/reference-registry-storage.ts';
import { readSkillRegistry } from '#lib/skills/skill-registry-storage.ts';

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
				JSON.stringify({ version: registry.version, workspaceId: 'workspace' })
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
			setTauriInvokeForTest(async <T>(command: string) =>
				(command === 'read_workspace_data_file' ? { ok: true, content: null } : { ok: true }) as T
			);
			const result = await registry.read('workspace', 'C:/workspace');
			assert.equal(result.ok, true);
			assert.equal(result.registry.workspaceId, 'workspace');
		});
	});
}
