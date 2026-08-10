<script lang="ts">
	import PageTitleRow from '$lib/ui/PageTitleRow.svelte';
	import StatusToast from '$lib/ui/StatusToast.svelte';
	import QueueFileList from './QueueFileList.svelte';
	import type { QueuePanelController } from './queue-panel-controller.svelte';
	import {
		queueExecutionFilterOptions,
		queueKindFilterOptions,
		queuePriorityFilterOptions,
		queueReadFilterOptions,
		queueSortOptions,
		type QueueCardEntry,
		type QueueKindFilter,
		type QueuePriorityFilter,
		type QueueSortOption
	} from './queue-panel-types';

	type QueueContextMenuComponent = typeof import('./QueueContextMenu.svelte').default;
	type QueueEvaluationDialogComponent = typeof import('./QueueEvaluationDialog.svelte').default;
	type QueuePromptPreviewDialogComponent = typeof import('./QueuePromptPreviewDialog.svelte').default;
	type QueueProposalDetailComponent = typeof import('./QueueProposalDetail.svelte').default;
	type QueueReportDetailComponent = typeof import('./QueueReportDetail.svelte').default;
	type QueueWorkOrderDetailComponent = typeof import('./QueueWorkOrderDetail.svelte').default;
	type QueueWorkOrderDialogComponent = typeof import('./QueueWorkOrderDialog.svelte').default;

	interface Props {
		readonly title: string;
		readonly controller: QueuePanelController;
	}

	let { title, controller }: Props = $props();

	let isAdvancedFiltersOpen = $state(false);
	let QueueContextMenu = $state<QueueContextMenuComponent | null>(null);
	let QueueEvaluationDialog = $state<QueueEvaluationDialogComponent | null>(null);
	let QueuePromptPreviewDialog = $state<QueuePromptPreviewDialogComponent | null>(null);
	let QueueProposalDetail = $state<QueueProposalDetailComponent | null>(null);
	let QueueReportDetail = $state<QueueReportDetailComponent | null>(null);
	let QueueWorkOrderDetail = $state<QueueWorkOrderDetailComponent | null>(null);
	let QueueWorkOrderDialog = $state<QueueWorkOrderDialogComponent | null>(null);
	let queueContextMenuLoad: Promise<void> | null = null;
	let queueEvaluationDialogLoad: Promise<void> | null = null;
	let queuePromptPreviewDialogLoad: Promise<void> | null = null;
	let queueProposalDetailLoad: Promise<void> | null = null;
	let queueReportDetailLoad: Promise<void> | null = null;
	let queueWorkOrderDetailLoad: Promise<void> | null = null;
	let queueWorkOrderDialogLoad: Promise<void> | null = null;
	let activeAdvancedFilterCount = $derived(
		[
			controller.queueReadFilter !== 'all',
			controller.queueKindFilter !== 'all',
			controller.queuePriorityFilter !== 'all',
			controller.queueSortOption !== 'created-desc'
		].filter(Boolean).length
	);
	let activeAdvancedFilterLabel = $derived(
		controller.messages.queue.activeFilterCount.replace(
			'{count}',
			String(activeAdvancedFilterCount)
		)
	);

	function loadQueueContextMenu() {
		if (QueueContextMenu !== null) {
			return Promise.resolve();
		}

		queueContextMenuLoad ??= import('./QueueContextMenu.svelte').then((module) => {
			QueueContextMenu = module.default;
		});

		return queueContextMenuLoad;
	}

	function loadQueueEvaluationDialog() {
		if (QueueEvaluationDialog !== null) {
			return Promise.resolve();
		}

		queueEvaluationDialogLoad ??= import('./QueueEvaluationDialog.svelte').then((module) => {
			QueueEvaluationDialog = module.default;
		});

		return queueEvaluationDialogLoad;
	}

	function loadQueuePromptPreviewDialog() {
		if (QueuePromptPreviewDialog !== null) {
			return Promise.resolve();
		}

		queuePromptPreviewDialogLoad ??= import('./QueuePromptPreviewDialog.svelte').then((module) => {
			QueuePromptPreviewDialog = module.default;
		});

		return queuePromptPreviewDialogLoad;
	}

	function loadQueueProposalDetail() {
		if (QueueProposalDetail !== null) {
			return Promise.resolve();
		}

		queueProposalDetailLoad ??= import('./QueueProposalDetail.svelte').then((module) => {
			QueueProposalDetail = module.default;
		});

		return queueProposalDetailLoad;
	}

	function loadQueueReportDetail() {
		if (QueueReportDetail !== null) {
			return Promise.resolve();
		}

		queueReportDetailLoad ??= import('./QueueReportDetail.svelte').then((module) => {
			QueueReportDetail = module.default;
		});

		return queueReportDetailLoad;
	}

	function loadQueueWorkOrderDetail() {
		if (QueueWorkOrderDetail !== null) {
			return Promise.resolve();
		}

		queueWorkOrderDetailLoad ??= import('./QueueWorkOrderDetail.svelte').then((module) => {
			QueueWorkOrderDetail = module.default;
		});

		return queueWorkOrderDetailLoad;
	}

	function loadQueueWorkOrderDialog() {
		if (QueueWorkOrderDialog !== null) {
			return Promise.resolve();
		}

		queueWorkOrderDialogLoad ??= import('./QueueWorkOrderDialog.svelte').then((module) => {
			QueueWorkOrderDialog = module.default;
		});

		return queueWorkOrderDialogLoad;
	}

	function preloadQueueCardSurface(file: QueueCardEntry) {
		if (file.kind === 'unsupported') {
			return;
		}

		void loadQueueContextMenu();

		if (file.kind === 'result-report') {
			void loadQueueReportDetail();
			return;
		}

		if (file.kind === 'proposal') {
			void loadQueueProposalDetail();
			return;
		}

		void loadQueueWorkOrderDetail();
	}

	$effect(() => {
		if (controller.selectedReport !== null) {
			void loadQueueReportDetail();
		}

		if (controller.selectedWorkOrder !== null) {
			void loadQueueWorkOrderDetail();
		}

		if (controller.selectedProposal !== null) {
			void loadQueueProposalDetail();
		}

		if (controller.queueContextMenu !== null) {
			void loadQueueContextMenu();
		}

		if (controller.evaluationDialog !== null) {
			void loadQueueEvaluationDialog();
		}

		if (controller.promptPreviews !== null) {
			void loadQueuePromptPreviewDialog();
		}

		if (controller.isNewWorkOrderDialogOpen) {
			void loadQueueWorkOrderDialog();
		}
	});
