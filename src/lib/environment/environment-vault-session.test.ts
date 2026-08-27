import assert from 'node:assert/strict';
import { afterEach, describe, test } from 'node:test';

import { setTauriInvokeForTest, type TauriInvoke } from '$lib/tauri/tauri-invoke';
import {
	markWorkspaceLocked,
	markWorkspaceUnlocked,
	readWorkspaceUnlockPasswordSession
} from '$lib/workspaces/workspace-unlock';

import {
	lockIdleWorkspaceEnvironmentVaultSessions,
	lockWorkspaceEnvironmentVaultSession
} from './environment-vault-session';

describe('native Environment vault workspace lock', () => {
	afterEach(() => {
		setTauriInvokeForTest(undefined);
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
