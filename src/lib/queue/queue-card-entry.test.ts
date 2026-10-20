import { afterEach, expect, test } from 'bun:test';
import { setTauriInvokeForTest } from '#lib/tauri/tauri-invoke.ts';
import { createQueueCardEntries } from './queue-card-entry';
import type { QueueFileEntry } from './queue-folder';

function deferred() {
	let resolve!: () => void;
	const promise = new Promise<void>((next) => { resolve = next; });
	return { promise, resolve };
}
async function settle() { await new Promise((resolve) => setTimeout(resolve, 0)); }
afterEach(() => { setTauriInvokeForTest(undefined); });

test('bounds queue reads, keeps input order, and continues past an unreadable file', async () => {
	const initialReads = deferred();
	const firstRead = deferred();
	let activeReads = 0;
	let peakReads = 0;
	const readPaths: string[] = [];
	const supportedFiles: QueueFileEntry[] = Array.from({ length: 12 }, (_, index) => ({
		relativePath: `work-orders/${index}.workduck-work-order.json`,
		fileName: `${index}.workduck-work-order.json`, kind: 'work-order'
	}));
	const unsupportedFile: QueueFileEntry = { relativePath: 'notes.txt', fileName: 'notes.txt', kind: 'unsupported' };
	const files = [unsupportedFile, ...supportedFiles];
	setTauriInvokeForTest(async <T>(command: string, args?: Record<string, unknown>) => {
		expect(command).toBe('read_queue_file');
		const path = String(args?.relativePath);
		readPaths.push(path);
		activeReads += 1;
		peakReads = Math.max(peakReads, activeReads);
		await initialReads.promise;
		if (path === supportedFiles[0]!.relativePath) await firstRead.promise;
		activeReads -= 1;
		if (path === supportedFiles[5]!.relativePath) return { ok: false } as T;
		return { ok: true, relativePath: path, content: JSON.stringify({
			schemaVersion: 'workduck.queue-work-order/v1', ref: { id: path, kind: 'queue-work-order', label: path },
			status: 'active', createdAt: '2026-10-10T00:00:00.000Z', tasks: []
		}) } as T;
	});
	const loading = createQueueCardEntries('C:/workspace', [supportedFiles[2]!.relativePath], files);
	try {
		await settle();
		expect(activeReads).toBe(4);
		initialReads.resolve(); await settle();
		// A slow first file must not stall the other workers or reorder the returned cards.
		expect(readPaths).toHaveLength(supportedFiles.length);
		expect(activeReads).toBe(1);
		firstRead.resolve();
		const entries = await loading;
		expect(peakReads).toBe(4);
		expect(entries.map((entry) => entry.relativePath)).toEqual(files.map((file) => file.relativePath));
		expect(entries[3]?.isRead).toBe(true);
		expect(entries[6]?.title).toBe(supportedFiles[5]!.fileName);
		expect(entries[12]?.artifactId).toBe(supportedFiles[11]!.relativePath);
		expect(readPaths).not.toContain(unsupportedFile.relativePath);
	} finally {
		initialReads.resolve(); firstRead.resolve(); await loading;
	}
});
