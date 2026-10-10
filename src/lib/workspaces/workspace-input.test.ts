import { afterEach, expect, test } from 'bun:test';
import { setTauriInvokeForTest } from '#lib/tauri/tauri-invoke.ts';
import {
	addWorkspace, createEmptyWorkspaceRegistry, updateWorkspacePath,
	WORKSPACE_PATH_MAX_LENGTH, WORKSPACE_PASSWORD_HASH_MAX_LENGTH
} from './workspace-registry';
import { validateWorkspacePath } from './workspace-path';

const pathAtLimit = `C:/${'a'.repeat(WORKSPACE_PATH_MAX_LENGTH - 3)}`;
const hashAtLimit = 'h'.repeat(WORKSPACE_PASSWORD_HASH_MAX_LENGTH);

afterEach(() => setTauriInvokeForTest(undefined));

test('registration rejects a path that would otherwise be stored as another folder', () => {
	const initial = createEmptyWorkspaceRegistry();
	const result = addWorkspace(initial, { name: 'Long', path: `${pathAtLimit}b` });
	expect(result).toEqual({ ok: false, registry: initial, error: 'workspace-path-too-long' });
});

test('path repair rejects overflow before duplicate detection and retains the previous path', () => {
	const added = addWorkspace(createEmptyWorkspaceRegistry(), { name: 'Existing', path: pathAtLimit });
	if (!added.ok) throw new Error('workspace fixture failed');
	const result = updateWorkspacePath(added.registry, added.workspace.id, `${pathAtLimit}b`);
	expect(result).toEqual({ ok: false, registry: added.registry, error: 'workspace-path-too-long' });
	expect(added.workspace.path).toBe(pathAtLimit);
});

test('registration rejects an oversized lock hash instead of persisting an unusable hash', () => {
	const initial = createEmptyWorkspaceRegistry();
	expect(addWorkspace(initial, { name: 'Locked', path: 'C:/locked', passwordHash: `${hashAtLimit}x` }))
		.toEqual({ ok: false, registry: initial, error: 'workspace-password-hash-invalid' });
});

test('length checks apply after harmless whitespace and Windows prefix normalization', () => {
	const result = addWorkspace(createEmptyWorkspaceRegistry(), {
		name: 'Boundary', path: `  \\\\?\\${pathAtLimit}  `, passwordHash: ` ${hashAtLimit} `
	});
	if (!result.ok) throw new Error('boundary input was rejected');
	expect(result.workspace.path).toBe(pathAtLimit);
	expect(result.workspace.lock?.passwordHash).toBe(hashAtLimit);
	expect(updateWorkspacePath(result.registry, result.workspace.id, `  ${pathAtLimit}  `).ok).toBe(true);
});

test('oversized manual and picker paths fail validation before invoking the filesystem', async () => {
	let calls = 0;
	setTauriInvokeForTest(async <T>() => { calls += 1; return { ok: true, normalizedPath: pathAtLimit } as T; });
	expect(await validateWorkspacePath(`${pathAtLimit}b`)).toEqual({ ok: false, error: 'workspace-path-too-long' });
	expect(calls).toBe(0);
	expect(await validateWorkspacePath(`  \\\\?\\${pathAtLimit}  `)).toEqual({ ok: true, path: pathAtLimit });
	expect(calls).toBe(1);
});

test('a short input resolving to an oversized canonical path cannot be registered', async () => {
	setTauriInvokeForTest(async <T>() => ({ ok: true, normalizedPath: `\\\\?\\${pathAtLimit}b` }) as T);
	expect(await validateWorkspacePath('C:/junction')).toEqual({ ok: false, error: 'workspace-path-too-long' });
	setTauriInvokeForTest(async <T>() => ({ ok: true, normalizedPath: `\\\\?\\${pathAtLimit}` }) as T);
	expect(await validateWorkspacePath('C:/junction')).toEqual({ ok: true, path: pathAtLimit });
});