</script>

<section class="workduck-queue-panel" aria-label={controller.messages.navigation.queue}>
	<header class="workduck-page-header">
		<PageTitleRow {title} meta={controller.queueItemCountLabel} />
		<div class="workduck-page-actions workduck-queue-header-actions">
			<div class="workduck-queue-filters" aria-label={controller.messages.queue.executionFilters}>
				{#each queueExecutionFilterOptions as option}
					<button
						class="workduck-project-sync-filter-button"
						class:workduck-project-sync-filter-button-active={controller.queueExecutionFilter === option.id}
						type="button"
						aria-pressed={controller.queueExecutionFilter === option.id}
						onclick={() => (controller.queueExecutionFilter = option.id)}
					>
						{controller.getExecutionFilterLabel(option.id)}
					</button>
				{/each}
			</div>
			<details class="workduck-queue-advanced-filters" bind:open={isAdvancedFiltersOpen}>
				<summary
					class="workduck-queue-filter-summary"
					class:workduck-queue-filter-summary-active={isAdvancedFiltersOpen ||
						activeAdvancedFilterCount > 0}
					aria-label={activeAdvancedFilterCount > 0
						? `${controller.messages.queue.filterMenu}, ${activeAdvancedFilterLabel}`
						: controller.messages.queue.filterMenu}
				>
					<span>{controller.messages.queue.filterMenu}</span>
					{#if activeAdvancedFilterCount > 0}
						<span class="workduck-queue-filter-count" aria-hidden="true">
							{activeAdvancedFilterCount}
						</span>
					{/if}
				</summary>
				<div class="workduck-queue-filter-panel" aria-label={controller.messages.queue.filters}>
					<div class="workduck-queue-filter-panel-group">
						<span class="workduck-queue-filter-panel-label">
							{controller.messages.queue.readFilters}
						</span>
						<div class="workduck-queue-filters" aria-label={controller.messages.queue.readFilters}>
							{#each queueReadFilterOptions as option}
								<button
									class="workduck-project-sync-filter-button"
									class:workduck-project-sync-filter-button-active={controller.queueReadFilter ===
										option.id}
									type="button"
									aria-pressed={controller.queueReadFilter === option.id}
									onclick={() => (controller.queueReadFilter = option.id)}
								>
									{controller.getReadFilterLabel(option.id)}
								</button>
							{/each}
						</div>
					</div>
					<div class="workduck-queue-filter-selects">
						<label class="workduck-queue-filter-field" for="queue-kind-filter">
							<span class="workduck-queue-filter-panel-label">
								{controller.messages.queue.kindFilter}
							</span>
							<select
								id="queue-kind-filter"
								class="workduck-select workduck-queue-filter-select"
								aria-label={controller.messages.queue.kindFilter}
								value={controller.queueKindFilter}
								onchange={(event) =>
									(controller.queueKindFilter = event.currentTarget.value as QueueKindFilter)}
							>
								{#each queueKindFilterOptions as option}
									<option value={option.id}>{controller.getKindFilterLabel(option.id)}</option>
								{/each}
							</select>
						</label>
						<label class="workduck-queue-filter-field" for="queue-priority-filter">
							<span class="workduck-queue-filter-panel-label">
								{controller.messages.queue.priorityFilter}
							</span>
							<select
								id="queue-priority-filter"
								class="workduck-select workduck-queue-filter-select"
								aria-label={controller.messages.queue.priorityFilter}
								value={controller.queuePriorityFilter}
								onchange={(event) =>
									(controller.queuePriorityFilter = event.currentTarget.value as QueuePriorityFilter)}
							>
								{#each queuePriorityFilterOptions as option}
									<option value={option.id}>{controller.getQueuePriorityFilterLabel(option.id)}</option>
								{/each}
							</select>
						</label>
						<label class="workduck-queue-filter-field" for="queue-sort">
							<span class="workduck-queue-filter-panel-label">
								{controller.messages.queue.sort}
							</span>
							<select
								id="queue-sort"
								class="workduck-select workduck-queue-filter-select"
								aria-label={controller.messages.queue.sort}
								value={controller.queueSortOption}
								onchange={(event) =>
									(controller.queueSortOption = event.currentTarget.value as QueueSortOption)}
							>
								{#each queueSortOptions as option}
									<option value={option.id}>{controller.getQueueSortLabel(option.id)}</option>
								{/each}
							</select>
						</label>
					</div>
				</div>
			</details>
			<div class="workduck-queue-bulk-delete">
				<label class="workduck-queue-bulk-delete-option">
					<input
						type="checkbox"
						checked={controller.bulkDeleteIncludesPending}
						disabled={controller.isWriting}
						onchange={(event) =>
							(controller.bulkDeleteIncludesPending = event.currentTarget.checked)}
					/>
					<span>{controller.messages.queue.includePendingDelete}</span>
				</label>
				<button
					class="workduck-button workduck-button-danger"
					type="button"
					disabled={!controller.canBulkDeleteQueueFiles}
					onclick={() => void controller.handleBulkDeleteQueueFiles()}
				>
					{controller.messages.queue.bulkDelete}
				</button>
			</div>
			<button
				class="workduck-button workduck-button-secondary"
				type="button"
				aria-keyshortcuts="F5"
				disabled={controller.isRefreshing}
				onclick={() => void controller.refreshQueueFiles()}
			>
				{controller.messages.common.refresh}
			</button>
		</div>
	</header>

	{#if controller.error !== null}
		<p class="workduck-inline-error" aria-live="polite">
			{controller.getQueueFolderLocalizedError(controller.error)}
		</p>
	{:else if controller.parseError !== null}
		<p class="workduck-inline-error" aria-live="polite">{controller.parseError}</p>
	{/if}

	<div class="workduck-queue-layout">
		<QueueFileList
			files={controller.files}
			filteredFiles={controller.filteredFiles}
			messages={controller.messages}
			isReading={controller.isReading}
			onAddWorkIntent={() => void loadQueueWorkOrderDialog()}
			onAddWork={(event) => {
				event.stopPropagation();
				void loadQueueWorkOrderDialog();
				controller.openNewWorkOrderDialog();
			}}
			onCardIntent={preloadQueueCardSurface}
			onCardClick={controller.handleQueueCardClick}
			onCardContextMenu={(event, file) => {
				preloadQueueCardSurface(file);
				controller.openQueueContextMenu(event, file);
			}}
			getQueueCardClass={controller.getQueueCardClass}
			isSelectedQueueFile={controller.isSelectedQueueFile}
			getQueueExecutionStateLabel={controller.getQueueExecutionStateLabel}
		/>

		<section
			class="workduck-queue-detail"
			class:workduck-queue-detail-empty={!controller.hasSelectedQueueArtifact}
			aria-label={controller.messages.queue.detail}
		>
			{#if controller.selectedReport !== null && QueueReportDetail !== null}
				<QueueReportDetail
					report={controller.selectedReport}
					reportPath={controller.selectedReportPath}
					voteAggregate={controller.selectedReportVoteAggregate}
					reviews={controller.reviews}
					messages={controller.messages}
					reviewDecisionOptions={controller.reviewDecisionOptions}
					isWriting={controller.isWriting}
					isSavingEvaluation={controller.isSavingEvaluation}
					canDelegateEvaluation={controller.selectedReportCanDelegateEvaluation}
					isEvaluationDelegationCreated={controller.selectedReportEvaluationDelegationPath !== null}
					onDelegateEvaluation={controller.handleDelegateReportEvaluation}
					onUpdateReviewDecision={controller.updateReviewDecision}
					onUpdateReviewComment={controller.updateReviewComment}
					onOpenEvaluation={controller.openEvaluationDialog}
					isEvaluationRecorded={controller.isReportTaskEvaluationRecorded}
					getVoteChoiceLabel={controller.getVoteChoiceLabel}
					getReportTaskAgent={controller.getReportTaskAgent}
					getReviewDecisionLabel={controller.getReviewDecisionLabel}
				/>
			{:else if controller.selectedWorkOrder !== null && QueueWorkOrderDetail !== null}
				<QueueWorkOrderDetail
					workOrder={controller.selectedWorkOrder}
					messages={controller.messages}
					isWriting={controller.isWriting}
					isPreviewingPrompt={controller.isPreviewingPrompt}
					isCancellingExecution={controller.isCancellingExecution}
					canExecute={controller.canExecuteSelectedWorkOrder}
					canPreviewPrompt={controller.canPreviewSelectedWorkOrderPrompt}
					canComplete={controller.canCompleteSelectedWorkOrder}
					canCancelExecution={controller.canCancelSelectedWorkOrderExecution}
					onPreviewPrompt={controller.handlePreviewWorkOrderPrompt}
					onExecute={controller.handleExecuteWorkOrder}
					onCancelExecution={controller.handleCancelWorkOrderExecution}
					onComplete={controller.handleCompleteWorkOrder}
					onEditTask={controller.openEditWorkOrderTaskDialog}
					getQueuePriorityLabel={controller.getQueuePriorityLabel}
					getQueueResponseLanguageLabel={controller.getQueueResponseLanguageLabel}
					getQueueResponseFormatLabel={controller.getQueueResponseFormatLabel}
					getQueueTaskKindLabel={controller.getQueueTaskKindLabel}
					getQueueTaskProjectLabels={controller.getQueueTaskProjectLabels}
					getQueueTaskRepositoryLabels={controller.getQueueTaskRepositoryLabels}
					getQueueTaskSkillLabels={controller.getQueueTaskSkillLabels}
					getQueueTaskAgentLabels={controller.getQueueTaskAgentLabels}
					getQueueTaskReferenceLabels={controller.getQueueTaskReferenceLabels}
				/>
			{:else if controller.selectedProposal !== null && QueueProposalDetail !== null}
				<QueueProposalDetail
					proposal={controller.selectedProposal}
					proposalPath={controller.selectedProposalPath}
					messages={controller.messages}
				/>
			{/if}
		</section>
	</div>
</section>

<StatusToast message={controller.status} />

{#if controller.queueContextMenu !== null && QueueContextMenu !== null}
	<QueueContextMenu
		contextMenu={controller.queueContextMenu}
		messages={controller.messages}
		isWriting={controller.isWriting}
		bind:contextMenuElement={controller.queueContextMenuElement}
		onDelete={controller.handleDeleteContextQueueFile}
	/>
{/if}

{#if controller.evaluationDialog !== null && QueueEvaluationDialog !== null}
	<QueueEvaluationDialog
		dialog={controller.evaluationDialog}
		messages={controller.messages}
		isSavingEvaluation={controller.isSavingEvaluation}
		evaluationScores={controller.evaluationScores}
		onClose={controller.closeEvaluationDialog}
		onScoreChange={controller.updateEvaluationScore}
		onSubmit={controller.handleSaveEvaluation}
	/>
{/if}

{#if controller.promptPreviews !== null && controller.promptEstimate !== null && QueuePromptPreviewDialog !== null}
	<QueuePromptPreviewDialog
		messages={controller.messages}
		previews={controller.promptPreviews}
		estimate={controller.promptEstimate}
		onExecute={controller.handleConfirmExecuteWorkOrder}
		onClose={controller.closePromptPreviewDialog}
	/>
{/if}

{#if controller.isNewWorkOrderDialogOpen && QueueWorkOrderDialog !== null}
	<QueueWorkOrderDialog
		messages={controller.messages}
		isWriting={controller.isWriting}
		canSubmit={controller.canCreateManualWorkOrder}
		title={controller.workOrderDialogTitle}
		submitLabel={controller.workOrderDialogSubmitLabel}
		bind:manualWorkOrderTitle={controller.manualWorkOrderTitle}
		bind:manualWorkOrderBody={controller.manualWorkOrderBody}
		bind:manualWorkOrderPriority={controller.manualWorkOrderPriority}
		bind:manualWorkOrderResponseLanguage={controller.manualWorkOrderResponseLanguage}
		bind:manualWorkOrderResponseFormat={controller.manualWorkOrderResponseFormat}
		bind:manualWorkOrderKind={controller.manualWorkOrderKind}
		bind:manualVoteCriteriaInput={controller.manualVoteCriteriaInput}
		manualVoteOptions={controller.manualVoteOptions}
		allSkills={controller.allSkills}
		allAgents={controller.allAgents}
		allProjects={controller.allProjects}
		allRepositories={controller.allRepositories}
		allReferences={controller.prioritizedReferences}
		selectedManualSkillIds={controller.selectedManualSkillIds}
		selectedManualAgentIds={controller.selectedManualAgentIds}
		selectedManualProjectIds={controller.selectedManualProjectIds}
		selectedManualRepositoryIds={controller.selectedManualRepositoryIds}
		selectedManualReferenceIds={controller.selectedManualReferenceIds}
		selectedManualSkillOptionIds={controller.selectedManualSkillOptionIds}
		showSkillOptions={controller.manualSkillOptionsAreVisible}
		manualWorkOrderSkillSummary={controller.manualWorkOrderSkillSummary}
		manualWorkOrderAgentSummary={controller.manualWorkOrderAgentSummary}
		manualWorkOrderProjectSummary={controller.manualWorkOrderProjectSummary}
		manualWorkOrderRepositorySummary={controller.manualWorkOrderRepositorySummary}
		manualWorkOrderReferenceSummary={controller.manualWorkOrderReferenceSummary}
		onClose={controller.closeNewWorkOrderDialog}
		onSubmit={controller.handleCreateManualWorkOrder}
		onSkillToggle={controller.toggleManualWorkOrderSkill}
		onAgentToggle={controller.toggleManualWorkOrderAgent}
		onProjectToggle={controller.toggleManualWorkOrderProject}
		onRepositoryToggle={controller.toggleManualWorkOrderRepository}
		onReferenceToggle={controller.toggleManualWorkOrderReference}
		onSkillOptionToggle={controller.toggleManualSkillOption}
		onVoteOptionAdd={controller.addManualVoteOption}
		onVoteOptionRemove={controller.removeManualVoteOption}
		onVoteOptionChange={controller.updateManualVoteOption}
		getQueuePriorityLabel={controller.getQueuePriorityLabel}
		getQueueResponseLanguageLabel={controller.getQueueResponseLanguageLabel}
		getQueueResponseFormatLabel={controller.getQueueResponseFormatLabel}
		getSkillDisplayName={controller.getSkillDisplayName}
		getAgentDisplayName={controller.getAgentDisplayName}
		getProjectDisplayName={controller.getProjectDisplayName}
		getRepositoryDisplayName={controller.getRepositoryDisplayName}
		getReferenceDisplayName={controller.getReferenceDisplayName}
	/>
{/if}
