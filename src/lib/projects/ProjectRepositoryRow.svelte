<script lang="ts">
	import type { WorkduckMessages } from '#lib/i18n/workduck-message-contract.ts';
	import { getProjectFormErrorMessage } from './project-board-errors';
	import {
		getRepositoryOperationMessage,
		type ProjectRepositoryOperation
	} from './project-board-operations';
	import { getRepositoryTaskRunMessage } from './project-repository-task-runs';
	import type { ProjectRepositoryGitStatus } from './project-board-selectors';
	import type { ProjectRepositoryTaskRunRecord } from './project-repository-task';
	import type { ProjectRepositoryLinkRecord } from './project-registry';

	interface RepositoryRowChangePill {
		readonly label: string;
		readonly count: boolean;
	}

	interface RepositoryRowStatus {
		readonly text: string;
		readonly tone: 'running' | 'failed' | 'succeeded';
		readonly alert: boolean;
	}

	interface Props {
		readonly repository: ProjectRepositoryLinkRecord;
		readonly projectMessages: WorkduckMessages['projects'];
		readonly repositoryOperation: ProjectRepositoryOperation | null;
		readonly repositoryTaskRun: ProjectRepositoryTaskRunRecord | null;
		readonly repositoryGitStatus: ProjectRepositoryGitStatus | undefined;
		readonly repositoryBusy: boolean;
		readonly isOpeningFolder: boolean;
		readonly repositoryPathOutsideWorkspace: boolean;
		readonly canCloneRepository: boolean;
		readonly selected: boolean;
		readonly onOverlayIntent: () => void;
		readonly onSelect: () => void;
		readonly onFavoriteToggle: () => void;
		readonly onOpenFolder: () => Promise<void>;
		readonly onContextMenu: (event: MouseEvent) => void;
	}

	let {
		repository,
		projectMessages,
		repositoryOperation,
		repositoryTaskRun,
		repositoryGitStatus,
		repositoryBusy,
		isOpeningFolder,
		repositoryPathOutsideWorkspace,
		canCloneRepository,
		selected,
		onOverlayIntent,
		onSelect,
		onFavoriteToggle,
		onOpenFolder,
		onContextMenu
	}: Props = $props();

	let repositoryPathLabel = $derived(repository.path ?? repository.remoteUrl);

	let visibleRepositoryGitStatusError = $derived.by(() => {
		const error = repositoryGitStatus?.error ?? null;

		if (error === 'project-repository-git-path-not-found' && canCloneRepository) {
			return null;
		}

		return error;
	});

	let changePills = $derived.by(() => {
		const pills: RepositoryRowChangePill[] = [];
		const gitStatus = repositoryGitStatus;

		if (gitStatus?.hasUncommittedChanges === true) {
			pills.push({ label: projectMessages.repository.uncommittedChanges, count: false });
		}

		if (gitStatus !== undefined && gitStatus.behindCount > 0) {
			pills.push({ label: `↓${gitStatus.behindCount}`, count: true });
		}

		if (gitStatus !== undefined && gitStatus.aheadCount > 0) {
			pills.push({ label: `↑${gitStatus.aheadCount}`, count: true });
		}

		return pills;
	});

	let status = $derived.by((): RepositoryRowStatus | null => {
		if (repositoryPathOutsideWorkspace) {
			return {
				text: getProjectFormErrorMessage(
					'project-repository-path-outside-workspace',
					projectMessages.errors
				),
				tone: 'failed',
				alert: true
			};
		}

		const taskRunIsLatest =
			repositoryTaskRun !== null &&
			(repositoryOperation === null ||
				new Date(repositoryTaskRun.startedAt).getTime() >=
					new Date(repositoryOperation.startedAt).getTime());

		if (taskRunIsLatest && repositoryTaskRun !== null) {
			return {
				text: getRepositoryTaskRunMessage(repositoryTaskRun, projectMessages.repositoryTasks),
				tone: repositoryTaskRun.state === 'succeeded' ? 'succeeded' :
					repositoryTaskRun.state === 'running' ? 'running' : 'failed',
				alert: repositoryTaskRun.state === 'failed'
			};
		}

		if (repositoryOperation !== null) {
			return {
				text: getRepositoryOperationMessage(repositoryOperation, projectMessages),
				tone: repositoryOperation.state,
				alert: repositoryOperation.state === 'failed'
			};
		}

		if (visibleRepositoryGitStatusError !== null) {
			return {
				text: getProjectFormErrorMessage(
					visibleRepositoryGitStatusError,
					projectMessages.errors
				),
				tone: 'failed',
				alert: true
			};
		}

		return null;
	});

	function handleFavoriteToggle(event: MouseEvent) {
		event.stopPropagation();
		void onFavoriteToggle();
	}
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	class="workduck-repository-row"
	class:workduck-repository-row-selected={selected}
	onpointerenter={onOverlayIntent}
	oncontextmenu={onContextMenu}
