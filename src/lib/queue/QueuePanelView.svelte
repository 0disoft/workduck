<script lang="ts">
	import PageTitleRow from '$lib/ui/PageTitleRow.svelte';
	import StatusToast from '$lib/ui/StatusToast.svelte';
	import QueueContextMenu from './QueueContextMenu.svelte';
	import QueueEvaluationDialog from './QueueEvaluationDialog.svelte';
	import QueueFileList from './QueueFileList.svelte';
	import QueueProposalDetail from './QueueProposalDetail.svelte';
	import QueueReportDetail from './QueueReportDetail.svelte';
	import QueueWorkOrderDetail from './QueueWorkOrderDetail.svelte';
	import QueueWorkOrderDialog from './QueueWorkOrderDialog.svelte';
	import type { QueuePanelController } from './queue-panel-controller.svelte';
	import { queueExecutionFilterOptions, queueReadFilterOptions } from './queue-panel-types';

	interface Props {
		readonly title: string;
		readonly controller: QueuePanelController;
	}

	let { title, controller }: Props = $props();
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
			<div class="workduck-queue-filters" aria-label={controller.messages.queue.readFilters}>
				{#each queueReadFilterOptions as option}
					<button
						class="workduck-project-sync-filter-button"
						class:workduck-project-sync-filter-button-active={controller.queueReadFilter === option.id}
						type="button"
						aria-pressed={controller.queueReadFilter === option.id}
						onclick={() => (controller.queueReadFilter = option.id)}
					>
						{controller.getReadFilterLabel(option.id)}
					</button>
				{/each}
			</div>
			<button
				class="workduck-button workduck-button-secondary"
				type="button"
				aria-keyshortcuts="F5"
				disabled={controller.isRefreshing}
				onclick={() => void controller.refreshQueueFiles()}
			>
				{controller.messages.common.refresh} (F5)
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
			getFileKindLabel={controller.getFileKindLabel}
			getQueuePriorityLabel={controller.getQueuePriorityLabel}
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
					getVoteChoiceLabel={controller.getVoteChoiceLabel}
					getReportTaskAgent={controller.getReportTaskAgent}
					getReviewDecisionLabel={controller.getReviewDecisionLabel}
				/>
			{:else if controller.selectedWorkOrder !== null}
				<QueueWorkOrderDetail
					workOrder={controller.selectedWorkOrder}
					messages={controller.messages}
					isWriting={controller.isWriting}
					canExecute={controller.canExecuteSelectedWorkOrder}
					onExecute={controller.handleExecuteWorkOrder}
					onEditTask={controller.openEditWorkOrderTaskDialog}
					getQueuePriorityLabel={controller.getQueuePriorityLabel}
					getQueueResponseLanguageLabel={controller.getQueueResponseLanguageLabel}
					getQueueTaskKindLabel={controller.getQueueTaskKindLabel}
					getQueueTaskProjectLabels={controller.getQueueTaskProjectLabels}
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
		bind:manualWorkOrderKind={controller.manualWorkOrderKind}
		bind:manualVoteCriteriaInput={controller.manualVoteCriteriaInput}
		manualVoteOptionCount={controller.manualVoteOptionCount}
		manualVoteOptionCountChoices={controller.manualVoteOptionCountChoices}
		manualVoteOptions={controller.manualVoteOptions}
		allSkills={controller.allSkills}
		allAgents={controller.allAgents}
		allProjects={controller.allProjects}
		allReferences={controller.prioritizedReferences}
		selectedManualSkillIds={controller.selectedManualSkillIds}
		selectedManualAgentIds={controller.selectedManualAgentIds}
		selectedManualProjectIds={controller.selectedManualProjectIds}
		selectedManualReferenceIds={controller.selectedManualReferenceIds}
		manualWorkOrderSkillSummary={controller.manualWorkOrderSkillSummary}
		manualWorkOrderAgentSummary={controller.manualWorkOrderAgentSummary}
		manualWorkOrderProjectSummary={controller.manualWorkOrderProjectSummary}
		manualWorkOrderReferenceSummary={controller.manualWorkOrderReferenceSummary}
		onClose={controller.closeNewWorkOrderDialog}
		onSubmit={controller.handleCreateManualWorkOrder}
		onSkillToggle={controller.toggleManualWorkOrderSkill}
		onAgentToggle={controller.toggleManualWorkOrderAgent}
		onProjectToggle={controller.toggleManualWorkOrderProject}
		onReferenceToggle={controller.toggleManualWorkOrderReference}
		onVoteOptionCountChange={controller.setManualVoteOptionCount}
		onVoteOptionChange={controller.updateManualVoteOption}
		getQueuePriorityLabel={controller.getQueuePriorityLabel}
		getQueueResponseLanguageLabel={controller.getQueueResponseLanguageLabel}
		getSkillDisplayName={controller.getSkillDisplayName}
		getAgentDisplayName={controller.getAgentDisplayName}
		getProjectDisplayName={controller.getProjectDisplayName}
		getReferenceDisplayName={controller.getReferenceDisplayName}
	/>
{/if}
