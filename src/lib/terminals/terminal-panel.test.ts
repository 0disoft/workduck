import { plugin, Transpiler } from 'bun';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { compileModule } from 'svelte/compiler';
import { setTauriInvokeForTest } from '#lib/tauri/tauri-invoke.ts';
import type { WorkspaceRecord } from '#lib/workspaces/workspace-registry.ts';
import { createEmptyTerminalRegistry, type TerminalSessionRecord } from './terminal-registry';
import { readTerminalRegistry, writeTerminalRegistry } from './terminal-registry-storage';

await plugin({
	name: 'terminal-panel-script',
	setup(build) {
		build.onLoad({ filter: /TerminalPanel\.svelte$/ }, async ({ path }) => {
			let source = (await Bun.file(path).text()).match(/<script lang="ts">([\s\S]*?)<\/script>/)![1]!;
			source = source.replace(/import \{ onMount, tick, untrack \} from 'svelte';/,
				'import { tick, untrack } from ' + JSON.stringify(import.meta.resolve('svelte/internal/client')) + '; const onMount = () => {};');
			source = source.replace(/import \{ DetailCard, EntityCard, EntityWorkbench, StatusToast \}[^;]+;/, '');
			source = source.replace('let { workspace, onTerminalCountChange }: Props = $props();',
				'export default function (_anchor: unknown, input: Props) { let workspace = $derived(input.workspace); const onTerminalCountChange = input.onTerminalCountChange;');
			source += `return {
				get selectedSessionId() { return selectedSessionId; },
				get terminalOutput() { return terminalOutput; },
				get isSessionStarting() { return isSessionStarting; },
				get isSessionConnected() { return isSessionConnected; },
				get sessionError() { return sessionError; },
				get terminalInput() { return terminalInput; }, set terminalInput(value) { terminalInput = value; },
				selectTerminalSession, handleConnectSelectedTerminalSession, handleDisconnectSelectedTerminalSession,
				handleTerminalInputSubmit, handleRemoveSelectedTerminalSession, refreshSelectedTerminalSession
			}; }`;
			source = new Transpiler({ loader: 'ts' }).transformSync(source);
			return { contents: compileModule(source, { filename: path, generate: 'client' }).js.code, loader: 'js' };
		});
		build.onLoad({ filter: /terminal-panel-harness\.svelte\.ts$/ }, async ({ path }) => {
			const source = new Transpiler({ loader: 'ts' }).transformSync(await Bun.file(path).text());
			return { contents: compileModule(source, { filename: path, generate: 'client' }).js.code, loader: 'js' };
		});
	}
});
const { createTerminalPanelHarness } = await import('./terminal-panel-harness.svelte');

function workspace(id = 'old'): WorkspaceRecord {
	return { id, name: id, path: `C:/workspaces/${id}`, lock: null, createdAt: '2026-10-10T00:00:00.000Z', updatedAt: '2026-10-10T00:00:00.000Z' };
}
function session(id: string): TerminalSessionRecord {
	return { id, name: id, terminalId: 'powershell', createdAt: workspace().createdAt, updatedAt: workspace().updatedAt };
}
function snapshot(output: string) { return { ok: true, connected: true, output, outputCursor: output.length, outputReset: true }; }
function deferred() {
	let resolve!: () => void;
	const promise = new Promise<void>((next) => { resolve = next; });
	return { promise, resolve };
}
async function settle() { await new Promise((resolve) => setTimeout(resolve, 0)); }
const first = session('first');
const second = session('second');
const windowDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'window');
const timers = new Map<number, () => void>();
let timerId = 0;
beforeEach(() => {
	timers.clear();
	const values = new Map<string, string>();
	Object.defineProperty(globalThis, 'window', { configurable: true, value: Object.assign(new EventTarget(), {
		localStorage: { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) },
		setInterval(callback: () => void) { const id = ++timerId; timers.set(id, callback); return id; },
		clearInterval(id: number) { timers.delete(id); }
	}) });
	writeTerminalRegistry({ ...createEmptyTerminalRegistry('old'), sessions: [first, second] });
	writeTerminalRegistry({ ...createEmptyTerminalRegistry('new'), sessions: [session('new')] });
});
afterEach(() => {
	setTauriInvokeForTest(undefined);
	if (windowDescriptor) Object.defineProperty(globalThis, 'window', windowDescriptor);
	else Reflect.deleteProperty(globalThis, 'window');
});

