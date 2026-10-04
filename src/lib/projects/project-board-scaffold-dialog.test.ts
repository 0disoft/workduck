import { plugin, Transpiler } from 'bun';
import { afterEach, describe, expect, test } from 'bun:test';
import { compileModule } from 'svelte/compiler';
import { getWorkduckMessages } from '#lib/i18n/workduck-language.ts';
import { setTauriInvokeForTest } from '#lib/tauri/tauri-invoke.ts';
import type { ProjectFormError } from './project-board-errors';
import type { ProjectRepositoryTarget } from './project-board-types';

await plugin({
	name: 'project-scaffold-dialog-runes',
	setup(build) {
		build.onLoad({ filter: /project-board-scaffold-dialog\.svelte\.ts$/ }, async ({ path }) => {
			const source = new Transpiler({ loader: 'ts' }).transformSync(await Bun.file(path).text());
			return { contents: compileModule(source, { filename: path, generate: 'client' }).js.code, loader: 'js' };
		});
	}
});

const { createProjectBoardScaffoldDialog } = await import('./project-board-scaffold-dialog.svelte');

const repository = {
	id: 'repo_1', name: 'demo', path: 'C:/workspace/projects/demo', remoteUrl: null,
	upstreamRemoteUrl: null, githubCredentialSecretId: null, favorite: false, tags: [],
	createdAt: '2026-10-04T00:00:00.000Z', updatedAt: '2026-10-04T00:00:00.000Z'
};
const target: ProjectRepositoryTarget = {
	repository,
	node: {
		id: 'project_1', kind: 'project', parentId: null, name: 'Demo', description: '',
		path: 'projects/demo', githubCredentialSecretId: null, tags: [], repositories: [repository],
		createdAt: repository.createdAt, updatedAt: repository.updatedAt
	}
};

function scaffoldResponse(args: Record<string, unknown> | undefined, applied = false) {
	return {
		ok: true,
		plan: {
			toolVersion: '0.7.0', scope: args?.ssealedScaffoldScope,
			profile: args?.ssealedScaffoldProfile, density: 'standard', runner: 'bun', files: [],
			missingCount: applied ? 0 : 3, addedCount: applied ? 2 : 0,
			unchangedCount: 0, conflictCount: applied ? 1 : 0
		}
	};
}

function createDialog(canApply = true) {
	const workspace = { id: 'workspace_1', path: 'C:/workspace' };
	let error: ProjectFormError | null = null;
	let status: string | null = null;
	let opened = 0;
	const dialog = createProjectBoardScaffoldDialog({
		captureWorkspace: () => {
			const { id, path } = workspace;
			return { workspacePath: path, isCurrent: () => workspace.id === id && workspace.path === path };
		},
		messages: () => getWorkduckMessages('en').projects,
		canApplyToRepository: () => canApply, preloadOverlays() {}, onOpen: () => { opened += 1; },
		setFormError: (value) => { error = value; }, setStatus: (value) => { status = value; }
	});
	return { dialog, workspace, get error() { return error; }, get status() { return status; }, get opened() { return opened; } };
}

async function settlePreview() {
	for (let i = 0; i < 8; i += 1) await Promise.resolve();
}

afterEach(() => setTauriInvokeForTest(undefined));

