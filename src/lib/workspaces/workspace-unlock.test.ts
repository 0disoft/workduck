import { afterEach, beforeEach, expect, test } from 'bun:test';
import { setTauriInvokeForTest } from '#lib/tauri/tauri-invoke.ts';
import type { WorkspaceRecord } from './workspace-registry';
import {
	getWorkspaceUnlockLockout, isWorkspaceUnlocked, markWorkspaceLocked, markWorkspaceUnlocked,
	readWorkspaceUnlockPasswordSession, unlockWorkspace
} from './workspace-unlock';

const workspace: WorkspaceRecord = { id: 'unlock-race', name: 'Unlock test', path: 'C:/unlock-test',
	lock: { kind: 'password', passwordHash: 'test-hash', createdAt: '', updatedAt: '' }, createdAt: '', updatedAt: '' };
const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'window');
let replies: ((reply: unknown) => void)[];
beforeEach(() => {
	const values = new Map<string, string>();
	Object.defineProperty(globalThis, 'window', { configurable: true, value: Object.assign(new EventTarget(), {
		localStorage: { getItem: (key: string) => values.get(key) ?? null,
			setItem: (key: string, value: string) => values.set(key, value) }
	}) });
	replies = [];
	setTauriInvokeForTest(async <T>(command: string) => {
		expect(command).toBe('verify_workspace_password');
		return await new Promise<unknown>((resolve) => replies.push(resolve)) as T;
	});
});
afterEach(() => {
	markWorkspaceLocked(workspace.id);
	setTauriInvokeForTest(undefined);
	if (descriptor) Object.defineProperty(globalThis, 'window', descriptor);
	else Reflect.deleteProperty(globalThis, 'window');
});

for (const matched of [true, false]) {
	test(`locking cancels pending verification without changing unlock state or attempts, matched=${matched}`, async () => {
		const pending = unlockWorkspace(workspace, 'example-password', 1_000);
		markWorkspaceLocked(workspace.id);
		replies[0]!({ ok: true, matched });
		expect(await pending).toMatchObject({ ok: false, error: 'workspace-unlock-cancelled' });
		expect(isWorkspaceUnlocked(workspace)).toBe(false);
		expect(readWorkspaceUnlockPasswordSession(workspace.id)).toBeNull();
		expect(getWorkspaceUnlockLockout(workspace.id, 1_000).failedAttempts).toBe(0);
	});
}

test('a newer verification owns the outcome even when an older success arrives afterwards', async () => {
	const old = unlockWorkspace(workspace, 'old-password', 1_000);
	const current = unlockWorkspace(workspace, 'current-password', 1_000);
	replies[1]!({ ok: true, matched: true });
	expect(await current).toEqual({ ok: true });
	replies[0]!({ ok: true, matched: true });
	expect(await old).toMatchObject({ ok: false, error: 'workspace-unlock-cancelled' });
	expect(readWorkspaceUnlockPasswordSession(workspace.id)).toBe('current-password');
});

test('late failed verification does not consume attempts after a newer unlock', async () => {
	const old = unlockWorkspace(workspace, 'old-password', 1_000);
	markWorkspaceUnlocked(workspace.id, 'trusted-new-password');
	replies[0]!({ ok: true, matched: false });
	expect(await old).toMatchObject({ ok: false, error: 'workspace-unlock-cancelled' });
	expect(readWorkspaceUnlockPasswordSession(workspace.id)).toBe('trusted-new-password');
	expect(getWorkspaceUnlockLockout(workspace.id, 1_000).failedAttempts).toBe(0);
});

test('aborting one owner cannot cancel a newer verification for the same workspace', async () => {
	const owner = new AbortController();
	const old = unlockWorkspace(workspace, 'old-password', 1_000, owner.signal);
	const current = unlockWorkspace(workspace, 'current-password', 1_000);
	owner.abort();
	replies[0]!({ ok: true, matched: true });
	expect(await old).toMatchObject({ ok: false, error: 'workspace-unlock-cancelled' });
	replies[1]!({ ok: true, matched: true });
	expect(await current).toEqual({ ok: true });
	expect(readWorkspaceUnlockPasswordSession(workspace.id)).toBe('current-password');
});

test('an already aborted owner cannot begin verification', async () => {
	const owner = new AbortController();
	owner.abort();
	const pending = unlockWorkspace(workspace, 'example-password', 1_000, owner.signal);
	expect(replies).toHaveLength(0);
	expect(await pending).toMatchObject({ ok: false, error: 'workspace-unlock-cancelled' });
});

for (const matched of [true, false]) {
	test(`closing a live owner ignores its later verification reply, matched=${matched}`, async () => {
		const owner = new AbortController();
		const pending = unlockWorkspace(workspace, 'example-password', 1_000, owner.signal);
		owner.abort();
		replies[0]!({ ok: true, matched });
		expect(await pending).toMatchObject({ ok: false, error: 'workspace-unlock-cancelled' });
		expect(isWorkspaceUnlocked(workspace)).toBe(false);
		expect(getWorkspaceUnlockLockout(workspace.id, 1_000).failedAttempts).toBe(0);
	});
}

test('an active verification still records failed attempts and permits a fresh successful retry', async () => {
	const failed = unlockWorkspace(workspace, 'wrong-password', 1_000);
	replies[0]!({ ok: true, matched: false });
	expect(await failed).toMatchObject({ ok: false, error: 'workspace-unlock-invalid-password', attemptsRemaining: 2 });
	expect(getWorkspaceUnlockLockout(workspace.id, 1_000).failedAttempts).toBe(1);
	const successful = unlockWorkspace(workspace, 'right-password', 1_000);
	replies[1]!({ ok: true, matched: true });
	expect(await successful).toEqual({ ok: true });
	expect(getWorkspaceUnlockLockout(workspace.id, 1_000).failedAttempts).toBe(0);
});