describe('terminal panel operation ownership', () => {
	for (const operation of ['connect', 'disconnect', 'send'] as const) {
		test(`ignores a late ${operation} response after another terminal is selected`, async () => {
			const pending = deferred();
			setTauriInvokeForTest(async <T>(command: string, args?: Record<string, unknown>) => {
				const id = (args?.request as { sessionId?: string } | undefined)?.sessionId ?? args?.sessionId;
				if (command !== 'read_terminal_session') await pending.promise;
				return snapshot(String(id)) as T;
			});
			const harness = createTerminalPanelHarness(workspace());
			let running: Promise<void> | undefined;
			try {
				await settle();
				const panel = harness.controller;
				panel.selectTerminalSession(first); await settle();
				panel.terminalInput = 'test-input';
				running = operation === 'connect' ? panel.handleConnectSelectedTerminalSession() :
					operation === 'disconnect' ? panel.handleDisconnectSelectedTerminalSession() : panel.handleTerminalInputSubmit({ preventDefault() {} } as SubmitEvent);
				panel.selectTerminalSession(second); await settle();
				pending.resolve(); await running;
				expect(panel.selectedSessionId).toBe(second.id);
				expect(panel.terminalOutput).toBe(second.id);
				expect(timers.size).toBe(1);
			} finally { pending.resolve(); await running; harness.dispose(); }
		});
	}

	for (const change of ['selection', 'workspace'] as const) {
		test(`removes the initiating terminal after a ${change} change`, async () => {
			const pending = deferred();
			setTauriInvokeForTest(async <T>(command: string) => {
				if (command === 'stop_terminal_session') await pending.promise;
				return snapshot('') as T;
			});
			const harness = createTerminalPanelHarness(workspace());
			let removing: Promise<void> | undefined;
			try {
				await settle();
				const panel = harness.controller;
				panel.selectTerminalSession(first); await settle();
				removing = panel.handleRemoveSelectedTerminalSession();
				if (change === 'workspace') harness.setWorkspace(workspace('new'));
				else panel.selectTerminalSession(second);
				await settle();
				pending.resolve(); await removing;
				expect(readTerminalRegistry('old').registry.sessions.map((entry) => entry.id)).toEqual([second.id]);
				expect(readTerminalRegistry('new').registry.sessions.map((entry) => entry.id)).toEqual(['new']);
				expect(panel.selectedSessionId).toBe(change === 'selection' ? second.id : null);
			} finally { pending.resolve(); await removing; harness.dispose(); }
		});
	}

	test('keeps a terminal registered when stopping its process fails', async () => {
		setTauriInvokeForTest(async <T>(command: string) => (command === 'stop_terminal_session' ? { ok: false } : snapshot('')) as T);
		const harness = createTerminalPanelHarness(workspace());
		try {
			await settle();
			harness.controller.selectTerminalSession(first); await settle();
			await harness.controller.handleRemoveSelectedTerminalSession();
			expect(readTerminalRegistry('old').registry.sessions.map((entry) => entry.id)).toEqual([first.id, second.id]);
			expect(harness.controller.sessionError).toBe('terminal-session-stop-failed');
		} finally { harness.dispose(); }
	});

	test('ignores a read from an earlier visit to the same terminal', async () => {
		const pending = deferred();
		let calls = 0;
		setTauriInvokeForTest(async <T>() => {
			const index = ++calls;
			if (index === 1) await pending.promise;
			return snapshot(`output-${index}`) as T;
		});
		const harness = createTerminalPanelHarness(workspace());
		try {
			await settle();
			const panel = harness.controller;
			panel.selectTerminalSession(first);
			panel.selectTerminalSession(second); await settle();
			panel.selectTerminalSession(first); await settle();
			pending.resolve(); await settle();
			expect(panel.terminalOutput).toBe('output-3');
		} finally { pending.resolve(); await settle(); harness.dispose(); }
	});

	test('keeps at most one output read in flight even when polling fires repeatedly', async () => {
		const pending = deferred();
		let reads = 0;
		setTauriInvokeForTest(async <T>() => {
			reads += 1; await pending.promise;
			return snapshot('output') as T;
		});
		const harness = createTerminalPanelHarness(workspace());
		try {
			await settle();
			harness.controller.selectTerminalSession(first);
			for (let count = 0; count < 5; count++) for (const poll of timers.values()) poll();
			expect(reads).toBe(1);
			pending.resolve(); await settle();
			for (const poll of timers.values()) poll();
			await settle();
			expect(reads).toBe(2);
		} finally { pending.resolve(); await settle(); harness.dispose(); }
	});

	test('preserves terminal output after a transient polling failure', async () => {
		let reads = 0;
		setTauriInvokeForTest(async <T>() => (++reads === 2 ? { ok: false } : snapshot('existing-output')) as T);
		const harness = createTerminalPanelHarness(workspace());
		try {
			await settle();
			harness.controller.selectTerminalSession(first); await settle();
			await harness.controller.refreshSelectedTerminalSession(first.id);
			expect(harness.controller.terminalOutput).toBe('existing-output');
			expect(harness.controller.sessionError).toBe('terminal-session-read-failed');
			await harness.controller.refreshSelectedTerminalSession(first.id);
			expect(harness.controller.sessionError).toBeNull();
		} finally { harness.dispose(); }
	});

	test('keeps output and polling when disconnect fails', async () => {
		setTauriInvokeForTest(async <T>(command: string) => (command === 'stop_terminal_session' ? { ok: false } : snapshot('existing-output')) as T);
		const harness = createTerminalPanelHarness(workspace());
		try {
			await settle();
			const panel = harness.controller;
			panel.selectTerminalSession(first); await settle();
			await panel.handleDisconnectSelectedTerminalSession();
			expect(panel.terminalOutput).toBe('existing-output');
			expect(panel.isSessionConnected).toBe(true);
			expect(timers.size).toBe(1);
		} finally { harness.dispose(); }
	});

	test('does not stop or remove a terminal while input is being sent', async () => {
		const pending = deferred();
		const commands: string[] = [];
		setTauriInvokeForTest(async <T>(command: string) => {
			commands.push(command);
			if (command === 'write_terminal_session_input') await pending.promise;
			return snapshot('existing-output') as T;
		});
		const harness = createTerminalPanelHarness(workspace());
		let sending: Promise<void> | undefined;
		try {
			await settle();
			const panel = harness.controller;
			panel.selectTerminalSession(first); await settle();
			panel.terminalInput = 'test-input';
			sending = panel.handleTerminalInputSubmit({ preventDefault() {} } as SubmitEvent);
			await panel.handleDisconnectSelectedTerminalSession();
			await panel.handleRemoveSelectedTerminalSession();
			expect(commands).toEqual(['read_terminal_session', 'write_terminal_session_input']);
		} finally { pending.resolve(); await sending; harness.dispose(); }
	});

	for (const newDraft of ['', 'new-input']) {
		test(`preserves output and ${newDraft ? 'new input' : 'restores failed input'} after a send failure`, async () => {
			const pending = deferred();
			setTauriInvokeForTest(async <T>(command: string) => {
				if (command === 'write_terminal_session_input') { await pending.promise; return { ok: false } as T; }
				return snapshot('existing-output') as T;
			});
			const harness = createTerminalPanelHarness(workspace());
			let sending: Promise<void> | undefined;
			try {
				await settle();
				const panel = harness.controller;
				panel.selectTerminalSession(first); await settle();
				panel.terminalInput = 'failed-input';
				sending = panel.handleTerminalInputSubmit({ preventDefault() {} } as SubmitEvent);
				panel.terminalInput = newDraft;
				pending.resolve(); await sending;
				expect(panel.terminalOutput).toBe('existing-output');
				expect(panel.terminalInput).toBe(newDraft || 'failed-input');
			} finally { pending.resolve(); await sending; harness.dispose(); }
		});
	}

	for (const operation of ['disconnect', 'send'] as const) {
		test(`ignores an old full-output poll after ${operation} updates the session`, async () => {
			const pendingRead = deferred();
			let reads = 0;
			setTauriInvokeForTest(async <T>(command: string) => {
				if (command === 'read_terminal_session') {
					if (++reads > 1) { await pendingRead.promise; return snapshot('old-output') as T; }
					return snapshot('initial-output') as T;
				}
				return { ...snapshot('latest-output'), connected: operation !== 'disconnect' } as T;
			});
			const harness = createTerminalPanelHarness(workspace());
			let reading: Promise<void> | undefined;
			try {
				await settle();
				const panel = harness.controller;
				panel.selectTerminalSession(first); await settle();
				reading = panel.refreshSelectedTerminalSession(first.id);
				if (operation === 'disconnect') await panel.handleDisconnectSelectedTerminalSession();
				else { panel.terminalInput = 'test-input'; await panel.handleTerminalInputSubmit({ preventDefault() {} } as SubmitEvent); }
				pendingRead.resolve(); await reading;
				expect(panel.terminalOutput).toBe('latest-output');
				expect(panel.isSessionConnected).toBe(operation !== 'disconnect');
			} finally { pendingRead.resolve(); await reading; harness.dispose(); }
		});
	}
});