describe('repository scaffold dialog', () => {
	for (const outcome of ['success', 'error'] as const) {
		for (const change of ['id', 'path'] as const) {
			test(`ignores scaffold apply ${outcome} after workspace ${change} changes`, async () => {
				let finish!: () => void;
				const pending = new Promise<void>((resolve) => { finish = resolve; });
				setTauriInvokeForTest(async <T>(command: string, args?: Record<string, unknown>) => {
					if (command === 'apply_ssealed_scaffold_to_repository') {
						await pending;
						if (outcome === 'error') return { ok: false, error: 'project-folder-ssealed-scaffold-failed' } as T;
					}
					return scaffoldResponse(args, command === 'apply_ssealed_scaffold_to_repository') as T;
				});
				const harness = createDialog();
				harness.dialog.openApplySsealedRepositoryDialog(target);
				await settlePreview();
				const applying = harness.dialog.applySsealedScaffoldToTarget();
				harness.workspace[change] += '_changed';
				finish();
				await applying;
				expect(harness.error).toBeNull();
				expect(harness.status).toBeNull();
				expect(harness.dialog.ssealedPreview?.addedCount).toBe(0);
			});
		}
	}

	test('ignores a preview after workspace changes and refuses a stale apply', async () => {
		let finish!: () => void;
		let applyCalls = 0;
		const pending = new Promise<void>((resolve) => { finish = resolve; });
		setTauriInvokeForTest(async <T>(command: string, args?: Record<string, unknown>) => {
			if (command === 'apply_ssealed_scaffold_to_repository') applyCalls += 1;
			await pending;
			return scaffoldResponse(args) as T;
		});
		const harness = createDialog();
		harness.dialog.openApplySsealedRepositoryDialog(target);
		harness.workspace.path = 'C:/other-workspace';
		finish();
		await settlePreview();
		expect(harness.dialog.ssealedPreview).toBeNull();
		await harness.dialog.applySsealedScaffoldToTarget();
		expect(applyCalls).toBe(0);
	});

	test('a previous apply cannot overwrite a reopened dialog or clear its busy state', async () => {
		const replies: (() => void)[] = [];
		setTauriInvokeForTest(async <T>(command: string, args?: Record<string, unknown>) => {
			if (command === 'apply_ssealed_scaffold_to_repository') {
				await new Promise<void>((resolve) => { replies.push(resolve); });
			}
			return scaffoldResponse(args, command === 'apply_ssealed_scaffold_to_repository') as T;
		});
		const harness = createDialog();
		harness.dialog.openApplySsealedRepositoryDialog(target);
		await settlePreview();
		const oldApply = harness.dialog.applySsealedScaffoldToTarget();
		harness.dialog.closeSsealedScaffoldDialog();
		harness.dialog.openApplySsealedRepositoryDialog(target);
		await settlePreview();
		const newApply = harness.dialog.applySsealedScaffoldToTarget();
		replies[0]!();
		await oldApply;
		expect(harness.dialog.isApplyingSsealed).toBe(true);
		expect(harness.dialog.ssealedPreview?.addedCount).toBe(0);
		expect(harness.status).toBeNull();
		replies[1]!();
		await newApply;
		expect(harness.dialog.isApplyingSsealed).toBe(false);
		expect(harness.dialog.ssealedPreview?.addedCount).toBe(2);
	});

	for (const order of ['old-first', 'new-first', 'old-error']) {
		test(`ignores the previous dialog preview after reopening the same repository (${order})`, async () => {
			const replies: (() => void)[] = [];
			setTauriInvokeForTest(async <T>(_command: string, args?: Record<string, unknown>) => {
				const request = replies.length;
				await new Promise<void>((resolve) => { replies.push(resolve); });
				if (order === 'old-error' && request === 0) {
					return { ok: false, error: 'project-folder-ssealed-scaffold-failed' } as T;
				}
				const response = scaffoldResponse(args);
				return { ...response, plan: { ...response.plan, missingCount: request + 1 } } as T;
			});
			const harness = createDialog();
			try {
				harness.dialog.openApplySsealedRepositoryDialog(target);
				harness.dialog.closeSsealedScaffoldDialog();
				harness.dialog.openApplySsealedRepositoryDialog(target);
				expect(replies.length).toBe(2);
				if (order === 'new-first') {
					replies[1]!();
					await settlePreview();
					expect(harness.dialog.ssealedPreview?.missingCount).toBe(2);
					replies[0]!();
					await settlePreview();
					expect(harness.dialog.ssealedPreview?.missingCount).toBe(2);
				} else {
					replies[0]!();
					await settlePreview();
					expect(harness.dialog.isPreviewingSsealed).toBe(true);
					expect(harness.dialog.ssealedPreview).toBeNull();
					expect(harness.error).toBeNull();
					replies[1]!();
					await settlePreview();
					expect(harness.dialog.ssealedPreview?.missingCount).toBe(2);
				}
			} finally {
				for (const reply of replies) reply();
				await settlePreview();
			}
		});
	}

	test('rejects an unavailable repository before opening or requesting native preview', () => {
		let calls = 0;
		setTauriInvokeForTest(async <T>() => { calls += 1; return {} as T; });
		const harness = createDialog(false);
		harness.dialog.openApplySsealedRepositoryDialog({ ...target, repository: { ...repository, path: null } });
		expect(harness.error).toBe('project-repository-path-required');
		expect(harness.opened).toBe(0);
		expect(harness.dialog.ssealedTarget).toBeNull();
		expect(calls).toBe(0);
	});

	test('keeps the selected profile preview when an older response arrives and ignores closed results', async () => {
		const replies: (() => void)[] = [];
		setTauriInvokeForTest(async <T>(_command: string, args?: Record<string, unknown>) => {
			await new Promise<void>((resolve) => { replies.push(resolve); });
			return scaffoldResponse(args) as T;
		});
		const { dialog } = createDialog();
		dialog.openApplySsealedRepositoryDialog(target);
		dialog.selectSsealedScaffoldApplyProfile('desktop-app');
		expect(replies.length).toBe(2);
		replies[1]!();
		await settlePreview();
		expect(dialog.ssealedPreview?.profile).toBe('desktop-app');
		replies[0]!();
		await settlePreview();
		expect(dialog.ssealedPreview?.profile).toBe('desktop-app');
		expect(dialog.canApplySsealedScaffold).toBe(true);
		const refresh = dialog.refreshSsealedScaffoldPreview();
		dialog.closeSsealedScaffoldDialog();
		replies[2]!();
		await refresh;
		expect(dialog.ssealedPreview).toBeNull();
		expect(dialog.isPreviewingSsealed).toBe(false);
	});

	test('runs apply once, holds the dialog open while busy, and reports skipped conflicts', async () => {
		let finishApply!: () => void;
		const pendingApply = new Promise<void>((resolve) => { finishApply = resolve; });
		let applyCalls = 0;
		setTauriInvokeForTest(async <T>(command: string, args?: Record<string, unknown>) => {
			if (command === 'apply_ssealed_scaffold_to_repository') {
				applyCalls += 1;
				expect(args?.workspacePath).toBe('C:/workspace');
				expect(args?.path).toBe(repository.path);
				await pendingApply;
			}
			return scaffoldResponse(args, command === 'apply_ssealed_scaffold_to_repository') as T;
		});
		const harness = createDialog();
		harness.dialog.openApplySsealedRepositoryDialog(target);
		await settlePreview();
		const applying = harness.dialog.applySsealedScaffoldToTarget();
		await harness.dialog.applySsealedScaffoldToTarget();
		const backdrop = {};
		harness.dialog.closeSsealedScaffoldDialogFromBackdrop({ target: backdrop, currentTarget: backdrop } as MouseEvent);
		expect(applyCalls).toBe(1);
		expect(harness.dialog.ssealedTarget).not.toBeNull();
		expect(harness.dialog.canApplySsealedScaffold).toBe(false);
		finishApply();
		await applying;
		expect(harness.dialog.isApplyingSsealed).toBe(false);
		expect(harness.dialog.ssealedPreview?.conflictCount).toBe(1);
		expect(harness.status).toBe(getWorkduckMessages('en').projects.ssealedScaffold
			.appliedWithSkippedConflictsSummary.replace('{added}', '2').replace('{conflicts}', '1'));
	});
});
