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
	createEmptyAgentRegistry,
	recordAgentEvaluationOnce,
	type AgentRecord,
	type AgentRegistry
} from '$lib/agents/agent-registry';
import {
	readAgentRegistry,
	subscribeAgentRegistry,
	writeAgentRegistry
} from '$lib/agents/agent-registry-storage';
import {
	createDefaultAgentEvaluationScores,
	normalizeAgentEvaluationScore,
	type AgentEvaluationCriterionId,
	type AgentEvaluationScores
} from '$lib/agents/agent-evaluation';
import {
	createEmptyPersonaRegistry,
	syncPersonaEvaluationSummariesFromAgents,
	type PersonaRecord,
	type PersonaRegistry
} from '$lib/personas/persona-registry';
import {
	readPersonaRegistry,
	subscribePersonaRegistry,
	writePersonaRegistry
} from '$lib/personas/persona-registry-storage';
import {
	createEmptyReferenceRegistry,
	type ReferenceRecord,
	type ReferenceRegistry
} from '$lib/references/reference-registry';
import {
	readReferenceRegistry,
	subscribeReferenceRegistry
} from '$lib/references/reference-registry-storage';
import {
	createEmptyProjectRegistry,
	type ProjectNodeRecord,
	type ProjectRegistry
} from '$lib/projects/project-registry';
import {
	createProjectRepositorySelectionOptions,
	type ProjectRepositorySelectionOption
} from '$lib/projects/project-repository-selection';
import { readProjectRegistry, subscribeProjectRegistry } from '$lib/projects/project-storage';
import {
	createEmptySkillRegistry,
	getAllSkills,
	WORKDUCK_AGENT_RESPONSE_EVALUATOR_SKILL_ID,
	type SkillRegistry,
	type WorkduckSkillRecord
} from '$lib/skills/skill-registry';
import { readSkillRegistry, subscribeSkillRegistry } from '$lib/skills/skill-registry-storage';
import {
	prepareDesktopNotificationPermission,
	showDesktopNotificationWhenUnfocused
} from '$lib/ui/desktop-notification';

