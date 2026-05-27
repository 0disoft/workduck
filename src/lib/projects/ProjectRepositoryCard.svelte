<script lang="ts">
	import type { WorkduckMessages } from '$lib/i18n/workduck-message-contract';
	import type { WorkduckLanguageId } from '$lib/i18n/workduck-language';
	import { getProjectFormErrorMessage } from './project-board-errors';
	import {
		getRepositoryActionButtonLabel,
		getRepositoryOperationFinishedAtLabel,
		getRepositoryOperationMessage,
		type ProjectRepositoryGitAction,
		type ProjectRepositoryOperation
	} from './project-board-operations';
	import {
		getRepositoryTaskRunFinishedAtLabel,
		getRepositoryTaskRunMessage
	} from './project-repository-task-runs';
	import type { ProjectRepositoryGitStatus } from './project-board-selectors';
	import type { ProjectRepositoryTaskRunRecord } from './project-repository-task';
	import type { ProjectNodeRecord, ProjectRepositoryLinkRecord } from './project-registry';

	interface Props {
		readonly node: ProjectNodeRecord;
		readonly repository: ProjectRepositoryLinkRecord;
		readonly projectMessages: WorkduckMessages['projects'];
		readonly languageId: WorkduckLanguageId;
		readonly repositoryOperation: ProjectRepositoryOperation | null;
		readonly repositoryTaskRun: ProjectRepositoryTaskRunRecord | null;
		readonly repositoryGitStatus: ProjectRepositoryGitStatus | undefined;
		readonly repositoryBusy: boolean;
		readonly repositoryPathOutsideWorkspace: boolean;
		readonly repositoryGithubCredentialName: string;
		readonly repositoryCardKind: string;
		readonly canCloneRepository: boolean;
		readonly canInitializeRepository: boolean;
		readonly canPublishRepositoryToGithub: boolean;
		readonly canQueueCommitWorkOrder: boolean;
		readonly canFetchRepository: boolean;
		readonly canPullRepository: boolean;
		readonly canPushRepository: boolean;
		readonly isRepositoryOperationRunning: (name: ProjectRepositoryOperation['name']) => boolean;
		readonly onContextMenu: (event: MouseEvent) => void;
		readonly onClone: () => Promise<void>;
		readonly onInitialize: () => Promise<void>;
		readonly onPublish: () => void;
		readonly onQueueCommitWorkOrder: () => Promise<void>;
		readonly onGitAction: (action: ProjectRepositoryGitAction) => Promise<void>;
	}

	let {
		repository,
		projectMessages,
		languageId,
		repositoryOperation,
		repositoryTaskRun,
		repositoryGitStatus,
		repositoryBusy,
		repositoryPathOutsideWorkspace,
		repositoryGithubCredentialName,
		repositoryCardKind,
		canCloneRepository,
		canInitializeRepository,
		canPublishRepositoryToGithub,
		canQueueCommitWorkOrder,
		canFetchRepository,
		canPullRepository,
		canPushRepository,
		isRepositoryOperationRunning,
		onContextMenu,
		onClone,
		onInitialize,
		onPublish,
		onQueueCommitWorkOrder,
		onGitAction
	}: Props = $props();

	let repositoryOperationFinishedAtLabel = $derived(
		repositoryOperation === null
			? null
			: getRepositoryOperationFinishedAtLabel(
					repositoryOperation,
					projectMessages.lastRepositoryOperation,
					languageId
				)
	);
	let repositoryTaskRunFinishedAtLabel = $derived(
		repositoryTaskRun === null
			? null
			: getRepositoryTaskRunFinishedAtLabel(
					repositoryTaskRun,
					projectMessages.lastRepositoryOperation,
					languageId
				)
	);
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<article
	class="workduck-project-card workduck-repository-card"
	class:workduck-repository-card-busy={repositoryBusy}
	aria-busy={repositoryBusy}
	oncontextmenu={onContextMenu}
