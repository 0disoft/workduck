import { plugin, Transpiler } from 'bun';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { compile, compileModule } from 'svelte/compiler';
import { setTauriInvokeForTest } from '#lib/tauri/tauri-invoke.ts';
import type { WorkspaceRecord } from '#lib/workspaces/workspace-registry.ts';
import { createEmptyProjectRegistry, serializeProjectRegistry } from './project-registry';
import { WORKDUCK_PROJECT_REGISTRY_CHANGED_EVENT } from './project-storage';
import { createEmptyEnvironmentVault } from '#lib/environment/environment-vault.ts';
import { closeEnvironmentVaultSession, setEnvironmentVaultSession } from '#lib/environment/environment-vault-session.ts';
import { WORKDUCK_ENVIRONMENT_VAULT_CHANGED_EVENT } from '#lib/environment/environment-vault-storage.ts';
import type { SecretVaultEnvelope } from '#lib/environment/secret-vault-crypto.ts';

await plugin({
	name: 'project-workspace-lifecycle-component',
	setup(build) {
		build.onLoad({ filter: /ProjectBoardWorkspaceLifecycle\.svelte$/ }, async ({ path }) => ({
			contents: compile(await Bun.file(path).text(), { filename: path, generate: 'client' }).js.code,
			loader: 'js'
		}));
		build.onLoad({ filter: /project-board-workspace-lifecycle-harness\.svelte\.ts$/ }, async ({ path }) => {
			const source = new Transpiler({ loader: 'ts' }).transformSync(await Bun.file(path).text());
			return { contents: compileModule(source, { filename: path, generate: 'client' }).js.code, loader: 'js' };
		});
	}
});
const { createProjectBoardWorkspaceLifecycleHarness } = await import('./project-board-workspace-lifecycle-harness.svelte');

function workspace(id: string): WorkspaceRecord {
	return { id, name: id, path: `C:/workspaces/${id}`, lock: null,
		createdAt: '2026-10-04T00:00:00.000Z', updatedAt: '2026-10-04T00:00:00.000Z' };
}
function deferred() {
	let resolve!: () => void;
	const promise = new Promise<void>((next) => { resolve = next; });
	return { promise, resolve };
}
async function settleEffects() { await new Promise((resolve) => setTimeout(resolve, 0)); }
function registry(id: string, read: number) {
	return { ...createEmptyProjectRegistry(id), updatedAt: `2026-10-04T00:00:0${read}.000Z` };
}
function operationResponse(id: string, read: number) {
	return { ok: true, records: [{
		id: `operation_${read}`, workspaceId: id, nodeId: 'project_1', repositoryId: 'repository_shared',
		repositoryName: 'Demo', operation: 'fetch', state: 'succeeded', errorCode: null,
		startedAt: '2026-10-04T00:00:00.000Z', finishedAt: '2026-10-04T00:00:01.000Z'
	}] };
}

const windowDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'window');
beforeEach(() => {
	const values = new Map<string, string>();
	const localStorage: Storage = {
		get length() { return values.size; }, clear() { values.clear(); },
		getItem(key) { return values.get(key) ?? null; }, key(index) { return [...values.keys()][index] ?? null; },
		removeItem(key) { values.delete(key); }, setItem(key, value) { values.set(key, value); }
	};
	Object.defineProperty(globalThis, 'window', { configurable: true,
		value: Object.assign(new EventTarget(), { localStorage }) });
});
afterEach(async () => {
	await closeEnvironmentVaultSession('old');
	setTauriInvokeForTest(undefined);
	if (windowDescriptor) Object.defineProperty(globalThis, 'window', windowDescriptor);
	else Reflect.deleteProperty(globalThis, 'window');
});

