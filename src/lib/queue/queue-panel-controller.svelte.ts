import { onMount, tick } from 'svelte';

import { getWorkduckMessages } from '$lib/i18n/workduck-language';
import {
	createDefaultAppearanceSettings,
	type AppearanceSettings
} from '$lib/settings/appearance-settings';
import {
	readAppearanceSettingsFromBrowser,
	subscribeAppearanceSettings
} from '$lib/settings/appearance-storage';
import type { WorkspaceRecord } from '$lib/workspaces/workspace-registry';
import {
	type AgentRecord,
	type AgentRegistry
} from '$lib/agents/agent-registry';
import {
	type AgentEvaluationCriterionId,
	type AgentEvaluationScores
} from '$lib/agents/agent-evaluation';
import {
	type PersonaRecord,
	type PersonaRegistry
} from '$lib/personas/persona-registry';
import { type ReferenceRecord, type ReferenceRegistry } from '$lib/references/reference-registry';
import {
	type ProjectNodeRecord,
	type ProjectRegistry
} from '$lib/projects/project-registry';
import {
	createProjectRepositorySelectionOptions,
	type ProjectRepositorySelectionOption
} from '$lib/projects/project-repository-selection';
import {
	getAllSkills,
	WORKDUCK_AGENT_RESPONSE_EVALUATOR_SKILL_ID,
	type SkillRegistry,
	type WorkduckSkillRecord
} from '$lib/skills/skill-registry';
import {
	prepareDesktopNotificationPermission,
	showDesktopNotificationWhenUnfocused
} from '$lib/ui/desktop-notification';

import {
	createQueueReportTaskEvaluationKey,
	hasQueueReportTaskEvaluation,
	QUEUE_WORK_ORDER_BODY_MAX_LENGTH,
	QUEUE_WORK_ORDER_TITLE_MAX_LENGTH,
	type QueueReportTaskReview,
	type WorkduckQueueProposal,
	type WorkduckQueueExecutionState,
	type WorkduckQueueResultReport,
	type WorkduckQueueResultReportTask,
	type WorkduckQueueResponseFormat,
	type WorkduckQueueResponseLanguage,
	type WorkduckQueueWorkPriority,
	type WorkduckQueueWorkOrder,
	type WorkduckQueueWorkOrderTask,
	type WorkduckQueueReviewDecision
} from './queue-artifacts';
import { readEnvironmentVaultSession } from '$lib/environment/environment-vault-session';
import type { WorkduckQueuePromptPreview } from './queue-execution';
import {
	type QueueFileEntry,
	type QueueFolderError
} from './queue-folder';
import {
	createVoteAggregate,
	type WorkduckQueueTaskKind
} from './queue-voting';
import {
	dispatchQueueFilesChanged
} from './queue-read-state';
import {
	createManualWorkOrderKindInput as createManualWorkOrderKindInputFromFields,
	createSelectionSummary,
	sortReferencesForProjectSelection
} from './queue-panel-helpers';
import {
	getAgentDisplayName as getAgentDisplayNameFromRecord,
	getExecutionFilterLabel as getLocalizedExecutionFilterLabel,
	getKindFilterLabel as getLocalizedKindFilterLabel,
	getQueueExecutionStateLabel as getLocalizedQueueExecutionStateLabel,
	getQueuePriorityFilterLabel as getLocalizedQueuePriorityFilterLabel,
	getQueuePriorityLabel as getLocalizedQueuePriorityLabel,
	getQueueResponseFormatLabel as getLocalizedQueueResponseFormatLabel,
	getQueueResponseLanguageLabel as getLocalizedQueueResponseLanguageLabel,
	getQueueSortLabel as getLocalizedQueueSortLabel,
	getQueueTaskKindLabel as getLocalizedQueueTaskKindLabel,
	getProjectDisplayName as getProjectDisplayNameFromRecord,
	getReadFilterLabel as getLocalizedReadFilterLabel,
	getRecordLabelById,
	getReferenceDisplayName as getReferenceDisplayNameFromRecord,
	getReportTaskAgent as findReportTaskAgent,
	getReviewDecisionLabel as getLocalizedReviewDecisionLabel,
	getSkillDisplayName as getLocalizedSkillDisplayName,
	getVoteChoiceLabel as getLocalizedVoteChoiceLabel
} from './queue-panel-labels';
import {
	startQueueAutoRefreshScheduler,
	type QueueAutoRefreshScheduler
} from './queue-auto-refresh-scheduler';
import { createQueueCompletedReportNotifications } from './queue-completed-report-notifications';
import {
	canOpenQueueContextMenu,
	createQueueContextMenuState,
	createViewportAlignedQueueContextMenu,
	subscribeQueueContextMenuDismissal
} from './queue-panel-context-menu-lifecycle';
import {
	createFilteredQueueFiles,
	createQueueCardClass as createQueueCardClassFromSelection,
	isQueueFileSelected,
	shouldBulkDeleteQueueFile
} from './queue-panel-file-list';
import {
	canCloseQueueEvaluationDialog,
	canOpenQueueEvaluationDialog,
	createClosedQueueEvaluationDialogState,
	createInitialQueueEvaluationDialogState,
	createOpenQueueEvaluationDialogState,
	createUpdatedQueueEvaluationScores
} from './queue-panel-evaluation-dialog-lifecycle';
import {
	saveQueuePanelEvaluation,
	type QueuePanelEvaluationSaveFailureCode,
	type QueuePanelEvaluationSaveResult
} from './queue-panel-evaluation-save-workflow';
import {
	executeQueuePanelWorkOrder,
	type QueuePanelWorkOrderExecutionResult
} from './queue-panel-work-order-execution-workflow';
import { cancelQueuePanelWorkOrder } from './queue-panel-work-order-cancel-workflow';
import { completeQueuePanelWorkOrder } from './queue-panel-work-order-completion-workflow';
import {
	createQueuePanelManualWorkOrder,
	updateQueuePanelManualWorkOrder,
	type QueuePanelManualWorkOrderSaveDraft
} from './queue-panel-manual-work-order-save-workflow';
import { delegateQueuePanelReportEvaluation } from './queue-panel-report-evaluation-delegation-workflow';
import { deleteQueuePanelFiles } from './queue-panel-file-delete-workflow';
import {
	markQueuePanelFileRead,
	readQueuePanelReadFilePaths,
	removeQueuePanelReadFilePaths
} from './queue-panel-read-state-workflow';
import { createQueuePanelExecutionContextReader } from './queue-panel-execution-context-workflow';
import { previewQueuePanelWorkOrderPrompt } from './queue-panel-prompt-preview-workflow';
import { refreshQueuePanelFiles } from './queue-panel-refresh-workflow';
import {
	readQueuePanelArtifactSelection,
	type QueuePanelArtifactSelection,
	type QueuePanelArtifactSelectionResult
} from './queue-panel-selection';
import {
	createEmptyQueuePanelWorkspaceRegistryState,
	startQueuePanelWorkspaceRegistryReads,
	subscribeQueuePanelWorkspaceRegistries
} from './queue-panel-workspace-lifecycle';
import {
	addManualVoteOption as addManualVoteOptionToDraft,
	createEmptyManualWorkOrderDraft,
	createManualWorkOrderBodyWithSkillOptions,
	createManualWorkOrderDraftFromTask,
	createManualWorkOrderResolvedTitle,
	removeManualVoteOption as removeManualVoteOptionFromDraft,
	updateManualSkillOptionSelection,
	updateManualWorkOrderRecordSelection,
	updateManualVoteOption as updateManualVoteOptionInDraft,
	updateManualWorkOrderSkillSelection,
	type QueuePanelManualWorkOrderDraft
} from './queue-panel-manual-work-order-draft';
import {
	getQueueExecutionErrorMessage as getLocalizedQueueExecutionErrorMessage,
	getQueueFolderLocalizedError as getLocalizedQueueFolderError
} from './queue-panel-errors';
import {
	type AgentEvaluationDialogState,
	type ManualVoteOptionInput,
	type QueueCardEntry,
	type QueueContextMenuState,
	type QueueExecutionContext,
	type QueueExecutionFilter,
	type QueueKindFilter,
	type QueuePriorityFilter,
	type QueueReadFilter,
	type QueueSortOption,
	type WorkOrderDialogMode
} from './queue-panel-types';

type QueuePanelWorkOrderExecutionSuccessResult = Extract<
	QueuePanelWorkOrderExecutionResult,
	{ readonly ok: true }
