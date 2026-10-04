import { plugin, Transpiler } from 'bun';
import { afterEach, beforeEach, expect, test } from 'bun:test';
import { compileModule } from 'svelte/compiler';
import { getWorkduckMessages } from '#lib/i18n/workduck-language.ts';
import { setTauriInvokeForTest } from '#lib/tauri/tauri-invoke.ts';
import type { WorkspaceRecord } from '#lib/workspaces/workspace-registry.ts';
import type { ProjectFormError } from './project-board-errors';
import type { ProjectRepositoryOperation } from './project-board-operations';
import type { ProjectRepositoryTaskRunRecordByRepositoryId } from './project-repository-task-runs';
import type { ProjectRepositoryTarget } from './project-board-types';
import type { ProjectNodeRecord } from './project-registry';

await plugin({
	name: 'project-repository-controller-runes',
	setup(build) {
		build.onLoad({ filter: /project-board-(repository-controller|registry-writer(-harness)?)\.svelte\.ts$/ }, async ({ path }) => {
			const source = new Transpiler({ loader: 'ts' }).transformSync(await Bun.file(path).text());
			return { contents: compileModule(source, { filename: path, generate: 'client' }).js.code, loader: 'js' };
		});
	}
});

const { createProjectBoardRepositoryController } = await import('./project-board-repository-controller.svelte');
const { createProjectBoardRegistryWriterHarness } = await import('./project-board-registry-writer-harness.svelte');
const timestamp = '2026-10-04T00:00:00.000Z';
const workspace: WorkspaceRecord = { id: 'workspace_1', name: 'Demo', path: 'C:/workspace', lock: null, createdAt: timestamp, updatedAt: timestamp };
const repository = {
	id: 'repo_1', name: 'Repository', path: 'C:/workspace/projects/demo/group/repository', remoteUrl: null,
	upstreamRemoteUrl: null, githubCredentialSecretId: null, favorite: false, tags: [],
	createdAt: timestamp, updatedAt: timestamp
};
const target: ProjectRepositoryTarget = {
	repository,
	node: { id: 'group_1', kind: 'group', parentId: 'project_1', name: 'Group', description: '',
		path: 'projects/demo/group', githubCredentialSecretId: null, tags: [], repositories: [repository],
		createdAt: timestamp, updatedAt: timestamp }
};
const project: ProjectNodeRecord = { ...target.node, id: 'project_1', kind: 'project', parentId: null,
	name: 'Demo', path: 'projects/demo', repositories: [] };

async function settleEffects() { await new Promise((resolve) => setTimeout(resolve, 0)); }

async function createController() {
	const writer = createProjectBoardRegistryWriterHarness(workspace);
	writer.state.registry = { ...writer.state.registry, nodes: [project, target.node] };
	await settleEffects();
	let operations: Record<string, ProjectRepositoryOperation> = {};
	let taskRuns: ProjectRepositoryTaskRunRecordByRepositoryId = {};
	let status: string | null = null;
	let error: ProjectFormError | null = null;
	const controller = createProjectBoardRepositoryController({
		registryWriter: writer.persistRegistry, registry: writer.getRegistry,
		operations: () => operations, setOperations: (value) => { operations = value; },
		taskRuns: () => taskRuns, setTaskRuns: (value) => { taskRuns = value; },
		gitStatusById: () => ({ [repository.id]: { isGitRepository: true, hasRemote: false,
			originUrl: null, upstreamRemoteUrl: null, aheadCount: 0, behindCount: 0,
			hasUncommittedChanges: false, branch: 'main', error: null } }),
		pathBoundaryKey: () => 'c:/workspace', environmentVault: () => null,
		githubCredentialNameById: () => new Map(), githubCredentialOptions: () => [],
		selectedProject: () => project, messages: () => getWorkduckMessages('en').projects,
		languageId: () => 'en', scaffoldState: () => ({ isApplying: false, target: null }),
		preloadOverlays() {}, clearDeleteCandidate() {}, clearDialog() {}, closeContextMenu() {},
		setFormError: (value) => { error = value; }, setStatus: (value) => { status = value; },
		setQueueFolderError() {}, setOperationStorageError() {}, setSelectedGroupId() {},
		async refreshRepositoryGitStatus() {}
	});
	return { writer, controller, get status() { return status; }, get error() { return error; } };
}

const windowDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'window');
beforeEach(() => {
	const values = new Map<string, string>();
	const localStorage: Storage = {
		get length() { return values.size; }, clear() { values.clear(); },
		getItem(key) { return values.get(key) ?? null; }, key(index) { return [...values.keys()][index] ?? null; },
		removeItem(key) { values.delete(key); }, setItem(key, value) { values.set(key, value); }
	};
	Object.defineProperty(globalThis, 'window', { configurable: true, value: Object.assign(new EventTarget(), { localStorage }) });
});
afterEach(() => {
	setTauriInvokeForTest(undefined);
	if (windowDescriptor) Object.defineProperty(globalThis, 'window', windowDescriptor);
	else Reflect.deleteProperty(globalThis, 'window');
});

test('publish inputs remain reactive and dialog reset admits the next repository', async () => {
	const harness = await createController();
	try {
		harness.controller.openPublishRepositoryDialog(target.node, repository);
		expect(harness.controller.publishTarget?.repository.id).toBe(repository.id);
		expect(harness.controller.canSubmitPublishRepository).toBe(true);
		harness.controller.githubRepositoryName = '';
		expect(harness.controller.canSubmitPublishRepository).toBe(false);
		harness.controller.githubRepositoryName = 'New repository';
		expect(harness.controller.canSubmitPublishRepository).toBe(true);
		harness.controller.selectGithubRepositoryVisibility('public');
		harness.controller.closePublishRepositoryDialog();
		expect(harness.controller.publishTarget).toBeNull();
		expect(harness.controller.githubRepositoryVisibility).toBe('private');
		harness.controller.openPublishRepositoryDialog(target.node, repository);
		expect(harness.controller.githubRepositoryName).toBe(repository.name);
	} finally { harness.writer.dispose(); }
});

test('repository controller retains captured action ownership after workspace reset', async () => {
	const harness = await createController();
	try {
		const context = harness.controller.createRepositoryActionContext();
		context.startOperation(repository.id, 'fetch');
		expect(harness.controller.isRepositoryBusy(repository.id)).toBe(true);
		harness.writer.setWorkspace({ ...workspace, id: 'workspace_2', path: 'C:/other' });
		harness.controller.resetWorkspace();
		await settleEffects();
		expect(context.isCurrent()).toBe(false);
		context.setStatus('Old workspace completion');
		expect(harness.status).toBeNull();
		expect(harness.controller.publishTarget).toBeNull();
	} finally { harness.writer.dispose(); }
});

for (const transition of ['stay', 'switch', 'return', 'rename'] as const) {
	test(`favorite save feedback stays in its initiating workspace across ${transition}`, async () => {
		const harness = await createController();
		const nativeRegistryJson = JSON.stringify(harness.writer.state.registry);
		let finish!: () => void;
		let entered!: () => void;
		const pending = new Promise<void>((resolve) => { finish = resolve; });
		const started = new Promise<void>((resolve) => { entered = resolve; });
		let writtenWorkspaceId: unknown;
		setTauriInvokeForTest(async <T>(command: string, args?: Record<string, unknown>) => {
			if (command === 'read_project_registry') return { ok: true, registryJson: nativeRegistryJson } as T;
			writtenWorkspaceId = args?.workspaceId;
			entered();
			await pending;
			return { ok: true } as T;
		});
		try {
			const saving = harness.controller.setRepositoryFavorite(target.node, repository, true);
			await Promise.race([started, saving.then(() => {
				throw new Error(`Save finished before native write: ${harness.error}, ${harness.writer.visibleError}`);
			})]);
			if (transition !== 'stay') {
				harness.writer.setWorkspace(transition === 'rename'
					? { ...workspace, path: 'C:/renamed' }
					: { ...workspace, id: 'workspace_2', path: 'C:/other' });
				harness.controller.resetWorkspace();
				await settleEffects();
				if (transition === 'return') {
					harness.writer.setWorkspace(workspace);
					await settleEffects();
				}
			}
			finish();
			await saving;
			expect(writtenWorkspaceId).toBe(workspace.id);
			expect(harness.status).toBe(transition === 'stay'
				? getWorkduckMessages('en').projects.repository.favoriteAdded
				: null);
		} finally { finish(); harness.writer.dispose(); }
	});
}
