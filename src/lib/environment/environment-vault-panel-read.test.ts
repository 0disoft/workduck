import { plugin, Transpiler } from 'bun';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { compile, compileModule } from 'svelte/compiler';
import { setTauriInvokeForTest } from '#lib/tauri/tauri-invoke.ts';
import { createEmptyEnvironmentVault } from './environment-vault';
import type { SecretVaultEnvelope } from './secret-vault-crypto';

await plugin({ name: 'vault-panel-read-lifecycle', setup(build) {
	build.onLoad({ filter: /EnvironmentVaultPanel\.svelte$/ }, async ({ path }) => {
		// Execute the production script and its effects without requiring a DOM.
		let script = (await Bun.file(path).text()).split('</script>')[0]!;
		script = script.replace(/\s*import (PageTitleRow|StatusToast) from [^;]+;/g, '');
		script += `
			export function setPasswordForTest(password: string) { vaultPassword = password; }
			export { handleVaultSubmit as submitForTest };
			export function readErrorForTest() { return error; }
		</script>`;
		return { contents: compile(script, { filename: path, generate: 'client' }).js.code, loader: 'js' };
	});
	build.onLoad({ filter: /environment-vault-panel-read-harness\.svelte\.ts$/ }, async ({ path }) => {
		const source = new Transpiler({ loader: 'ts' }).transformSync(await Bun.file(path).text());
		return { contents: compileModule(source, { filename: path, generate: 'client' }).js.code, loader: 'js' };
	});
}});
const { createVaultPanelReadHarness } = await import('./environment-vault-panel-read-harness.svelte');

const workspace = { id: 'vault-read-test', name: 'Test', path: 'C:/workspace', lock: null,
	createdAt: '2026-10-27T00:00:00.000Z', updatedAt: '2026-10-27T00:00:00.000Z' };
const envelope: SecretVaultEnvelope = {
	format: 'workduck.secret-vault', version: 1,
	kdf: { algorithm: 'argon2id', version: 19, memoryKiB: 19456, iterations: 2, parallelism: 1, salt: 'salt' },
	cipher: { algorithm: 'xchacha20poly1305', nonce: 'nonce' }, ciphertext: 'encrypted-existing-secrets'
};
const createdEnvelope = { ...envelope, ciphertext: 'encrypted-new-empty-vault' };
const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
let commands: string[];
let file: string | null;
let read: () => Promise<{ ok: boolean; content?: string | null; error?: string }>;
let harness: ReturnType<typeof createVaultPanelReadHarness> | undefined;
async function settleEffects() { await new Promise((resolve) => setTimeout(resolve, 0)); }

beforeEach(() => {
	commands = [];
	file = JSON.stringify(envelope);
	const values = new Map<string, string>();
	Object.defineProperty(globalThis, 'window', { configurable: true, value: Object.assign(new EventTarget(), {
		localStorage: { getItem: (key: string) => values.get(key) ?? null,
			setItem: (key: string, value: string) => { values.set(key, value); } },
		setInterval: () => 0, clearInterval: () => {}
	}) });
	setTauriInvokeForTest(async <T>(command: string, args?: Record<string, unknown>) => {
		commands.push(command);
		if (command === 'read_workspace_data_file') return await read() as T;
		if (command === 'create_environment_vault_session') return { ok: true,
			vault: { ...createEmptyEnvironmentVault(workspace.id), nativeManaged: true }, envelope: createdEnvelope } as T;
		if (command === 'write_workspace_data_file') file = String(args?.content);
		return { ok: true } as T;
	});
});
afterEach(async () => {
	harness?.dispose(); harness = undefined;
	await settleEffects();
	setTauriInvokeForTest(undefined);
	if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow);
	else Reflect.deleteProperty(globalThis, 'window');
});

describe('vault creation requires a successful initial read', () => {
	test('does not create or write while the initial read is pending', async () => {
		let completeRead!: () => void;
		read = () => new Promise((resolve) => { completeRead = () => resolve({ ok: true, content: file }); });
		harness = createVaultPanelReadHarness(workspace);
		await settleEffects();
		try {
			await harness.submit();
			expect(commands.filter((command) => /^(create_|write_)/.test(command))).toEqual([]);
		} finally { completeRead(); await settleEffects(); }
	});
	for (const failure of ['unreadable-file', 'invalid-json', 'unsupported-version']) {
		test(`preserves the original file after ${failure}`, async () => {
			file = failure === 'invalid-json' ? '{broken' : JSON.stringify(
				failure === 'unsupported-version' ? { ...envelope, version: 999 } : envelope
			);
			const original = file;
			read = async () => failure === 'unreadable-file'
				? { ok: false, error: 'workspace-data-file-read-failed' }
				: { ok: true, content: file };
			harness = createVaultPanelReadHarness(workspace);
			await settleEffects();
			expect(harness.error).not.toBeNull();
			await harness.submit();
			expect(commands.filter((command) => /^(create_|write_)/.test(command))).toEqual([]);
			expect(file).toBe(original);
		});
	}
	test('allows creating a vault when a successful read confirms no file exists', async () => {
		file = null;
		read = async () => ({ ok: true, content: null });
		harness = createVaultPanelReadHarness(workspace);
		await settleEffects();
		await harness.submit();
		expect(commands.filter((command) => /^(create_|write_)/.test(command))).toEqual([
			'create_environment_vault_session', 'write_workspace_data_file'
		]);
		expect(JSON.parse(file!)).toEqual(createdEnvelope);
	});
});