>
	<div class="workduck-project-card-header">
		<strong class="workduck-project-card-name">{repository.name}</strong>
		<span class="workduck-project-card-kind">{repositoryCardKind}</span>
		{#if repositoryBusy}
			<span class="workduck-repository-busy-indicator" aria-hidden="true"></span>
		{/if}
	</div>
	{#if repository.tags.length > 0}
		<div class="workduck-project-tag-list" aria-label={`${repository.name} tags`}>
			{#each repository.tags as tag (tag)}
				<span class="workduck-project-tag">{tag}</span>
			{/each}
		</div>
	{/if}
	{#if repositoryGithubCredentialName !== 'System Git'}
		<p class="workduck-project-card-description">GitHub: {repositoryGithubCredentialName}</p>
	{/if}
	{#if repositoryPathOutsideWorkspace}
		<p class="workduck-repository-operation-status workduck-repository-operation-status-failed">
			{getProjectFormErrorMessage('project-repository-path-outside-workspace', projectMessages.errors)}
		</p>
	{:else if repositoryTaskRun !== null &&
		(repositoryOperation === null ||
			new Date(repositoryTaskRun.startedAt).getTime() >= new Date(repositoryOperation.startedAt).getTime())}
		<p
			class="workduck-repository-operation-status"
			class:workduck-repository-operation-status-running={repositoryTaskRun.state === 'running'}
			class:workduck-repository-operation-status-failed={repositoryTaskRun.state === 'failed'}
			class:workduck-repository-operation-status-succeeded={repositoryTaskRun.state === 'succeeded'}
			role={repositoryTaskRun.state === 'failed' ? 'alert' : 'status'}
			aria-live="polite"
		>
			<span class="workduck-repository-operation-status-text">
				{getRepositoryTaskRunMessage(repositoryTaskRun, projectMessages.repositoryTasks)}
			</span>
			{#if repositoryTaskRunFinishedAtLabel !== null}
				<span class="workduck-repository-operation-status-time">
					{repositoryTaskRunFinishedAtLabel}
				</span>
			{/if}
		</p>
	{:else if repositoryOperation !== null}
		<p
			class="workduck-repository-operation-status"
			class:workduck-repository-operation-status-running={repositoryOperation.state === 'running'}
			class:workduck-repository-operation-status-failed={repositoryOperation.state === 'failed'}
			class:workduck-repository-operation-status-succeeded={repositoryOperation.state === 'succeeded'}
			role={repositoryOperation.state === 'failed' ? 'alert' : 'status'}
			aria-live="polite"
		>
			<span class="workduck-repository-operation-status-text">
				{getRepositoryOperationMessage(repositoryOperation, projectMessages)}
			</span>
			{#if repositoryOperationFinishedAtLabel !== null}
				<span class="workduck-repository-operation-status-time">
					{repositoryOperationFinishedAtLabel}
				</span>
			{/if}
		</p>
	{:else if repositoryGitStatus?.error !== null && repositoryGitStatus?.error !== undefined}
		<p
			class="workduck-repository-operation-status workduck-repository-operation-status-failed"
			role="alert"
			aria-live="polite"
		>
			{getProjectFormErrorMessage(repositoryGitStatus.error, projectMessages.errors)}
		</p>
	{:else if repositoryGitStatus?.hasUncommittedChanges === true}
		<p
			class="workduck-repository-operation-status workduck-repository-operation-status-warning"
			role="status"
			aria-live="polite"
		>
			{projectMessages.repository.uncommittedChanges}
		</p>
	{/if}
	<div class="workduck-repository-card-actions" aria-label={`${repository.name} actions`}>
		{#if canCloneRepository || isRepositoryOperationRunning('clone')}
			<button
				class="workduck-repository-action-button"
				type="button"
				disabled={repositoryBusy}
				onclick={() => void onClone()}
			>
				{getRepositoryActionButtonLabel(repositoryOperation, 'clone', 'Clone')}
			</button>
		{/if}
		{#if canInitializeRepository || isRepositoryOperationRunning('init')}
			<button
				class="workduck-repository-action-button"
				type="button"
				disabled={repositoryBusy}
				onclick={() => void onInitialize()}
			>
				{getRepositoryActionButtonLabel(repositoryOperation, 'init', 'Git Init')}
			</button>
		{/if}
		{#if canPublishRepositoryToGithub || isRepositoryOperationRunning('publish')}
			<button
				class="workduck-repository-action-button"
				type="button"
				disabled={repositoryBusy}
				onclick={onPublish}
			>
				{getRepositoryActionButtonLabel(repositoryOperation, 'publish', 'Publish')}
			</button>
		{/if}
		{#if canFetchRepository ||
			canPullRepository ||
			canPushRepository ||
			canQueueCommitWorkOrder ||
			isRepositoryOperationRunning('fetch') ||
			isRepositoryOperationRunning('pull') ||
			isRepositoryOperationRunning('push')}
			<button
				class="workduck-repository-action-button"
				type="button"
				disabled={repositoryBusy || !canFetchRepository}
				onclick={() => void onGitAction('fetch')}
			>
				{getRepositoryActionButtonLabel(repositoryOperation, 'fetch', 'Fetch')}
			</button>
			<button
				class="workduck-repository-action-button"
				type="button"
				disabled={repositoryBusy || !canPullRepository}
				onclick={() => void onGitAction('pull')}
			>
				{getRepositoryActionButtonLabel(repositoryOperation, 'pull', 'Pull')}
			</button>
			<button
				class="workduck-repository-action-button"
				type="button"
				disabled={repositoryBusy || !canPushRepository}
				onclick={() => void onGitAction('push')}
			>
				{getRepositoryActionButtonLabel(repositoryOperation, 'push', 'Push')}
			</button>
			{#if canQueueCommitWorkOrder}
				<button
					class="workduck-repository-action-button"
					type="button"
					disabled={repositoryBusy}
					onclick={() => void onQueueCommitWorkOrder()}
				>
					{projectMessages.repository.queueCommitWorkOrder}
				</button>
			{/if}
		{/if}
	</div>
</article>
