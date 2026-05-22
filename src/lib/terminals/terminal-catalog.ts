import { getTauriInvoke } from '$lib/tauri/tauri-invoke';
export type TerminalCatalogError =
	| 'terminal-catalog-unavailable'
	| 'terminal-catalog-read-failed';

export interface TerminalCatalogEntry {
	readonly id: string;
	readonly name: string;
	readonly command: string;
	readonly executablePath: string | null;
	readonly available: boolean;
}

export type TerminalCatalogResult =
	| {
			readonly ok: true;
			readonly terminals: readonly TerminalCatalogEntry[];
	  }
	| {
			readonly ok: false;
			readonly terminals: readonly TerminalCatalogEntry[];
			readonly error: TerminalCatalogError;
	  };

interface TerminalCatalogResponse {
	readonly ok: boolean;
	readonly terminals?: readonly TerminalCatalogEntry[] | null;
}

export async function listTerminalCatalog(): Promise<TerminalCatalogResult> {
	const invoke = getTauriInvoke();

	if (invoke === undefined) {
		return {
			ok: false,
			terminals: [],
			error: 'terminal-catalog-unavailable'
		};
	}

	try {
		const response = await invoke<TerminalCatalogResponse>('list_terminal_catalog');

		if (response.ok && Array.isArray(response.terminals)) {
			return {
				ok: true,
				terminals: response.terminals.map(normalizeTerminalCatalogEntry)
			};
		}

		return {
			ok: false,
			terminals: [],
			error: 'terminal-catalog-read-failed'
		};
	} catch {
		return {
			ok: false,
			terminals: [],
			error: 'terminal-catalog-read-failed'
		};
	}
}

function normalizeTerminalCatalogEntry(entry: TerminalCatalogEntry): TerminalCatalogEntry {
	return {
		id: entry.id,
		name: entry.name,
		command: entry.command,
		executablePath: entry.executablePath ?? null,
		available: entry.available
	};
}
