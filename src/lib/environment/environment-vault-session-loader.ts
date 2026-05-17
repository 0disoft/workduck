import {
	parseEnvironmentVault,
	type EnvironmentVault
} from './environment-vault';
import {
	readEnvironmentVaultEnvelope,
	type EnvironmentVaultStorageError
} from './environment-vault-storage';
import {
	readEnvironmentVaultSession,
	setEnvironmentVaultSession
} from './environment-vault-session';
import { decryptSecretVaultPayload } from './secret-vault-crypto';
import { readWorkspaceUnlockPasswordSession } from '$lib/workspaces/workspace-unlock';

export type EnvironmentVaultSessionOpenStatus =
	| 'already-open'
	| 'opened'
	| 'missing-vault'
	| 'missing-workspace-password';

export type EnvironmentVaultSessionOpenError =
	| EnvironmentVaultStorageError
	| 'environment-vault-session-decrypt-failed'
	| 'environment-vault-session-invalid';

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
	workspaceId: string
): Promise<EnvironmentVaultSessionOpenResult> {
	const currentVault = readEnvironmentVaultSession(workspaceId);

	if (currentVault !== null) {
		return {
			ok: true,
			vault: currentVault,
			status: 'already-open'
		};
	}

	const envelopeResult = readEnvironmentVaultEnvelope(workspaceId);

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

	const decryptResult = await decryptSecretVaultPayload(
		envelopeResult.envelope,
		workspacePassword
	);

	if (!decryptResult.ok) {
		return {
			ok: false,
			vault: null,
			error: 'environment-vault-session-decrypt-failed'
		};
	}

	const vault = parseEnvironmentVault(decryptResult.plaintext, workspaceId);

	if (vault === null) {
		return {
			ok: false,
			vault: null,
			error: 'environment-vault-session-invalid'
		};
	}

	setEnvironmentVaultSession(vault);

	return {
		ok: true,
		vault,
		status: 'opened'
	};
}