>
	<button
		class="workduck-repository-row-select"
		type="button"
		aria-pressed={selected}
		onfocus={onOverlayIntent}
		onclick={onSelect}
	>
		<span class="workduck-repository-row-main">
			<span class="workduck-repository-row-title">
				<strong class="workduck-repository-row-name">{repository.name}</strong>
				{#if repositoryBusy}
					<span class="workduck-repository-busy-indicator" aria-hidden="true"></span>
				{/if}
			</span>
			{#if repositoryPathLabel !== null}
				<span class="workduck-repository-row-path" title={repositoryPathLabel}>
					{repositoryPathLabel}
				</span>
			{/if}
		</span>

		<span class="workduck-repository-row-facts">
			{#if repositoryGitStatus?.branch != null}
				<span class="workduck-repository-row-branch">{repositoryGitStatus.branch}</span>
			{/if}
			{#each changePills as pill (pill.label)}
				<span
					class="workduck-repository-row-change"
					class:workduck-repository-row-change-count={pill.count}
				>
					{pill.label}
				</span>
			{/each}
		</span>

		{#if status !== null}
			<span
				class="workduck-repository-row-state"
				class:workduck-repository-row-state-running={status.tone === 'running'}
				class:workduck-repository-row-state-succeeded={status.tone === 'succeeded'}
				class:workduck-repository-row-state-failed={status.tone === 'failed'}
				role={status.alert ? 'alert' : 'status'}
				aria-live="polite"
				title={status.text}
			>
				{status.text}
			</span>
		{/if}

	</button>

	<button
		class="workduck-repository-open-folder-button"
		type="button"
		aria-label={projectMessages.contextMenu.openFolder}
		title={projectMessages.contextMenu.openFolder}
		disabled={isOpeningFolder || repository.path === null ||
			repositoryGitStatus?.error === 'project-repository-git-path-not-found'}
		onfocus={onOverlayIntent}
		onclick={() => void onOpenFolder()}
	>
		<svg width="16" height="16" viewBox="0 0 24 24" fill="none"
			stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"
			aria-hidden="true">
			<path d="M3 10V6a2 2 0 0 1 2-2h4l2 3h8a2 2 0 0 1 2 2v1" />
			<path d="M3 10h18l-3 10H3a1 1 0 0 1-1-1l1-9Z" />
		</svg>
	</button>

	<button
		class="workduck-repository-favorite-button"
		class:workduck-repository-favorite-button-active={repository.favorite}
		type="button"
		aria-pressed={repository.favorite}
		aria-label={repository.favorite
			? projectMessages.repository.unfavorite
			: projectMessages.repository.favorite}
		title={repository.favorite
			? projectMessages.repository.unfavorite
			: projectMessages.repository.favorite}
		onclick={handleFavoriteToggle}
	>
		<span aria-hidden="true">★</span>
	</button>
</div>
