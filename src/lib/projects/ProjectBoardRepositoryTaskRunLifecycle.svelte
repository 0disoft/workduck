<script lang="ts">
	import type { WorkspaceRecord } from '$lib/workspaces/workspace-registry';
	import {
		readProjectRepositoryTaskRunRecords,
		subscribeProjectRepositoryTaskRunChanges
	} from './project-repository-task';
	import {
		mapLatestTaskRunsByRepositoryId,
		type ProjectRepositoryTaskRunRecordByRepositoryId
	} from './project-repository-task-runs';
	import type { ProjectRepositoryLinkRecord } from './project-registry';

	const PROJECT_REPOSITORY_TASK_RUN_ACTIVE_REFRESH_MS = 2_000;
	const PROJECT_REPOSITORY_TASK_RUN_IDLE_REFRESH_MS = 30_000;
	const PROJECT_REPOSITORY_TASK_RUN_HIDDEN_REFRESH_MS = 60_000;

	interface Props {
		readonly workspace: WorkspaceRecord;
		readonly repositories: readonly ProjectRepositoryLinkRecord[];
		repositoryTaskRunById: ProjectRepositoryTaskRunRecordByRepositoryId;
	}

	let {
		workspace,
		repositories,
		repositoryTaskRunById = $bindable()
	}: Props = $props();

	let refreshNow: (() => void) | null = null;
	let lastKnownTaskRunStateSignature = '';

	const repositorySignature = $derived(
		`${workspace.id}|${repositories
			.map((repository) => `${repository.id}:${repository.path ?? ''}`)
			.join('|')}`
	);
	const taskRunStateSignature = $derived(createRepositoryTaskRunStateSignature(repositoryTaskRunById));

	$effect(() => {
		const workspacePath = workspace.path;
		const repositorySnapshot = repositories;
		const currentRepositorySignature = repositorySignature;
		let isCurrent = true;
		let refreshTimeoutId: number | undefined;
		let isRefreshingTaskRuns = false;
		let refreshRequestedWhileActive = false;

		void currentRepositorySignature;

		function clearRefreshTimeout() {
			if (refreshTimeoutId !== undefined) {
				window.clearTimeout(refreshTimeoutId);
				refreshTimeoutId = undefined;
			}
		}

		function scheduleRefresh(delayMs: number) {
			if (!isCurrent) {
				return;
			}

			clearRefreshTimeout();
			refreshTimeoutId = window.setTimeout(() => {
				refreshTimeoutId = undefined;
				void refresh();
			}, delayMs);
		}

		const refresh = async () => {
			if (isRefreshingTaskRuns) {
				refreshRequestedWhileActive = true;
				return;
			}

			isRefreshingTaskRuns = true;

			try {
				const result = await readProjectRepositoryTaskRunRecords(workspacePath);

				if (!isCurrent) {
					return;
				}

				if (!result.ok) {
					scheduleRefresh(getRepositoryTaskRunRefreshDelayMs(repositoryTaskRunById));
					return;
				}

				const nextTaskRunById = mapLatestTaskRunsByRepositoryId(
					repositorySnapshot,
					result.records
				);
				lastKnownTaskRunStateSignature =
					createRepositoryTaskRunStateSignature(nextTaskRunById);
				repositoryTaskRunById = nextTaskRunById;
				scheduleRefresh(getRepositoryTaskRunRefreshDelayMs(nextTaskRunById));
			} finally {
				isRefreshingTaskRuns = false;

				if (refreshRequestedWhileActive && isCurrent) {
					refreshRequestedWhileActive = false;
					clearRefreshTimeout();
					void refresh();
				}
			}
		};

		const refreshNowForLifecycle = () => {
			clearRefreshTimeout();
			void refresh();
		};
		refreshNow = refreshNowForLifecycle;

		const handleVisibilityChange = () => {
			if (document.visibilityState === 'visible') {
				refreshNowForLifecycle();
				return;
			}

			scheduleRefresh(PROJECT_REPOSITORY_TASK_RUN_HIDDEN_REFRESH_MS);
		};
		const unsubscribeTaskRunChanges = subscribeProjectRepositoryTaskRunChanges(
			workspacePath,
			() => refreshNowForLifecycle()
		);

		void refresh();
		document.addEventListener('visibilitychange', handleVisibilityChange);
		window.addEventListener('focus', refreshNowForLifecycle);

		return () => {
			isCurrent = false;
			if (refreshNow === refreshNowForLifecycle) {
				refreshNow = null;
			}
			clearRefreshTimeout();
			unsubscribeTaskRunChanges();
			document.removeEventListener('visibilitychange', handleVisibilityChange);
			window.removeEventListener('focus', refreshNowForLifecycle);
		};
	});

	$effect(() => {
		const currentTaskRunStateSignature = taskRunStateSignature;

		if (currentTaskRunStateSignature === lastKnownTaskRunStateSignature) {
			return;
		}

		lastKnownTaskRunStateSignature = currentTaskRunStateSignature;
		refreshNow?.();
	});

	function getRepositoryTaskRunRefreshDelayMs(
		recordsById: ProjectRepositoryTaskRunRecordByRepositoryId
	) {
		if (typeof document !== 'undefined' && document.visibilityState !== 'visible') {
			return PROJECT_REPOSITORY_TASK_RUN_HIDDEN_REFRESH_MS;
		}

		return hasRunningRepositoryTaskRun(recordsById)
			? PROJECT_REPOSITORY_TASK_RUN_ACTIVE_REFRESH_MS
			: PROJECT_REPOSITORY_TASK_RUN_IDLE_REFRESH_MS;
	}

	function hasRunningRepositoryTaskRun(
		recordsById: ProjectRepositoryTaskRunRecordByRepositoryId
	) {
		return Object.values(recordsById).some((record) => record.state === 'running');
	}

	function createRepositoryTaskRunStateSignature(
		recordsById: ProjectRepositoryTaskRunRecordByRepositoryId
	) {
		return Object.entries(recordsById)
			.map(
				([repositoryId, record]) =>
					`${repositoryId}:${record.id}:${record.state}:${record.finishedAt ?? ''}`
			)
			.sort()
			.join('|');
	}
</script>
