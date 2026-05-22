import { getTauriInvoke } from '$lib/tauri/tauri-invoke';
export type TerminalSessionError =
	| 'terminal-session-unavailable'
	| 'terminal-session-start-failed'
	| 'terminal-session-read-failed'
	| 'terminal-session-write-failed'
	| 'terminal-session-stop-failed';

export interface TerminalSessionSnapshot {
	readonly connected: boolean;
	readonly output: string;
}

export type TerminalSessionResult =
	| {
			readonly ok: true;
			readonly snapshot: TerminalSessionSnapshot;
	  }
	| {
			readonly ok: false;
			readonly snapshot: TerminalSessionSnapshot;
			readonly error: TerminalSessionError;
	  };

interface TerminalSessionSnapshotResponse {
	readonly ok?: boolean;
	readonly connected?: boolean;
	readonly output?: string;
}

export async function startTerminalSession(input: {
	readonly sessionId: string;
	readonly terminalId: string;
	readonly workspacePath: string;
}): Promise<TerminalSessionResult> {
	return invokeTerminalSession('start_terminal_session', { request: input }, 'terminal-session-start-failed');
}

export async function readTerminalSession(sessionId: string): Promise<TerminalSessionResult> {
	return invokeTerminalSession('read_terminal_session', { sessionId }, 'terminal-session-read-failed');
}

export async function writeTerminalSessionInput(input: {
	readonly sessionId: string;
	readonly input: string;
}): Promise<TerminalSessionResult> {
	return invokeTerminalSession(
		'write_terminal_session_input',
		{ request: input },
		'terminal-session-write-failed'
	);
}

export async function stopTerminalSession(sessionId: string): Promise<TerminalSessionResult> {
	return invokeTerminalSession('stop_terminal_session', { sessionId }, 'terminal-session-stop-failed');
}

async function invokeTerminalSession(
	command: string,
	args: Record<string, unknown>,
	failure: TerminalSessionError
): Promise<TerminalSessionResult> {
	const invoke = getTauriInvoke();
	const disconnectedSnapshot = createTerminalSessionSnapshot();

	if (invoke === undefined) {
		return {
			ok: false,
			snapshot: disconnectedSnapshot,
			error: 'terminal-session-unavailable'
		};
	}

	try {
		const response = await invoke<TerminalSessionSnapshotResponse>(command, args);

		if (response.ok === true) {
			return {
				ok: true,
				snapshot: createTerminalSessionSnapshot(response)
			};
		}

		return {
			ok: false,
			snapshot: disconnectedSnapshot,
			error: failure
		};
	} catch {
		return {
			ok: false,
			snapshot: disconnectedSnapshot,
			error: failure
		};
	}
}

function createTerminalSessionSnapshot(
	response?: TerminalSessionSnapshotResponse
): TerminalSessionSnapshot {
	return {
		connected: response?.connected === true,
		output: typeof response?.output === 'string' ? response.output : ''
	};
}
