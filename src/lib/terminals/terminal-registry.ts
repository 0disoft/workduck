import { isObjectRecord } from '$lib/shared/object-record';
export const TERMINAL_REGISTRY_VERSION = 1;
export const TERMINAL_SESSION_NAME_MAX_LENGTH = 120;

export type TerminalRegistryError =
	| 'terminal-session-name-required'
	| 'terminal-session-name-duplicate'
	| 'terminal-kind-required'
	| 'terminal-session-not-found'
	| 'terminal-registry-invalid';

export interface TerminalSessionRecord {
	readonly id: string;
	readonly name: string;
	readonly terminalId: string;
	readonly createdAt: string;
	readonly updatedAt: string;
}

export interface TerminalRegistry {
	readonly version: typeof TERMINAL_REGISTRY_VERSION;
	readonly workspaceId: string;
	readonly sessions: readonly TerminalSessionRecord[];
	readonly updatedAt: string;
}

export interface TerminalSessionInput {
	readonly id?: string | null;
	readonly name: string;
	readonly terminalId: string;
}

export type TerminalRegistryMutationResult =
	| {
			readonly ok: true;
			readonly registry: TerminalRegistry;
	  }
	| {
			readonly ok: false;
			readonly registry: TerminalRegistry;
			readonly error: TerminalRegistryError;
	  };

export function createEmptyTerminalRegistry(
	workspaceId: string,
	now = new Date()
): TerminalRegistry {
	return {
		version: TERMINAL_REGISTRY_VERSION,
		workspaceId,
		sessions: [],
		updatedAt: now.toISOString()
	};
}

export function parseTerminalRegistry(serializedRegistry: string, workspaceId: string) {
	try {
		return normalizeTerminalRegistry(JSON.parse(serializedRegistry), workspaceId);
	} catch {
		return null;
	}
}

export function serializeTerminalRegistry(registry: TerminalRegistry) {
	return JSON.stringify(normalizeTerminalRegistry(registry, registry.workspaceId) ?? registry);
}

export function upsertTerminalSession(
	registry: TerminalRegistry,
	input: TerminalSessionInput,
	now = new Date()
): TerminalRegistryMutationResult {
	const normalizedRegistry = normalizeTerminalRegistry(registry, registry.workspaceId) ?? registry;
	const name = normalizeTerminalSessionName(input.name);
	const terminalId = readTrimmedString(input.terminalId);
	const sessionId = normalizeRecordId(input.id ?? null);

	if (name.length === 0) {
		return { ok: false, registry: normalizedRegistry, error: 'terminal-session-name-required' };
	}

	if (terminalId.length === 0) {
		return { ok: false, registry: normalizedRegistry, error: 'terminal-kind-required' };
	}

	const matchingSession = normalizedRegistry.sessions.find((session) => session.id === sessionId);
	const nameKey = createTerminalSessionNameKey(name);
	const nameAlreadyExists = normalizedRegistry.sessions.some(
		(session) => session.id !== sessionId && createTerminalSessionNameKey(session.name) === nameKey
	);

	if (nameAlreadyExists) {
		return { ok: false, registry: normalizedRegistry, error: 'terminal-session-name-duplicate' };
	}

	if (sessionId !== null && matchingSession === undefined) {
		return { ok: false, registry: normalizedRegistry, error: 'terminal-session-not-found' };
	}

	const timestamp = now.toISOString();
	const nextSession = {
		id: sessionId ?? createTerminalSessionId(),
		name,
		terminalId,
		createdAt: matchingSession?.createdAt ?? timestamp,
		updatedAt: timestamp
	} satisfies TerminalSessionRecord;
	const sessions =
		matchingSession === undefined
			? [...normalizedRegistry.sessions, nextSession]
			: normalizedRegistry.sessions.map((session) =>
					session.id === nextSession.id ? nextSession : session
				);

	return {
		ok: true,
		registry: {
			...normalizedRegistry,
			sessions: sortTerminalSessions(sessions),
			updatedAt: timestamp
		}
	};
}

export function removeTerminalSession(
	registry: TerminalRegistry,
	sessionId: string,
	now = new Date()
): TerminalRegistryMutationResult {
	const normalizedRegistry = normalizeTerminalRegistry(registry, registry.workspaceId) ?? registry;

	if (!normalizedRegistry.sessions.some((session) => session.id === sessionId)) {
		return { ok: false, registry: normalizedRegistry, error: 'terminal-session-not-found' };
	}

	return {
		ok: true,
		registry: {
			...normalizedRegistry,
			sessions: normalizedRegistry.sessions.filter((session) => session.id !== sessionId),
			updatedAt: now.toISOString()
		}
	};
}

function normalizeTerminalRegistry(value: unknown, workspaceId: string): TerminalRegistry | null {
	if (!isObjectRecord(value) || value.version !== TERMINAL_REGISTRY_VERSION) {
		return null;
	}

	if (typeof value.workspaceId !== 'string' || value.workspaceId !== workspaceId) {
		return null;
	}

	const rawSessions = Array.isArray(value.sessions) ? value.sessions : [];
	const seenSessionIds = new Set<string>();
	const seenSessionNames = new Set<string>();
	const sessions: TerminalSessionRecord[] = [];

	for (const rawSession of rawSessions) {
		const session = parseTerminalSessionRecord(rawSession);

		if (session === null) {
			continue;
		}

		const sessionNameKey = createTerminalSessionNameKey(session.name);

		if (seenSessionIds.has(session.id) || seenSessionNames.has(sessionNameKey)) {
			continue;
		}

		seenSessionIds.add(session.id);
		seenSessionNames.add(sessionNameKey);
		sessions.push(session);
	}

	return {
		version: TERMINAL_REGISTRY_VERSION,
		workspaceId,
		sessions: sortTerminalSessions(sessions),
		updatedAt: readTrimmedString(value.updatedAt)
	};
}

function parseTerminalSessionRecord(value: unknown): TerminalSessionRecord | null {
	if (!isObjectRecord(value)) {
		return null;
	}

	const id = normalizeRecordId(value.id);
	const name = normalizeTerminalSessionName(readTrimmedString(value.name));
	const terminalId = readTrimmedString(value.terminalId);
	const createdAt = readTrimmedString(value.createdAt);
	const updatedAt = readTrimmedString(value.updatedAt);

	if (id === null || name.length === 0 || terminalId.length === 0) {
		return null;
	}

	return {
		id,
		name,
		terminalId,
		createdAt: createdAt.length === 0 ? updatedAt : createdAt,
		updatedAt: updatedAt.length === 0 ? createdAt : updatedAt
	};
}

function sortTerminalSessions(sessions: readonly TerminalSessionRecord[]) {
	return [...sessions].sort((left, right) =>
		left.name.localeCompare(right.name, 'en-US', { sensitivity: 'base' })
	);
}

function normalizeTerminalSessionName(value: string) {
	return value.trim().replace(/\s+/g, ' ').slice(0, TERMINAL_SESSION_NAME_MAX_LENGTH);
}

function normalizeRecordId(value: unknown) {
	const id = readTrimmedString(value);

	return id.length === 0 ? null : id;
}

function createTerminalSessionId() {
	if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
		return crypto.randomUUID();
	}

	return `terminal-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function createTerminalSessionNameKey(name: string) {
	return normalizeTerminalSessionName(name).toLocaleLowerCase('en-US');
}

function readTrimmedString(value: unknown) {
	return typeof value === 'string' ? value.trim() : '';
}
