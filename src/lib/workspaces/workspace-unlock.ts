import type { WorkspaceRecord } from './workspace-registry';
import { verifyWorkspacePassword, type WorkspacePasswordError } from './workspace-password';

export const WORKSPACE_UNLOCK_MAX_ATTEMPTS = 3;
export const WORKSPACE_UNLOCK_COOLDOWN_MS = 30_000;
export const WORKDUCK_WORKSPACE_UNLOCK_CHANGED_EVENT = 'workduck:workspace-unlock-changed';
export const WORKDUCK_WORKSPACE_UNLOCK_ATTEMPTS_STORAGE_KEY =
	'workduck.workspaceUnlockAttempts.v1';

export type WorkspaceUnlockError =
	| 'workspace-unlock-password-required'
	| 'workspace-unlock-rate-limited'
	| 'workspace-unlock-invalid-password'
	| 'workspace-unlock-unavailable'
	| 'workspace-unlock-invalid-hash';

export type WorkspaceUnlockResult =
	| {
			readonly ok: true;
	  }
	| {
			readonly ok: false;
			readonly error: WorkspaceUnlockError;
			readonly attemptsRemaining: number;
			readonly lockedUntil: number | null;
	  };

export interface WorkspaceUnlockLockout {
	readonly failedAttempts: number;
	readonly attemptsRemaining: number;
	readonly isLocked: boolean;
	readonly lockedUntil: number | null;
	readonly secondsRemaining: number;
}

interface WorkspaceUnlockAttemptRecord {
	readonly failedAttempts: number;
	readonly lockedUntil: number | null;
}

interface WorkspaceUnlockSession {
	readonly password: string | null;
	lastActiveAt: number;
}

const unlockedWorkspaceSessions = new Map<string, WorkspaceUnlockSession>();

export function workspaceRequiresUnlock(workspace: WorkspaceRecord | null | undefined) {
	return workspace?.lock !== null && workspace?.lock !== undefined;
}

export function isWorkspaceUnlocked(workspace: WorkspaceRecord | null | undefined) {
	if (!workspaceRequiresUnlock(workspace)) {
		return true;
	}

	return (
		workspace !== null &&
		workspace !== undefined &&
		unlockedWorkspaceSessions.has(workspace.id)
	);
}

export function markWorkspaceUnlocked(workspaceId: string, password: string | null = null) {
	unlockedWorkspaceSessions.set(workspaceId, {
		password,
		lastActiveAt: Date.now()
	});
	dispatchWorkspaceUnlockChanged();
}

export function markWorkspaceLocked(workspaceId: string) {
	unlockedWorkspaceSessions.delete(workspaceId);
	dispatchWorkspaceUnlockChanged();
}

export function readWorkspaceUnlockPasswordSession(workspaceId: string) {
	return unlockedWorkspaceSessions.get(workspaceId)?.password ?? null;
}

export function touchWorkspaceUnlockSessions(nowMs = Date.now()) {
	for (const session of unlockedWorkspaceSessions.values()) {
		session.lastActiveAt = nowMs;
	}
}

export function lockIdleWorkspaceSessions(idleTimeoutMs: number, nowMs = Date.now()) {
	if (!Number.isFinite(idleTimeoutMs) || idleTimeoutMs <= 0) {
		return [] as string[];
	}

	const lockedWorkspaceIds: string[] = [];

	for (const [workspaceId, session] of unlockedWorkspaceSessions.entries()) {
		if (nowMs - session.lastActiveAt < idleTimeoutMs) {
			continue;
		}

		unlockedWorkspaceSessions.delete(workspaceId);
		lockedWorkspaceIds.push(workspaceId);
	}

	if (lockedWorkspaceIds.length > 0) {
		dispatchWorkspaceUnlockChanged();
	}

	return lockedWorkspaceIds;
}

export async function unlockWorkspace(
	workspace: WorkspaceRecord,
	password: string,
	nowMs = Date.now()
): Promise<WorkspaceUnlockResult> {
	if (!workspaceRequiresUnlock(workspace)) {
		markWorkspaceUnlocked(workspace.id);
		return { ok: true };
	}

	const lockout = getWorkspaceUnlockLockout(workspace.id, nowMs);

	if (lockout.isLocked) {
		return {
			ok: false,
			error: 'workspace-unlock-rate-limited',
			attemptsRemaining: 0,
			lockedUntil: lockout.lockedUntil
		};
	}

	if (password.length === 0) {
		return {
			ok: false,
			error: 'workspace-unlock-password-required',
			attemptsRemaining: lockout.attemptsRemaining,
			lockedUntil: null
		};
	}

	const verification = await verifyWorkspacePassword(password, workspace.lock?.passwordHash ?? '');

	if (!verification.ok) {
		return {
			ok: false,
			error: mapPasswordErrorToUnlockError(verification.error),
			attemptsRemaining: lockout.attemptsRemaining,
			lockedUntil: null
		};
	}

	if (verification.matched) {
		clearWorkspaceUnlockAttempt(workspace.id);
		markWorkspaceUnlocked(workspace.id, password);
		return { ok: true };
	}

	return recordWorkspaceUnlockFailure(workspace.id, nowMs);
}

