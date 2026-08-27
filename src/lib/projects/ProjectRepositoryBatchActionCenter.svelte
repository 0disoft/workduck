<script lang="ts">
	import type { WorkduckMessages } from '$lib/i18n/workduck-message-contract';
	import type { WorkduckLanguageId } from '$lib/i18n/workduck-language';
	import { getActiveWorkspace } from '$lib/workspaces/workspace-registry';
	import { readWorkspaceRegistryFromBrowser } from '$lib/workspaces/workspace-storage';
	import './project-repository-batch.css';
	import {
		createProjectRepositoryBatchFailure,
		createProjectRepositoryBatchSkip,
		createProjectRepositoryBatchSuccess,
		PROJECT_REPOSITORY_BATCH_DEFAULT_CONCURRENCY,
		PROJECT_REPOSITORY_BATCH_MAX_CONCURRENCY,
		projectRepositoryBatchActions,
		runBoundedProjectRepositoryBatch,
		waitForProjectRepositoryTaskRun,
		type ProjectRepositoryBatchAction,
		type ProjectRepositoryBatchItemState,
		type ProjectRepositoryBatchOutcome,
		type ProjectRepositoryBatchProgress
	} from './project-repository-batch';
	import {
		formatProjectRepositoryBatchMessage,
		getProjectRepositoryBatchErrorMessage,
		getProjectRepositoryBatchMessages
	} from './project-repository-batch-messages';
	import type {
		ProjectRepositoryGitAction,
		ProjectRepositoryOperation
	} from './project-board-operations';
	import { runProjectRepositoryTask } from './project-repository-task';
	import type {
		ProjectNodeRecord,
		ProjectRepositoryLinkRecord
	} from './project-registry';

	interface ProjectRepositoryBatchItemView {
		readonly repositoryId: string;
		readonly repositoryName: string;
		readonly state: ProjectRepositoryBatchItemState;
		readonly error: string | null;
	}

	interface Props {
		readonly node: ProjectNodeRecord;
		readonly visibleRepositories: readonly ProjectRepositoryLinkRecord[];
		readonly selectedRepositories: readonly ProjectRepositoryLinkRecord[];
		readonly projectMessages: WorkduckMessages['projects'];
		readonly languageId: WorkduckLanguageId;
		readonly getRepositoryOperation: (
			repositoryId: string
		) => ProjectRepositoryOperation | null;
		readonly isRepositoryBusy: (repositoryId: string) => boolean;
		readonly canRunRemoteRepositoryGitAction: (
			repository: ProjectRepositoryLinkRecord,
			action: ProjectRepositoryGitAction
		) => boolean;
		readonly onGitAction: (
			node: ProjectNodeRecord,
			repository: ProjectRepositoryLinkRecord,
			action: ProjectRepositoryGitAction
		) => Promise<void>;
		readonly onSelectVisible: () => void;
		readonly onClearSelection: () => void;
		readonly onRepositorySelectionChange: (repositoryId: string, selected: boolean) => void;
		readonly onRunningChange: (running: boolean) => void;
	}

	let {
		node,
		visibleRepositories,
		selectedRepositories,
		projectMessages,
		languageId,
		getRepositoryOperation,
		isRepositoryBusy,
		canRunRemoteRepositoryGitAction,
		onGitAction,
		onSelectVisible,
		onClearSelection,
		onRepositorySelectionChange,
		onRunningChange
	}: Props = $props();

	let concurrency = $state(PROJECT_REPOSITORY_BATCH_DEFAULT_CONCURRENCY);
	let activeAction = $state<ProjectRepositoryBatchAction | null>(null);
	let lastAction = $state<ProjectRepositoryBatchAction | null>(null);
	let batchItems = $state<readonly ProjectRepositoryBatchItemView[]>([]);
	let batchSequence = 0;

	let messages = $derived(getProjectRepositoryBatchMessages(languageId));
	let selectedRepositoryIds = $derived(
		new Set(selectedRepositories.map((repository) => repository.id))
	);
	let completedCount = $derived(
		batchItems.filter((item) => item.state !== 'queued' && item.state !== 'running').length
	);
	let succeededCount = $derived(
		batchItems.filter((item) => item.state === 'succeeded').length
	);
	let failedCount = $derived(batchItems.filter((item) => item.state === 'failed').length);
	let skippedCount = $derived(batchItems.filter((item) => item.state === 'skipped').length);
	let selectedCountLabel = $derived(
		formatProjectRepositoryBatchMessage(messages.selectedCount, {
			selected: selectedRepositories.length,
			visible: visibleRepositories.length
		})
	);
	let progressLabel = $derived(
		formatProjectRepositoryBatchMessage(messages.progress, {
			completed: completedCount,
			total: batchItems.length
		})
	);
	let summaryLabel = $derived(
		formatProjectRepositoryBatchMessage(messages.summary, {
			succeeded: succeededCount,
			failed: failedCount,
			skipped: skippedCount
		})
	);

	function handleRepositorySelectionChange(repositoryId: string, event: Event) {
		onRepositorySelectionChange(
			repositoryId,
			(event.currentTarget as HTMLInputElement).checked
		);
	}

	function handleConcurrencyChange(event: Event) {
		const nextConcurrency = Number.parseInt(
			(event.currentTarget as HTMLSelectElement).value,
			10
		);

		concurrency = Number.isFinite(nextConcurrency)
			? Math.min(PROJECT_REPOSITORY_BATCH_MAX_CONCURRENCY, Math.max(1, nextConcurrency))
			: PROJECT_REPOSITORY_BATCH_DEFAULT_CONCURRENCY;
	}

	function canRunBatchAction(action: ProjectRepositoryBatchAction) {
		if (activeAction !== null || selectedRepositories.length === 0) {
			return false;
		}

		if (isProjectRepositoryGitBatchAction(action)) {
			return selectedRepositories.some(
				(repository) =>
					!isRepositoryBusy(repository.id) &&
					canRunRemoteRepositoryGitAction(repository, action)
			);
		}

		return selectedRepositories.some(
			(repository) => repository.path !== null && !isRepositoryBusy(repository.id)
		);
	}

	async function runBatchAction(action: ProjectRepositoryBatchAction) {
		if (!canRunBatchAction(action)) {
			return;
		}

		const repositories = [...selectedRepositories];

		if (
			action === 'update-dependencies' &&
			typeof window !== 'undefined' &&
			!window.confirm(
				formatProjectRepositoryBatchMessage(messages.confirmUpdateDependencies, {
					count: repositories.length
				})
			)
		) {
			return;
		}

		const workspacePath = readActiveWorkspacePath();
		const sequence = ++batchSequence;
		activeAction = action;
		lastAction = action;
		batchItems = repositories.map((repository) => ({
			repositoryId: repository.id,
			repositoryName: repository.name,
			state: 'queued',
			error: null
		}));
		onRunningChange(true);

		try {
			await runBoundedProjectRepositoryBatch(repositories, {
				concurrency,
				execute: (repository) =>
					executeRepositoryBatchAction(action, repository, workspacePath),
				onProgress: (progress) => updateBatchItemProgress(sequence, progress)
			});
		} finally {
			if (sequence === batchSequence) {
				activeAction = null;
				onRunningChange(false);
			}

		}
	}

	async function executeRepositoryBatchAction(
		action: ProjectRepositoryBatchAction,
		repository: ProjectRepositoryLinkRecord,
		workspacePath: string | null
	): Promise<ProjectRepositoryBatchOutcome> {
		if (isRepositoryBusy(repository.id)) {
			return createProjectRepositoryBatchSkip('project-repository-batch-repository-busy');
		}

		if (isProjectRepositoryGitBatchAction(action)) {
			return executeRepositoryGitBatchAction(repository, action);
		}

		if (workspacePath === null) {
			return createProjectRepositoryBatchFailure(
				'project-repository-batch-workspace-unavailable'
			);
		}

		if (repository.path === null) {
			return createProjectRepositoryBatchSkip(
				'project-repository-batch-repository-path-missing'
			);
		}

		const result = await runProjectRepositoryTask({
			workspacePath,
			repositoryPath: repository.path,
			task: action
		});

		if (!result.ok) {
			if (result.error === 'project-repository-task-command-unavailable') {
				return createProjectRepositoryBatchSkip(result.error);
			}

			return createProjectRepositoryBatchFailure(result.error);
		}

		if (result.runRecord === null) {
			return createProjectRepositoryBatchFailure(
				'project-repository-batch-operation-not-started'
			);
		}

		return waitForProjectRepositoryTaskRun({
			workspacePath,
			runRecordId: result.runRecord.id
		});
	}

	async function executeRepositoryGitBatchAction(
		repository: ProjectRepositoryLinkRecord,
		action: ProjectRepositoryGitAction
	): Promise<ProjectRepositoryBatchOutcome> {
		if (!canRunRemoteRepositoryGitAction(repository, action)) {
			return createProjectRepositoryBatchSkip(
				'project-repository-batch-action-unavailable'
			);
		}

		const previousOperationId = getRepositoryOperation(repository.id)?.id ?? null;
		await onGitAction(node, repository, action);
		const operation = getRepositoryOperation(repository.id);

		if (
			operation === null ||
			operation.id === previousOperationId ||
			operation.name !== action
		) {
			return createProjectRepositoryBatchFailure(
				'project-repository-batch-operation-not-started'
			);
		}

		if (operation.state === 'succeeded') {
			return createProjectRepositoryBatchSuccess();
		}

		return createProjectRepositoryBatchFailure(
			operation.error ?? 'project-repository-batch-operation-failed'
		);
	}

	function updateBatchItemProgress(
		sequence: number,
		progress: ProjectRepositoryBatchProgress<ProjectRepositoryLinkRecord>
	) {
		if (sequence !== batchSequence) {
			return;
		}

		batchItems = batchItems.map((item, index) =>
			index === progress.index
				? {
						repositoryId: item.repositoryId,
						repositoryName: item.repositoryName,
						state: progress.state,
						error: progress.outcome?.error ?? null
					}
				: item
		);
	}

	function getBatchItemErrorMessage(error: string) {
		return getProjectRepositoryBatchErrorMessage(
			error,
			languageId,
			projectMessages.errors
		);
	}

	function readActiveWorkspacePath() {
		return getActiveWorkspace(readWorkspaceRegistryFromBrowser().registry)?.path ?? null;
	}

	function isProjectRepositoryGitBatchAction(
		action: ProjectRepositoryBatchAction
	): action is Extract<ProjectRepositoryBatchAction, ProjectRepositoryGitAction> {
		return action === 'fetch' || action === 'pull';
	}
