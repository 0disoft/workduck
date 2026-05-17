export type DeveloperProcessError =
	| 'developer-processes-unavailable'
	| 'developer-processes-read-failed'
	| 'developer-process-kill-denied'
	| 'developer-process-kill-failed';

export interface DeveloperProcessEntry {
	readonly pid: number;
	readonly name: string;
	readonly kind: string;
	readonly command: string;
	readonly ports: readonly number[];
	readonly memoryBytes?: number | null;
}

export type DeveloperProcessListResult =
	| {
			readonly ok: true;
			readonly processes: readonly DeveloperProcessEntry[];
	  }
	| {
			readonly ok: false;
			readonly processes: readonly DeveloperProcessEntry[];
			readonly error: DeveloperProcessError;
	  };

interface TauriCoreApi {
	readonly invoke?: <T>(command: string, args?: Record<string, unknown>) => Promise<T>;
}

interface TauriGlobalWindow {
	readonly __TAURI__?: {
		readonly core?: TauriCoreApi;
	};
}

interface DeveloperProcessListResponse {
	readonly ok?: boolean;
	readonly processes?: readonly DeveloperProcessEntry[];
	readonly error?: DeveloperProcessError;
}

interface DeveloperProcessCommandResponse {
	readonly ok?: boolean;
	readonly error?: DeveloperProcessError;
}

export async function listDeveloperProcesses(): Promise<DeveloperProcessListResult> {
	const invoke = getTauriInvoke();

	if (invoke === undefined) {
		return {
			ok: false,
			processes: [],
			error: 'developer-processes-unavailable'
		};
	}

	try {
		const response = await invoke<DeveloperProcessListResponse>('list_developer_processes');
		const processes = sortDeveloperProcessesByMemory(
			Array.isArray(response.processes) ? response.processes : []
		);

		if (response.ok === true) {
			return {
				ok: true,
				processes
			};
		}

		return {
			ok: false,
			processes,
			error: response.error ?? 'developer-processes-read-failed'
		};
	} catch {
		return {
			ok: false,
			processes: [],
			error: 'developer-processes-read-failed'
		};
	}
}

function sortDeveloperProcessesByMemory(processes: readonly DeveloperProcessEntry[]) {
	return [...processes].sort((left, right) => {
		const leftMemory = normalizeProcessMemoryBytes(left.memoryBytes);
		const rightMemory = normalizeProcessMemoryBytes(right.memoryBytes);

		if (leftMemory !== rightMemory) {
			return rightMemory - leftMemory;
		}

		return (
			left.kind.localeCompare(right.kind) ||
			left.name.localeCompare(right.name) ||
			left.pid - right.pid
		);
	});
}

function normalizeProcessMemoryBytes(memoryBytes: number | null | undefined) {
	return typeof memoryBytes === 'number' && Number.isFinite(memoryBytes) ? memoryBytes : -1;
}

export async function killDeveloperProcess(pid: number): Promise<DeveloperProcessError | null> {
	const invoke = getTauriInvoke();

	if (invoke === undefined) {
		return 'developer-processes-unavailable';
	}

	try {
		const response = await invoke<DeveloperProcessCommandResponse>('kill_developer_process', { pid });

		if (response.ok === true) {
			return null;
		}

		return response.error ?? 'developer-process-kill-failed';
	} catch {
		return 'developer-process-kill-failed';
	}
}

function getTauriInvoke() {
	if (typeof window === 'undefined') {
		return undefined;
	}

	return (window as unknown as TauriGlobalWindow).__TAURI__?.core?.invoke;
}
