import { afterEach, expect, test } from 'bun:test';
import { setTauriInvokeForTest } from '#lib/tauri/tauri-invoke.ts';
import { createEmptyWorkspaceRegistry, type WorkspaceRegistry } from './workspace-registry';
import { registerWorkspace, isWorkspaceRegistrationInputEqual } from './workspace-registration';
import { isWorkspaceUnlocked, markWorkspaceLocked, readWorkspaceUnlockPasswordSession } from './workspace-unlock';

const registeredIds: string[] = [];
afterEach(() => {
	setTauriInvokeForTest(undefined);
	for (const id of registeredIds.splice(0)) markWorkspaceLocked(id);
});

function draft() {
	return { name: 'Submitted', path: 'C:/submitted', password: 'submitted-password',
		repositoryChoice: 'yes' as 'yes' | 'no' | null, initializeGit: false, installGitignore: true };
}

function deferred() {
	let release!: () => void;
	const promise = new Promise<void>((resolve) => { release = resolve; });
	return { promise, release };
}

test('registration uses one snapshot through validation, hashing, persistence, unlocking and repository setup', async () => {
	const validation = deferred();
	const hash = deferred();
	const saving = deferred();
	const hashStarted = deferred();
	const saveStarted = deferred();
	const input = draft();
	const submitted = { ...input };
	let accepted = createEmptyWorkspaceRegistry();
	let proposed: WorkspaceRegistry | undefined;
	const repositoryCalls: Record<string, unknown>[] = [];
	const hashPasswords: unknown[] = [];
	setTauriInvokeForTest(async <T>(command: string, args?: Record<string, unknown>) => {
		if (command === 'validate_workspace_path') {
			expect(args?.path).toBe('C:/submitted');
			await validation.promise;
			return { ok: true, normalizedPath: 'C:/canonical-submitted' } as T;
		}
		if (command === 'create_workspace_password_hash') {
			hashPasswords.push(args?.password);
			hashStarted.release();
			await hash.promise;
			return { ok: true, passwordHash: 'submitted-hash' } as T;
		}
		expect(command).toBe('setup_workspace_repository');
		repositoryCalls.push(args!);
		return { ok: true } as T;
	});
	const registration = registerWorkspace(input, {
		getRegistry: () => accepted,
		persistRegistry: async (next, expected) => {
			expect(expected).toBe(accepted);
			proposed = next;
			registeredIds.push(next.workspaces[0]!.id);
			saveStarted.release();
			await saving.promise;
			accepted = next;
			return true;
		}
	});
	Object.assign(input, { name: 'Next draft', path: 'C:/next', password: 'next-password',
		repositoryChoice: 'no', initializeGit: true, installGitignore: false });
	validation.release();
	await hashStarted.promise;
	input.password = 'third-password';
	hash.release();
	await saveStarted.promise;
	expect(proposed?.workspaces[0]).toMatchObject({ name: 'Submitted', path: 'C:/canonical-submitted',
		lock: { passwordHash: 'submitted-hash' } });
	expect(isWorkspaceUnlocked(proposed!.workspaces[0])).toBe(false);
	expect(repositoryCalls).toEqual([]);
	saving.release();
	const result = await registration;
	expect(result.ok).toBe(true);
	expect(hashPasswords).toEqual(['submitted-password']);
	expect(readWorkspaceUnlockPasswordSession(accepted.workspaces[0]!.id)).toBe('submitted-password');
	expect(repositoryCalls).toEqual([{ workspacePath: 'C:/canonical-submitted',
		options: { initializeGit: false, installGitignore: true } }]);
	expect(isWorkspaceRegistrationInputEqual(submitted, input)).toBe(false);
	expect(input.password).toBe('third-password');
});

test('a failed save cannot unlock the proposed workspace or prepare its repository', async () => {
	let proposed: WorkspaceRegistry | undefined;
	const commands: string[] = [];
	setTauriInvokeForTest(async <T>(command: string) => {
		commands.push(command);
		return (command === 'validate_workspace_path' ? { ok: true, normalizedPath: 'C:/submitted' }
			: { ok: true, passwordHash: 'submitted-hash' }) as T;
	});
	expect(await registerWorkspace(draft(), { getRegistry: createEmptyWorkspaceRegistry,
		persistRegistry: async (next) => { proposed = next; return false; } }))
		.toEqual({ ok: false, phase: 'persistence' });
	expect(isWorkspaceUnlocked(proposed!.workspaces[0])).toBe(false);
	expect(commands).toEqual(['validate_workspace_path', 'create_workspace_password_hash']);
});

test('repository setup failure retains a committed workspace with its submitted unlock password', async () => {
	let accepted = createEmptyWorkspaceRegistry();
	setTauriInvokeForTest(async <T>(command: string) => (command === 'validate_workspace_path'
		? { ok: true, normalizedPath: 'C:/submitted' } : command === 'create_workspace_password_hash'
		? { ok: true, passwordHash: 'submitted-hash' } : { ok: false, error: 'workspace-repository-create-failed' }) as T);
	const input = draft();
	const submitted = { ...input };
	const result = await registerWorkspace(input, { getRegistry: () => accepted,
		persistRegistry: async (next) => { accepted = next; registeredIds.push(next.workspaces[0]!.id); return true; } });
	expect(result).toMatchObject({ ok: true, repositorySetup: { ok: false, error: 'workspace-repository-create-failed' } });
	expect(readWorkspaceUnlockPasswordSession(accepted.workspaces[0]!.id)).toBe(submitted.password);
	expect(isWorkspaceRegistrationInputEqual(submitted, input)).toBe(true);
});

test('a submitted no-repository choice cannot become repository preparation during a save', async () => {
	const input = { ...draft(), repositoryChoice: 'no' as const };
	const commands: string[] = [];
	setTauriInvokeForTest(async <T>(command: string) => {
		commands.push(command);
		return (command === 'validate_workspace_path' ? { ok: true, normalizedPath: 'C:/submitted' }
			: { ok: true, passwordHash: 'submitted-hash' }) as T;
	});
	const result = await registerWorkspace(input, { getRegistry: createEmptyWorkspaceRegistry,
		persistRegistry: async (next) => {
			registeredIds.push(next.workspaces[0]!.id);
			Object.assign(input, { repositoryChoice: 'yes' });
			return true;
		} });
	expect(result).toMatchObject({ ok: true, repositorySetup: null });
	expect(commands).toEqual(['validate_workspace_path', 'create_workspace_password_hash']);
});

test('invalid preparation stops before persistence or unlocking', async () => {
	setTauriInvokeForTest(async <T>() => ({ ok: false, error: 'workspace-path-not-found' }) as T);
	expect(await registerWorkspace(draft(), { getRegistry: createEmptyWorkspaceRegistry,
		persistRegistry: async () => { throw new Error('must not save'); } }))
		.toEqual({ ok: false, phase: 'preparation', error: 'workspace-path-not-found' });
});
