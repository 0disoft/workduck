<script lang="ts">
	/* llmnav/1 module
	id=workduck.projects.task-run-lifecycle
	role=Poll repository task run history within a workspace and repository mapping lifetime.
	owns=task run polling|refresh coalescing|visibility scheduling|task run result ownership
	excludes=native task execution|durable task history persistence|repository Git status scans
	search=task run polling|repository task refresh|task history visibility interval
	invariant=Metadata-only changes reuse polling; queued refreshes supersede older snapshots, and teardown removes listeners and timers.
	stability=architecture
	*/
	import { untrack } from 'svelte';
	import type { WorkspaceRecord } from '#lib/workspaces/workspace-registry.ts';
	import {
		readProjectRepositoryTaskRunRecords,
		subscribeProjectRepositoryTaskRunChanges
	} from './project-repository-task';
	import {
		createRepositoryTaskRunPathKey,
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
		JSON.stringify([
			workspace.id,
			workspace.path,
			repositories
				.filter((repository) => repository.path !== null)
				.map((repository) => [
					repository.id,
					createRepositoryTaskRunPathKey(repository.path ?? '')
				] as const)
				// Equal paths keep their order because the mapper uses the last repository for each path.
				.sort((left, right) => left[1] === right[1] ? 0 : left[1] < right[1] ? -1 : 1)
		])
	);
	const taskRunStateSignature = $derived(createRepositoryTaskRunStateSignature(repositoryTaskRunById));

	$effect(() => {
		const currentRepositorySignature = repositorySignature;
		const workspacePath = untrack(() => workspace.path);
		const repositorySnapshot = untrack(() => repositories);
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

				if (!isCurrent || refreshRequestedWhileActive) {
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
