import { afterEach, beforeEach, expect, test } from 'bun:test';
import { setTauriInvokeForTest } from '#lib/tauri/tauri-invoke.ts';
import type { ProjectNodeRecord, ProjectRepositoryLinkRecord } from './project-registry';
import type { QueueFolderError } from '#lib/queue/queue-folder.ts';
import { queueProjectRepositoryCommitWorkOrder } from './project-board-repository-commit-work-order';

const windowDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'window');
beforeEach(() => Object.defineProperty(globalThis, 'window', { configurable: true, value: new EventTarget() }));
afterEach(() => {
	setTauriInvokeForTest(undefined);
	if (windowDescriptor) Object.defineProperty(globalThis, 'window', windowDescriptor);
	else Reflect.deleteProperty(globalThis, 'window');
});

const timestamp = '2026-10-04T00:00:00.000Z';
const repository: ProjectRepositoryLinkRecord = {
	id: 'repository', name: 'Repository', path: 'C:/workspaces/old/projects/demo/repository',
	remoteUrl: null, upstreamRemoteUrl: null, githubCredentialSecretId: null,
	favorite: false, tags: [], createdAt: timestamp, updatedAt: timestamp
};
const node: ProjectNodeRecord = {
	id: 'project', kind: 'project', parentId: null, name: 'Demo', description: '',
	path: 'projects/demo', githubCredentialSecretId: null, tags: [], repositories: [repository],
	createdAt: timestamp, updatedAt: timestamp
};

for (const ok of [true, false]) {
	for (const transition of ['stay', 'switch', 'return', 'dispose'] as const) {
		test(`commit work order keeps ${ok ? 'success' : 'failure'} feedback ownership across ${transition}`, async () => {
			let finish!: () => void;
			const pending = new Promise<void>(resolve => { finish = resolve; });
			let current = true;
			let busy: string | null = null;
			let status: string | null = null;
			let error: QueueFolderError | null = null;
			let writtenPath: unknown;
			let writtenProjectIds: unknown;
			setTauriInvokeForTest(async <T>(_command: string, args?: Record<string, unknown>) => {
				writtenPath = args?.workspacePath;
				writtenProjectIds = JSON.parse(args?.content as string).tasks[0].projectIds;
				await pending;
				return (ok ? { ok: true, relativePath: 'queue/work-orders/commit.json', content: args?.content }
					: { ok: false, error: 'queue-folder-file-write-failed' }) as T;
			});
			const saving = queueProjectRepositoryCommitWorkOrder({
				workspaceId: 'old', workspacePath: 'C:/workspaces/old', nodes: [node], node, repository,
				languageId: 'en', queuedMessageTemplate: 'Queued {relativePath}'
			}, {
				isCurrent: () => current,
				canQueueRepositoryCommitWorkOrder: () => true,
				setCommitWorkOrderTargetRepositoryId: value => { busy = value; },
				setFormError: () => {}, setQueueFolderError: value => { error = value; },
				setStatus: value => { status = value; }
			});
			expect(busy as string | null).toBe(repository.id);
			if (transition !== 'stay') {
				current = false;
				busy = 'new action'; status = 'new view'; error = 'queue-folder-list-failed';
			}
			finish();
			await saving;
			expect(writtenPath).toBe('C:/workspaces/old');
			expect(writtenProjectIds).toEqual(['project']);
			if (transition === 'stay') {
				expect(busy).toBeNull();
				expect(status).toBe(ok ? 'Queued queue/work-orders/commit.json' : null);
				expect(error as QueueFolderError | null).toBe(ok ? null : 'queue-folder-file-write-failed');
			} else {
				expect(busy).toBe('new action');
				expect(status).toBe('new view');
				expect(error).toBe('queue-folder-list-failed');
			}
		});
	}
}
