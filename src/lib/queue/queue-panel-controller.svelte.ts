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
	recordAgentEvaluation,
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
	recordPersonaEvaluation,
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
	archiveQueueWorkOrder,
	createDefaultReportReviews,
	createManualQueueWorkOrder,
	createQueueResultReportFileNameFromLabel,
	createQueueWorkOrderFileName,
	createQueueWorkOrderForReportEvaluation,
	defaultQueueResponseFormat,
	defaultQueueResponseLanguage,
	defaultQueueWorkPriority,
	normalizeQueueResponseFormat,
	normalizeQueueResponseLanguage,
	normalizeQueueTaskKind,
	normalizeQueueWorkPriority,
	parseQueueProposal,
	parseQueueResultReport,
	parseQueueWorkOrder,
	serializeQueueArtifact,
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
	executeQueueWorkOrder,
	previewQueueWorkOrderPrompt,
	type WorkduckQueuePromptPreview
} from './queue-execution';
import {
	deleteQueueFile,
	ensureQueueFolder,
	listQueueFiles,
	readQueueFile,
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
	let selectedManualAgentIds = $state<string[]>([]);
	let selectedManualProjectIds = $state<string[]>([]);
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
	let isSavingEvaluation = $state(false);
	let evaluationDialog = $state<AgentEvaluationDialogState | null>(null);
	let evaluationScores = $state<AgentEvaluationScores>(createDefaultAgentEvaluationScores());
	let queueContextMenu = $state<QueueContextMenuState | null>(null);
	let queueContextMenuElement = $state<HTMLElement | undefined>(undefined);
	let ensureSignature = $state('');
	let refreshSignature = $state(0);
	let messages = $derived(getWorkduckMessages(appearanceSettings.languageId));
	let queueItemCountLabel = $derived(
		messages.queue.registeredCount.replace('{count}', files.length.toString())
	);
	let allSkills = $derived(getAllSkills(skillRegistry));
	let allAgents = $derived(agentRegistry.agents);
	let allProjects = $derived(
		projectRegistry.nodes.filter((node): node is ProjectNodeRecord => node.kind === 'project')
	);
	let allReferences = $derived(referenceRegistry.references);
	let prioritizedReferences = $derived(
		sortReferencesForProjectSelection(allReferences, selectedManualProjectIds)
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
	let manualWorkOrderReferenceSummary = $derived(
		createSelectionSummary(
			selectedManualReferenceIds,
			messages.queue.noReference,
			messages.queue.selectionCount,
			getReferenceLabelById
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
			(manualWorkOrderKind !== 'vote' || manualValidVoteOptionCount >= 2) &&
			!isWriting
	);
	let canExecuteSelectedWorkOrder = $derived(
		selectedWorkOrder !== null &&
			selectedWorkOrder.status !== 'archived' &&
			selectedWorkOrder.tasks.some((task) => (task.agentIds ?? []).length > 0) &&
			!isWriting
	);
	let canPreviewSelectedWorkOrderPrompt = $derived(
		selectedWorkOrder !== null &&
			selectedWorkOrder.status !== 'archived' &&
			selectedWorkOrder.tasks.some((task) => (task.agentIds ?? []).length > 0) &&
			!isWriting &&
			!isPreviewingPrompt
	);
	let canCompleteSelectedWorkOrder = $derived(
		selectedWorkOrder !== null && selectedWorkOrder.status !== 'archived' && !isWriting
	);
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
		skillRegistry = createEmptySkillRegistry(workspace.id);
		agentRegistry = createEmptyAgentRegistry(workspace.id);
		personaRegistry = createEmptyPersonaRegistry(workspace.id);
		projectRegistry = createEmptyProjectRegistry(workspace.id);
		referenceRegistry = createEmptyReferenceRegistry(workspace.id);
		selectedManualSkillIds = [];
		selectedManualAgentIds = [];
		selectedManualProjectIds = [];
		selectedManualReferenceIds = [];
		void readSkillsForWorkspace(workspace.id, workspace.path);
		void readAgentsForWorkspace(workspace.id, workspace.path);
		void readPersonasForWorkspace(workspace.id, workspace.path);
		void readProjectsForWorkspace(workspace.id);
		void readReferencesForWorkspace(workspace.id, workspace.path);
		void ensureQueueFolderForWorkspace();

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

	async function ensureQueueFolderForWorkspace() {
		const result = await ensureQueueFolder(workspace.path);

		if (result.ok) {
			error = null;
			await refreshQueueFiles({ silent: true });
			return;
	}

		error = result.error;
		status = null;
}

	async function readSkillsForWorkspace(workspaceId: string, workspacePath: string) {
		const result = await readSkillRegistry(workspaceId, workspacePath);

		skillRegistry = result.registry;
}

	async function readAgentsForWorkspace(workspaceId: string, workspacePath: string) {
		const result = await readAgentRegistry(workspaceId, workspacePath);

		agentRegistry = result.registry;
}

	async function readPersonasForWorkspace(workspaceId: string, workspacePath: string) {
		const result = await readPersonaRegistry(workspaceId, workspacePath);

		personaRegistry = result.registry;
}

	async function readProjectsForWorkspace(workspaceId: string) {
		const result = await readProjectRegistry(workspaceId);

		projectRegistry = result.registry;
}

	async function readReferencesForWorkspace(workspaceId: string, workspacePath: string) {
		const result = await readReferenceRegistry(workspaceId, workspacePath);

		referenceRegistry = result.registry;
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
				const nextFiles = await createQueueCardEntries(workspace.path, readFilePaths, result.files);
				const previousSignature = createQueueFilesSignature(files);
				const nextSignature = createQueueFilesSignature(nextFiles);
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

			files = files.filter((file) => file.relativePath !== result.relativePath);
			readFilePaths = readFilePaths.filter((relativePath) => relativePath !== result.relativePath);
			writeQueueReadFilePaths(workspace.id, readFilePaths);
			clearQueueSelectionForPath(result.relativePath);
			status = messages.queue.deletedFile.replace('{relativePath}', result.relativePath);
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
		selectedManualAgentIds = [];
		selectedManualProjectIds = [];
		selectedManualReferenceIds = [];
		error = null;
		parseError = null;
		status = null;
}

	function openEditWorkOrderTaskDialog(task: WorkduckQueueWorkOrderTask) {
		if (selectedWorkOrder === null || selectedWorkOrderPath === null) {
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
		selectedManualAgentIds = [...(task.agentIds ?? [])];
		selectedManualProjectIds = [...(task.projectIds ?? [])];
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
		selectedManualAgentIds = [];
		selectedManualProjectIds = [];
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
		if (readFilePaths.includes(relativePath)) {
			files = files.map((file) =>
				file.relativePath === relativePath ? { ...file, isRead: true } : file
			);
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
				manualWorkOrderBody,
				manualWorkOrderPriority,
				createManualWorkOrderSkillIds(),
				createManualWorkOrderAgentIds(),
				createManualWorkOrderReferenceIds(),
				{
					...createManualWorkOrderKindInput(),
					projectIds: createManualWorkOrderProjectIds()
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
				selectedManualAgentIds = [];
				selectedManualProjectIds = [];
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
			body: manualWorkOrderBody,
			priority: manualWorkOrderPriority,
			projectIds: createManualWorkOrderProjectIds(),
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
			selectedManualAgentIds = [];
			selectedManualProjectIds = [];
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

		isWriting = true;
		error = null;
		parseError = null;
		status = messages.queue.executing;

		try {
			const executionContext = await readExecutionContextForWorkspace();
			const executionResult = await executeQueueWorkOrder({
				workOrder: selectedWorkOrder,
				agents: executionContext.agents,
				vault: readEnvironmentVaultSession(workspace.id),
				skills: executionContext.skills,
				references: executionContext.references,
				personas: executionContext.personas
			});

			if (!executionResult.ok) {
				parseError = getQueueExecutionErrorMessage(executionResult.error);
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
				status = null;
				return;
			}

			const archivedWorkOrder = archiveQueueWorkOrder(selectedWorkOrder);
			const archiveResult = await updateQueueWorkOrderFile(
				workspace.path,
				selectedWorkOrderPath,
				serializeQueueArtifact(archivedWorkOrder)
			);

			if (!archiveResult.ok) {
				error = archiveResult.error;
				status = null;
				return;
			}

			selectedWorkOrder = archivedWorkOrder;
			status = messages.queue.executedFile.replace('{relativePath}', reportWriteResult.relativePath);
			await refreshQueueFiles({ silent: true });
	} finally {
			isWriting = false;
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
		return appearanceSettings.languageId === 'en' ? 'en' : 'ko';
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

	function createManualWorkOrderReferenceIds() {
		return selectedManualReferenceIds;
}

	function getSkillDisplayName(skill: WorkduckSkillRecord) {
		return getLocalizedSkillDisplayName(messages, skill);
}

	function getAgentDisplayName(agent: AgentRecord) {
		return getAgentDisplayNameFromRecord(agent);
}

	function getProjectDisplayName(project: ProjectNodeRecord) {
		return getProjectDisplayNameFromRecord(project);
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

	function getReferenceLabelById(referenceId: string) {
		return getRecordLabelById(allReferences, referenceId, getReferenceDisplayName);
}

	function toggleManualWorkOrderSkill(skillId: string, isSelected: boolean) {
		selectedManualSkillIds = updateSelectedRecordIds(selectedManualSkillIds, skillId, isSelected);
}

	function toggleManualWorkOrderAgent(agentId: string, isSelected: boolean) {
		selectedManualAgentIds = updateSelectedRecordIds(selectedManualAgentIds, agentId, isSelected);
}

	function toggleManualWorkOrderProject(projectId: string, isSelected: boolean) {
		selectedManualProjectIds = updateSelectedRecordIds(selectedManualProjectIds, projectId, isSelected);
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

	function openEvaluationDialog(task: WorkduckQueueResultReportTask) {
		const agent = getReportTaskAgent(task);

		if (agent === null || isWriting || isSavingEvaluation) {
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

		isSavingEvaluation = true;
		error = null;
		parseError = null;
		status = null;

		try {
			const targetAgentId = evaluationDialog.agent.id;
			const latestAgentRegistryResult = await readAgentRegistry(workspace.id, workspace.path);
			const mutation = recordAgentEvaluation(
				latestAgentRegistryResult.registry,
				targetAgentId,
				evaluationScores
			);

			if (!mutation.ok) {
				parseError = messages.agents.errors.notFound;
				return;
			}

			const evaluatedAgent =
				mutation.registry.agents.find((agent) => agent.id === targetAgentId) ?? null;
			let nextPersonaRegistry = personaRegistry;
			let shouldWritePersonaRegistry = false;

			if (evaluatedAgent?.personaId !== null && evaluatedAgent?.personaId !== undefined) {
				const latestPersonaRegistryResult = await readPersonaRegistry(workspace.id, workspace.path);

				if (!latestPersonaRegistryResult.ok) {
					parseError = messages.personas.errors.readFailed;
					return;
				}

				nextPersonaRegistry = latestPersonaRegistryResult.registry;

				if (
					nextPersonaRegistry.personas.some((persona) => persona.id === evaluatedAgent.personaId)
				) {
					const personaMutation = recordPersonaEvaluation(
						nextPersonaRegistry,
						evaluatedAgent.personaId,
						evaluationScores
					);

					if (!personaMutation.ok) {
						parseError = messages.personas.errors.notFound;
						return;
					}

					nextPersonaRegistry = personaMutation.registry;
					shouldWritePersonaRegistry = true;
				}
			}

			const writeResult = await writeAgentRegistry(mutation.registry, workspace.path);

			agentRegistry = writeResult.registry;

			if (!writeResult.ok) {
				parseError = messages.agents.errors.saveFailed;
				return;
			}

			if (shouldWritePersonaRegistry) {
				const personaWriteResult = await writePersonaRegistry(nextPersonaRegistry, workspace.path);

				personaRegistry = personaWriteResult.registry;

				if (!personaWriteResult.ok) {
					parseError = messages.personas.errors.saveFailed;
					return;
				}
			}

			status = messages.queue.evaluation.saved;
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
		get selectedManualAgentIds() { return selectedManualAgentIds; },
		get selectedManualProjectIds() { return selectedManualProjectIds; },
		get selectedManualReferenceIds() { return selectedManualReferenceIds; },
		get allSkills() { return allSkills; },
		get allAgents() { return allAgents; },
		get allProjects() { return allProjects; },
		get prioritizedReferences() { return prioritizedReferences; },
		get isRefreshing() { return isRefreshing; },
		get isReading() { return isReading; },
		get isWriting() { return isWriting; },
		get isPreviewingPrompt() { return isPreviewingPrompt; },
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
		get workOrderDialogTitle() { return workOrderDialogTitle; },
		get workOrderDialogSubmitLabel() { return workOrderDialogSubmitLabel; },
		get manualWorkOrderSkillSummary() { return manualWorkOrderSkillSummary; },
		get manualWorkOrderAgentSummary() { return manualWorkOrderAgentSummary; },
		get manualWorkOrderProjectSummary() { return manualWorkOrderProjectSummary; },
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
		handlePreviewWorkOrderPrompt,
		closePromptPreviewDialog,
		handleExecuteWorkOrder,
		handleCompleteWorkOrder,
		openEditWorkOrderTaskDialog,
		getQueueResponseLanguageLabel,
		getQueueTaskKindLabel,
		getQueueTaskProjectLabels,
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
		toggleManualWorkOrderAgent,
		toggleManualWorkOrderProject,
		toggleManualWorkOrderReference,
		addManualVoteOption,
		removeManualVoteOption,
		updateManualVoteOption,
		getSkillDisplayName,
		getAgentDisplayName,
		getProjectDisplayName,
		getReferenceDisplayName
};
}

export type QueuePanelController = ReturnType<typeof createQueuePanelController>;