>;

type QueuePanelWorkOrderExecutionFailureResult = Extract<
	QueuePanelWorkOrderExecutionResult,
	{ readonly ok: false }
>;

export interface QueuePanelControllerInput {
	readonly workspace: () => WorkspaceRecord;
	readonly refreshSignal: () => number;
}

export function createQueuePanelController(input: QueuePanelControllerInput) {
	let workspace = $derived(input.workspace());
	let refreshSignal = $derived(input.refreshSignal());
	const QUEUE_AUTO_REFRESH_ACTIVE_MS = 30_000;
	const QUEUE_AUTO_REFRESH_IDLE_MS = 60_000;
	const QUEUE_AUTO_REFRESH_HIDDEN_MS = 60_000;
	const reviewDecisionOptions = [
		{ value: 'approved' },
		{ value: 'needs-work' },
		{ value: 'rollback' }
	] as const satisfies readonly {
		readonly value: Exclude<WorkduckQueueReviewDecision, 'pending'>;
	}[];
	const initialManualWorkOrderDraft = createEmptyManualWorkOrderDraft();
	const executionContextReader = createQueuePanelExecutionContextReader();


	let appearanceSettings = $state<AppearanceSettings>(createDefaultAppearanceSettings());
	let files = $state<readonly QueueCardEntry[]>([]);
	let readFilePaths = $state<readonly string[]>([]);
	let queueExecutionFilter = $state<QueueExecutionFilter>('all');
	let queueReadFilter = $state<QueueReadFilter>('all');
	let queueKindFilter = $state<QueueKindFilter>('all');
	let queuePriorityFilter = $state<QueuePriorityFilter>('all');
	let queueSortOption = $state<QueueSortOption>('created-desc');
	let bulkDeleteIncludesPending = $state(false);
	let error = $state<QueueFolderError | null>(null);
	let parseError = $state<string | null>(null);
	let status = $state<string | null>(null);
	let selectedReport = $state<WorkduckQueueResultReport | null>(null);
	let selectedReportPath = $state<string | null>(null);
	let selectedWorkOrder = $state<WorkduckQueueWorkOrder | null>(null);
	let selectedWorkOrderPath = $state<string | null>(null);
	let selectedProposal = $state<WorkduckQueueProposal | null>(null);
	let selectedProposalPath = $state<string | null>(null);
	let promptPreviews = $state<readonly WorkduckQueuePromptPreview[] | null>(null);
	let reviews = $state<readonly QueueReportTaskReview[]>([]);
	let isNewWorkOrderDialogOpen = $state(false);
	let workOrderDialogMode = $state<WorkOrderDialogMode>('create');
	let editingWorkOrderTaskId = $state<string | null>(null);
	let manualWorkOrderTitle = $state(initialManualWorkOrderDraft.title);
	let manualWorkOrderBody = $state(initialManualWorkOrderDraft.body);
	let manualWorkOrderPriority =
		$state<WorkduckQueueWorkPriority>(initialManualWorkOrderDraft.priority);
	let manualWorkOrderResponseLanguage =
		$state<WorkduckQueueResponseLanguage>(initialManualWorkOrderDraft.responseLanguage);
	let manualWorkOrderResponseFormat =
		$state<WorkduckQueueResponseFormat>(initialManualWorkOrderDraft.responseFormat);
	let manualWorkOrderKind = $state<WorkduckQueueTaskKind>(initialManualWorkOrderDraft.kind);
	let manualVoteOptions =
		$state<readonly ManualVoteOptionInput[]>(initialManualWorkOrderDraft.voteOptions);
	let manualVoteCriteriaInput = $state(initialManualWorkOrderDraft.voteCriteriaInput);
	let selectedManualSkillIds = $state<string[]>(initialManualWorkOrderDraft.selectedSkillIds);
	let selectedManualSkillOptionIds =
		$state<string[]>(initialManualWorkOrderDraft.selectedSkillOptionIds);
	let selectedManualAgentIds = $state<string[]>(initialManualWorkOrderDraft.selectedAgentIds);
	let selectedManualProjectIds = $state<string[]>(initialManualWorkOrderDraft.selectedProjectIds);
	let selectedManualRepositoryIds =
		$state<string[]>(initialManualWorkOrderDraft.selectedRepositoryIds);
	let selectedManualReferenceIds =
		$state<string[]>(initialManualWorkOrderDraft.selectedReferenceIds);
	const initialWorkspaceRegistries = createEmptyQueuePanelWorkspaceRegistryState('');
	let skillRegistry = $state<SkillRegistry>(initialWorkspaceRegistries.skillRegistry);
	let agentRegistry = $state<AgentRegistry>(initialWorkspaceRegistries.agentRegistry);
	let personaRegistry = $state<PersonaRegistry>(initialWorkspaceRegistries.personaRegistry);
	let projectRegistry = $state<ProjectRegistry>(initialWorkspaceRegistries.projectRegistry);
	let referenceRegistry = $state<ReferenceRegistry>(initialWorkspaceRegistries.referenceRegistry);
	let isRefreshing = $state(false);
	let isReading = $state(false);
	let isWriting = $state(false);
	let isPreviewingPrompt = $state(false);
	let isCancellingExecution = $state(false);
	let activeExecution = $state<{
		readonly executionId: string;
		readonly workspacePath: string;
		readonly workOrderId: string;
	} | null>(null);
	let isSavingEvaluation = $state(false);
	const initialEvaluationDialogState = createInitialQueueEvaluationDialogState();
	let evaluationDialog = $state<AgentEvaluationDialogState | null>(
		initialEvaluationDialogState.dialog
	);
	let evaluationScores = $state<AgentEvaluationScores>(initialEvaluationDialogState.scores);
	let queueContextMenu = $state<QueueContextMenuState | null>(null);
	let queueContextMenuElement = $state<HTMLElement | undefined>(undefined);
	let ensureSignature = $state('');
	let refreshSignature = $state(0);
	let workspaceDataReadGeneration = 0;
	let queueAutoRefreshScheduler: QueueAutoRefreshScheduler | null = null;
	const completedReportNotifications = createQueueCompletedReportNotifications();
	let messages = $derived(getWorkduckMessages(appearanceSettings.languageId));
	let readFilePathSet = $derived(new Set(readFilePaths));
	let queueItemCountLabel = $derived(
		messages.queue.registeredCount.replace('{count}', files.length.toString())
	);
	let allStoredSkills = $derived(getAllSkills(skillRegistry));
	let allSkills = $derived(sortSkillsForDisplay(allStoredSkills));
	let allAgents = $derived(agentRegistry.agents);
	let allProjects = $derived(
		projectRegistry.nodes.filter((node): node is ProjectNodeRecord => node.kind === 'project')
	);
	let allRepositories = $derived(createProjectRepositorySelectionOptions(projectRegistry.nodes));
	let allReferences = $derived(referenceRegistry.references);
	let prioritizedReferences = $derived(
		sortReferencesForProjectSelection(
			allReferences,
			selectedManualProjectIds,
			selectedManualRepositoryIds
		)
	);
	let manualWorkOrderSkillSummary = $derived(
		createSelectionSummary(
			selectedManualSkillIds,
			messages.queue.noSkill,
			messages.queue.selectionCount,
			getSkillLabelById
		)
	);
	let manualWorkOrderAgentSummary = $derived(
		createSelectionSummary(
			selectedManualAgentIds,
			messages.queue.noAgent,
			messages.queue.selectionCount,
			getAgentLabelById
		)
	);
	let manualWorkOrderProjectSummary = $derived(
		createSelectionSummary(
			selectedManualProjectIds,
			messages.queue.noProject,
			messages.queue.selectionCount,
			getProjectLabelById
		)
	);
	let manualWorkOrderRepositorySummary = $derived(
		createSelectionSummary(
			selectedManualRepositoryIds,
			messages.queue.noRepository,
			messages.queue.selectionCount,
			getRepositoryLabelById
		)
	);
	let manualWorkOrderReferenceSummary = $derived(
		createSelectionSummary(
			selectedManualReferenceIds,
			messages.queue.noReference,
			messages.queue.selectionCount,
			getReferenceLabelById
		)
	);
	let manualSkillOptionsAreVisible = $derived(
		manualWorkOrderKind === 'instruction' &&
			allSkills.some(
				(skill) => selectedManualSkillIds.includes(skill.id) && skill.optionGroups.length > 0
			)
	);
	let selectedReportVoteAggregate = $derived(
		selectedReport === null ? null : createVoteAggregate(selectedReport.tasks)
	);
	let selectedReportEvaluationDelegationPath = $derived(
		selectedReport === null
			? null
			: findReportEvaluationDelegationPath(selectedReport)
	);
	let selectedReportCanDelegateEvaluation = $derived(
		selectedReport !== null && selectedReport.tasks.some((task) => getReportTaskAgent(task) !== null)
	);
	let manualValidVoteOptionCount = $derived(
		manualVoteOptions.filter((option) => option.label.trim().length > 0).length
	);
	let filteredFiles = $derived(
		createFilteredQueueFiles(files, {
			executionFilter: queueExecutionFilter,
			readFilter: queueReadFilter,
			kindFilter: queueKindFilter,
			priorityFilter: queuePriorityFilter,
			sortOption: queueSortOption
		})
	);
	let hasSelectedQueueArtifact = $derived(
		selectedReport !== null || selectedWorkOrder !== null || selectedProposal !== null
	);
	let canCreateManualWorkOrder = $derived(
			getManualWorkOrderTitle().length > 0 &&
			manualWorkOrderBody.trim().length > 0 &&
			manualWorkOrderTitle.trim().length <= QUEUE_WORK_ORDER_TITLE_MAX_LENGTH &&
			manualWorkOrderBody.trim().length <= QUEUE_WORK_ORDER_BODY_MAX_LENGTH &&
			(manualWorkOrderKind !== 'vote' || manualValidVoteOptionCount >= 2) &&
			!isWriting
	);
	let canExecuteSelectedWorkOrder = $derived(
		selectedWorkOrder !== null &&
			(selectedWorkOrder.status === 'active' || selectedWorkOrder.status === 'failed') &&
			selectedWorkOrder.tasks.length > 0 &&
			selectedWorkOrder.tasks.every((task) => (task.agentIds ?? []).length > 0) &&
			!isWriting
	);
	let canPreviewSelectedWorkOrderPrompt = $derived(
		selectedWorkOrder !== null &&
			(selectedWorkOrder.status === 'active' || selectedWorkOrder.status === 'failed') &&
			selectedWorkOrder.tasks.length > 0 &&
			selectedWorkOrder.tasks.every((task) => (task.agentIds ?? []).length > 0) &&
			!isWriting &&
			!isPreviewingPrompt
	);
	let canCompleteSelectedWorkOrder = $derived(
		selectedWorkOrder !== null &&
			selectedWorkOrder.status !== 'archived' &&
			selectedWorkOrder.status !== 'running' &&
			!isWriting
	);
	let canCancelSelectedWorkOrderExecution = $derived(
		selectedWorkOrder !== null && selectedWorkOrder.status === 'running' && !isCancellingExecution
	);
	let bulkDeleteTargetFiles = $derived(
		files.filter((file) => shouldBulkDeleteQueueFile(file, bulkDeleteIncludesPending))
	);
	let bulkDeleteTargetCount = $derived(bulkDeleteTargetFiles.length);
	let canBulkDeleteQueueFiles = $derived(bulkDeleteTargetCount > 0 && !isWriting);
	let workOrderDialogTitle = $derived(
		workOrderDialogMode === 'create' ? messages.queue.newWork : messages.queue.editWork
	);
	let workOrderDialogSubmitLabel = $derived(
		workOrderDialogMode === 'create' ? messages.common.add : messages.common.save
	);

	onMount(() => {
		appearanceSettings = readAppearanceSettingsFromBrowser().settings;
		const unsubscribeAppearanceSettings = subscribeAppearanceSettings((nextSettings) => {
			appearanceSettings = nextSettings;
	});
		queueAutoRefreshScheduler = startQueueAutoRefreshScheduler({
			getDelayMs: getQueueAutoRefreshDelayMs,
			refresh: () => {
				void refreshQueueFiles({ silent: true });
			},
			environment: { document, window }
		});

		const handleQueueShortcut = (event: KeyboardEvent) => {
			if (event.key !== 'F5') {
				return;
			}

			event.preventDefault();
			void refreshQueueFiles();
	};

		window.addEventListener('keydown', handleQueueShortcut);

		return () => {
			queueAutoRefreshScheduler?.dispose();
			queueAutoRefreshScheduler = null;
			window.removeEventListener('keydown', handleQueueShortcut);
			unsubscribeAppearanceSettings();
	};
});

	$effect(() => {
		const nextSignature = `${workspace.id}:${workspace.path}`;

		if (ensureSignature === nextSignature) {
			return;
	}

		ensureSignature = nextSignature;
		files = [];
		error = null;
		parseError = null;
		status = null;
		selectedReport = null;
		selectedReportPath = null;
		selectedWorkOrder = null;
		selectedWorkOrderPath = null;
		selectedProposal = null;
		selectedProposalPath = null;
		promptPreviews = null;
		queueContextMenu = null;
		queueContextMenuElement = undefined;
		reviews = [];
		readFilePaths = readQueuePanelReadFilePaths(workspace.id);
		queueExecutionFilter = 'all';
		queueReadFilter = 'all';
		queueKindFilter = 'all';
		queuePriorityFilter = 'all';
		queueSortOption = 'created-desc';
		completedReportNotifications.reset();
		const emptyWorkspaceRegistries = createEmptyQueuePanelWorkspaceRegistryState(workspace.id);
		skillRegistry = emptyWorkspaceRegistries.skillRegistry;
		agentRegistry = emptyWorkspaceRegistries.agentRegistry;
		personaRegistry = emptyWorkspaceRegistries.personaRegistry;
		projectRegistry = emptyWorkspaceRegistries.projectRegistry;
		referenceRegistry = emptyWorkspaceRegistries.referenceRegistry;
		selectedManualSkillIds = [];
		selectedManualSkillOptionIds = [];
		selectedManualAgentIds = [];
		selectedManualProjectIds = [];
		selectedManualRepositoryIds = [];
		selectedManualReferenceIds = [];
		const workspaceId = workspace.id;
		const workspacePath = workspace.path;
		const readGeneration = ++workspaceDataReadGeneration;
		const workspaceDataReadIsStillCurrent = () =>
			workspaceDataReadIsCurrent(workspaceId, workspacePath, readGeneration);
		const workspaceRegistrySetters = {
			setSkillRegistry: (nextRegistry: SkillRegistry) => {
				skillRegistry = nextRegistry;
			},
			setAgentRegistry: (nextRegistry: AgentRegistry) => {
				agentRegistry = nextRegistry;
			},
			setPersonaRegistry: (nextRegistry: PersonaRegistry) => {
				personaRegistry = nextRegistry;
			},
			setProjectRegistry: (nextRegistry: ProjectRegistry) => {
				projectRegistry = nextRegistry;
			},
			setReferenceRegistry: (nextRegistry: ReferenceRegistry) => {
				referenceRegistry = nextRegistry;
			}
		};
		startQueuePanelWorkspaceRegistryReads({
			workspaceId,
			workspacePath,
			isCurrent: workspaceDataReadIsStillCurrent,
			...workspaceRegistrySetters
		});
		void refreshQueueFiles({ silent: true });

		const unsubscribeWorkspaceRegistries = subscribeQueuePanelWorkspaceRegistries(
			workspaceId,
			workspaceRegistrySetters
		);

		return () => {
			workspaceDataReadGeneration += 1;
			unsubscribeWorkspaceRegistries();
	};
});

	$effect(() => {
		if (refreshSignature === refreshSignal) {
			return;
	}

		refreshSignature = refreshSignal;
		void refreshQueueFiles();
});

	$effect(() => {
		if (queueContextMenu === null || queueContextMenuElement === undefined) {
			return;
	}

		void alignQueueContextMenuToViewport({
			menuSnapshot: queueContextMenu,
			menuElement: queueContextMenuElement
		});
});

	$effect(() => {
		if (queueContextMenu === null || typeof window === 'undefined') {
			return;
	}

		return subscribeQueueContextMenuDismissal({
			window,
			getMenuElement: () => queueContextMenuElement,
			close: closeQueueContextMenu
		});
});

	function workspaceDataReadIsCurrent(
		workspaceId: string,
		workspacePath: string,
		readGeneration: number
	) {
		return (
			readGeneration === workspaceDataReadGeneration &&
			workspace.id === workspaceId &&
			workspace.path === workspacePath
		);
	}

	async function readExecutionContextForWorkspace(): Promise<QueueExecutionContext> {
		const result = await executionContextReader.read({
			workspaceId: workspace.id,
			workspacePath: workspace.path
		});

		skillRegistry = result.skillRegistry;
		agentRegistry = result.agentRegistry;
		referenceRegistry = result.referenceRegistry;
		personaRegistry = result.personaRegistry;

		return result.executionContext;
	}

	async function refreshQueueFiles(options: { readonly silent?: boolean } = {}) {
		if (isRefreshing) {
			queueAutoRefreshScheduler?.reschedule();
			return;
	}

		isRefreshing = true;
		error = null;
		status = null;

		try {
			const result = await refreshQueuePanelFiles({
				workspaceId: workspace.id,
				workspacePath: workspace.path,
				currentFiles: files,
				currentReadFilePaths: readFilePaths,
				selectedWorkOrder,
				recoverStaleRunning: !isWriting && !isCancellingExecution,
				completedReportNotifications,
				showCompletedReportNotification
			});

			if (result.ok) {
				files = result.files;
				readFilePaths = result.readFilePaths;
				selectedWorkOrder = result.selectedWorkOrder;
				if (!options.silent) {
					status = null;
				}
				return;
			}

			error = result.error;
		} finally {
			isRefreshing = false;
			queueAutoRefreshScheduler?.reschedule();
		}
	}

	function getQueueAutoRefreshDelayMs() {
		if (typeof document !== 'undefined' && document.visibilityState !== 'visible') {
			return QUEUE_AUTO_REFRESH_HIDDEN_MS;
		}

		return hasActiveQueueWork() ? QUEUE_AUTO_REFRESH_ACTIVE_MS : QUEUE_AUTO_REFRESH_IDLE_MS;
	}

	function hasActiveQueueWork() {
		return (
			isWriting ||
			isCancellingExecution ||
			files.some((file) => file.executionState === 'running')
		);
	}

	async function handleSelectQueueArtifact(file: QueueFileEntry) {
		if (isReading) {
			return;
	}

		isReading = true;
		error = null;
		parseError = null;
		status = null;
		resetQueueArtifactSelectionState();

		try {
			const result = await readQueuePanelArtifactSelection(workspace.path, file);

			if (!result.ok) {
				applyQueueArtifactSelectionFailure(result);
				return;
			}

			applyQueueArtifactSelection(result.selection);
			markQueueFileRead(result.selection.relativePath);
	} finally {
			isReading = false;
	}
}

	function resetQueueArtifactSelectionState() {
		selectedReport = null;
		selectedReportPath = null;
		selectedWorkOrder = null;
		selectedWorkOrderPath = null;
		selectedProposal = null;
		selectedProposalPath = null;
		promptPreviews = null;
		reviews = [];
	}

	function applyQueueArtifactSelectionFailure(
		result: Exclude<QueuePanelArtifactSelectionResult, { readonly ok: true }>
	) {
		if ('error' in result) {
			error = result.error;
			return;
	}

		parseError = result.parseError;
	}

	function applyQueueArtifactSelection(selection: QueuePanelArtifactSelection) {
		if (selection.kind === 'result-report') {
			selectedReport = selection.report;
			selectedReportPath = selection.relativePath;
			reviews = selection.reviews;
			return;
	}

		if (selection.kind === 'work-order') {
			selectedWorkOrder = selection.workOrder;
			selectedWorkOrderPath = selection.relativePath;
			return;
		}

		selectedProposal = selection.proposal;
		selectedProposalPath = selection.relativePath;
	}

	function clearQueueSelection() {
		selectedReport = null;
		selectedReportPath = null;
		selectedWorkOrder = null;
		selectedWorkOrderPath = null;
		selectedProposal = null;
		selectedProposalPath = null;
		promptPreviews = null;
		reviews = [];
		parseError = null;
		status = null;
}

	function clearQueueSelectionForPath(relativePath: string) {
		if (selectedReportPath === relativePath) {
			selectedReport = null;
			selectedReportPath = null;
			reviews = [];
	}

		if (selectedWorkOrderPath === relativePath) {
			selectedWorkOrder = null;
			selectedWorkOrderPath = null;
			promptPreviews = null;
	}

		if (selectedProposalPath === relativePath) {
			selectedProposal = null;
			selectedProposalPath = null;
	}

		parseError = null;
}

	function removeQueueFilesFromState(relativePaths: readonly string[]) {
		if (relativePaths.length === 0) {
			return;
		}

		const relativePathSet = new Set(relativePaths);
		files = files.filter((file) => !relativePathSet.has(file.relativePath));
		readFilePaths = removeQueuePanelReadFilePaths({
			workspaceId: workspace.id,
			currentReadFilePaths: readFilePaths,
			relativePaths
		});

		for (const relativePath of relativePathSet) {
			clearQueueSelectionForPath(relativePath);
		}
	}

	function openQueueContextMenu(event: MouseEvent, file: QueueCardEntry) {
		if (!canOpenQueueContextMenu(file, isWriting)) {
			return;
	}

		queueContextMenu = createQueueContextMenuState(event, file);
}

	function closeQueueContextMenu() {
		queueContextMenu = null;
		queueContextMenuElement = undefined;
}

	async function alignQueueContextMenuToViewport(input: {
		readonly menuSnapshot: QueueContextMenuState;
		readonly menuElement: HTMLElement;
	}) {
		if (typeof window === 'undefined') {
			return;
	}

		const alignedMenu = await createViewportAlignedQueueContextMenu({
			...input,
			window,
			waitForDomUpdate: tick,
			isCurrent: () =>
				queueContextMenu === input.menuSnapshot &&
				queueContextMenuElement === input.menuElement
		});

		if (alignedMenu === null) {
			return;
	}

		queueContextMenu = alignedMenu;
}

	async function handleDeleteContextQueueFile() {
		const targetFile = queueContextMenu?.file ?? null;

		if (targetFile === null || targetFile.kind === 'unsupported' || isWriting) {
			return;
	}

		closeQueueContextMenu();
		isWriting = true;
		error = null;
		parseError = null;
		status = null;

		try {
			const result = await deleteQueuePanelFiles({
				workspacePath: workspace.path,
				relativePaths: [targetFile.relativePath]
			});

			if (!result.ok) {
				applyDeletedQueueFiles(result.deletedRelativePaths);
				error = result.error;
				return;
			}

			applyDeletedQueueFiles(result.deletedRelativePaths);
			status = messages.queue.deletedFile.replace(
				'{relativePath}',
				result.deletedRelativePaths[0] ?? targetFile.relativePath
			);
	} finally {
			isWriting = false;
	}
}

	async function handleBulkDeleteQueueFiles() {
		if (!canBulkDeleteQueueFiles) {
			return;
		}

		const targetFiles = bulkDeleteTargetFiles;

		if (targetFiles.length === 0) {
			return;
		}

		isWriting = true;
		error = null;
		parseError = null;
		status = null;

		try {
			const result = await deleteQueuePanelFiles({
				workspacePath: workspace.path,
				relativePaths: targetFiles.map((targetFile) => targetFile.relativePath)
			});

			if (!result.ok) {
				applyDeletedQueueFiles(result.deletedRelativePaths);
				error = result.error;
				return;
			}

			applyDeletedQueueFiles(result.deletedRelativePaths);
			status = messages.queue.bulkDeletedFiles.replace(
				'{count}',
				result.deletedRelativePaths.length.toString()
			);
	} finally {
			isWriting = false;
	}
}

	function applyDeletedQueueFiles(deletedRelativePaths: readonly string[]) {
		removeQueueFilesFromState(deletedRelativePaths);

		if (deletedRelativePaths.length > 0) {
			dispatchQueueFilesChanged(workspace.id);
		}
	}

	function applyManualWorkOrderDraft(draft: QueuePanelManualWorkOrderDraft) {
		manualWorkOrderTitle = draft.title;
		manualWorkOrderBody = draft.body;
		manualWorkOrderPriority = draft.priority;
		manualWorkOrderResponseLanguage = draft.responseLanguage;
		manualWorkOrderResponseFormat = draft.responseFormat;
		manualWorkOrderKind = draft.kind;
		manualVoteOptions = draft.voteOptions;
		manualVoteCriteriaInput = draft.voteCriteriaInput;
		selectedManualSkillIds = draft.selectedSkillIds;
		selectedManualSkillOptionIds = draft.selectedSkillOptionIds;
		selectedManualAgentIds = draft.selectedAgentIds;
		selectedManualProjectIds = draft.selectedProjectIds;
		selectedManualRepositoryIds = draft.selectedRepositoryIds;
		selectedManualReferenceIds = draft.selectedReferenceIds;
	}

	function resetManualWorkOrderDraft(input: {
		readonly responseLanguage?: WorkduckQueueResponseLanguage;
	} = {}) {
		applyManualWorkOrderDraft(createEmptyManualWorkOrderDraft(input));
	}

	function finishManualWorkOrderDialog() {
		isNewWorkOrderDialogOpen = false;
		workOrderDialogMode = 'create';
		editingWorkOrderTaskId = null;
		resetManualWorkOrderDraft();
	}

	function openNewWorkOrderDialog() {
		isNewWorkOrderDialogOpen = true;
		workOrderDialogMode = 'create';
		editingWorkOrderTaskId = null;
		resetManualWorkOrderDraft({ responseLanguage: getDefaultManualResponseLanguage() });
		error = null;
		parseError = null;
		status = null;
}

	function openEditWorkOrderTaskDialog(task: WorkduckQueueWorkOrderTask) {
		if (
			selectedWorkOrder === null ||
			selectedWorkOrderPath === null ||
			selectedWorkOrder.status === 'running' ||
			selectedWorkOrder.status === 'archived'
		) {
			return;
	}

		isNewWorkOrderDialogOpen = true;
		workOrderDialogMode = 'edit';
		editingWorkOrderTaskId = task.id;
		applyManualWorkOrderDraft(createManualWorkOrderDraftFromTask(task));
		error = null;
		parseError = null;
		status = null;
}

	function closeNewWorkOrderDialog() {
		if (isWriting) {
			return;
	}

		finishManualWorkOrderDialog();
}

	function handleQueueCardClick(file: QueueCardEntry) {
		if (file.kind === 'unsupported') {
			return;
	}

		if (isSelectedQueueFile(file)) {
			clearQueueSelection();
			return;
	}

		void handleSelectQueueArtifact(file);
}

	function markQueueFileRead(relativePath: string) {
		const nextReadState = markQueuePanelFileRead({
			workspaceId: workspace.id,
			currentFiles: files,
			currentReadFilePaths: readFilePaths,
			isAlreadyRead: readFilePathSet.has(relativePath),
			relativePath
		});

		files = nextReadState.files;
		readFilePaths = nextReadState.readFilePaths;
}

	function getQueueCardClass(file: QueueCardEntry) {
		return createQueueCardClassFromSelection(file, {
			reportPath: selectedReportPath,
			workOrderPath: selectedWorkOrderPath,
			proposalPath: selectedProposalPath
		});
}

	function isSelectedQueueFile(file: QueueCardEntry) {
		return isQueueFileSelected(file, {
			reportPath: selectedReportPath,
			workOrderPath: selectedWorkOrderPath,
			proposalPath: selectedProposalPath
		});
}

	function findReportEvaluationDelegationPath(report: WorkduckQueueResultReport) {
		return (
			files.find(
				(file) =>
					file.kind === 'work-order' &&
					file.sourceReportId === report.ref.id &&
					file.skillIds.includes(WORKDUCK_AGENT_RESPONSE_EVALUATOR_SKILL_ID)
			)?.relativePath ?? null
		);
}

	function updateReviewDecision(taskId: string, decision: Exclude<WorkduckQueueReviewDecision, 'pending'>) {
		reviews = reviews.map((review) =>
			review.taskId === taskId
				? {
						...review,
						decision,
						comment: decision === 'approved' ? '' : review.comment
					}
				: review
		);
}

	function updateReviewComment(taskId: string, comment: string) {
		reviews = reviews.map((review) =>
			review.taskId === taskId
				? {
						...review,
						comment
					}
				: review
		);
}

	async function handleDelegateReportEvaluation() {
		if (selectedReport === null || isWriting) {
			return;
		}

		if (!selectedReportCanDelegateEvaluation) {
			status = messages.queue.noEvaluationTargets;
			return;
		}

		if (selectedReportEvaluationDelegationPath !== null) {
			status = messages.queue.evaluationAlreadyDelegated.replace(
				'{relativePath}',
				selectedReportEvaluationDelegationPath
			);
			return;
		}

		isWriting = true;
		error = null;
		parseError = null;
		status = null;

		try {
			const result = await delegateQueuePanelReportEvaluation({
				workspacePath: workspace.path,
				reportPath: selectedReportPath,
				report: selectedReport,
				evaluatorSkillId: WORKDUCK_AGENT_RESPONSE_EVALUATOR_SKILL_ID
			});

			if (result.ok) {
				status = messages.queue.evaluationDelegated.replace('{relativePath}', result.relativePath);
				await refreshQueueFiles({ silent: true });
				return;
			}

			error = result.error;
		} finally {
			isWriting = false;
		}
	}

	async function handleCreateManualWorkOrder(event: SubmitEvent) {
		event.preventDefault();

		if (!canCreateManualWorkOrder) {
			return;
		}

		isWriting = true;
		error = null;
		status = null;

		try {
			if (workOrderDialogMode === 'edit') {
				await handleUpdateManualWorkOrder();
				return;
			}

			const result = await createQueuePanelManualWorkOrder({
				workspacePath: workspace.path,
				draft: createManualWorkOrderSaveDraft()
			});

			if (result.ok) {
				status = messages.queue.createdFile.replace('{relativePath}', result.relativePath);
				finishManualWorkOrderDialog();
				await refreshQueueFiles({ silent: true });
				return;
			}

			error = result.error;
		} finally {
			isWriting = false;
		}
	}

	async function handleUpdateManualWorkOrder() {
		if (
			selectedWorkOrder === null ||
			selectedWorkOrderPath === null ||
			editingWorkOrderTaskId === null
		) {
			return;
		}

		const result = await updateQueuePanelManualWorkOrder({
			workspacePath: workspace.path,
			workOrderPath: selectedWorkOrderPath,
			workOrder: selectedWorkOrder,
			taskId: editingWorkOrderTaskId,
			draft: createManualWorkOrderSaveDraft()
		});

		if (result.ok) {
			selectedWorkOrder = result.workOrder;
			selectedWorkOrderPath = result.relativePath;
			status = messages.queue.updatedFile.replace('{relativePath}', result.relativePath);
			finishManualWorkOrderDialog();
			await refreshQueueFiles({ silent: true });
			return;
		}

		error = result.error;
	}

	async function handlePreviewWorkOrderPrompt() {
		if (
			selectedWorkOrder === null ||
			!canPreviewSelectedWorkOrderPrompt ||
			isPreviewingPrompt
		) {
			return;
	}

		isPreviewingPrompt = true;
		error = null;
		parseError = null;
		status = null;

		try {
			const previewResult = await previewQueuePanelWorkOrderPrompt({
				workOrder: selectedWorkOrder,
				readExecutionContext: readExecutionContextForWorkspace
			});

			if (!previewResult.ok) {
				parseError = getQueueExecutionErrorMessage(previewResult.error);
				promptPreviews = null;
				return;
		}

			promptPreviews = previewResult.previews;
	} finally {
			isPreviewingPrompt = false;
	}
}

	function closePromptPreviewDialog() {
		promptPreviews = null;
}

	async function handleExecuteWorkOrder() {
		if (selectedWorkOrder === null || selectedWorkOrderPath === null || !canExecuteSelectedWorkOrder) {
			return;
	}

		const executableWorkOrder = selectedWorkOrder;
		const workOrderPath = selectedWorkOrderPath;
		const executionId = crypto.randomUUID();
		activeExecution = {
			executionId,
			workspacePath: workspace.path,
			workOrderId: executableWorkOrder.ref.id
		};

		isWriting = true;
		error = null;
		parseError = null;
		status = messages.queue.executing;

		try {
			const executionResult = await executeQueuePanelWorkOrder({
				executionId,
				workspacePath: workspace.path,
				workOrderPath,
				workOrder: executableWorkOrder,
				readExecutionContext: readExecutionContextForWorkspace,
				readVault: () => readEnvironmentVaultSession(workspace.id),
				onRunningWorkOrderSaved: async (runningWorkOrder) => {
					selectedWorkOrder = runningWorkOrder;
					await prepareDesktopNotificationPermission();
				}
			});

			await applyQueuePanelWorkOrderExecutionResult(executionResult);
	} finally {
			if (activeExecution?.executionId === executionId) {
				activeExecution = null;
			}
			isWriting = false;
	}
}

	async function applyQueuePanelWorkOrderExecutionResult(
		result: QueuePanelWorkOrderExecutionResult
	) {
		if (!result.ok) {
			await applyQueuePanelWorkOrderExecutionFailure(result);
			return;
		}

		await applyQueuePanelWorkOrderExecutionSuccess(result);
}

	async function applyQueuePanelWorkOrderExecutionSuccess(
		result: QueuePanelWorkOrderExecutionSuccessResult
	) {
		selectedWorkOrder = result.workOrder;
		status = messages.queue.executedFile.replace('{relativePath}', result.reportRelativePath);
		completedReportNotifications.rememberPath(result.reportRelativePath);
		showCompletedReportNotification(result.report.ref.label, result.reportRelativePath);
		await refreshQueueFiles({ silent: true });
}

	async function applyQueuePanelWorkOrderExecutionFailure(
		result: QueuePanelWorkOrderExecutionFailureResult
	) {
		parseError = getQueueExecutionErrorMessage(result.error);

		if (result.workOrder !== null) {
			selectedWorkOrder = result.workOrder;
			await refreshQueueFiles({ silent: true });
		}

		status = null;
}

	async function handleCancelWorkOrderExecution() {
		if (selectedWorkOrder === null || !canCancelSelectedWorkOrderExecution) {
			return;
	}

		isCancellingExecution = true;
		parseError = null;
		status = messages.queue.cancellingExecution;

		try {
			const executionId =
				activeExecution?.workspacePath === workspace.path &&
				activeExecution.workOrderId === selectedWorkOrder.ref.id
					? activeExecution.executionId
					: null;
			const cancelResult = await cancelQueuePanelWorkOrder({
				executionId,
				workspacePath: workspace.path,
				workOrderPath: selectedWorkOrderPath,
				workOrderId: selectedWorkOrder.ref.id
			});

			if (cancelResult.ok && cancelResult.recoveredWorkOrder !== null) {
				selectedWorkOrder = cancelResult.recoveredWorkOrder;
				status = null;
				await refreshQueueFiles({ silent: true });
				return;
			}

			if (!cancelResult.ok) {
				parseError = getQueueExecutionErrorMessage(cancelResult.error);
				status = null;
			}
		} finally {
			isCancellingExecution = false;
		}
	}

	async function handleCompleteWorkOrder() {
		if (
			selectedWorkOrder === null ||
			selectedWorkOrderPath === null ||
			!canCompleteSelectedWorkOrder
		) {
			return;
		}

		isWriting = true;
		error = null;
		parseError = null;

		try {
			const completionResult = await completeQueuePanelWorkOrder({
				workspacePath: workspace.path,
				workOrderPath: selectedWorkOrderPath,
				workOrder: selectedWorkOrder
			});

			if (!completionResult.ok) {
				error = completionResult.error;
				return;
			}

			selectedWorkOrder = completionResult.workOrder;
			status = messages.queue.completedFile.replace(
				'{relativePath}',
				completionResult.relativePath
			);
			await refreshQueueFiles({ silent: true });
		} finally {
			isWriting = false;
		}
	}

	function getExecutionFilterLabel(filter: QueueExecutionFilter) {
		return getLocalizedExecutionFilterLabel(messages, filter);
}

	function getReadFilterLabel(filter: QueueReadFilter) {
		return getLocalizedReadFilterLabel(messages, filter);
}

	function getKindFilterLabel(filter: QueueKindFilter) {
		return getLocalizedKindFilterLabel(messages, filter);
}

	function getQueueExecutionStateLabel(executionState: WorkduckQueueExecutionState | null) {
		return getLocalizedQueueExecutionStateLabel(messages, executionState);
}

	function getQueuePriorityLabel(priority: WorkduckQueueWorkPriority) {
		return getLocalizedQueuePriorityLabel(messages, priority);
}

	function getQueuePriorityFilterLabel(filter: QueuePriorityFilter) {
		return getLocalizedQueuePriorityFilterLabel(messages, filter);
}

	function getQueueSortLabel(sortOption: QueueSortOption) {
		return getLocalizedQueueSortLabel(messages, sortOption);
}

	function getQueueResponseLanguageLabel(language: WorkduckQueueResponseLanguage) {
		return getLocalizedQueueResponseLanguageLabel(messages, language);
}

	function getQueueResponseFormatLabel(format: WorkduckQueueResponseFormat) {
		return getLocalizedQueueResponseFormatLabel(messages, format);
}

	function getDefaultManualResponseLanguage(): WorkduckQueueResponseLanguage {
		return appearanceSettings.languageId;
}

	function createManualWorkOrderSkillIds() {
		return selectedManualSkillIds;
}

	function createManualWorkOrderAgentIds() {
		return selectedManualAgentIds;
}

	function createManualWorkOrderProjectIds() {
		return selectedManualProjectIds;
}

	function createManualWorkOrderRepositoryIds() {
		return selectedManualRepositoryIds;
}

	function createManualWorkOrderReferenceIds() {
		return selectedManualReferenceIds;
	}

	function createManualWorkOrderSaveDraft(): QueuePanelManualWorkOrderSaveDraft {
		return {
			title: getManualWorkOrderTitle(),
			body: createManualWorkOrderBody(),
			priority: manualWorkOrderPriority,
			skillIds: createManualWorkOrderSkillIds(),
			agentIds: createManualWorkOrderAgentIds(),
			referenceIds: createManualWorkOrderReferenceIds(),
			projectIds: createManualWorkOrderProjectIds(),
			repositoryIds: createManualWorkOrderRepositoryIds(),
			kindInput: createManualWorkOrderKindInput()
		};
	}

	function getSkillDisplayName(skill: WorkduckSkillRecord) {
		return getLocalizedSkillDisplayName(messages, skill);
	}

	function sortSkillsForDisplay(skills: readonly WorkduckSkillRecord[]) {
		return [...skills].sort((left, right) =>
			getSkillDisplayName(left).localeCompare(getSkillDisplayName(right), undefined, {
				numeric: true,
				sensitivity: 'base'
			})
		);
	}

	function getAgentDisplayName(agent: AgentRecord) {
		return getAgentDisplayNameFromRecord(agent);
}

	function getProjectDisplayName(project: ProjectNodeRecord) {
		return getProjectDisplayNameFromRecord(project);
}

	function getRepositoryDisplayName(repository: ProjectRepositorySelectionOption) {
		return repository.label;
}

	function getReferenceDisplayName(reference: ReferenceRecord) {
		return getReferenceDisplayNameFromRecord(reference);
}

	function getSkillLabelById(skillId: string) {
		return getRecordLabelById(allSkills, skillId, getSkillDisplayName);
}

	function getAgentLabelById(agentId: string) {
		return getRecordLabelById(allAgents, agentId, getAgentDisplayName);
}

	function getProjectLabelById(projectId: string) {
		return getRecordLabelById(allProjects, projectId, getProjectDisplayName);
	}

	function getRepositoryLabelById(repositoryId: string) {
		return getRecordLabelById(allRepositories, repositoryId, getRepositoryDisplayName);
	}

	function getReferenceLabelById(referenceId: string) {
		return getRecordLabelById(allReferences, referenceId, getReferenceDisplayName);
	}

	function toggleManualWorkOrderSkill(skillId: string, isSelected: boolean) {
		const nextSelection = updateManualWorkOrderSkillSelection({
			selectedSkillIds: selectedManualSkillIds,
			selectedSkillOptionIds: selectedManualSkillOptionIds,
			skillId,
			isSelected,
			kind: manualWorkOrderKind,
			skills: allSkills,
			responseFormat: manualWorkOrderResponseFormat
		});

		selectedManualSkillIds = nextSelection.selectedSkillIds;
		selectedManualSkillOptionIds = nextSelection.selectedSkillOptionIds;
		manualWorkOrderResponseFormat = nextSelection.responseFormat;
	}

	function toggleManualWorkOrderAgent(agentId: string, isSelected: boolean) {
		selectedManualAgentIds = updateManualWorkOrderRecordSelection(
			selectedManualAgentIds,
			agentId,
			isSelected
		);
	}

	function toggleManualSkillOption(
		skillId: string,
		groupId: string,
		optionId: string,
		selectionMode: 'single' | 'multiple',
		isSelected: boolean
	) {
		selectedManualSkillOptionIds = updateManualSkillOptionSelection({
			selectedSkillOptionIds: selectedManualSkillOptionIds,
			skillId,
			groupId,
			optionId,
			selectionMode,
			isSelected
		});
	}

	function toggleManualWorkOrderProject(projectId: string, isSelected: boolean) {
		selectedManualProjectIds = updateManualWorkOrderRecordSelection(
			selectedManualProjectIds,
			projectId,
			isSelected
		);
	}

	function toggleManualWorkOrderRepository(repositoryId: string, isSelected: boolean) {
		selectedManualRepositoryIds = updateManualWorkOrderRecordSelection(
			selectedManualRepositoryIds,
			repositoryId,
			isSelected
		);
	}

	function toggleManualWorkOrderReference(referenceId: string, isSelected: boolean) {
		selectedManualReferenceIds = updateManualWorkOrderRecordSelection(
			selectedManualReferenceIds,
			referenceId,
			isSelected
		);
	}

	function addManualVoteOption() {
		manualVoteOptions = addManualVoteOptionToDraft(manualVoteOptions);
	}

	function removeManualVoteOption(index: number) {
		manualVoteOptions = removeManualVoteOptionFromDraft(manualVoteOptions, index);
	}

	function updateManualVoteOption(
		index: number,
		field: 'label' | 'description',
		value: string
	) {
		manualVoteOptions = updateManualVoteOptionInDraft({
			options: manualVoteOptions,
			index,
			field,
			value
		});
	}

	function getManualWorkOrderTitle() {
		return createManualWorkOrderResolvedTitle({
			title: manualWorkOrderTitle,
			body: manualWorkOrderBody,
			kind: manualWorkOrderKind,
			directMessageLabel: messages.queue.workTypes.directMessage
		});
	}

	function createManualWorkOrderBody() {
		return createManualWorkOrderBodyWithSkillOptions({
			body: manualWorkOrderBody,
			skillOptionsAreVisible: manualSkillOptionsAreVisible,
			selectedSkillOptionIds: selectedManualSkillOptionIds,
			skills: allSkills,
			skillOptionsTitle: messages.queue.skillOptions.title,
			getSkillDisplayName
		});
	}

	function createManualWorkOrderKindInput() {
		return createManualWorkOrderKindInputFromFields({
			kind: manualWorkOrderKind,
			responseLanguage: manualWorkOrderResponseLanguage,
			responseFormat: manualWorkOrderResponseFormat,
			body: manualWorkOrderBody,
			voteOptions: manualVoteOptions,
			voteCriteriaInput: manualVoteCriteriaInput
	});
	}

	function getQueueTaskSkillLabels(task: WorkduckQueueWorkOrderTask) {
		return (task.skillIds ?? []).map(getSkillLabelById);
}

	function getQueueTaskAgentLabels(task: WorkduckQueueWorkOrderTask) {
		return (task.agentIds ?? []).map(getAgentLabelById);
}

	function getQueueTaskProjectLabels(task: WorkduckQueueWorkOrderTask) {
		return (task.projectIds ?? []).map(getProjectLabelById);
}

	function getQueueTaskRepositoryLabels(task: WorkduckQueueWorkOrderTask) {
		return (task.repositoryIds ?? []).map(getRepositoryLabelById);
}

	function getQueueTaskReferenceLabels(task: WorkduckQueueWorkOrderTask) {
		return (task.referenceIds ?? []).map(getReferenceLabelById);
}

	function getQueueTaskKindLabel(kind: WorkduckQueueTaskKind | undefined) {
		return getLocalizedQueueTaskKindLabel(messages, kind);
}

	function getVoteChoiceLabel(task: WorkduckQueueResultReportTask) {
		return getLocalizedVoteChoiceLabel(messages, task);
}

	function getReviewDecisionLabel(decision: Exclude<WorkduckQueueReviewDecision, 'pending'>) {
		return getLocalizedReviewDecisionLabel(messages, decision);
}

	function getReportTaskAgent(task: WorkduckQueueResultReportTask) {
		return findReportTaskAgent(task, allAgents);
}

	function isReportTaskEvaluationRecorded(task: WorkduckQueueResultReportTask) {
		const agent = getReportTaskAgent(task);

		if (agent === null || selectedReport === null) {
			return false;
		}

		const evaluationKey = createQueueReportTaskEvaluationKey(selectedReport, task);

		return (
			hasQueueReportTaskEvaluation(task, agent.id) ||
			agent.evaluationKeys.includes(evaluationKey)
		);
}

	function openEvaluationDialog(task: WorkduckQueueResultReportTask) {
		const agent = getReportTaskAgent(task);

		if (
			agent === null ||
			!canOpenQueueEvaluationDialog({
				agent,
				isWriting,
				isSavingEvaluation,
				isEvaluationRecorded: isReportTaskEvaluationRecorded(task)
			})
		) {
			return;
	}

		const nextState = createOpenQueueEvaluationDialogState(task, agent);

		evaluationDialog = nextState.dialog;
		evaluationScores = nextState.scores;
		error = null;
		parseError = null;
		status = null;
}

	function closeEvaluationDialog() {
		if (!canCloseQueueEvaluationDialog(isSavingEvaluation)) {
			return;
	}

		const nextState = createClosedQueueEvaluationDialogState();

		evaluationDialog = nextState.dialog;
		evaluationScores = nextState.scores;
}

	function updateEvaluationScore(criterionId: AgentEvaluationCriterionId, value: string) {
		evaluationScores = createUpdatedQueueEvaluationScores(evaluationScores, criterionId, value);
}

	async function handleSaveEvaluation(event: SubmitEvent) {
		event.preventDefault();

		if (evaluationDialog === null || isSavingEvaluation) {
			return;
	}

		if (selectedReport === null || selectedReportPath === null) {
			parseError = messages.queue.errors.fileInvalid;
			return;
		}

		isSavingEvaluation = true;
		error = null;
		parseError = null;
		status = null;

		try {
			const saveResult = await saveQueuePanelEvaluation({
				workspaceId: workspace.id,
				workspacePath: workspace.path,
				report: selectedReport,
				reportPath: selectedReportPath,
				task: evaluationDialog.task,
				agentId: evaluationDialog.agent.id,
				scores: evaluationScores
			});

			await applyQueuePanelEvaluationSaveState(saveResult);

			if (!saveResult.ok) {
				parseError = getQueuePanelEvaluationSaveFailureMessage(saveResult.code);
				return;
			}

			status = saveResult.applied
				? messages.queue.evaluation.saved
				: messages.queue.evaluation.alreadySaved;
			const nextState = createClosedQueueEvaluationDialogState();

			evaluationDialog = nextState.dialog;
			evaluationScores = nextState.scores;
	} finally {
			isSavingEvaluation = false;
	}
}

	async function applyQueuePanelEvaluationSaveState(result: QueuePanelEvaluationSaveResult) {
		if (result.agentRegistry !== null) {
			agentRegistry = result.agentRegistry;
		}

		if (result.report !== null && result.reportRelativePath !== null) {
			selectedReport = result.report;
			completedReportNotifications.rememberPath(result.reportRelativePath);
			await refreshQueueFiles({ silent: true });
		}

		if (result.personaRegistry !== null) {
			personaRegistry = result.personaRegistry;
		}
}

	function getQueuePanelEvaluationSaveFailureMessage(
		code: QueuePanelEvaluationSaveFailureCode
	) {
		switch (code) {
			case 'agent-read-failed':
				return messages.agents.errors.readFailed;
			case 'agent-not-found':
				return messages.agents.errors.notFound;
			case 'agent-save-failed':
				return messages.agents.errors.saveFailed;
			case 'report-write-failed':
				return messages.queue.errors.fileWriteFailed;
			case 'persona-read-failed':
				return messages.personas.errors.readFailed;
			case 'persona-save-failed':
				return messages.personas.errors.saveFailed;
		}
}

	function getQueueFolderLocalizedError(error: QueueFolderError) {
		return getLocalizedQueueFolderError(messages, error);
}

	function getQueueExecutionErrorMessage(executionError: Parameters<typeof getLocalizedQueueExecutionErrorMessage>[1]) {
		return getLocalizedQueueExecutionErrorMessage(messages, executionError);
}

	function showCompletedReportNotification(title: string, relativePath: string) {
		showDesktopNotificationWhenUnfocused({
			title: messages.queue.reportNotification.title,
			body: messages.queue.reportNotification.body
				.replace('{title}', title)
				.replace('{relativePath}', relativePath),
			tag: `workduck-queue-report:${workspace.id}:${relativePath}`
		});
}
	return {
		get messages() { return messages; },
		get queueItemCountLabel() { return queueItemCountLabel; },
		get files() { return files; },
		get filteredFiles() { return filteredFiles; },
		get queueExecutionFilter() { return queueExecutionFilter; },
		set queueExecutionFilter(value: QueueExecutionFilter) { queueExecutionFilter = value; },
		get queueReadFilter() { return queueReadFilter; },
		set queueReadFilter(value: QueueReadFilter) { queueReadFilter = value; },
		get queueKindFilter() { return queueKindFilter; },
		set queueKindFilter(value: QueueKindFilter) { queueKindFilter = value; },
		get queuePriorityFilter() { return queuePriorityFilter; },
		set queuePriorityFilter(value: QueuePriorityFilter) { queuePriorityFilter = value; },
		get queueSortOption() { return queueSortOption; },
		set queueSortOption(value: QueueSortOption) { queueSortOption = value; },
		get bulkDeleteIncludesPending() { return bulkDeleteIncludesPending; },
		set bulkDeleteIncludesPending(value: boolean) { bulkDeleteIncludesPending = value; },
		get bulkDeleteTargetCount() { return bulkDeleteTargetCount; },
		get canBulkDeleteQueueFiles() { return canBulkDeleteQueueFiles; },
		get error() { return error; },
		get parseError() { return parseError; },
		get status() { return status; },
		get selectedReport() { return selectedReport; },
		get selectedReportPath() { return selectedReportPath; },
		get selectedReportVoteAggregate() { return selectedReportVoteAggregate; },
		get selectedReportEvaluationDelegationPath() { return selectedReportEvaluationDelegationPath; },
		get selectedReportCanDelegateEvaluation() { return selectedReportCanDelegateEvaluation; },
		get selectedWorkOrder() { return selectedWorkOrder; },
		get selectedProposal() { return selectedProposal; },
		get selectedProposalPath() { return selectedProposalPath; },
		get promptPreviews() { return promptPreviews; },
		get reviews() { return reviews; },
		get reviewDecisionOptions() { return reviewDecisionOptions; },
		get isNewWorkOrderDialogOpen() { return isNewWorkOrderDialogOpen; },
		get manualWorkOrderTitle() { return manualWorkOrderTitle; },
		set manualWorkOrderTitle(value: string) { manualWorkOrderTitle = value; },
		get manualWorkOrderBody() { return manualWorkOrderBody; },
		set manualWorkOrderBody(value: string) { manualWorkOrderBody = value; },
		get manualWorkOrderPriority() { return manualWorkOrderPriority; },
		set manualWorkOrderPriority(value: WorkduckQueueWorkPriority) { manualWorkOrderPriority = value; },
		get manualWorkOrderResponseLanguage() { return manualWorkOrderResponseLanguage; },
		set manualWorkOrderResponseLanguage(value: WorkduckQueueResponseLanguage) { manualWorkOrderResponseLanguage = value; },
		get manualWorkOrderResponseFormat() { return manualWorkOrderResponseFormat; },
		set manualWorkOrderResponseFormat(value: WorkduckQueueResponseFormat) { manualWorkOrderResponseFormat = value; },
		get manualWorkOrderKind() { return manualWorkOrderKind; },
		set manualWorkOrderKind(value: WorkduckQueueTaskKind) { manualWorkOrderKind = value; },
		get manualVoteOptions() { return manualVoteOptions; },
		get manualVoteCriteriaInput() { return manualVoteCriteriaInput; },
		set manualVoteCriteriaInput(value: string) { manualVoteCriteriaInput = value; },
		get selectedManualSkillIds() { return selectedManualSkillIds; },
		get selectedManualSkillOptionIds() { return selectedManualSkillOptionIds; },
		get selectedManualAgentIds() { return selectedManualAgentIds; },
		get selectedManualProjectIds() { return selectedManualProjectIds; },
		get selectedManualRepositoryIds() { return selectedManualRepositoryIds; },
		get selectedManualReferenceIds() { return selectedManualReferenceIds; },
		get allSkills() { return allSkills; },
		get allAgents() { return allAgents; },
		get allProjects() { return allProjects; },
		get allRepositories() { return allRepositories; },
		get prioritizedReferences() { return prioritizedReferences; },
		get isRefreshing() { return isRefreshing; },
		get isReading() { return isReading; },
		get isWriting() { return isWriting; },
		get isPreviewingPrompt() { return isPreviewingPrompt; },
		get isCancellingExecution() { return isCancellingExecution; },
		get isSavingEvaluation() { return isSavingEvaluation; },
		get evaluationDialog() { return evaluationDialog; },
		get evaluationScores() { return evaluationScores; },
		get queueContextMenu() { return queueContextMenu; },
		get queueContextMenuElement() { return queueContextMenuElement; },
		set queueContextMenuElement(value: HTMLElement | undefined) { queueContextMenuElement = value; },
		get hasSelectedQueueArtifact() { return hasSelectedQueueArtifact; },
		get canCreateManualWorkOrder() { return canCreateManualWorkOrder; },
		get canExecuteSelectedWorkOrder() { return canExecuteSelectedWorkOrder; },
		get canPreviewSelectedWorkOrderPrompt() { return canPreviewSelectedWorkOrderPrompt; },
		get canCompleteSelectedWorkOrder() { return canCompleteSelectedWorkOrder; },
		get canCancelSelectedWorkOrderExecution() { return canCancelSelectedWorkOrderExecution; },
		get workOrderDialogTitle() { return workOrderDialogTitle; },
		get workOrderDialogSubmitLabel() { return workOrderDialogSubmitLabel; },
		get manualSkillOptionsAreVisible() { return manualSkillOptionsAreVisible; },
		get manualWorkOrderSkillSummary() { return manualWorkOrderSkillSummary; },
		get manualWorkOrderAgentSummary() { return manualWorkOrderAgentSummary; },
		get manualWorkOrderProjectSummary() { return manualWorkOrderProjectSummary; },
		get manualWorkOrderRepositorySummary() { return manualWorkOrderRepositorySummary; },
		get manualWorkOrderReferenceSummary() { return manualWorkOrderReferenceSummary; },
		refreshQueueFiles,
		getExecutionFilterLabel,
		getReadFilterLabel,
		openNewWorkOrderDialog,
		handleQueueCardClick,
		openQueueContextMenu,
		getQueueCardClass,
		isSelectedQueueFile,
		getQueuePriorityLabel,
		getKindFilterLabel,
		getQueuePriorityFilterLabel,
		getQueueSortLabel,
		getQueueResponseFormatLabel,
		getQueueExecutionStateLabel,
		getQueueFolderLocalizedError,
		handleDelegateReportEvaluation,
		updateReviewDecision,
		updateReviewComment,
		openEvaluationDialog,
		getVoteChoiceLabel,
		getReportTaskAgent,
		getReviewDecisionLabel,
		isReportTaskEvaluationRecorded,
		handlePreviewWorkOrderPrompt,
		closePromptPreviewDialog,
		handleExecuteWorkOrder,
		handleCancelWorkOrderExecution,
		handleCompleteWorkOrder,
		openEditWorkOrderTaskDialog,
		handleBulkDeleteQueueFiles,
		getQueueResponseLanguageLabel,
		getQueueTaskKindLabel,
		getQueueTaskProjectLabels,
		getQueueTaskRepositoryLabels,
		getQueueTaskSkillLabels,
		getQueueTaskAgentLabels,
		getQueueTaskReferenceLabels,
		handleDeleteContextQueueFile,
		closeEvaluationDialog,
		updateEvaluationScore,
		handleSaveEvaluation,
		closeNewWorkOrderDialog,
		handleCreateManualWorkOrder,
		toggleManualWorkOrderSkill,
		toggleManualSkillOption,
		toggleManualWorkOrderAgent,
		toggleManualWorkOrderProject,
		toggleManualWorkOrderRepository,
		toggleManualWorkOrderReference,
		addManualVoteOption,
		removeManualVoteOption,
		updateManualVoteOption,
		getSkillDisplayName,
		getAgentDisplayName,
		getProjectDisplayName,
		getRepositoryDisplayName,
		getReferenceDisplayName
};
}

export type QueuePanelController = ReturnType<typeof createQueuePanelController>;
