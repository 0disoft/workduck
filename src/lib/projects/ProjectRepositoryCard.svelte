<script lang="ts">
	import { getProjectFormErrorMessage } from './project-board-errors';
	import {
		getRepositoryActionButtonLabel,
		getRepositoryOperationMessage,
		type ProjectRepositoryGitAction,
		type ProjectRepositoryOperation
	} from './project-board-operations';
	import type { ProjectRepositoryGitStatus } from './project-board-selectors';
	import type { ProjectNodeRecord, ProjectRepositoryLinkRecord } from './project-registry';

	interface Props {
		readonly node: ProjectNodeRecord;
		readonly repository: ProjectRepositoryLinkRecord;
		readonly repositoryOperation: ProjectRepositoryOperation | null;
		readonly repositoryGitStatus: ProjectRepositoryGitStatus | undefined;
		readonly repositoryBusy: boolean;
		readonly repositoryPathOutsideWorkspace: boolean;
		readonly repositoryGithubCredentialName: string;
		readonly repositoryCardKind: string;
		readonly canCloneRepository: boolean;
		readonly canInitializeRepository: boolean;
		readonly canPublishRepositoryToGithub: boolean;
		readonly canFetchRepository: boolean;
		readonly canPullRepository: boolean;
		readonly canPushRepository: boolean;
		readonly isRepositoryOperationRunning: (name: ProjectRepositoryOperation['name']) => boolean;
		readonly onContextMenu: (event: MouseEvent) => void;
		readonly onClone: () => Promise<void>;
		readonly onInitialize: () => Promise<void>;
		readonly onPublish: () => void;
		readonly onGitAction: (action: ProjectRepositoryGitAction) => Promise<void>;
	}

	let {
		repository,
		repositoryOperation,
		repositoryGitStatus,
		repositoryBusy,
		repositoryPathOutsideWorkspace,
		repositoryGithubCredentialName,
		repositoryCardKind,
		canCloneRepository,
		canInitializeRepository,
		canPublishRepositoryToGithub,
		canFetchRepository,
		canPullRepository,
		canPushRepository,
		isRepositoryOperationRunning,
		onContextMenu,
		onClone,
		onInitialize,
		onPublish,
		onGitAction
	}: Props = $props();
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<article
	class="workduck-project-card workduck-repository-card"
	class:workduck-repository-card-busy={repositoryBusy}
	oncontextmenu={onContextMenu}
>
	<div class="workduck-project-card-header">
		<strong class="workduck-project-card-name">{repository.name}</strong>
		<span class="workduck-project-card-kind">{repositoryCardKind}</span>
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
			Repository path must stay inside this workspace.
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
			{getRepositoryOperationMessage(repositoryOperation)}
		</p>
	{:else if repositoryGitStatus?.error !== null && repositoryGitStatus?.error !== undefined}
		<p
			class="workduck-repository-operation-status workduck-repository-operation-status-failed"
			role="alert"
			aria-live="polite"
		>
			{getProjectFormErrorMessage(repositoryGitStatus.error)}
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
				{getRepositoryActionButtonLabel(repositoryOperation, 'init', 'Init')}
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
		{/if}
	</div>
</article>