import {
	archiveQueueWorkOrder,
	createDefaultReportReviews,
	createQueueReportTaskEvaluationKey,
	createManualQueueWorkOrder,
	createQueueResultReportFileNameFromLabel,
	createQueueWorkOrderFileName,
	createQueueWorkOrderForReportEvaluation,
	failQueueWorkOrderExecution,
	hasQueueReportTaskEvaluation,
	defaultQueueResponseFormat,
	defaultQueueResponseLanguage,
	defaultQueueWorkPriority,
	QUEUE_WORK_ORDER_BODY_MAX_LENGTH,
	QUEUE_WORK_ORDER_TITLE_MAX_LENGTH,
	normalizeQueueResponseFormat,
	normalizeQueueResponseLanguage,
	normalizeQueueTaskKind,
	normalizeQueueWorkPriority,
	parseQueueProposal,
	parseQueueResultReport,
	parseQueueWorkOrder,
	recordQueueReportTaskEvaluation,
	serializeQueueArtifact,
	startQueueWorkOrderExecution,
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
	updateQueueWorkOrderTask,
	type WorkduckQueueReviewDecision
} from './queue-artifacts';
import { readEnvironmentVaultSession } from '$lib/environment/environment-vault-session';
import {
	cancelQueueWorkOrderExecution,
	executeQueueWorkOrder,
	inspectQueueWorkOrderExecutions,
	previewQueueWorkOrderPrompt,
	type WorkduckQueuePromptPreview
} from './queue-execution';
import {
	deleteQueueFile,
	ensureQueueFolder,
	listQueueFiles,
	readQueueFile,
	updateQueueResultReportFile,
	updateQueueWorkOrderFile,
	writeQueueResultReportFile,
	writeQueueWorkOrderFile,
	type QueueFileEntry,
	type QueueFolderError
} from './queue-folder';
import {
	createVoteAggregate,
	type WorkduckQueueVoteSpec,
	type WorkduckQueueTaskKind
} from './queue-voting';
import { createQueueCardEntries } from './queue-card-entry';
import {
	dispatchQueueFilesChanged,
	pruneQueueReadFilePaths,
	readQueueReadFilePaths,
	writeQueueReadFilePaths
} from './queue-read-state';
import {
	createManualVoteOptions,
	createManualVoteFieldState,
	createManualWorkOrderKindInput as createManualWorkOrderKindInputFromFields,
	createQueueFilesSignature,
	createSelectionSummary,
	sortReferencesForProjectSelection,
	updateSelectedRecordIds
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

export interface QueuePanelControllerInput {
	readonly workspace: () => WorkspaceRecord;
	readonly refreshSignal: () => number;
}

const queuePrioritySortRank = {
	urgent: 4,
	high: 3,
	normal: 2,
	low: 1
} as const satisfies Record<WorkduckQueueWorkPriority, number>;

function compareQueueFiles(left: QueueCardEntry, right: QueueCardEntry, sortOption: QueueSortOption) {
	switch (sortOption) {
		case 'created-asc':
			return compareQueueCreatedAt(left, right, 'asc') || compareQueueTitle(left, right);
		case 'created-desc':
			return compareQueueCreatedAt(left, right, 'desc') || compareQueueTitle(left, right);
		case 'priority-asc':
			return (
				compareQueuePriority(left, right, 'asc') ||
				compareQueueCreatedAt(left, right, 'desc') ||
				compareQueueTitle(left, right)
			);
		case 'priority-desc':
			return (
				compareQueuePriority(left, right, 'desc') ||
				compareQueueCreatedAt(left, right, 'desc') ||
				compareQueueTitle(left, right)
			);
	}
}

function compareQueueCreatedAt(
	left: QueueCardEntry,
	right: QueueCardEntry,
	direction: 'asc' | 'desc'
) {
	const leftTimestamp = getQueueCreatedAtTime(left);
	const rightTimestamp = getQueueCreatedAtTime(right);

	if (leftTimestamp === 0 && rightTimestamp === 0) {
		return 0;
	}

	if (leftTimestamp === 0) {
		return 1;
	}

	if (rightTimestamp === 0) {
		return -1;
	}

	return direction === 'asc'
		? leftTimestamp - rightTimestamp
		: rightTimestamp - leftTimestamp;
}

function compareQueuePriority(
	left: QueueCardEntry,
	right: QueueCardEntry,
	direction: 'asc' | 'desc'
) {
	const leftRank = getQueuePrioritySortRank(left);
	const rightRank = getQueuePrioritySortRank(right);

	if (leftRank === 0 && rightRank === 0) {
		return 0;
	}

	if (leftRank === 0) {
		return 1;
	}

	if (rightRank === 0) {
		return -1;
	}

	return direction === 'asc' ? leftRank - rightRank : rightRank - leftRank;
}

function compareQueueTitle(left: QueueCardEntry, right: QueueCardEntry) {
	return left.title.localeCompare(right.title);
}

function getQueueCreatedAtTime(file: QueueCardEntry) {
	const timestamp = Date.parse(file.createdAt);

	return Number.isFinite(timestamp) ? timestamp : 0;
}

function getQueuePrioritySortRank(file: QueueCardEntry) {
	return file.priority === null ? 0 : queuePrioritySortRank[file.priority];
}

function shouldBulkDeleteQueueFile(file: QueueCardEntry, includePending: boolean) {
	if (file.kind === 'unsupported') {
		return false;
	}

	return (
		file.executionState === 'completed' ||
		(includePending && file.executionState !== null)
	);
}

export function createQueuePanelController(input: QueuePanelControllerInput) {
	let workspace = $derived(input.workspace());
	let refreshSignal = $derived(input.refreshSignal());
	const QUEUE_AUTO_REFRESH_INTERVAL_MS = 30_000;
	const QUEUE_CONTEXT_MENU_MARGIN_PX = 12;
	const reviewDecisionOptions = [
		{ value: 'approved' },
		{ value: 'needs-work' },
		{ value: 'rollback' }
	] as const satisfies readonly {
		readonly value: Exclude<WorkduckQueueReviewDecision, 'pending'>;
	}[];


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
	let manualWorkOrderTitle = $state('');
	let manualWorkOrderBody = $state('');
	let manualWorkOrderPriority = $state<WorkduckQueueWorkPriority>(defaultQueueWorkPriority);
	let manualWorkOrderResponseLanguage =
		$state<WorkduckQueueResponseLanguage>(defaultQueueResponseLanguage);
	let manualWorkOrderResponseFormat =
		$state<WorkduckQueueResponseFormat>(defaultQueueResponseFormat);
	let manualWorkOrderKind = $state<WorkduckQueueTaskKind>('instruction');
	let manualVoteOptions = $state<readonly ManualVoteOptionInput[]>(createManualVoteOptions(2));
	let manualVoteCriteriaInput = $state('');
	let selectedManualSkillIds = $state<string[]>([]);
	let selectedManualSkillOptionIds = $state<string[]>([]);
	let selectedManualAgentIds = $state<string[]>([]);
	let selectedManualProjectIds = $state<string[]>([]);
	let selectedManualRepositoryIds = $state<string[]>([]);
	let selectedManualReferenceIds = $state<string[]>([]);
	let skillRegistry = $state<SkillRegistry>(createEmptySkillRegistry(''));
	let agentRegistry = $state<AgentRegistry>(createEmptyAgentRegistry(''));
	let personaRegistry = $state<PersonaRegistry>(createEmptyPersonaRegistry(''));
	let projectRegistry = $state<ProjectRegistry>(createEmptyProjectRegistry(''));
	let referenceRegistry = $state<ReferenceRegistry>(createEmptyReferenceRegistry(''));
	let isRefreshing = $state(false);
	let isReading = $state(false);
	let isWriting = $state(false);
	let isPreviewingPrompt = $state(false);
	let isCancellingExecution = $state(false);
	let isSavingEvaluation = $state(false);
	let evaluationDialog = $state<AgentEvaluationDialogState | null>(null);
	let evaluationScores = $state<AgentEvaluationScores>(createDefaultAgentEvaluationScores());
	let queueContextMenu = $state<QueueContextMenuState | null>(null);
	let queueContextMenuElement = $state<HTMLElement | undefined>(undefined);
	let ensureSignature = $state('');
	let refreshSignature = $state(0);
	let workspaceDataReadGeneration = 0;
	let knownCompletedReportPaths = new Set<string>();
	let completedReportNotificationsArePrimed = false;
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
		files.filter((file) => {
			const matchesExecutionFilter =
				queueExecutionFilter === 'all' ||
				(queueExecutionFilter === 'pending' && file.executionState === 'pending') ||
				(queueExecutionFilter === 'running' && file.executionState === 'running') ||
				(queueExecutionFilter === 'failed' && file.executionState === 'failed') ||
				(queueExecutionFilter === 'completed' && file.executionState === 'completed');
			const matchesReadFilter =
				queueReadFilter === 'all' ||
				(queueReadFilter === 'unread' && !file.isRead) ||
				(queueReadFilter === 'read' && file.isRead);
			const matchesKindFilter = queueKindFilter === 'all' || file.kind === queueKindFilter;
			const matchesPriorityFilter =
				queuePriorityFilter === 'all' || file.priority === queuePriorityFilter;

			if (
				!matchesExecutionFilter ||
				!matchesReadFilter ||
				!matchesKindFilter ||
				!matchesPriorityFilter
			) {
				return false;
			}

			return true;
	}).sort((left, right) => compareQueueFiles(left, right, queueSortOption))
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
		const intervalId = window.setInterval(() => {
			void refreshQueueFiles({ silent: true });
	}, QUEUE_AUTO_REFRESH_INTERVAL_MS);
		const handleQueueShortcut = (event: KeyboardEvent) => {
			if (event.key !== 'F5') {
				return;
			}

			event.preventDefault();
			void refreshQueueFiles();
	};

		window.addEventListener('keydown', handleQueueShortcut);

		return () => {
			window.removeEventListener('keydown', handleQueueShortcut);
			window.clearInterval(intervalId);
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
		readFilePaths = readQueueReadFilePaths(workspace.id);
		queueExecutionFilter = 'all';
		queueReadFilter = 'all';
		queueKindFilter = 'all';
		queuePriorityFilter = 'all';
		queueSortOption = 'created-desc';
		knownCompletedReportPaths = new Set();
		completedReportNotificationsArePrimed = false;
		skillRegistry = createEmptySkillRegistry(workspace.id);
		agentRegistry = createEmptyAgentRegistry(workspace.id);
		personaRegistry = createEmptyPersonaRegistry(workspace.id);
		projectRegistry = createEmptyProjectRegistry(workspace.id);
		referenceRegistry = createEmptyReferenceRegistry(workspace.id);
		selectedManualSkillIds = [];
		selectedManualSkillOptionIds = [];
		selectedManualAgentIds = [];
		selectedManualProjectIds = [];
		selectedManualRepositoryIds = [];
		selectedManualReferenceIds = [];
		const readGeneration = ++workspaceDataReadGeneration;
		void readSkillsForWorkspace(workspace.id, workspace.path, readGeneration);
		void readAgentsForWorkspace(workspace.id, workspace.path, readGeneration);
		void readPersonasForWorkspace(workspace.id, workspace.path, readGeneration);
		void readProjectsForWorkspace(workspace.id, workspace.path, readGeneration);
		void readReferencesForWorkspace(workspace.id, workspace.path, readGeneration);
		void ensureQueueFolderForWorkspace(workspace.id, workspace.path, readGeneration);

		const unsubscribeSkillRegistry = subscribeSkillRegistry(workspace.id, (nextRegistry) => {
			skillRegistry = nextRegistry;
	});
		const unsubscribeAgentRegistry = subscribeAgentRegistry(workspace.id, (nextRegistry) => {
			agentRegistry = nextRegistry;
	});
		const unsubscribePersonaRegistry = subscribePersonaRegistry(workspace.id, (nextRegistry) => {
			personaRegistry = nextRegistry;
	});
		const unsubscribeProjectRegistry = subscribeProjectRegistry(workspace.id, (nextRegistry) => {
			projectRegistry = nextRegistry;
	});
		const unsubscribeReferenceRegistry = subscribeReferenceRegistry(workspace.id, (nextRegistry) => {
			referenceRegistry = nextRegistry;
	});

		return () => {
			workspaceDataReadGeneration += 1;
			unsubscribeSkillRegistry();
			unsubscribeAgentRegistry();
			unsubscribePersonaRegistry();
			unsubscribeProjectRegistry();
			unsubscribeReferenceRegistry();
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

		void alignQueueContextMenuToViewport(queueContextMenu, queueContextMenuElement);
});

	$effect(() => {
		if (queueContextMenu === null || typeof window === 'undefined') {
			return;
	}

		function handleGlobalPointerDown(event: PointerEvent) {
			if (
				queueContextMenuElement !== undefined &&
				event.target instanceof Node &&
				queueContextMenuElement.contains(event.target)
			) {
				return;
			}

			closeQueueContextMenu();
	}

		function handleGlobalContextKey(event: KeyboardEvent) {
			if (event.key === 'Escape') {
				closeQueueContextMenu();
			}
	}

		window.addEventListener('pointerdown', handleGlobalPointerDown);
		window.addEventListener('keydown', handleGlobalContextKey);

		return () => {
			window.removeEventListener('pointerdown', handleGlobalPointerDown);
			window.removeEventListener('keydown', handleGlobalContextKey);
	};
});

	async function ensureQueueFolderForWorkspace(
		workspaceId: string,
		workspacePath: string,
		readGeneration: number
	) {
		const result = await ensureQueueFolder(workspacePath);

		if (!workspaceDataReadIsCurrent(workspaceId, workspacePath, readGeneration)) {
			return;
		}

		if (result.ok) {
			error = null;
			await refreshQueueFiles({ silent: true });
			return;
		}

		error = result.error;
		status = null;
	}

	async function readSkillsForWorkspace(
		workspaceId: string,
		workspacePath: string,
		readGeneration: number
	) {
		const result = await readSkillRegistry(workspaceId, workspacePath);

		if (!workspaceDataReadIsCurrent(workspaceId, workspacePath, readGeneration)) {
			return;
		}

		skillRegistry = result.registry;
	}

	async function readAgentsForWorkspace(
		workspaceId: string,
		workspacePath: string,
		readGeneration: number
	) {
		const result = await readAgentRegistry(workspaceId, workspacePath);

		if (!workspaceDataReadIsCurrent(workspaceId, workspacePath, readGeneration)) {
			return;
		}

		agentRegistry = result.registry;
	}

	async function readPersonasForWorkspace(
		workspaceId: string,
		workspacePath: string,
		readGeneration: number
	) {
		const result = await readPersonaRegistry(workspaceId, workspacePath);

		if (!workspaceDataReadIsCurrent(workspaceId, workspacePath, readGeneration)) {
			return;
		}

		personaRegistry = result.registry;
	}

	async function readProjectsForWorkspace(
		workspaceId: string,
		workspacePath: string,
		readGeneration: number
	) {
		const result = await readProjectRegistry(workspaceId);

		if (!workspaceDataReadIsCurrent(workspaceId, workspacePath, readGeneration)) {
			return;
		}

		projectRegistry = result.registry;
	}

	async function readReferencesForWorkspace(
		workspaceId: string,
		workspacePath: string,
		readGeneration: number
	) {
		const result = await readReferenceRegistry(workspaceId, workspacePath);

		if (!workspaceDataReadIsCurrent(workspaceId, workspacePath, readGeneration)) {
			return;
		}

		referenceRegistry = result.registry;
	}

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
		const [skillResult, agentResult, referenceResult, personaResult] = await Promise.all([
			readSkillRegistry(workspace.id, workspace.path),
			readAgentRegistry(workspace.id, workspace.path),
			readReferenceRegistry(workspace.id, workspace.path),
			readPersonaRegistry(workspace.id, workspace.path)
		]);

		skillRegistry = skillResult.registry;
		agentRegistry = agentResult.registry;
		referenceRegistry = referenceResult.registry;
		personaRegistry = personaResult.registry;

		return {
			agents: agentResult.registry.agents,
			skills: getAllSkills(skillResult.registry),
			references: referenceResult.registry.references,
			personas: personaResult.registry.personas
	};
}

	async function refreshQueueFiles(options: { readonly silent?: boolean } = {}) {
		if (isRefreshing) {
			return;
	}

		isRefreshing = true;
		error = null;
		status = null;

		try {
			const result = await listQueueFiles(workspace.path);

			if (result.ok) {
				const nextReadFilePaths = pruneQueueReadFilePaths(readFilePaths, result.files);

				if (nextReadFilePaths.length !== readFilePaths.length) {
					readFilePaths = nextReadFilePaths;
					writeQueueReadFilePaths(workspace.id, nextReadFilePaths);
				}

				let nextFiles = await createQueueCardEntries(
					workspace.path,
					nextReadFilePaths,
					result.files
				);
				const recoveredStaleRunningWorkOrders =
					!isWriting && !isCancellingExecution
						? await recoverStaleRunningWorkOrders(nextFiles)
						: false;

				if (recoveredStaleRunningWorkOrders) {
					nextFiles = await createQueueCardEntries(
						workspace.path,
						nextReadFilePaths,
						result.files
					);
				}

				const previousSignature = createQueueFilesSignature(files);
				const nextSignature = createQueueFilesSignature(nextFiles);
				notifyNewCompletedReports(nextFiles);
				files = nextFiles;
				if (previousSignature !== nextSignature) {
					dispatchQueueFilesChanged(workspace.id);
				}
				if (!options.silent) {
					status = null;
				}
				return;
			}

			error = result.error;
		} finally {
			isRefreshing = false;
		}
	}

	async function recoverStaleRunningWorkOrders(queueFiles: readonly QueueCardEntry[]) {
		const runningWorkOrderFiles = queueFiles.filter(
			(file) =>
				file.kind === 'work-order' &&
				file.executionState === 'running' &&
				file.artifactId.trim().length > 0
		);

		if (runningWorkOrderFiles.length === 0) {
			return false;
		}

		const inspectResult = await inspectQueueWorkOrderExecutions({
			workOrderIds: runningWorkOrderFiles.map((file) => file.artifactId)
		});

		if (!inspectResult.ok) {
			return false;
		}

		const runningWorkOrderIds = new Set(
			inspectResult.runningWorkOrderIds
				.map((workOrderId) => workOrderId.trim())
				.filter((workOrderId) => workOrderId.length > 0)
		);
		let recoveredAny = false;

		for (const file of runningWorkOrderFiles) {
			const workOrderId = file.artifactId.trim();

			if (runningWorkOrderIds.has(workOrderId)) {
				continue;
			}

			const recoveredWorkOrder = await markStaleRunningWorkOrderFailed(
				file.relativePath,
				workOrderId
			);

			if (recoveredWorkOrder !== null) {
				recoveredAny = true;
			}
		}

		return recoveredAny;
	}

	async function markStaleRunningWorkOrderFailed(relativePath: string, workOrderId: string) {
		const normalizedWorkOrderId = workOrderId.trim();

		if (normalizedWorkOrderId.length === 0) {
			return null;
		}

		const readResult = await readQueueFile(workspace.path, relativePath);

		if (!readResult.ok) {
			return null;
		}

		const parsed = parseQueueWorkOrder(readResult.content);

		if (!parsed.ok) {
			return null;
		}

		if (
			parsed.workOrder.status !== 'running' ||
			parsed.workOrder.ref.id.trim() !== normalizedWorkOrderId
		) {
			return null;
		}

		const failedWorkOrder = failQueueWorkOrderExecution(parsed.workOrder);
		const updateResult = await updateQueueWorkOrderFile(
			workspace.path,
			relativePath,
			serializeQueueArtifact(failedWorkOrder)
		);

		if (!updateResult.ok) {
			return null;
		}

		if (selectedWorkOrder?.ref.id === failedWorkOrder.ref.id) {
			selectedWorkOrder = failedWorkOrder;
		}

		return failedWorkOrder;
	}

	async function handleReviewReport(file: QueueFileEntry) {
		if (isReading) {
			return;
	}

		isReading = true;
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
		reviews = [];

		try {
			const result = await readQueueFile(workspace.path, file.relativePath);

			if (!result.ok) {
				error = result.error;
				return;
			}

			const parsed = parseQueueResultReport(result.content);

			if (!parsed.ok) {
				parseError = parsed.message;
				return;
			}

			selectedReport = parsed.report;
			selectedReportPath = result.relativePath;
			reviews = createDefaultReportReviews(parsed.report);
			markQueueFileRead(result.relativePath);
	} finally {
			isReading = false;
	}
}

	async function handleViewWorkOrder(file: QueueFileEntry) {
		if (isReading) {
			return;
	}

		isReading = true;
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
		reviews = [];

		try {
			const result = await readQueueFile(workspace.path, file.relativePath);

			if (!result.ok) {
				error = result.error;
				return;
			}

			const parsed = parseQueueWorkOrder(result.content);

			if (!parsed.ok) {
				parseError = parsed.message;
				return;
			}

			selectedWorkOrder = parsed.workOrder;
			selectedWorkOrderPath = result.relativePath;
			markQueueFileRead(result.relativePath);
	} finally {
			isReading = false;
	}
}

	async function handleViewProposal(file: QueueFileEntry) {
		if (isReading) {
			return;
	}

		isReading = true;
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
		reviews = [];

		try {
			const result = await readQueueFile(workspace.path, file.relativePath);

			if (!result.ok) {
				error = result.error;
				return;
			}

			const parsed = parseQueueProposal(result.content);

			if (!parsed.ok) {
				parseError = parsed.message;
				return;
			}

			selectedProposal = parsed.proposal;
			selectedProposalPath = result.relativePath;
			markQueueFileRead(result.relativePath);
	} finally {
			isReading = false;
	}
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
		readFilePaths = readFilePaths.filter((relativePath) => !relativePathSet.has(relativePath));
		writeQueueReadFilePaths(workspace.id, readFilePaths);

		for (const relativePath of relativePathSet) {
			clearQueueSelectionForPath(relativePath);
		}
	}

	function openQueueContextMenu(event: MouseEvent, file: QueueCardEntry) {
		if (file.kind === 'unsupported' || isWriting) {
			return;
	}

		event.preventDefault();
		event.stopPropagation();
		queueContextMenu = {
			x: event.clientX,
			y: event.clientY,
			file
	};
}

	function closeQueueContextMenu() {
		queueContextMenu = null;
		queueContextMenuElement = undefined;
}

	async function alignQueueContextMenuToViewport(
		menuSnapshot: QueueContextMenuState,
		menuElement: HTMLElement
	) {
		await tick();

		if (
			typeof window === 'undefined' ||
			queueContextMenu !== menuSnapshot ||
			queueContextMenuElement !== menuElement
		) {
			return;
	}

		const menuRect = menuElement.getBoundingClientRect();
		const maxX = Math.max(
			QUEUE_CONTEXT_MENU_MARGIN_PX,
			window.innerWidth - menuRect.width - QUEUE_CONTEXT_MENU_MARGIN_PX
		);
		const maxY = Math.max(
			QUEUE_CONTEXT_MENU_MARGIN_PX,
			window.innerHeight - menuRect.height - QUEUE_CONTEXT_MENU_MARGIN_PX
		);
		const nextX = Math.min(Math.max(QUEUE_CONTEXT_MENU_MARGIN_PX, menuSnapshot.x), maxX);
		const nextY = Math.min(Math.max(QUEUE_CONTEXT_MENU_MARGIN_PX, menuSnapshot.y), maxY);

		if (nextX === menuSnapshot.x && nextY === menuSnapshot.y) {
			return;
	}

		queueContextMenu = {
			...menuSnapshot,
			x: nextX,
			y: nextY
	};
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
			const result = await deleteQueueFile(workspace.path, targetFile.relativePath);

			if (!result.ok) {
				error = result.error;
				return;
			}

			removeQueueFilesFromState([result.relativePath]);
			status = messages.queue.deletedFile.replace('{relativePath}', result.relativePath);
			dispatchQueueFilesChanged(workspace.id);
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

		const deletedRelativePaths: string[] = [];

		try {
			for (const targetFile of targetFiles) {
				const result = await deleteQueueFile(workspace.path, targetFile.relativePath);

				if (!result.ok) {
					removeQueueFilesFromState(deletedRelativePaths);

					if (deletedRelativePaths.length > 0) {
						dispatchQueueFilesChanged(workspace.id);
					}

					error = result.error;
					return;
				}

				deletedRelativePaths.push(result.relativePath);
			}

			removeQueueFilesFromState(deletedRelativePaths);
			status = messages.queue.bulkDeletedFiles.replace(
				'{count}',
				deletedRelativePaths.length.toString()
			);
			dispatchQueueFilesChanged(workspace.id);
	} finally {
			isWriting = false;
	}
}

	function openNewWorkOrderDialog() {
		isNewWorkOrderDialogOpen = true;
		workOrderDialogMode = 'create';
		editingWorkOrderTaskId = null;
		manualWorkOrderTitle = '';
		manualWorkOrderBody = '';
		manualWorkOrderPriority = defaultQueueWorkPriority;
		manualWorkOrderResponseLanguage = getDefaultManualResponseLanguage();
		manualWorkOrderResponseFormat = defaultQueueResponseFormat;
		manualWorkOrderKind = 'instruction';
		resetManualVoteFields();
		selectedManualSkillIds = [];
		selectedManualSkillOptionIds = [];
		selectedManualAgentIds = [];
		selectedManualProjectIds = [];
		selectedManualRepositoryIds = [];
		selectedManualReferenceIds = [];
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
		manualWorkOrderTitle = task.title;
		manualWorkOrderBody = task.body;
		manualWorkOrderPriority = normalizeQueueWorkPriority(task.priority);
		manualWorkOrderResponseLanguage = normalizeQueueResponseLanguage(task.responseLanguage);
		manualWorkOrderResponseFormat = normalizeQueueResponseFormat(task.responseFormat);
		manualWorkOrderKind = normalizeQueueTaskKind(task.kind);
		loadManualVoteFields(task.vote);
		selectedManualSkillIds = [...(task.skillIds ?? [])];
	selectedManualSkillOptionIds = [];
		selectedManualAgentIds = [...(task.agentIds ?? [])];
		selectedManualProjectIds = [...(task.projectIds ?? [])];
		selectedManualRepositoryIds = [...(task.repositoryIds ?? [])];
		selectedManualReferenceIds = [...(task.referenceIds ?? [])];
		error = null;
		parseError = null;
		status = null;
}

	function closeNewWorkOrderDialog() {
		if (isWriting) {
			return;
	}

		isNewWorkOrderDialogOpen = false;
		workOrderDialogMode = 'create';
		editingWorkOrderTaskId = null;
		manualWorkOrderTitle = '';
		manualWorkOrderBody = '';
		manualWorkOrderPriority = defaultQueueWorkPriority;
		manualWorkOrderResponseLanguage = defaultQueueResponseLanguage;
		manualWorkOrderResponseFormat = defaultQueueResponseFormat;
		manualWorkOrderKind = 'instruction';
		resetManualVoteFields();
		selectedManualSkillIds = [];
		selectedManualSkillOptionIds = [];
		selectedManualAgentIds = [];
		selectedManualProjectIds = [];
		selectedManualRepositoryIds = [];
		selectedManualReferenceIds = [];
}

	function handleQueueCardClick(file: QueueCardEntry) {
		if (file.kind === 'unsupported') {
			return;
	}

		if (isSelectedQueueFile(file)) {
			clearQueueSelection();
			return;
	}

		if (file.kind === 'result-report') {
			void handleReviewReport(file);
			return;
	}

		if (file.kind === 'proposal') {
			void handleViewProposal(file);
			return;
	}

		void handleViewWorkOrder(file);
}

	function markQueueFileRead(relativePath: string) {
		if (readFilePathSet.has(relativePath)) {
			if (files.some((file) => file.relativePath === relativePath && !file.isRead)) {
				files = files.map((file) =>
					file.relativePath === relativePath ? { ...file, isRead: true } : file
				);
			}
			return;
	}

		const nextReadFilePaths = [...readFilePaths, relativePath];

		readFilePaths = nextReadFilePaths;
		files = files.map((file) =>
			file.relativePath === relativePath ? { ...file, isRead: true } : file
		);
		writeQueueReadFilePaths(workspace.id, nextReadFilePaths);
}

	function getQueueCardClass(file: QueueCardEntry) {
		return [
			'workduck-queue-file',
			file.kind === 'unsupported' ? 'workduck-queue-file-disabled' : 'workduck-queue-file-button',
			isSelectedQueueFile(file) ? 'workduck-queue-file-selected' : '',
			file.executionState === 'pending' ? 'workduck-queue-file-pending' : '',
			file.executionState === 'running' ? 'workduck-queue-file-running' : '',
			file.executionState === 'failed' ? 'workduck-queue-file-failed' : '',
			file.executionState === 'completed' ? 'workduck-queue-file-completed' : ''
		]
			.filter(Boolean)
			.join(' ');
}

	function isSelectedQueueFile(file: QueueCardEntry) {
		return (
			file.relativePath === selectedReportPath ||
			file.relativePath === selectedWorkOrderPath ||
			file.relativePath === selectedProposalPath
		);
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

		const workOrder = createQueueWorkOrderForReportEvaluation(selectedReport, {
			workspacePath: workspace.path,
			reportPath: selectedReportPath,
			evaluatorSkillId: WORKDUCK_AGENT_RESPONSE_EVALUATOR_SKILL_ID
	});

		isWriting = true;
		error = null;
		parseError = null;
		status = null;

		try {
			const result = await writeQueueWorkOrderFile(
				workspace.path,
				createQueueWorkOrderFileName(workOrder),
				serializeQueueArtifact(workOrder)
			);

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

			const workOrder = createManualQueueWorkOrder(
				getManualWorkOrderTitle(),
				createManualWorkOrderBody(),
				manualWorkOrderPriority,
				createManualWorkOrderSkillIds(),
				createManualWorkOrderAgentIds(),
				createManualWorkOrderReferenceIds(),
				{
					...createManualWorkOrderKindInput(),
					projectIds: createManualWorkOrderProjectIds(),
					repositoryIds: createManualWorkOrderRepositoryIds()
				}
			);
			const result = await writeQueueWorkOrderFile(
				workspace.path,
				createQueueWorkOrderFileName(workOrder),
				serializeQueueArtifact(workOrder)
			);

			if (result.ok) {
				status = messages.queue.createdFile.replace('{relativePath}', result.relativePath);
				isNewWorkOrderDialogOpen = false;
				manualWorkOrderTitle = '';
				manualWorkOrderBody = '';
				manualWorkOrderPriority = defaultQueueWorkPriority;
				manualWorkOrderResponseLanguage = defaultQueueResponseLanguage;
				manualWorkOrderResponseFormat = defaultQueueResponseFormat;
				manualWorkOrderKind = 'instruction';
				resetManualVoteFields();
				selectedManualSkillIds = [];
				selectedManualSkillOptionIds = [];
				selectedManualAgentIds = [];
				selectedManualProjectIds = [];
				selectedManualRepositoryIds = [];
				selectedManualReferenceIds = [];
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

		const nextWorkOrder = updateQueueWorkOrderTask(selectedWorkOrder, editingWorkOrderTaskId, {
			title: getManualWorkOrderTitle(),
			body: createManualWorkOrderBody(),
			priority: manualWorkOrderPriority,
			projectIds: createManualWorkOrderProjectIds(),
			repositoryIds: createManualWorkOrderRepositoryIds(),
			skillIds: createManualWorkOrderSkillIds(),
			agentIds: createManualWorkOrderAgentIds(),
			referenceIds: createManualWorkOrderReferenceIds(),
			...createManualWorkOrderKindInput()
	});
		const result = await updateQueueWorkOrderFile(
			workspace.path,
			selectedWorkOrderPath,
			serializeQueueArtifact(nextWorkOrder)
		);

		if (result.ok) {
			selectedWorkOrder = nextWorkOrder;
			selectedWorkOrderPath = result.relativePath;
			status = messages.queue.updatedFile.replace('{relativePath}', result.relativePath);
			isNewWorkOrderDialogOpen = false;
			manualWorkOrderTitle = '';
			manualWorkOrderBody = '';
			manualWorkOrderPriority = defaultQueueWorkPriority;
			manualWorkOrderResponseLanguage = defaultQueueResponseLanguage;
			manualWorkOrderResponseFormat = defaultQueueResponseFormat;
			manualWorkOrderKind = 'instruction';
			resetManualVoteFields();
			selectedManualSkillIds = [];
			selectedManualSkillOptionIds = [];
			selectedManualAgentIds = [];
			selectedManualProjectIds = [];
			selectedManualRepositoryIds = [];
			selectedManualReferenceIds = [];
			editingWorkOrderTaskId = null;
			workOrderDialogMode = 'create';
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
			const executionContext = await readExecutionContextForWorkspace();
			const previewResult = await previewQueueWorkOrderPrompt({
				workOrder: selectedWorkOrder,
				agents: executionContext.agents,
				skills: executionContext.skills,
				references: executionContext.references,
				personas: executionContext.personas
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
		const runningWorkOrder = startQueueWorkOrderExecution(executableWorkOrder);

		isWriting = true;
		error = null;
		parseError = null;
		status = messages.queue.executing;

		try {
			const runningResult = await updateQueueWorkOrderFile(
				workspace.path,
				workOrderPath,
				serializeQueueArtifact(runningWorkOrder)
			);

			if (!runningResult.ok) {
				error = runningResult.error;
				status = null;
				return;
			}

			selectedWorkOrder = runningWorkOrder;
			await refreshQueueFiles({ silent: true });
			await prepareDesktopNotificationPermission();
			const executionContext = await readExecutionContextForWorkspace();
			const executionResult = await executeQueueWorkOrder({
				workOrder: executableWorkOrder,
				agents: executionContext.agents,
				vault: readEnvironmentVaultSession(workspace.id),
				skills: executionContext.skills,
				references: executionContext.references,
				personas: executionContext.personas
			});

			if (!executionResult.ok) {
				parseError = getQueueExecutionErrorMessage(executionResult.error);
				const failedWorkOrder = failQueueWorkOrderExecution(runningWorkOrder);
				const failedResult = await updateQueueWorkOrderFile(
					workspace.path,
					workOrderPath,
					serializeQueueArtifact(failedWorkOrder)
				);

				if (failedResult.ok) {
					selectedWorkOrder = failedWorkOrder;
					await refreshQueueFiles({ silent: true });
				}
				status = null;
				return;
			}

			const reportWriteResult = await writeQueueResultReportFile(
				workspace.path,
				createQueueResultReportFileNameFromLabel(executionResult.report.ref.label),
				serializeQueueArtifact(executionResult.report)
			);

			if (!reportWriteResult.ok) {
				error = reportWriteResult.error;
				const failedWorkOrder = failQueueWorkOrderExecution(runningWorkOrder);
				const failedResult = await updateQueueWorkOrderFile(
					workspace.path,
					workOrderPath,
					serializeQueueArtifact(failedWorkOrder)
				);

				if (failedResult.ok) {
					selectedWorkOrder = failedWorkOrder;
					await refreshQueueFiles({ silent: true });
				}
				status = null;
				return;
			}

			const archivedWorkOrder = archiveQueueWorkOrder(runningWorkOrder);
			const archiveResult = await updateQueueWorkOrderFile(
				workspace.path,
				workOrderPath,
				serializeQueueArtifact(archivedWorkOrder)
			);

			if (!archiveResult.ok) {
				error = archiveResult.error;
				status = null;
				return;
			}

			selectedWorkOrder = archivedWorkOrder;
			status = messages.queue.executedFile.replace('{relativePath}', reportWriteResult.relativePath);
			rememberCompletedReportPath(reportWriteResult.relativePath);
			showCompletedReportNotification(
				executionResult.report.ref.label,
				reportWriteResult.relativePath
			);
			await refreshQueueFiles({ silent: true });
	} finally {
			isWriting = false;
	}
}

	async function handleCancelWorkOrderExecution() {
		if (selectedWorkOrder === null || !canCancelSelectedWorkOrderExecution) {
			return;
	}

		isCancellingExecution = true;
		parseError = null;
		status = messages.queue.cancellingExecution;

		try {
			const cancelResult = await cancelQueueWorkOrderExecution({
				workOrderId: selectedWorkOrder.ref.id
			});

			if (!cancelResult.ok) {
				if (
					cancelResult.error === 'queue-execution-work-order-not-running' &&
					selectedWorkOrderPath !== null
				) {
					const recoveredWorkOrder = await markStaleRunningWorkOrderFailed(
						selectedWorkOrderPath,
						selectedWorkOrder.ref.id
					);

					if (recoveredWorkOrder !== null) {
						selectedWorkOrder = recoveredWorkOrder;
						status = null;
						await refreshQueueFiles({ silent: true });
						return;
					}
				}

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
			const archivedWorkOrder = archiveQueueWorkOrder(selectedWorkOrder);
			const archiveResult = await updateQueueWorkOrderFile(
				workspace.path,
				selectedWorkOrderPath,
				serializeQueueArtifact(archivedWorkOrder)
			);

			if (!archiveResult.ok) {
				error = archiveResult.error;
				return;
		}

			selectedWorkOrder = archivedWorkOrder;
			status = messages.queue.completedFile.replace('{relativePath}', archiveResult.relativePath);
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
		selectedManualSkillIds = updateSelectedRecordIds(selectedManualSkillIds, skillId, isSelected);

		if (!isSelected) {
			selectedManualSkillOptionIds = selectedManualSkillOptionIds.filter(
				(optionId) => !optionId.startsWith(`${skillId}:`)
			);
			applyManualSkillResponseFormat();
			return;
		}

		if (!isSelected || manualWorkOrderKind !== 'instruction') {
			return;
		}

		applyManualSkillResponseFormat();
	}

	function applyManualSkillResponseFormat() {
		if (manualWorkOrderKind !== 'instruction') {
			return;
		}

		const selectedSkills = allSkills.filter((skill) => selectedManualSkillIds.includes(skill.id));

		if (selectedSkills.some((skill) => skill.outputTypes.includes('revision'))) {
			manualWorkOrderResponseFormat = 'revision-draft';
			return;
		}

		if (selectedSkills.some((skill) => skill.outputTypes.includes('writing'))) {
			manualWorkOrderResponseFormat = 'writing-draft';
		}
	}

	function toggleManualWorkOrderAgent(agentId: string, isSelected: boolean) {
		selectedManualAgentIds = updateSelectedRecordIds(selectedManualAgentIds, agentId, isSelected);
	}

	function toggleManualSkillOption(
		skillId: string,
		groupId: string,
		optionId: string,
		selectionMode: 'single' | 'multiple',
		isSelected: boolean
	) {
		const selectionId = createSkillOptionSelectionId(skillId, groupId, optionId);

		if (selectionMode === 'single') {
			const groupPrefix = `${skillId}:${groupId}:`;
			selectedManualSkillOptionIds = isSelected
				? [
						...selectedManualSkillOptionIds.filter(
							(selectedOptionId) => !selectedOptionId.startsWith(groupPrefix)
						),
						selectionId
					]
				: selectedManualSkillOptionIds.filter(
						(selectedOptionId) => selectedOptionId !== selectionId
					);
			return;
		}

		selectedManualSkillOptionIds = updateSelectedRecordIds(
			selectedManualSkillOptionIds,
			selectionId,
			isSelected
		);
	}

	function toggleManualWorkOrderProject(projectId: string, isSelected: boolean) {
		selectedManualProjectIds = updateSelectedRecordIds(selectedManualProjectIds, projectId, isSelected);
	}

	function toggleManualWorkOrderRepository(repositoryId: string, isSelected: boolean) {
		selectedManualRepositoryIds = updateSelectedRecordIds(
			selectedManualRepositoryIds,
			repositoryId,
			isSelected
		);
	}

	function toggleManualWorkOrderReference(referenceId: string, isSelected: boolean) {
		selectedManualReferenceIds = updateSelectedRecordIds(
			selectedManualReferenceIds,
			referenceId,
			isSelected
		);
	}

	function resetManualVoteFields() {
		const nextFields = createManualVoteFieldState(undefined);

		manualVoteOptions = nextFields.options;
		manualVoteCriteriaInput = nextFields.criteriaInput;
	}

	function loadManualVoteFields(vote: WorkduckQueueVoteSpec | undefined) {
		const nextFields = createManualVoteFieldState(vote);

		manualVoteOptions = nextFields.options;
		manualVoteCriteriaInput = nextFields.criteriaInput;
	}

	function addManualVoteOption() {
		if (manualVoteOptions.length >= 50) {
			return;
		}

		manualVoteOptions = createManualVoteOptions(manualVoteOptions.length + 1, manualVoteOptions);
	}

	function removeManualVoteOption(index: number) {
		if (manualVoteOptions.length <= 2) {
			return;
		}

		const nextOptions = manualVoteOptions
			.filter((_, optionIndex) => optionIndex !== index)
			.map(({ id, label, description }) => ({ id, label, description }));

		manualVoteOptions = createManualVoteOptions(nextOptions.length, nextOptions);
	}

	function updateManualVoteOption(
		index: number,
		field: 'label' | 'description',
		value: string
	) {
		manualVoteOptions = manualVoteOptions.map((option, optionIndex) =>
			optionIndex === index ? { ...option, [field]: value } : option
		);
	}

	function getManualWorkOrderTitle() {
		const explicitTitle = manualWorkOrderTitle.trim();

		if (manualWorkOrderKind !== 'direct-message') {
			return explicitTitle;
		}

		const firstLine = manualWorkOrderBody
			.split(/\r?\n/u)
			.map((line) => line.trim().replace(/\s+/g, ' '))
			.find((line) => line.length > 0);

		if (firstLine === undefined) {
			return '';
		}

		const summary = firstLine.length <= 48 ? firstLine : `${firstLine.slice(0, 45).trimEnd()}...`;

		return `${messages.queue.workTypes.directMessage}: ${summary}`;
	}

	function createManualWorkOrderBody() {
		if (!manualSkillOptionsAreVisible || selectedManualSkillOptionIds.length === 0) {
			return manualWorkOrderBody;
		}

		const selectedOptionSet = new Set(selectedManualSkillOptionIds);
		const optionLines = allSkills.flatMap((skill) =>
			skill.optionGroups.flatMap((group) =>
				group.options
					.filter((option) =>
						selectedOptionSet.has(createSkillOptionSelectionId(skill.id, group.id, option.id))
					)
					.map((option) => {
						const optionDescription =
							option.description.length > 0 ? ` - ${option.description}` : '';

						return `- ${getSkillDisplayName(skill)} / ${group.label}: ${option.label}${optionDescription}`;
					})
			)
		);

		if (optionLines.length === 0) {
			return manualWorkOrderBody;
		}

		return [
			manualWorkOrderBody.trimEnd(),
			'',
			`${messages.queue.skillOptions.title}:`,
			...optionLines
		].join('\n');
	}

	function createSkillOptionSelectionId(skillId: string, groupId: string, optionId: string) {
		return `${skillId}:${groupId}:${optionId}`;
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
			isWriting ||
			isSavingEvaluation ||
			isReportTaskEvaluationRecorded(task)
		) {
			return;
	}

		evaluationDialog = { task, agent };
		evaluationScores = createDefaultAgentEvaluationScores();
		error = null;
		parseError = null;
		status = null;
}

	function closeEvaluationDialog() {
		if (isSavingEvaluation) {
			return;
	}

		evaluationDialog = null;
		evaluationScores = createDefaultAgentEvaluationScores();
}

	function updateEvaluationScore(criterionId: AgentEvaluationCriterionId, value: string) {
		evaluationScores = {
			...evaluationScores,
			[criterionId]: normalizeAgentEvaluationScore(value)
	};
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
			const targetAgentId = evaluationDialog.agent.id;
			const evaluationKey = createQueueReportTaskEvaluationKey(
				selectedReport,
				evaluationDialog.task
			);
			const latestAgentRegistryResult = await readAgentRegistry(workspace.id, workspace.path);
			const mutation = recordAgentEvaluationOnce(
				latestAgentRegistryResult.registry,
				targetAgentId,
				evaluationKey,
				evaluationScores
			);

			if (!mutation.ok) {
				parseError = messages.agents.errors.notFound;
				return;
			}

			const writeResult = await writeAgentRegistry(mutation.registry, workspace.path);

			agentRegistry = writeResult.registry;

			if (!writeResult.ok) {
				parseError = messages.agents.errors.saveFailed;
				return;
			}

			if (mutation.applied) {
				const nextReport = recordQueueReportTaskEvaluation(
					selectedReport,
					evaluationDialog.task.id,
					targetAgentId
				);
				const reportWriteResult = await updateQueueResultReportFile(
					workspace.path,
					selectedReportPath,
					serializeQueueArtifact(nextReport)
				);

				if (!reportWriteResult.ok) {
					parseError = messages.queue.errors.fileWriteFailed;
					return;
				}

				selectedReport = nextReport;
				rememberCompletedReportPath(reportWriteResult.relativePath);
				await refreshQueueFiles({ silent: true });
			}

			const latestPersonaRegistryResult = await readPersonaRegistry(workspace.id, workspace.path);

			if (!latestPersonaRegistryResult.ok) {
				parseError = messages.personas.errors.readFailed;
				return;
			}

			const nextPersonaRegistry = syncPersonaEvaluationSummariesFromAgents(
				latestPersonaRegistryResult.registry,
				mutation.registry.agents
			);
			const personaWriteResult = await writePersonaRegistry(nextPersonaRegistry, workspace.path);

			personaRegistry = personaWriteResult.registry;

			if (!personaWriteResult.ok) {
				parseError = messages.personas.errors.saveFailed;
				return;
			}

			status = mutation.applied
				? messages.queue.evaluation.saved
				: messages.queue.evaluation.alreadySaved;
			evaluationDialog = null;
			evaluationScores = createDefaultAgentEvaluationScores();
	} finally {
			isSavingEvaluation = false;
	}
}

	function getQueueFolderLocalizedError(error: QueueFolderError) {
		return getLocalizedQueueFolderError(messages, error);
}

	function getQueueExecutionErrorMessage(executionError: Parameters<typeof getLocalizedQueueExecutionErrorMessage>[1]) {
		return getLocalizedQueueExecutionErrorMessage(messages, executionError);
}

	function notifyNewCompletedReports(nextFiles: readonly QueueCardEntry[]) {
		const completedReportFiles = nextFiles.filter(isCompletedResultReportFile);
		const nextCompletedReportPaths = new Set(
			completedReportFiles.map((file) => file.relativePath)
		);

		if (!completedReportNotificationsArePrimed) {
			knownCompletedReportPaths = nextCompletedReportPaths;
			completedReportNotificationsArePrimed = true;
			return;
		}

		for (const file of completedReportFiles) {
			if (!knownCompletedReportPaths.has(file.relativePath)) {
				showCompletedReportNotification(file.title, file.relativePath);
			}
		}

		knownCompletedReportPaths = nextCompletedReportPaths;
}

	function rememberCompletedReportPath(relativePath: string) {
		knownCompletedReportPaths = new Set([...knownCompletedReportPaths, relativePath]);
		completedReportNotificationsArePrimed = true;
}

	function isCompletedResultReportFile(file: QueueCardEntry) {
		return file.kind === 'result-report' && file.executionState === 'completed';
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
