import { getTauriInvoke } from '$lib/tauri/tauri-invoke';
import {
	isEnvironmentSecretNativeReference,
	parseEnvironmentVault,
	type EnvironmentSecretInput,
	type EnvironmentVault,
	type EnvironmentVaultError
} from './environment-vault';
import { isSecretVaultEnvelope, type SecretVaultEnvelope } from './secret-vault-crypto';

const environmentVaultSessions = new Map<string, EnvironmentVault>();
const environmentVaultSessionSubscribers = new Map<
	string,
	Set<(vault: EnvironmentVault | null) => void>
>();

export type EnvironmentVaultSessionError =
	| EnvironmentVaultError
	| 'environment-vault-session-workspace-required'
	| 'environment-vault-session-password-required'
	| 'environment-vault-session-decrypt-failed'
	| 'environment-vault-session-invalid'
	| 'environment-vault-session-locked'
	| 'environment-vault-session-store-failed'
	| 'environment-vault-session-unavailable';

export type EnvironmentVaultSessionResult =
	| {
			readonly ok: true;
			readonly vault: EnvironmentVault;
	  }
	| {
			readonly ok: false;
			readonly error: EnvironmentVaultSessionError;
	  };

export type EnvironmentVaultSessionMutationResult =
	| {
			readonly ok: true;
			readonly vault: EnvironmentVault;
			readonly envelope: SecretVaultEnvelope;
	  }
	| {
			readonly ok: false;
			readonly error: EnvironmentVaultSessionError;
	  };

export type EnvironmentVaultSecretValueResult =
	| {
			readonly ok: true;
			readonly value: string;
	  }
	| {
			readonly ok: false;
			readonly error: EnvironmentVaultSessionError;
	  };

interface EnvironmentVaultSessionCommandResponse {
	readonly ok: boolean;
	readonly vault?: unknown;
	readonly envelope?: unknown;
	readonly value?: unknown;
	readonly error?: unknown;
}

export function readEnvironmentVaultSession(workspaceId: string) {
	return environmentVaultSessions.get(workspaceId) ?? null;
}

export function setEnvironmentVaultSession(vault: EnvironmentVault) {
	if (!isNativeManagedVault(vault, vault.workspaceId)) {
		return;
	}

	environmentVaultSessions.set(vault.workspaceId, vault);
	notifyEnvironmentVaultSessionSubscribers(vault.workspaceId);
}

export function clearEnvironmentVaultSession(workspaceId: string) {
	clearLocalEnvironmentVaultSession(workspaceId);
	void closeNativeEnvironmentVaultSession(workspaceId);
}

export async function closeEnvironmentVaultSession(workspaceId: string) {
	clearLocalEnvironmentVaultSession(workspaceId);

	const invoke = getTauriInvoke();
	if (invoke === undefined) {
		return { ok: false, error: 'environment-vault-session-unavailable' } as const;
	}

	try {
		const response = await invoke<EnvironmentVaultSessionCommandResponse>(
			'close_environment_vault_session',
			{ workspaceId }
		);

		return response.ok
			? ({ ok: true } as const)
			: ({ ok: false, error: normalizeEnvironmentVaultSessionError(response.error) } as const);
	} catch {
		return { ok: false, error: 'environment-vault-session-store-failed' } as const;
	}
}

export async function createEnvironmentVaultSession(
	workspaceId: string,
	password: string
): Promise<EnvironmentVaultSessionMutationResult> {
	return invokeVaultMutation('create_environment_vault_session', workspaceId, {
		workspaceId,
		password
	});
}

export async function openEnvironmentVaultSession(
	workspaceId: string,
	password: string,
	envelope: SecretVaultEnvelope
): Promise<EnvironmentVaultSessionResult> {
	const response = await invokeVaultCommand('open_environment_vault_session', {
		workspaceId,
		password,
		envelope
	});

	if (!response.ok) {
		return response;
	}

	const vault = parseNativeManagedVault(response.response.vault, workspaceId);
	if (vault === null) {
		return { ok: false, error: 'environment-vault-session-invalid' };
	}

	setEnvironmentVaultSession(vault);
	return { ok: true, vault };
}

export async function refreshEnvironmentVaultSession(
	workspaceId: string
): Promise<EnvironmentVaultSessionResult> {
	const response = await invokeVaultCommand('read_environment_vault_session', { workspaceId });

	if (!response.ok) {
		return response;
	}

	const vault = parseNativeManagedVault(response.response.vault, workspaceId);
	if (vault === null) {
		return { ok: false, error: 'environment-vault-session-invalid' };
	}

	setEnvironmentVaultSession(vault);
	return { ok: true, vault };
}

export async function upsertEnvironmentVaultSessionSecret(
	workspaceId: string,
	input: EnvironmentSecretInput
): Promise<EnvironmentVaultSessionMutationResult> {
	return invokeVaultMutation('upsert_environment_vault_secret', workspaceId, {
		workspaceId,
		input
	});
}

