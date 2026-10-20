import type { WorkspaceRecord } from '#lib/workspaces/workspace-registry.ts';
import type { TerminalSessionRecord } from './terminal-registry';
import type { TerminalSessionError } from './terminal-session';
import TerminalPanel from './TerminalPanel.svelte';

export interface TerminalPanelTestController {
	readonly selectedSessionId: string | null;
	readonly terminalOutput: string;
	readonly isSessionStarting: boolean;
	readonly isSessionConnected: boolean;
	readonly sessionError: TerminalSessionError | null;
	terminalInput: string;
	selectTerminalSession(session: TerminalSessionRecord): void;
	handleConnectSelectedTerminalSession(): Promise<void>;
	handleDisconnectSelectedTerminalSession(): Promise<void>;
	handleTerminalInputSubmit(event: SubmitEvent): Promise<void>;
	handleRemoveSelectedTerminalSession(): Promise<void>;
	refreshSelectedTerminalSession(sessionId: string): Promise<void>;
}

// Tests compile the panel's actual script without rendering its template.
export function createTerminalPanelHarness(initialWorkspace: WorkspaceRecord) {
	let workspace = $state(initialWorkspace);
	let controller!: TerminalPanelTestController;
	const dispose = $effect.root(() => {
		controller = TerminalPanel(null as never, { get workspace() { return workspace; } }) as unknown as TerminalPanelTestController;
	});
	return { controller, dispose, setWorkspace(next: WorkspaceRecord) { workspace = next; } };
}