</script>

<section class="workduck-repository-batch-panel" aria-label={messages.title}>
	<div class="workduck-repository-batch-header">
		<div class="workduck-repository-batch-heading">
			<strong>{messages.title}</strong>
			<span>{selectedCountLabel}</span>
		</div>
		<div class="workduck-repository-batch-selection-actions">
			<button
				class="workduck-repository-action-button"
				type="button"
				disabled={activeAction !== null ||
					visibleRepositories.length === 0 ||
					selectedRepositories.length === visibleRepositories.length}
				onclick={onSelectVisible}
			>
				{messages.selectVisible}
			</button>
			<button
				class="workduck-repository-action-button"
				type="button"
				disabled={activeAction !== null || selectedRepositories.length === 0}
				onclick={onClearSelection}
			>
				{messages.clearSelection}
			</button>
		</div>
	</div>

	<div class="workduck-repository-batch-selection-list" role="group" aria-label={messages.title}>
		{#each visibleRepositories as repository (repository.id)}
			<label class="workduck-repository-batch-selection-item">
				<input
					class="workduck-repository-batch-checkbox"
					type="checkbox"
					checked={selectedRepositoryIds.has(repository.id)}
					disabled={activeAction !== null}
					aria-label={formatProjectRepositoryBatchMessage(messages.selectRepository, {
						repository: repository.name
					})}
					onchange={(event) => handleRepositorySelectionChange(repository.id, event)}
				/>
				<span class="workduck-repository-batch-selection-name">{repository.name}</span>
				{#if repository.path !== null}
					<span class="workduck-repository-batch-selection-path" title={repository.path}>
						{repository.path}
					</span>
				{/if}
			</label>
		{/each}
	</div>

	<div class="workduck-repository-batch-controls">
		<label class="workduck-repository-batch-concurrency">
			<span>{messages.concurrency}</span>
			<select
				class="workduck-input"
				value={concurrency}
				disabled={activeAction !== null}
				onchange={handleConcurrencyChange}
			>
				{#each Array.from(
					{ length: PROJECT_REPOSITORY_BATCH_MAX_CONCURRENCY },
					(_, index) => index + 1
				) as option}
					<option value={option}>{option}</option>
				{/each}
			</select>
		</label>
		<div class="workduck-repository-batch-action-buttons">
			{#each projectRepositoryBatchActions as action (action)}
				<button
					class="workduck-repository-action-button"
					class:workduck-repository-batch-action-active={activeAction === action}
					type="button"
					disabled={!canRunBatchAction(action)}
					onclick={() => void runBatchAction(action)}
				>
					{messages.actions[action]}
				</button>
			{/each}
		</div>
	</div>

	{#if batchItems.length === 0}
		<p class="workduck-repository-batch-empty">{messages.noSelection}</p>
	{:else}
		<div class="workduck-repository-batch-progress" aria-live="polite">
			<progress max={batchItems.length} value={completedCount}></progress>
			<span>{progressLabel}</span>
		</div>
		<p
			class="workduck-repository-batch-summary"
			class:workduck-repository-batch-summary-failed={failedCount > 0}
			role={failedCount > 0 ? 'alert' : 'status'}
		>
			{#if lastAction !== null}
				<strong>{messages.actions[lastAction]}</strong>
			{/if}
			<span>{summaryLabel}</span>
		</p>
		<ol class="workduck-repository-batch-results">
			{#each batchItems as item (item.repositoryId)}
				<li data-state={item.state}>
					<span class="workduck-repository-batch-result-name">{item.repositoryName}</span>
					<span class="workduck-repository-batch-result-state">
						{messages.states[item.state]}
					</span>
					{#if item.error !== null}
						<span class="workduck-repository-batch-result-error">
							{getBatchItemErrorMessage(item.error)}
						</span>
					{/if}
				</li>
			{/each}
		</ol>
	{/if}
</section>
