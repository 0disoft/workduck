import { lstat, mkdir, open, rm } from 'node:fs/promises';
import { hostname } from 'node:os';
import { dirname, resolve } from 'node:path';

// Locks cover snapshots, replacement, rollback, and staging cleanup across processes.
// Never reclaim an existing lock automatically: its owner may still be publishing.
export async function acquireSsealedPublicationLocks(paths, owned) {
	for (const target of new Set(paths.map((path) => resolve(path)))) {
		await mkdir(dirname(target), { recursive: true });
		const path = `${target}.workduck-ssealed-publish.lock`;
		let file;
		try {
			file = await open(path, 'wx');
		} catch (error) {
			if (error.code === 'EEXIST') {
				throw new Error(`ssealed publication lock already exists: ${path}. Another publisher may be active or interrupted; check the recorded host and PID before removing this lock.`, { cause: error });
			}
			throw error;
		}
		const lock = { path, file, identity: null };
		owned.push(lock);
		lock.identity = await file.stat({ bigint: true });
		await file.writeFile(JSON.stringify({ hostname: hostname(), pid: process.pid, target }) + '\n');
		await file.sync();
	}
}

export async function releaseSsealedPublicationLock(lock) {
	await lock.file.close();
	let current;
	try {
		current = await lstat(lock.path, { bigint: true });
	} catch (error) {
		if (error.code === 'ENOENT') return;
		throw error;
	}
	if (!lock.identity || !current.isFile() || current.isSymbolicLink() ||
		current.dev !== lock.identity.dev || current.ino !== lock.identity.ino) {
		throw new Error(`Preserved a replaced ssealed publication lock: ${lock.path}`);
	}
	await rm(lock.path);
}
