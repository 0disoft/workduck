import { lstat, mkdir, mkdtemp, open, readFile, rename, rm } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';

async function snapshot(path) {
	try {
		const metadata = await lstat(path);
		if (!metadata.isFile() || metadata.isSymbolicLink()) {
			throw new Error(`Generated artifact target is not a regular file: ${path}`);
		}
		return await readFile(path);
	} catch (error) {
		if (error.code === 'ENOENT') return null;
		throw error;
	}
}

function equal(left, right) {
	return left === null ? right === null : right !== null && left.equals(right);
}

async function writeSynced(path, content) {
	const file = await open(path, 'wx');
	try {
		await file.writeFile(content);
		await file.sync();
	} finally {
		await file.close();
	}
}

export async function publishSsealedArtifacts(artifacts, { renameFile = rename } = {}) {
	const staged = [];
	const published = [];
	const errors = [];
	let failure;
	try {
		for (const artifact of artifacts) {
			await mkdir(dirname(artifact.path), { recursive: true });
			const original = await snapshot(artifact.path);
			const content = Buffer.from(artifact.content, 'utf8');
			if (equal(original, content)) continue;
			const directory = await mkdtemp(join(dirname(artifact.path), `.workduck-ssealed-stage-${basename(artifact.path)}-`));
			const stage = {
				path: artifact.path, original, content, directory, retain: false,
				next: join(directory, 'next'), previous: join(directory, 'previous')
			};
			staged.push(stage);
			await writeSynced(stage.next, content);
			if (original !== null) await writeSynced(stage.previous, original);
		}
		for (const stage of staged) {
			if (!equal(await snapshot(stage.path), stage.original)) {
				throw new Error(`Generated artifact changed during publication: ${stage.path}`);
			}
			await renameFile(stage.next, stage.path);
			published.push(stage);
		}
	} catch (error) {
		failure = error;
		for (const stage of published.reverse()) {
			try {
				if (!equal(await snapshot(stage.path), stage.content)) {
					throw new Error(`Preserved an externally changed artifact: ${stage.path}`);
				}
				if (stage.original === null) {
					await rm(stage.path);
				} else {
					await renameFile(stage.previous, stage.path);
				}
			} catch (rollbackError) {
				stage.retain = true;
				errors.push(rollbackError);
			}
		}
	}
	for (const stage of staged) {
		if (!stage.retain) {
			try {
				await rm(stage.directory, { recursive: true, force: true });
			} catch (cleanupError) {
				stage.retain = true;
				errors.push(cleanupError);
			}
		}
	}
	if (errors.length) {
		const backups = staged.filter((stage) => stage.retain).map((stage) => stage.directory);
		throw new AggregateError([failure, ...errors].filter(Boolean),
			`ssealed artifact publication or recovery failed. Retained backups: ${backups.join(', ') || 'none'}`);
	}
	if (failure) throw failure;
}
