<script lang="ts">
	import PageTitleRow from '#lib/ui/PageTitleRow.svelte';
	import StatusToast from '#lib/ui/StatusToast.svelte';
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

	let executionFilterTabs = $derived(
		queueExecutionFilterOptions.map((option) => ({
			id: option.id,
			label: controller.getExecutionFilterLabel(option.id),
			count:
				option.id === 'all'
					? controller.files.length
					: controller.files.filter((file) => file.executionState === option.id).length
		}))
	);

	let linkedSourceReport = $derived.by(() => {
		const sourceReport = controller.selectedWorkOrder?.sourceReport;

		if (sourceReport === undefined) {
			return null;
		}

		const matches = controller.files.filter(
			(candidate) => candidate.kind === 'result-report' && candidate.artifactId === sourceReport.id
		);

		if (matches.length !== 1) {
			return null;
		}

		const [file] = matches;

		return file === undefined ? null : { file, label: file.title };
	});

	let linkedResultReports = $derived.by(() => {
		const workOrder = controller.selectedWorkOrder;

		if (workOrder === null || workOrder.ref.id.length === 0) {
			return [];
		}

		if (controller.files.filter((file) =>
			file.kind === 'work-order' && file.artifactId === workOrder.ref.id
		).length !== 1) {
			return [];
		}

		const matches = controller.files.filter(
			(candidate) =>
				candidate.kind === 'result-report' &&
				(candidate.sourceWorkOrderId ?? '') === workOrder.ref.id
		);
		const reportIdCounts = new Map<string, number>();
		for (const file of controller.files) {
			if (file.kind === 'result-report') {
				reportIdCounts.set(file.artifactId, (reportIdCounts.get(file.artifactId) ?? 0) + 1);
			}
		}

		return matches.filter((file) =>
			file.artifactId.length > 0 && reportIdCounts.get(file.artifactId) === 1
		);
	});

	let linkedSourceWorkOrder = $derived.by(() => {
		const sourceWorkOrder = controller.selectedReport?.sourceWorkOrder;

		if (sourceWorkOrder === undefined) {
			return null;
		}

		const matches = controller.files.filter(
			(candidate) => candidate.kind === 'work-order' && candidate.artifactId === sourceWorkOrder.id
		);

		if (matches.length !== 1) {
			return null;
		}

		const [file] = matches;

		return file === undefined ? null : { file, label: file.title };
	});

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

		if (controller.workOrderEditor.isNewWorkOrderDialogOpen) {
			void loadQueueWorkOrderDialog();
		}
	});
</script>

