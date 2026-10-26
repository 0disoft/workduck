import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, test } from 'node:test';
import { setTauriInvokeForTest } from '#lib/tauri/tauri-invoke.ts';
import type { SecretVaultEnvelope } from './secret-vault-crypto';
import {
	WORKDUCK_ENVIRONMENT_VAULT_STORAGE_KEY,
	readEnvironmentVaultEnvelope,
	readEnvironmentVaultEnvelopeForWorkspace,
	writeEnvironmentVaultEnvelope,
	writeEnvironmentVaultEnvelopeForWorkspace
} from './environment-vault-storage';

const envelope: SecretVaultEnvelope = {
	format: 'workduck.secret-vault', version: 1,
	kdf: { algorithm: 'argon2id', version: 19, memoryKiB: 19456, iterations: 2, parallelism: 1, salt: 'test-salt' },
	cipher: { algorithm: 'xchacha20poly1305', nonce: 'test-nonce' }, ciphertext: 'test-ciphertext'
};
const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
let stored: string | null;
let writes: number;
let notifications: number;

describe('environment vault storage preserves unreadable records', () => {
	beforeEach(() => {
		stored = null;
		writes = 0;
		notifications = 0;
		Object.defineProperty(globalThis, 'window', { configurable: true, value: {
			localStorage: {
				getItem: (key: string) => { assert.equal(key, WORKDUCK_ENVIRONMENT_VAULT_STORAGE_KEY); return stored; },
				setItem: (key: string, value: string) => {
					assert.equal(key, WORKDUCK_ENVIRONMENT_VAULT_STORAGE_KEY);
					writes += 1;
					stored = value;
				}
			},
			dispatchEvent: () => { notifications += 1; return true; }
		} });
	});
	afterEach(() => {
		setTauriInvokeForTest(undefined);
		if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow);
		else Reflect.deleteProperty(globalThis, 'window');
	});

	const unreadableRecords = {
		'truncated JSON': '{"version":1,"vaults":{"ws-old":',
		'future version': JSON.stringify({ version: 2, vaults: { 'ws-old': envelope } }),
		'null record': 'null',
		'array record': '[]',
		'missing vault map': JSON.stringify({ version: 1 }),
		'array vault map': JSON.stringify({ version: 1, vaults: [] }),
		'one invalid vault among valid vaults': JSON.stringify({ version: 1, vaults: {
			'ws-valid': envelope, 'ws-unreadable': { ...envelope, version: 2 }
		} })
	};
	for (const [name, raw] of Object.entries(unreadableRecords)) {
		test(`rejects ${name} without overwriting any encrypted data`, () => {
			stored = raw;
			assert.deepEqual(readEnvironmentVaultEnvelope('ws-new'), {
				ok: false, envelope: null, error: 'environment-vault-storage-read-failed'
			});
			assert.deepEqual(writeEnvironmentVaultEnvelope('ws-new', envelope), {
				ok: false, error: 'environment-vault-storage-write-failed'
			});
			assert.equal(stored, raw);
			assert.equal(writes, 0);
			assert.equal(notifications, 0);
		});
	}

	test('initializes only an absent record and preserves other workspaces on update', () => {
		assert.deepEqual(readEnvironmentVaultEnvelope('ws-1'), { ok: true, envelope: null });
		assert.deepEqual(writeEnvironmentVaultEnvelope('ws-1', envelope), { ok: true });
		const second = { ...envelope, ciphertext: 'second-workspace' };
		assert.deepEqual(writeEnvironmentVaultEnvelope('ws-2', second), { ok: true });
		const updated = { ...envelope, ciphertext: 'updated-first-workspace' };
		assert.deepEqual(writeEnvironmentVaultEnvelope('ws-1', updated), { ok: true });
		assert.deepEqual(readEnvironmentVaultEnvelope('ws-1'), { ok: true, envelope: updated });
		assert.deepEqual(readEnvironmentVaultEnvelope('ws-2'), { ok: true, envelope: second });
		assert.equal(notifications, 3);
	});

	test('keeps corruption errors when native file access is unavailable', async () => {
		stored = unreadableRecords['future version'];
		const original = stored;
		setTauriInvokeForTest(async <T>() => ({ ok: false, error: 'workspace-data-unavailable' }) as T);
		assert.deepEqual(await readEnvironmentVaultEnvelopeForWorkspace('ws-new', 'C:/workspace'), {
			ok: false, envelope: null, error: 'environment-vault-storage-read-failed'
		});
		assert.deepEqual(await writeEnvironmentVaultEnvelopeForWorkspace('ws-new', envelope, 'C:/workspace'), {
			ok: false, error: 'environment-vault-storage-write-failed'
		});
		assert.equal(stored, original);
		assert.equal(writes, 0);
		assert.equal(notifications, 0);
	});

	test('a committed native file remains usable when the browser mirror is unreadable', async () => {
		stored = unreadableRecords['future version'];
		const original = stored;
		let file: string | null = null;
		setTauriInvokeForTest(async <T>(command: string, args?: Record<string, unknown>) => {
			if (command === 'read_workspace_data_file') return { ok: true, content: file } as T;
			assert.equal(command, 'write_workspace_data_file');
			file = String(args?.content);
			return { ok: true } as T;
		});
		assert.deepEqual(await writeEnvironmentVaultEnvelopeForWorkspace('ws-new', envelope, 'C:/workspace'), { ok: true });
		assert.deepEqual(await readEnvironmentVaultEnvelopeForWorkspace('ws-new', 'C:/workspace'), { ok: true, envelope });
		assert.equal(stored, original);
		assert.equal(writes, 0);
		assert.equal(notifications, 1);
	});
});
