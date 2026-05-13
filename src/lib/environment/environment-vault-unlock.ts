import { WORKSPACE_UNLOCK_COOLDOWN_MS, WORKSPACE_UNLOCK_MAX_ATTEMPTS } from '$lib/workspaces/workspace-unlock';

export const WORKDUCK_ENVIRONMENT_VAULT_UNLOCK_ATTEMPTS_STORAGE_KEY =
	'workduck.environmentVaultUnlockAttempts.v1';

export interface EnvironmentVaultUnlockLockout {
	readonly failedAttempts: number;
	readonly attemptsRemaining: number;
	readonly isLocked: boolean;
	readonly lockedUntil: number | null;
	readonly secondsRemaining: number;
}

interface EnvironmentVaultUnlockAttemptRecord {
	readonly failedAttempts: number;
	readonly lockedUntil: number | null;
}

export function getEnvironmentVaultUnlockLockout(
	workspaceId: string,
	nowMs = Date.now()
): EnvironmentVaultUnlockLockout {
	const attempts = readEnvironmentVaultUnlockAttempts()[workspaceId] ?? {
		failedAttempts: 0,
		lockedUntil: null
	};
	const lockedUntil = attempts.lockedUntil;
	const isLocked = typeof lockedUntil === 'number' && lockedUntil > nowMs;
	const failedAttempts = isLocked ? WORKSPACE_UNLOCK_MAX_ATTEMPTS : attempts.failedAttempts;
	const attemptsRemaining = Math.max(0, WORKSPACE_UNLOCK_MAX_ATTEMPTS - failedAttempts);
	const secondsRemaining =
		isLocked && lockedUntil !== null ? Math.max(1, Math.ceil((lockedUntil - nowMs) / 1000)) : 0;

	return {
		failedAttempts,
		attemptsRemaining,
		isLocked,
		lockedUntil: isLocked ? lockedUntil : null,
		secondsRemaining
	};
}

export function recordEnvironmentVaultUnlockFailure(workspaceId: string, nowMs = Date.now()) {
	const attemptsByWorkspace = readEnvironmentVaultUnlockAttempts();
	const currentRecord = attemptsByWorkspace[workspaceId] ?? {
		failedAttempts: 0,
		lockedUntil: null
	};
	const failedAttempts = currentRecord.failedAttempts + 1;
	const shouldLock = failedAttempts >= WORKSPACE_UNLOCK_MAX_ATTEMPTS;
	const nextRecord = {
		failedAttempts: shouldLock ? WORKSPACE_UNLOCK_MAX_ATTEMPTS : failedAttempts,
		lockedUntil: shouldLock ? nowMs + WORKSPACE_UNLOCK_COOLDOWN_MS : null
	} satisfies EnvironmentVaultUnlockAttemptRecord;

	writeEnvironmentVaultUnlockAttempts({
		...attemptsByWorkspace,
		[workspaceId]: nextRecord
	});

	return getEnvironmentVaultUnlockLockout(workspaceId, nowMs);
}

export function clearEnvironmentVaultUnlockAttempts(workspaceId: string) {
	const attemptsByWorkspace = readEnvironmentVaultUnlockAttempts();

	if (!(workspaceId in attemptsByWorkspace)) {
		return;
	}

	const { [workspaceId]: _removed, ...nextAttemptsByWorkspace } = attemptsByWorkspace;
	writeEnvironmentVaultUnlockAttempts(nextAttemptsByWorkspace);
}

function readEnvironmentVaultUnlockAttempts() {
	if (typeof window === 'undefined') {
		return {} as Record<string, EnvironmentVaultUnlockAttemptRecord>;
	}

	try {
		const value = JSON.parse(
			window.localStorage.getItem(WORKDUCK_ENVIRONMENT_VAULT_UNLOCK_ATTEMPTS_STORAGE_KEY) ?? '{}'
		);

		if (typeof value !== 'object' || value === null || Array.isArray(value)) {
			return {} as Record<string, EnvironmentVaultUnlockAttemptRecord>;
		}

		return Object.fromEntries(
			Object.entries(value).flatMap(([workspaceId, rawRecord]) => {
				const record = parseEnvironmentVaultUnlockAttemptRecord(rawRecord);

				return record === null ? [] : [[workspaceId, record]];
			})
		) as Record<string, EnvironmentVaultUnlockAttemptRecord>;
	} catch {
		return {} as Record<string, EnvironmentVaultUnlockAttemptRecord>;
	}
}

function writeEnvironmentVaultUnlockAttempts(
	attemptsByWorkspace: Record<string, EnvironmentVaultUnlockAttemptRecord>
) {
	if (typeof window === 'undefined') {
		return;
	}

	try {
		window.localStorage.setItem(
			WORKDUCK_ENVIRONMENT_VAULT_UNLOCK_ATTEMPTS_STORAGE_KEY,
			JSON.stringify(attemptsByWorkspace)
		);
	} catch {
		return;
	}
}

function parseEnvironmentVaultUnlockAttemptRecord(
	value: unknown
): EnvironmentVaultUnlockAttemptRecord | null {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) {
		return null;
	}

	const failedAttempts = Number((value as { failedAttempts?: unknown }).failedAttempts);
	const lockedUntilValue = (value as { lockedUntil?: unknown }).lockedUntil;
	const lockedUntil = typeof lockedUntilValue === 'number' ? lockedUntilValue : null;

	if (!Number.isFinite(failedAttempts)) {
		return null;
	}

	return {
		failedAttempts: Math.min(
			WORKSPACE_UNLOCK_MAX_ATTEMPTS,
			Math.max(0, Math.floor(failedAttempts))
		),
		lockedUntil
	};
}
