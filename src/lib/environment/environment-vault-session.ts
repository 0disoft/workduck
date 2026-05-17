import type { EnvironmentVault } from './environment-vault';

const environmentVaultSessions = new Map<string, EnvironmentVault>();
const environmentVaultSessionSubscribers = new Map<
	string,
	Set<(vault: EnvironmentVault | null) => void>
>();

export function readEnvironmentVaultSession(workspaceId: string) {
	return environmentVaultSessions.get(workspaceId) ?? null;
}

export function setEnvironmentVaultSession(vault: EnvironmentVault) {
	environmentVaultSessions.set(vault.workspaceId, vault);
	notifyEnvironmentVaultSessionSubscribers(vault.workspaceId);
}

export function clearEnvironmentVaultSession(workspaceId: string) {
	if (!environmentVaultSessions.delete(workspaceId)) {
		return;
	}

	notifyEnvironmentVaultSessionSubscribers(workspaceId);
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