describe('project board workspace lifecycle', () => {
	for (const error of ['project-registry-read-failed', 'project-registry-version-unsupported'] as const) {
		test(`keeps editing closed while loading and after ${error}`, async () => {
			const pending = deferred();
			setTauriInvokeForTest(async <T>(command: string) => {
				if (command === 'read_project_registry') {
					await pending.promise;
					if (error === 'project-registry-version-unsupported') {
						return { ok: true, registryJson: JSON.stringify({ ...registry('old', 0), version: 999 }) } as T;
					}
				}
				return { ok: false, error } as T;
			});
			const harness = createProjectBoardWorkspaceLifecycleHarness(workspace('old'));
			try {
				await settleEffects();
				expect(harness.state.registryReadScope).toBeNull();
				pending.resolve();
				await settleEffects();
				expect(harness.state.storageError).toBe(error);
				expect(harness.state.registryReadScope).toBeNull();
			} finally { pending.resolve(); await settleEffects(); harness.dispose(); }
		});
	}

	test('preserves board selection and avoids reloading when workspace metadata changes', async () => {
		let registryReads = 0;
		setTauriInvokeForTest(async <T>(command: string) => {
			if (command === 'read_project_registry') {
				registryReads += 1;
				return { ok: true, registryJson: null } as T;
			}
			return { ok: false } as T;
		});
		const harness = createProjectBoardWorkspaceLifecycleHarness(workspace('old'));
		try {
			await settleEffects();
			harness.state.selectedProjectId = 'selected';
			harness.state.environmentVaultPassword = 'draft';
			harness.setWorkspace({ ...workspace('old'), name: 'Renamed workspace' });
			await settleEffects();
			expect(registryReads).toBe(1);
			expect(harness.state.registryReadScope).toBe(JSON.stringify(['old', workspace('old').path]));
			expect(harness.state.selectedProjectId).toBe('selected');
			expect(harness.state.environmentVaultPassword).toBe('draft');
		} finally { harness.dispose(); }
	});

	for (const change of ['switch', 'return', 'rename', 'dispose']) {
		test(`rejects the previous workspace registry and operation response across ${change}`, async () => {
			const oldRead = deferred();
			let registryReads = 0;
			let operationReads = 0;
			setTauriInvokeForTest(async <T>(command: string, args?: Record<string, unknown>) => {
				const id = args?.workspaceId as string;
				if (command === 'read_project_registry') {
					const read = registryReads++;
					if (read === 0) await oldRead.promise;
					return { ok: true, registryJson: serializeProjectRegistry(registry(id, read)) } as T;
				}
				if (command === 'read_project_repository_operation_records') {
					const read = operationReads++;
					if (read === 0) await oldRead.promise;
					return operationResponse(id, read) as T;
				}
				return { ok: false } as T;
			});
			const harness = createProjectBoardWorkspaceLifecycleHarness(workspace('old'));
			try {
				await settleEffects();
				expect(registryReads).toBe(1);
				if (change === 'dispose') {
					harness.dispose();
				} else {
					harness.setWorkspace(change === 'rename'
						? { ...workspace('old'), path: 'C:/workspaces/renamed' } : workspace('new'));
					await settleEffects();
					if (change === 'return') {
						harness.setWorkspace(workspace('old'));
						await settleEffects();
					}
				}
				const currentRegistry = harness.state.registry;
				const currentOperations = harness.state.repositoryOperationById;
				const currentReadScope = harness.state.registryReadScope;
				oldRead.resolve();
				await settleEffects();
				expect(harness.state.registry).toEqual(currentRegistry);
				expect(harness.state.repositoryOperationById).toEqual(currentOperations);
				expect(harness.state.registryReadScope).toBe(currentReadScope);
				if (change !== 'dispose') {
					const currentWorkspace = change === 'rename' ? { ...workspace('old'), path: 'C:/workspaces/renamed' }
						: workspace(change === 'return' ? 'old' : 'new');
					expect(currentReadScope).toBe(JSON.stringify([currentWorkspace.id, currentWorkspace.path]));
				}
			} finally {
				oldRead.resolve();
				await settleEffects();
				if (change !== 'dispose') harness.dispose();
			}
		});
	}

	test('keeps a published registry when the initial snapshot arrives later', async () => {
		const pending = deferred();
		setTauriInvokeForTest(async <T>(command: string) => {
			if (command === 'read_project_registry') {
				await pending.promise;
				return { ok: true, registryJson: serializeProjectRegistry(registry('old', 0)) } as T;
			}
			return { ok: false } as T;
		});
		const harness = createProjectBoardWorkspaceLifecycleHarness(workspace('old'));
		try {
			await settleEffects();
			const published = registry('old', 8);
			window.dispatchEvent(new CustomEvent(WORKDUCK_PROJECT_REGISTRY_CHANGED_EVENT, {
				detail: { workspaceId: 'old', registry: published }
			}));
			expect(harness.state.registry).toEqual(published);
			expect(harness.state.registryReadScope).toBe(JSON.stringify(['old', workspace('old').path]));
			pending.resolve();
			await settleEffects();
			expect(harness.state.registry).toEqual(published);
		} finally {
			pending.resolve();
			await settleEffects();
			harness.dispose();
		}
	});

	test('keeps a live repository operation when older history arrives', async () => {
		const pending = deferred();
		setTauriInvokeForTest(async <T>(command: string) => {
			if (command === 'read_project_repository_operation_records') {
				await pending.promise;
				return operationResponse('old', 0) as T;
			}
			return (command === 'read_project_registry' ? { ok: true, registryJson: null } : { ok: false }) as T;
		});
		const harness = createProjectBoardWorkspaceLifecycleHarness(workspace('old'));
		try {
			await settleEffects();
			const running = { id: 'live', name: 'fetch', state: 'running', error: null,
				startedAt: '2026-10-04T00:00:02.000Z', finishedAt: null } as const;
			harness.state.repositoryOperationById = { repository_shared: running };
			pending.resolve();
			await settleEffects();
			expect(harness.state.repositoryOperationById.repository_shared).toEqual(running);
		} finally {
			pending.resolve();
			await settleEffects();
			harness.dispose();
		}
	});

	for (const publication of ['session', 'envelope']) {
		test(`keeps the published vault ${publication} when the initial empty read arrives`, async () => {
			const pending = deferred();
			setTauriInvokeForTest(async <T>(command: string) => {
				if (command === 'read_workspace_data_file') {
					await pending.promise;
					return { ok: true, content: null } as T;
				}
				return (command === 'read_project_registry' ? { ok: true, registryJson: null } : { ok: false }) as T;
			});
			const harness = createProjectBoardWorkspaceLifecycleHarness(workspace('old'));
			const vault = { ...createEmptyEnvironmentVault('old'), nativeManaged: true } as const;
			const envelope: SecretVaultEnvelope = {
				format: 'workduck.secret-vault', version: 1,
				kdf: { algorithm: 'argon2id', version: 19, memoryKiB: 19456, iterations: 2, parallelism: 1, salt: 'fixture' },
				cipher: { algorithm: 'xchacha20poly1305', nonce: 'fixture' }, ciphertext: 'encrypted-fixture'
			};
			try {
				await settleEffects();
				if (publication === 'session') setEnvironmentVaultSession(vault);
				else window.dispatchEvent(new CustomEvent(WORKDUCK_ENVIRONMENT_VAULT_CHANGED_EVENT, {
					detail: { workspaceId: 'old', envelope }
				}));
				pending.resolve();
				await settleEffects();
				if (publication === 'session') expect(harness.state.environmentVault).toEqual(vault);
				else expect(harness.state.environmentVaultEnvelope).toEqual(envelope);
			} finally {
				pending.resolve();
				await settleEffects();
				harness.dispose();
			}
		});
	}
});
