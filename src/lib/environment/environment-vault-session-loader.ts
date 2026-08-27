import type { EnvironmentVault } from './environment-vault';
import {
	readEnvironmentVaultEnvelopeForWorkspace,
	type EnvironmentVaultStorageError
} from './environment-vault-storage';
import {
	openEnvironmentVaultSession,
	readEnvironmentVaultSession,
	type EnvironmentVaultSessionError
} from './environment-vault-session';
import { readWorkspaceUnlockPasswordSession } from '$lib/workspaces/workspace-unlock';

export type EnvironmentVaultSessionOpenStatus =
	| 'already-open'
	| 'opened'
	| 'missing-vault'
	| 'missing-workspace-password';

export type EnvironmentVaultSessionOpenError =
	| EnvironmentVaultStorageError
	| EnvironmentVaultSessionError;

export type EnvironmentVaultSessionOpenResult =
	| {
			readonly ok: true;
			readonly vault: EnvironmentVault | null;
			readonly status: EnvironmentVaultSessionOpenStatus;
	  }
	| {
			readonly ok: false;
			readonly vault: null;
			readonly error: EnvironmentVaultSessionOpenError;
	  };

export async function openEnvironmentVaultSessionFromWorkspaceUnlock(
	workspaceId: string,
	workspacePath?: string
): Promise<EnvironmentVaultSessionOpenResult> {
	const currentVault = readEnvironmentVaultSession(workspaceId);

	if (currentVault !== null) {
		return {
			ok: true,
			vault: currentVault,
			status: 'already-open'
		};
	}

	const envelopeResult = await readEnvironmentVaultEnvelopeForWorkspace(workspaceId, workspacePath);

	if (!envelopeResult.ok) {
		return {
			ok: false,
			vault: null,
			error: envelopeResult.error
		};
	}

	if (envelopeResult.envelope === null) {
		return {
			ok: true,
			vault: null,
			status: 'missing-vault'
		};
	}

	const workspacePassword = readWorkspaceUnlockPasswordSession(workspaceId);

	if (workspacePassword === null) {
		return {
			ok: true,
			vault: null,
			status: 'missing-workspace-password'
		};
	}

	const openResult = await openEnvironmentVaultSession(
		workspaceId,
		workspacePassword,
		envelopeResult.envelope
	);

	if (!openResult.ok) {
		return {
			ok: false,
			vault: null,
			error: openResult.error
		};
	}

	return {
		ok: true,
		vault: openResult.vault,
		status: 'opened'
	};
}
