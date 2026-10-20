import { afterEach, expect, test } from 'bun:test';
import { setTauriInvokeForTest } from '#lib/tauri/tauri-invoke.ts';
import { normalizeSyncSettings, parseSyncSettings, serializeSyncSettings } from '#lib/settings/sync-settings.ts';
import {
	isWorkspaceSyncFileNameUsable, normalizeWorkspaceSyncFileName,
	readWorkspaceSyncFile, writeWorkspaceSyncFile
} from './workspace-sync-file';

afterEach(() => setTauriInvokeForTest(undefined));

test('sync settings preserve long directory and filename identities through storage round trips', () => {
	const folderPath = `C:/${'x'.repeat(1022)}`;
	const fileName = `${'x'.repeat(120)}.json`;
	const settings = normalizeSyncSettings({ folderPath, fileName });
	expect(settings.folderPath).toBe(folderPath);
	expect(settings.fileName).toBe(fileName);
	expect(parseSyncSettings(serializeSyncSettings(settings))).toEqual(settings);
	expect(isWorkspaceSyncFileNameUsable(fileName)).toBe(false);
});

for (const fileName of ['x'.repeat(121), `${'x'.repeat(120)}/other.json`, 'sync\u007f.json', 'sync\u0085.json']) {
	test(`invalid sync filename cannot be truncated or reach read/write I/O: ${JSON.stringify(fileName)}`, async () => {
		let calls = 0;
		setTauriInvokeForTest(async <T>() => { calls += 1; return { ok: true, normalizedPath: 'C:/sync/output', content: '{}' } as T; });
		expect(normalizeWorkspaceSyncFileName(fileName)).toBe(fileName);
		expect(isWorkspaceSyncFileNameUsable(fileName)).toBe(false);
		expect(await readWorkspaceSyncFile('C:/sync', fileName)).toEqual({ ok: false, error: 'workspace-sync-file-name-invalid' });
		expect(await writeWorkspaceSyncFile('C:/sync', fileName, '{}')).toEqual({ ok: false, error: 'workspace-sync-file-name-invalid' });
		expect(calls).toBe(0);
	});
}

test('native I/O receives the exact long directory and a Unicode filename at its character limit', async () => {
	const folderPath = `C:/${'x'.repeat(1022)}`;
	const fileName = `${'😀'.repeat(115)}.json`;
	expect(Array.from(fileName)).toHaveLength(120);
	expect(isWorkspaceSyncFileNameUsable(fileName)).toBe(true);
	const commands: string[] = [];
	setTauriInvokeForTest(async <T>(command: string, args?: Record<string, unknown>) => {
		commands.push(command);
		expect(args?.folderPath).toBe(folderPath);
		expect(args?.fileName).toBe(fileName);
		return { ok: true, normalizedPath: `${folderPath}/${fileName}`, content: '{}' } as T;
	});
	expect((await readWorkspaceSyncFile(folderPath, ` ${fileName} `)).ok).toBe(true);
	expect((await writeWorkspaceSyncFile(folderPath, fileName, '{}')).ok).toBe(true);
	expect(commands).toEqual(['read_workspace_sync_file', 'write_workspace_sync_file']);
});
