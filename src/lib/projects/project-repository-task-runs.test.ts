import { describe, expect, test } from 'bun:test';
import { createRepositoryTaskRunPathKey, mapLatestTaskRunsByRepositoryId } from './project-repository-task-runs';
import { createEmptyProjectRegistry, parseStoredProjectRegistry, type ProjectRepositoryLinkRecord } from './project-registry';
import type { ProjectRepositoryTaskRunRecord } from './project-repository-task';

const timestamp = '2026-10-04T00:00:00.000Z';
function repository(path: string): ProjectRepositoryLinkRecord {
	return { id: 'repository', name: 'Demo', path, remoteUrl: null, upstreamRemoteUrl: null,
		githubCredentialSecretId: null, favorite: false, tags: [], createdAt: timestamp, updatedAt: timestamp };
}
function run(id: string, repositoryPath: string): ProjectRepositoryTaskRunRecord {
	return { id, repositoryPath, task: 'build', command: 'bun run build', state: 'succeeded', exitCode: 0,
		startedAt: timestamp, finishedAt: timestamp, outputTail: null, recordPath: `runs/${id}.json` };
}

describe('repository task run path identity', () => {
	for (const id of ['constructor', '__proto__', 'toString', 'hasOwnProperty']) {
		test(`restores task history for the accepted repository ID ${id}`, () => {
			const stored = parseStoredProjectRegistry(JSON.stringify({
				...createEmptyProjectRegistry('workspace'),
				nodes: [{
					id: 'project', kind: 'project', parentId: null, name: 'Project', description: '',
					path: 'C:/workspace', githubCredentialSecretId: null, tags: [],
					createdAt: timestamp, updatedAt: timestamp,
					repositories: [{ ...repository('C:/workspace/demo'), id }]
				}]
			}), 'workspace');
			expect(stored.ok).toBe(true);
			if (!stored.ok) throw new Error(stored.error);
			const repositories = stored.registry.nodes.flatMap((node) => node.repositories);
			expect(repositories.map((repository) => repository.id)).toEqual([id]);
			const latest = run('latest', 'C:/workspace/demo');
			const mapped = mapLatestTaskRunsByRepositoryId(repositories, [latest, run('older', latest.repositoryPath)]);
			expect(Object.hasOwn(mapped, id)).toBe(true);
			expect(mapped[id]).toBe(latest);
			expect(mapLatestTaskRunsByRepositoryId(repositories, [run('unrelated', 'C:/workspace/other')])[id]).toBeUndefined();
		});
	}

	for (const [registered, recorded] of [
		['C:/workspace/Projects/Demo/', 'c:\\workspace\\projects\\demo'],
		['C:\\workspace\\demo', '\\\\?\\C:\\workspace\\demo'],
		['//Server/share/Demo', '\\\\?\\UNC\\server\\share\\demo\\']
	]) {
		test(`connects native Windows task records to ${registered}`, () => {
			const latest = run('latest', recorded!);
			expect(mapLatestTaskRunsByRepositoryId([repository(registered!)], [latest, run('older', recorded!)]))
				.toEqual({ repository: latest });
		});
	}

	test('keeps Unix case and literal backslashes distinct', () => {
		const latest = run('latest', '/workspace/Demo');
		expect(mapLatestTaskRunsByRepositoryId([repository('/workspace/demo')], [latest])).toEqual({});
		expect(createRepositoryTaskRunPathKey('/workspace/a\\b')).not.toBe(createRepositoryTaskRunPathKey('/workspace/a/b'));
		expect(createRepositoryTaskRunPathKey('/')).toBe('/');
		expect(createRepositoryTaskRunPathKey('/workspace/Demo/')).toBe('/workspace/Demo');
	});
});