<section class="workduck-queue-panel" aria-label={controller.messages.navigation.queue}>
	<header class="workduck-page-header">
		<PageTitleRow {title} meta={controller.queueItemCountLabel} />
		<div class="workduck-page-actions workduck-queue-header-actions">
			<button
				class="workduck-button workduck-button-primary"
				type="button"
				aria-haspopup="dialog"
				onpointerenter={() => void loadQueueWorkOrderDialog()}
				onfocus={() => void loadQueueWorkOrderDialog()}
				onclick={() => {
					void loadQueueWorkOrderDialog();
					controller.openNewWorkOrderDialog();
				}}
			>
				{controller.messages.queue.addWork}
			</button>
		</div>
	</header>

	<div class="workduck-queue-toolbar">
		<div
			class="workduck-queue-status-tabs"
			role="group"
			aria-label={controller.messages.queue.executionFilters}
		>
			{#each executionFilterTabs as tab (tab.id)}
				<button
					class="workduck-queue-status-tab"
					class:workduck-queue-status-tab-active={controller.queueExecutionFilter === tab.id}
					type="button"
					aria-pressed={controller.queueExecutionFilter === tab.id}
					onclick={() => (controller.queueExecutionFilter = tab.id)}
				>
					<span>{tab.label}</span>
					<span class="workduck-queue-status-tab-count" aria-hidden="true">{tab.count}</span>
				</button>
			{/each}
		</div>
		<div class="workduck-queue-toolbar-actions">
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
	</div>

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
					sourceWorkOrder={linkedSourceWorkOrder}
					onOpenSourceWorkOrder={() => {
						if (linkedSourceWorkOrder !== null) {
							controller.handleQueueCardClick(linkedSourceWorkOrder.file);
						}
					}}
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
					sourceReport={linkedSourceReport}
					onOpenSourceReport={() => {
						if (linkedSourceReport !== null) {
							controller.handleQueueCardClick(linkedSourceReport.file);
						}
					}}
					resultReports={linkedResultReports.map((file) => ({
						relativePath: file.relativePath,
						label: file.title
					}))}
					onOpenResultReport={(relativePath) => {
						const file = controller.files.find(
							(candidate) => candidate.relativePath === relativePath
						);

						if (file !== undefined) {
							controller.handleQueueCardClick(file);
						}
					}}
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

{#if controller.workOrderEditor.isNewWorkOrderDialogOpen && QueueWorkOrderDialog !== null}
	<QueueWorkOrderDialog
		messages={controller.messages}
		isWriting={controller.isWriting}
		canSubmit={controller.workOrderEditor.canCreateManualWorkOrder}
		title={controller.workOrderEditor.workOrderDialogTitle}
		submitLabel={controller.workOrderEditor.workOrderDialogSubmitLabel}
		bind:manualWorkOrderTitle={controller.workOrderEditor.manualWorkOrderTitle}
		bind:manualWorkOrderBody={controller.workOrderEditor.manualWorkOrderBody}
		bind:manualWorkOrderPriority={controller.workOrderEditor.manualWorkOrderPriority}
		bind:manualWorkOrderResponseLanguage={controller.workOrderEditor.manualWorkOrderResponseLanguage}
		bind:manualWorkOrderResponseFormat={controller.workOrderEditor.manualWorkOrderResponseFormat}
		bind:manualWorkOrderKind={controller.workOrderEditor.manualWorkOrderKind}
		bind:manualVoteCriteriaInput={controller.workOrderEditor.manualVoteCriteriaInput}
		manualVoteOptions={controller.workOrderEditor.manualVoteOptions}
		allSkills={controller.allSkills}
		allAgents={controller.allAgents}
		allProjects={controller.allProjects}
		allRepositories={controller.allRepositories}
		allReferences={controller.workOrderEditor.prioritizedReferences}
		selectedManualSkillIds={controller.workOrderEditor.selectedManualSkillIds}
		selectedManualAgentIds={controller.workOrderEditor.selectedManualAgentIds}
		selectedManualProjectIds={controller.workOrderEditor.selectedManualProjectIds}
		selectedManualRepositoryIds={controller.workOrderEditor.selectedManualRepositoryIds}
		selectedManualReferenceIds={controller.workOrderEditor.selectedManualReferenceIds}
		selectedManualSkillOptionIds={controller.workOrderEditor.selectedManualSkillOptionIds}
		showSkillOptions={controller.workOrderEditor.manualSkillOptionsAreVisible}
		manualWorkOrderSkillSummary={controller.workOrderEditor.manualWorkOrderSkillSummary}
		manualWorkOrderAgentSummary={controller.workOrderEditor.manualWorkOrderAgentSummary}
		manualWorkOrderProjectSummary={controller.workOrderEditor.manualWorkOrderProjectSummary}
		manualWorkOrderRepositorySummary={controller.workOrderEditor.manualWorkOrderRepositorySummary}
		manualWorkOrderReferenceSummary={controller.workOrderEditor.manualWorkOrderReferenceSummary}
		onClose={controller.closeNewWorkOrderDialog}
		onSubmit={controller.handleCreateManualWorkOrder}
		onSkillToggle={controller.workOrderEditor.toggleManualWorkOrderSkill}
		onAgentToggle={controller.workOrderEditor.toggleManualWorkOrderAgent}
		onProjectToggle={controller.workOrderEditor.toggleManualWorkOrderProject}
		onRepositoryToggle={controller.workOrderEditor.toggleManualWorkOrderRepository}
		onReferenceToggle={controller.workOrderEditor.toggleManualWorkOrderReference}
		onSkillOptionToggle={controller.workOrderEditor.toggleManualSkillOption}
		onVoteOptionAdd={controller.workOrderEditor.addManualVoteOption}
		onVoteOptionRemove={controller.workOrderEditor.removeManualVoteOption}
		onVoteOptionChange={controller.workOrderEditor.updateManualVoteOption}
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