export async function removeEnvironmentVaultSessionSecret(
	workspaceId: string,
	secretId: string
): Promise<EnvironmentVaultSessionMutationResult> {
	return invokeVaultMutation('remove_environment_vault_secret', workspaceId, {
		workspaceId,
		secretId
	});
}

export async function readEnvironmentVaultSessionSecretValue(
	workspaceId: string,
	secretId: string
): Promise<EnvironmentVaultSecretValueResult> {
	const response = await invokeVaultCommand('read_environment_vault_secret_value', {
		workspaceId,
		secretId
	});

	if (!response.ok) {
		return response;
	}

	return typeof response.response.value === 'string'
		? { ok: true, value: response.response.value }
		: { ok: false, error: 'environment-vault-session-invalid' };
}

export function subscribeEnvironmentVaultSession(
	workspaceId: string,
	callback: (vault: EnvironmentVault | null) => void
) {
	const subscribers = environmentVaultSessionSubscribers.get(workspaceId) ?? new Set();
	subscribers.add(callback);
	environmentVaultSessionSubscribers.set(workspaceId, subscribers);

	return () => {
		subscribers.delete(callback);

		if (subscribers.size === 0) {
			environmentVaultSessionSubscribers.delete(workspaceId);
		}
	};
}

async function invokeVaultMutation(
	command: string,
	workspaceId: string,
	args: Record<string, unknown>
): Promise<EnvironmentVaultSessionMutationResult> {
	const response = await invokeVaultCommand(command, args);

	if (!response.ok) {
		return response;
	}

	const vault = parseNativeManagedVault(response.response.vault, workspaceId);
	if (vault === null || !isSecretVaultEnvelope(response.response.envelope)) {
		return { ok: false, error: 'environment-vault-session-invalid' };
	}

	setEnvironmentVaultSession(vault);
	return {
		ok: true,
		vault,
		envelope: response.response.envelope
	};
}

async function invokeVaultCommand(
	command: string,
	args: Record<string, unknown>
): Promise<
	| { readonly ok: true; readonly response: EnvironmentVaultSessionCommandResponse }
	| { readonly ok: false; readonly error: EnvironmentVaultSessionError }
> {
	const invoke = getTauriInvoke();
	if (invoke === undefined) {
		return { ok: false, error: 'environment-vault-session-unavailable' };
	}

	try {
		const response = await invoke<EnvironmentVaultSessionCommandResponse>(command, args);
		return response.ok
			? { ok: true, response }
			: { ok: false, error: normalizeEnvironmentVaultSessionError(response.error) };
	} catch {
		return { ok: false, error: 'environment-vault-session-store-failed' };
	}
}

async function closeNativeEnvironmentVaultSession(workspaceId: string) {
	const invoke = getTauriInvoke();
	if (invoke === undefined) {
		return;
	}

	try {
		await invoke('close_environment_vault_session', { workspaceId });
	} catch {
		// Closing is best effort when the native window is already shutting down.
	}
}

function parseNativeManagedVault(value: unknown, workspaceId: string) {
	try {
		const vault = parseEnvironmentVault(JSON.stringify(value), workspaceId);
		return vault !== null && isNativeManagedVault(vault, workspaceId) ? vault : null;
	} catch {
		return null;
	}
}

function isNativeManagedVault(vault: EnvironmentVault, workspaceId: string) {
	return (
		vault.workspaceId === workspaceId &&
		vault.nativeManaged === true &&
		vault.secrets.every(
			(secret) =>
				isEnvironmentSecretNativeReference(secret.value) &&
				typeof secret.valueLength === 'number'
		)
	);
}

function normalizeEnvironmentVaultSessionError(value: unknown): EnvironmentVaultSessionError {
	return isEnvironmentVaultSessionError(value)
		? value
		: 'environment-vault-session-store-failed';
}

function isEnvironmentVaultSessionError(value: unknown): value is EnvironmentVaultSessionError {
	return (
		value === 'environment-secret-name-required' ||
		value === 'environment-secret-kind-required' ||
		value === 'environment-secret-tag-required' ||
		value === 'environment-secret-name-duplicate' ||
		value === 'environment-secret-value-required' ||
		value === 'environment-secret-not-found' ||
		value === 'environment-vault-invalid' ||
		value === 'environment-vault-session-workspace-required' ||
		value === 'environment-vault-session-password-required' ||
		value === 'environment-vault-session-decrypt-failed' ||
		value === 'environment-vault-session-invalid' ||
		value === 'environment-vault-session-locked' ||
		value === 'environment-vault-session-store-failed' ||
		value === 'environment-vault-session-unavailable'
	);
}

function clearLocalEnvironmentVaultSession(workspaceId: string) {
	if (!environmentVaultSessions.delete(workspaceId)) {
		return;
	}

	notifyEnvironmentVaultSessionSubscribers(workspaceId);
}

function notifyEnvironmentVaultSessionSubscribers(workspaceId: string) {
	const vault = readEnvironmentVaultSession(workspaceId);
	const subscribers = environmentVaultSessionSubscribers.get(workspaceId);

	if (subscribers === undefined) {
		return;
	}

	for (const subscriber of subscribers) {
		subscriber(vault);
	}
}
