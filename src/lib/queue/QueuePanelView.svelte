<script lang="ts">
	import PageTitleRow from '$lib/ui/PageTitleRow.svelte';
	import StatusToast from '$lib/ui/StatusToast.svelte';
	import QueueContextMenu from './QueueContextMenu.svelte';
	import QueueEvaluationDialog from './QueueEvaluationDialog.svelte';
	import QueueFileList from './QueueFileList.svelte';
	import QueuePromptPreviewDialog from './QueuePromptPreviewDialog.svelte';
	import QueueProposalDetail from './QueueProposalDetail.svelte';
	import QueueReportDetail from './QueueReportDetail.svelte';
	import QueueWorkOrderDetail from './QueueWorkOrderDetail.svelte';
	import QueueWorkOrderDialog from './QueueWorkOrderDialog.svelte';
	import type { QueuePanelController } from './queue-panel-controller.svelte';
	import {
		queueExecutionFilterOptions,
		queueKindFilterOptions,
		queuePriorityFilterOptions,
		queueReadFilterOptions,
		queueSortOptions,
		type QueueKindFilter,
		type QueuePriorityFilter,
		type QueueSortOption
	} from './queue-panel-types';

	interface Props {
		readonly title: string;
		readonly controller: QueuePanelController;
	}

	let { title, controller }: Props = $props();

	let isAdvancedFiltersOpen = $state(false);
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
			onAddWork={(event) => {
				event.stopPropagation();
				controller.openNewWorkOrderDialog();
			}}
			onCardClick={controller.handleQueueCardClick}
			onCardContextMenu={controller.openQueueContextMenu}
			getQueueCardClass={controller.getQueueCardClass}
			isSelectedQueueFile={controller.isSelectedQueueFile}
			getQueueExecutionStateLabel={controller.getQueueExecutionStateLabel}
		/>

		<section
			class="workduck-queue-detail"
			class:workduck-queue-detail-empty={!controller.hasSelectedQueueArtifact}
			aria-label={controller.messages.queue.detail}
		>
			{#if controller.selectedReport !== null}
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
			{:else if controller.selectedWorkOrder !== null}
				<QueueWorkOrderDetail
					workOrder={controller.selectedWorkOrder}
					messages={controller.messages}
					isWriting={controller.isWriting}
					isPreviewingPrompt={controller.isPreviewingPrompt}
					canExecute={controller.canExecuteSelectedWorkOrder}
					canPreviewPrompt={controller.canPreviewSelectedWorkOrderPrompt}
					canComplete={controller.canCompleteSelectedWorkOrder}
					onPreviewPrompt={controller.handlePreviewWorkOrderPrompt}
					onExecute={controller.handleExecuteWorkOrder}
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
			{:else if controller.selectedProposal !== null}
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

{#if controller.queueContextMenu !== null}
	<QueueContextMenu
		contextMenu={controller.queueContextMenu}
		messages={controller.messages}
		isWriting={controller.isWriting}
		bind:contextMenuElement={controller.queueContextMenuElement}
		onDelete={controller.handleDeleteContextQueueFile}
	/>
{/if}

{#if controller.evaluationDialog !== null}
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

{#if controller.promptPreviews !== null}
	<QueuePromptPreviewDialog
		messages={controller.messages}
		previews={controller.promptPreviews}
		onClose={controller.closePromptPreviewDialog}
	/>
{/if}

{#if controller.isNewWorkOrderDialogOpen}
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