export function getWorkspaceUnlockLockout(
	workspaceId: string,
	nowMs = Date.now()
): WorkspaceUnlockLockout {
	const attempts = readWorkspaceUnlockAttempts()[workspaceId] ?? {
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

export function subscribeWorkspaceUnlocks(callback: () => void): () => void {
	if (typeof window === 'undefined') {
		return () => {};
	}

	window.addEventListener(WORKDUCK_WORKSPACE_UNLOCK_CHANGED_EVENT, callback);

	return () => {
		window.removeEventListener(WORKDUCK_WORKSPACE_UNLOCK_CHANGED_EVENT, callback);
	};
}

function recordWorkspaceUnlockFailure(
	workspaceId: string,
	nowMs: number
): WorkspaceUnlockResult {
	const attemptsByWorkspace = readWorkspaceUnlockAttempts();
	const currentRecord = attemptsByWorkspace[workspaceId] ?? {
		failedAttempts: 0,
		lockedUntil: null
	};
	const failedAttempts = currentRecord.failedAttempts + 1;
	const shouldLock = failedAttempts >= WORKSPACE_UNLOCK_MAX_ATTEMPTS;
	const nextRecord = {
		failedAttempts: shouldLock ? WORKSPACE_UNLOCK_MAX_ATTEMPTS : failedAttempts,
		lockedUntil: shouldLock ? nowMs + WORKSPACE_UNLOCK_COOLDOWN_MS : null
	} satisfies WorkspaceUnlockAttemptRecord;

	writeWorkspaceUnlockAttempts({
		...attemptsByWorkspace,
		[workspaceId]: nextRecord
	});

	return {
		ok: false,
		error: shouldLock ? 'workspace-unlock-rate-limited' : 'workspace-unlock-invalid-password',
		attemptsRemaining: Math.max(0, WORKSPACE_UNLOCK_MAX_ATTEMPTS - nextRecord.failedAttempts),
		lockedUntil: nextRecord.lockedUntil
	};
}

function clearWorkspaceUnlockAttempt(workspaceId: string) {
	const attemptsByWorkspace = readWorkspaceUnlockAttempts();

	if (!(workspaceId in attemptsByWorkspace)) {
		return;
	}

	const { [workspaceId]: _removed, ...nextAttemptsByWorkspace } = attemptsByWorkspace;
	writeWorkspaceUnlockAttempts(nextAttemptsByWorkspace);
}

function readWorkspaceUnlockAttempts() {
	if (typeof window === 'undefined') {
		return {} as Record<string, WorkspaceUnlockAttemptRecord>;
	}

	try {
		const value = JSON.parse(
			window.localStorage.getItem(WORKDUCK_WORKSPACE_UNLOCK_ATTEMPTS_STORAGE_KEY) ?? '{}'
		);

		if (typeof value !== 'object' || value === null || Array.isArray(value)) {
			return {} as Record<string, WorkspaceUnlockAttemptRecord>;
		}

		return Object.fromEntries(
			Object.entries(value).flatMap(([workspaceId, rawRecord]) => {
				const record = parseWorkspaceUnlockAttemptRecord(rawRecord);

				return record === null ? [] : [[workspaceId, record]];
			})
		) as Record<string, WorkspaceUnlockAttemptRecord>;
	} catch {
		return {} as Record<string, WorkspaceUnlockAttemptRecord>;
	}
}

function writeWorkspaceUnlockAttempts(
	attemptsByWorkspace: Record<string, WorkspaceUnlockAttemptRecord>
) {
	if (typeof window === 'undefined') {
		return;
	}

	try {
		window.localStorage.setItem(
			WORKDUCK_WORKSPACE_UNLOCK_ATTEMPTS_STORAGE_KEY,
			JSON.stringify(attemptsByWorkspace)
		);
	} catch {
		return;
	}
}

function parseWorkspaceUnlockAttemptRecord(value: unknown): WorkspaceUnlockAttemptRecord | null {
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

function mapPasswordErrorToUnlockError(error: WorkspacePasswordError): WorkspaceUnlockError {
	if (error === 'workspace-password-required') {
		return 'workspace-unlock-password-required';
	}

	if (error === 'workspace-password-unavailable' || error === 'workspace-password-hash-failed') {
		return 'workspace-unlock-unavailable';
	}

	return 'workspace-unlock-invalid-hash';
}

function dispatchWorkspaceUnlockChanged() {
	if (typeof window === 'undefined') {
		return;
	}

	window.dispatchEvent(new CustomEvent(WORKDUCK_WORKSPACE_UNLOCK_CHANGED_EVENT));
}
