import { afterEach, describe, expect, test } from 'bun:test';
import { getWorkduckMessages } from '#lib/i18n/workduck-language.ts';
import { setTauriInvokeForTest } from '#lib/tauri/tauri-invoke.ts';
import { createEmptyProjectRegistry } from './project-registry';
import type { ProjectRepositoryTarget } from './project-board-types';
import type { ProjectRepositoryOperation } from './project-board-operations';
import {
	createProjectBoardRepositoryActionContext
} from './project-board-repository-action-context';
import { runProjectRepositoryRemoteGitAction } from './project-board-repository-actions';

function deferred() {
	let resolve!: () => void;
	const promise = new Promise<void>(next => { resolve = next; });
	return { promise, resolve };
}

const timestamp = '2026-10-04T00:00:00.000Z';
const repository = {
	id: 'repository', name: 'Repository', path: 'C:/workspaces/old/projects/demo/repository',
	remoteUrl: 'https://github.com/example/repository.git', upstreamRemoteUrl: null,
	githubCredentialSecretId: null, favorite: false, tags: [], createdAt: timestamp, updatedAt: timestamp
};
const target: ProjectRepositoryTarget = {
	repository,
	node: { id: 'group', kind: 'group', parentId: 'project', name: 'Group',
		description: '', path: 'projects/demo', githubCredentialSecretId: null, tags: [],
		repositories: [repository], createdAt: timestamp, updatedAt: timestamp }
};

afterEach(() => setTauriInvokeForTest(undefined));

describe('repository action workspace ownership', () => {
	for (const transition of ['switch', 'return', 'rename', 'dispose'] as const) {
		test(`keeps native operation history and feedback ownership across ${transition}`, async () => {
			const mutation = deferred();
			let workspaceId = 'old';
			let generation = 1;
			let operations: Record<string, ProjectRepositoryOperation> = {};
			let status: string | null = null;
			let gitTarget: unknown = null;
			let formError: unknown = null;
			let storageError: unknown = null;
			let refreshes = 0;
			const records: Record<string, unknown>[] = [];
			setTauriInvokeForTest(async <T>(command: string, args?: Record<string, unknown>) => {
				if (command === 'fetch_project_repository_git') {
					await mutation.promise;
					return { ok: true } as T;
				}
				if (command === 'write_project_repository_operation_record') {
					records.push(args?.record as Record<string, unknown>);
					return { ok: true } as T;
				}
				throw new Error(command);
			});
			const options = {
				workspaceId: 'old', workspacePath: 'C:/workspaces/old',
				registry: createEmptyProjectRegistry('old'),
				isCurrent: () => workspaceId === 'old' && generation === 1,
				operations: () => operations,
				setOperations: (next: Record<string, ProjectRepositoryOperation>) => { operations = next; },
				setOperationStorageError: (error: unknown) => { storageError = error; },
				isRepositoryBusy: () => false, isRepositoryPathInsideWorkspace: () => true,
				resolveCredential: () => null,
				persistRegistry: async () => true,
				refreshRepositoryGitStatus: async () => { refreshes += 1; },
				setFormError: (error: unknown) => { formError = error; },
				setStatus: (next: string | null) => { status = next; },
				setSelectedGroupId: () => {}, setCloneTarget: () => {},
				setGitActionTarget: (next: unknown) => { gitTarget = next; },
				setIsPublishingRepository: () => {}, closePublishRepositoryDialog: () => {},
				operationMessages: getWorkduckMessages('en').projects.operations
			};
			const context = createProjectBoardRepositoryActionContext(options);
			const running = runProjectRepositoryRemoteGitAction(target, 'fetch', context);
			const operation = operations[repository.id]!;
			expect(operation.state).toBe('running');
			if (transition !== 'rename') {
				generation += 1;
				workspaceId = transition === 'switch' ? 'new' : 'old';
				operations = {};
				status = 'new view'; gitTarget = 'new target'; formError = 'new error'; storageError = 'new storage error';
			}
			mutation.resolve();
			await running;
			expect(records).toHaveLength(1);
			expect(records[0]?.workspaceId).toBe('old');
			expect(records[0]?.id).toBe(operation.id);
			expect(records[0]?.startedAt).toBe(operation.startedAt);
			if (transition === 'rename') {
				expect(operations[repository.id]?.state).toBe('succeeded');
				expect(status).toBe(options.operationMessages.done.fetch);
				expect(gitTarget).toBeNull();
				expect(refreshes).toBe(1);
			} else {
				expect(operations).toEqual({});
				expect(status).toBe('new view'); expect(gitTarget).toBe('new target');
				expect(formError).toBe('new error'); expect(storageError).toBe('new storage error');
				expect(refreshes).toBe(0);
			}
		});
	}
});
