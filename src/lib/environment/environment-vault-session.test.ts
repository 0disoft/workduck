import assert from 'node:assert/strict';
import { afterEach, describe, test } from 'node:test';

import { setTauriInvokeForTest, type TauriInvoke } from '#lib/tauri/tauri-invoke.ts';
import {
	markWorkspaceLocked,
	markWorkspaceUnlocked,
	readWorkspaceUnlockPasswordSession
} from '#lib/workspaces/workspace-unlock.ts';

import {
	closeEnvironmentVaultSession,
	createEnvironmentVaultSession,
	lockIdleWorkspaceEnvironmentVaultSessions,
	lockWorkspaceEnvironmentVaultSession,
	openEnvironmentVaultSession,
	readEnvironmentVaultSession,
	readEnvironmentVaultSessionSecretValue,
	refreshEnvironmentVaultSession,
	removeEnvironmentVaultSessionSecret,
	setEnvironmentVaultSession
} from './environment-vault-session';
import { createEmptyEnvironmentVault } from './environment-vault';
import type { SecretVaultEnvelope } from './secret-vault-crypto';

const envelope: SecretVaultEnvelope = {
	format: 'workduck.secret-vault', version: 1,
	kdf: { algorithm: 'argon2id', version: 19, memoryKiB: 19456, iterations: 2, parallelism: 1, salt: 'test-salt' },
	cipher: { algorithm: 'xchacha20poly1305', nonce: 'test-nonce' }, ciphertext: 'test-ciphertext'
};

function deferred() {
	let resolve!: () => void;
	const promise = new Promise<void>((next) => { resolve = next; });
	return { promise, resolve };
}

describe('native Environment vault workspace lock', () => {
	afterEach(() => {
		setTauriInvokeForTest(undefined);
	});
	const operations = {
		refresh: (id: string) => refreshEnvironmentVaultSession(id),
		open: (id: string) => openEnvironmentVaultSession(id, 'test-password', envelope),
		create: (id: string) => createEnvironmentVaultSession(id, 'test-password'),
		remove: (id: string) => removeEnvironmentVaultSessionSecret(id, 'test-secret'),
		readValue: (id: string) => readEnvironmentVaultSessionSecretValue(id, 'test-secret')
	};
	for (const [name, operation] of Object.entries(operations)) {
		test(`rejects a late ${name} response after the session closes`, async () => {
			const workspaceId = `vault-late-${name}`;
			const pending = deferred();
			const vault = { ...createEmptyEnvironmentVault(workspaceId), nativeManaged: true as const };
			setTauriInvokeForTest(async <T>(command: string) => {
				if (command === 'close_environment_vault_session') return { ok: true } as T;
				await pending.promise;
				return { ok: true, vault, envelope, value: 'test-value' } as T;
			});
			setEnvironmentVaultSession(vault);
			const reading = operation(workspaceId);
			try {
				assert.equal((await closeEnvironmentVaultSession(workspaceId)).ok, true);
				pending.resolve();
				assert.deepEqual(await reading, { ok: false, error: 'environment-vault-session-locked' });
				assert.equal(readEnvironmentVaultSession(workspaceId), null);
				assert.equal((await openEnvironmentVaultSession(workspaceId, 'test-password', envelope)).ok, true);
				assert.ok(readEnvironmentVaultSession(workspaceId));
			} finally { pending.resolve(); await reading; await closeEnvironmentVaultSession(workspaceId); }
		});
	}

	test('rejects new requests during close without blocking another workspace', async () => {
		const pendingClose = deferred();
		const commands: string[] = [];
		setTauriInvokeForTest(async <T>(command: string, args?: Record<string, unknown>) => {
			commands.push(command);
			if (command === 'close_environment_vault_session') { await pendingClose.promise; return { ok: true } as T; }
			return { ok: true, vault: { ...createEmptyEnvironmentVault(String(args?.workspaceId)), nativeManaged: true } } as T;
		});
		const closing = closeEnvironmentVaultSession('vault-closing');
		try {
			assert.deepEqual(await refreshEnvironmentVaultSession('vault-closing'), { ok: false, error: 'environment-vault-session-locked' });
			assert.deepEqual(commands, ['close_environment_vault_session']);
			assert.equal((await refreshEnvironmentVaultSession('vault-independent')).ok, true);
		} finally {
			pendingClose.resolve(); await closing;
			await closeEnvironmentVaultSession('vault-independent');
		}
	});

	test('keeps requests blocked until every overlapping close finishes', async () => {
		const firstClose = deferred();
		const secondClose = deferred();
		let closes = 0;
		setTauriInvokeForTest(async <T>(command: string, args?: Record<string, unknown>) => {
			if (command === 'close_environment_vault_session') {
				await (++closes === 1 ? firstClose : secondClose).promise;
				return { ok: true } as T;
			}
			return { ok: true, vault: { ...createEmptyEnvironmentVault(String(args?.workspaceId)), nativeManaged: true } } as T;
		});
		const first = closeEnvironmentVaultSession('vault-overlapping');
		const second = closeEnvironmentVaultSession('vault-overlapping');
		try {
			secondClose.resolve(); await second;
			assert.deepEqual(await refreshEnvironmentVaultSession('vault-overlapping'), { ok: false, error: 'environment-vault-session-locked' });
			firstClose.resolve(); await first;
			assert.equal((await openEnvironmentVaultSession('vault-overlapping', 'test-password', envelope)).ok, true);
		} finally {
			firstClose.resolve(); secondClose.resolve(); await Promise.all([first, second]);
			await closeEnvironmentVaultSession('vault-overlapping');
		}
	});

	test('rechecks close ownership before publishing an already received response', async () => {
		const workspaceId = 'vault-close-before-publish';
		setTauriInvokeForTest(async <T>(command: string) => (
			command === 'close_environment_vault_session' ? { ok: true } :
				{ ok: true, vault: { ...createEmptyEnvironmentVault(workspaceId), nativeManaged: true } }
		) as T);
		const reading = refreshEnvironmentVaultSession(workspaceId);
		let closing: Promise<unknown> | undefined;
		queueMicrotask(() => { closing = closeEnvironmentVaultSession(workspaceId); });
		assert.deepEqual(await reading, { ok: false, error: 'environment-vault-session-locked' });
		await closing;
		assert.equal(readEnvironmentVaultSession(workspaceId), null);
	});

	test('waits for native session close before publishing the workspace lock', async () => {
		const workspaceId = 'workspace-lock-order';
		let completeClose: ((value: { ok: true }) => void) | undefined;
		const invoke: TauriInvoke = async <T>(command: string) => {
			assert.equal(command, 'close_environment_vault_session');

			return await new Promise<T>((resolve) => {
				completeClose = (value) => resolve(value as T);
			});
		};

		setTauriInvokeForTest(invoke);
		markWorkspaceUnlocked(workspaceId, 'password');

		const lock = lockWorkspaceEnvironmentVaultSession(workspaceId);
		assert.equal(readWorkspaceUnlockPasswordSession(workspaceId), 'password');

		completeClose?.({ ok: true });
		assert.equal(await lock, true);
		assert.equal(readWorkspaceUnlockPasswordSession(workspaceId), null);
	});

	test('does not claim the workspace is locked when native revocation fails', async () => {
		const workspaceId = 'workspace-lock-failure';
		setTauriInvokeForTest(async <T>() =>
			({ ok: false, error: 'environment-vault-session-store-failed' }) as T
		);
		markWorkspaceUnlocked(workspaceId, 'password');

		assert.equal(await lockWorkspaceEnvironmentVaultSession(workspaceId), false);
		assert.equal(readWorkspaceUnlockPasswordSession(workspaceId), 'password');

		markWorkspaceLocked(workspaceId);
	});

	test('starts every idle workspace revocation even when an earlier close is still pending', async () => {
		const firstWorkspaceId = 'workspace-idle-first';
		const secondWorkspaceId = 'workspace-idle-second';
		let completeFirstClose: ((value: { ok: true }) => void) | undefined;
		const invokedWorkspaceIds: string[] = [];

		setTauriInvokeForTest(async <T>(_command: string, args?: Record<string, unknown>) => {
			const workspaceId = String(args?.workspaceId ?? '');
			invokedWorkspaceIds.push(workspaceId);

			if (workspaceId === firstWorkspaceId) {
				return await new Promise<T>((resolve) => {
					completeFirstClose = (value) => resolve(value as T);
				});
			}

			return { ok: true } as T;
		});
		markWorkspaceUnlocked(firstWorkspaceId, 'first-password');
		markWorkspaceUnlocked(secondWorkspaceId, 'second-password');

		const lock = lockIdleWorkspaceEnvironmentVaultSessions(1, Date.now() + 1_000);
		await new Promise((resolve) => setTimeout(resolve, 0));

		assert.deepEqual(invokedWorkspaceIds, [firstWorkspaceId, secondWorkspaceId]);
		assert.equal(readWorkspaceUnlockPasswordSession(firstWorkspaceId), 'first-password');
		assert.equal(readWorkspaceUnlockPasswordSession(secondWorkspaceId), null);

		completeFirstClose?.({ ok: true });
		assert.deepEqual(await lock, [firstWorkspaceId, secondWorkspaceId]);
		assert.equal(readWorkspaceUnlockPasswordSession(firstWorkspaceId), null);
	});
});
