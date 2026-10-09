/* llmnav/1 module
id=workduck.queue.panel-controller
role=Coordinate Queue panel state, workspace lifetimes, artifact selection, prompt previews, and user-initiated workflows.
owns=workspace view lifetime|operation result ownership|artifact selection|Queue workflow UI state
excludes=manual draft editing|evaluation dialog state|provider execution|native file persistence
search=Queue workspace switch|late Queue read results|Queue panel controller
invariant=Operation results update only their captured workspace lifetime; execution context and vault stay bound to the initiating workspace.
stability=architecture
*/
import { onMount, untrack } from 'svelte';

import { getWorkduckMessages } from '#lib/i18n/workduck-language.ts';
import {
	createDefaultAppearanceSettings,
	type AppearanceSettings
} from '#lib/settings/appearance-settings.ts';
import {
	readAppearanceSettingsFromBrowser,
	subscribeAppearanceSettings
} from '#lib/settings/appearance-storage.ts';
import type { WorkspaceRecord } from '#lib/workspaces/workspace-registry.ts';
import {
	type AgentRegistry
} from '#lib/agents/agent-registry.ts';
import {
	type PersonaRegistry
} from '#lib/personas/persona-registry.ts';
import {
	type ReferenceRegistry
} from '#lib/references/reference-registry.ts';
import {
	type ProjectNodeRecord,
	type ProjectRegistry
} from '#lib/projects/project-registry.ts';
import {
	createProjectRepositorySelectionOptions
} from '#lib/projects/project-repository-selection.ts';
import {
	getAllSkills,
	WORKDUCK_AGENT_RESPONSE_EVALUATOR_SKILL_ID,
	type SkillRegistry
} from '#lib/skills/skill-registry.ts';
import {
	prepareDesktopNotificationPermission,
	showDesktopNotificationWhenUnfocused
} from '#lib/ui/desktop-notification.ts';

import {
	type QueueReportTaskReview,
	type WorkduckQueueProposal,
	type WorkduckQueueResultReport,
	type WorkduckQueueWorkOrder,
	type WorkduckQueueWorkOrderTask,
	type WorkduckQueueReviewDecision
} from './queue-artifacts';
import { readEnvironmentVaultSession } from '#lib/environment/environment-vault-session.ts';
import {
	type QueueFileEntry,
	type QueueFolderError
} from './queue-folder';
import {
	createVoteAggregate
} from './queue-voting';
import {
	dispatchQueueFilesChanged
} from './queue-read-state';
import { createQueuePanelPresentation } from './queue-panel-presentation.svelte';
import {
	startQueueAutoRefreshScheduler,
	type QueueAutoRefreshScheduler
} from './queue-auto-refresh-scheduler';
import { createQueueCompletedReportNotifications } from './queue-completed-report-notifications';
import { createQueuePanelFileActions } from './queue-panel-file-actions.svelte';
import {
	createFilteredQueueFiles,
	createQueueCardClass as createQueueCardClassFromSelection,
	isQueueFileSelected
} from './queue-panel-file-list';
import { createQueuePanelEvaluationController } from './queue-panel-evaluation-controller.svelte';
import type { QueuePanelEvaluationSaveResult } from './queue-panel-evaluation-save-workflow';
import {
	executeQueuePanelWorkOrder,
	type QueuePanelWorkOrderExecutionResult
} from './queue-panel-work-order-execution-workflow';
import { cancelQueuePanelWorkOrder } from './queue-panel-work-order-cancel-workflow';
import { completeQueuePanelWorkOrder } from './queue-panel-work-order-completion-workflow';
import {
	createQueuePanelManualWorkOrder,
	updateQueuePanelManualWorkOrder
} from './queue-panel-manual-work-order-save-workflow';
import { delegateQueuePanelReportEvaluation } from './queue-panel-report-evaluation-delegation-workflow';
import {
	markQueuePanelFileRead,
	readQueuePanelReadFilePaths,
	removeQueuePanelReadFilePaths
} from './queue-panel-read-state-workflow';
import { createQueuePanelExecutionContextReader } from './queue-panel-execution-context-workflow';
import { createQueuePanelPromptPreview } from './queue-panel-prompt-preview-controller.svelte';
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
import { createQueuePanelWorkOrderEditor } from './queue-panel-work-order-editor.svelte';
import {
	getQueueExecutionErrorMessage as getLocalizedQueueExecutionErrorMessage,
	getQueueFolderLocalizedError as getLocalizedQueueFolderError
} from './queue-panel-errors';
import {
	type QueueCardEntry,
	type QueueExecutionContext,
	type QueueExecutionFilter,
	type QueueKindFilter,
	type QueuePriorityFilter,
	type QueueReadFilter,
	type QueueSortOption,
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
	let workspaceSignature = $derived(`${workspace.id}:${workspace.path}`);
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
	const executionContextReader = createQueuePanelExecutionContextReader();


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
	let reviews = $state<readonly QueueReportTaskReview[]>([]);
	const initialWorkspaceRegistries = createEmptyQueuePanelWorkspaceRegistryState('');
	let skillRegistry = $state<SkillRegistry>(initialWorkspaceRegistries.skillRegistry);
	let agentRegistry = $state<AgentRegistry>(initialWorkspaceRegistries.agentRegistry);
	let personaRegistry = $state<PersonaRegistry>(initialWorkspaceRegistries.personaRegistry);
	let projectRegistry = $state<ProjectRegistry>(initialWorkspaceRegistries.projectRegistry);
	let referenceRegistry = $state<ReferenceRegistry>(initialWorkspaceRegistries.referenceRegistry);
	let isRefreshing = $state(false);
	let isReading = $state(false);
	let isWriting = $state(false);
	let isCancellingExecution = $state(false);
	const activeExecutions = new Map<string, string>();
	let ensureSignature = '';
	let refreshSignature = 0;
	let workspaceDataReadGeneration = 0;
	let artifactReadGeneration = 0;
	let queueAutoRefreshScheduler: QueueAutoRefreshScheduler | null = null;
	let completedReportNotifications = createQueueCompletedReportNotifications();
	let messages = $derived(getWorkduckMessages(appearanceSettings.languageId));
	let readFilePathSet = $derived(new Set(readFilePaths));
	let queueItemCountLabel = $derived(
		messages.queue.registeredCount.replace('{count}', files.length.toString())
	);
	let allStoredSkills = $derived(getAllSkills(skillRegistry));
	const presentation = createQueuePanelPresentation({
		messages: () => messages, skills: () => allStoredSkills, agents: () => allAgents,
		projects: () => allProjects, repositories: () => allRepositories, references: () => allReferences
	});
	let allSkills = $derived(presentation.allSkills);
	let allAgents = $derived(agentRegistry.agents);
	let allProjects = $derived(
		projectRegistry.nodes.filter((node): node is ProjectNodeRecord => node.kind === 'project')
	);
	let allRepositories = $derived(createProjectRepositorySelectionOptions(projectRegistry.nodes));
	let allReferences = $derived(referenceRegistry.references);
	const evaluationController = createQueuePanelEvaluationController({
		selection: () => selectedReport === null || selectedReportPath === null ? null : {
			report: selectedReport, reportPath: selectedReportPath, generation: artifactReadGeneration
		},
		agents: () => allAgents,
		isWriting: () => isWriting,
		messages: () => messages,
		captureWorkspaceTarget: captureWorkspaceOperationTarget,
		clearFeedback: () => { error = null; parseError = null; status = null; },
		setParseError: message => { parseError = message; },
		setStatus: message => { status = message; },
		applySavedState: applyQueuePanelEvaluationSaveState
	});
	const workOrderEditor = createQueuePanelWorkOrderEditor({
		messages: () => messages,
		skills: () => allSkills,
		references: () => allReferences,
		isWriting: () => isWriting,
		responseLanguage: () => appearanceSettings.languageId,
		getSkillLabelById: presentation.getSkillLabelById,
		getAgentLabelById: presentation.getAgentLabelById,
		getProjectLabelById: presentation.getProjectLabelById,
		getRepositoryLabelById: presentation.getRepositoryLabelById,
		getReferenceLabelById: presentation.getReferenceLabelById,
		getSkillDisplayName: presentation.getSkillDisplayName
	});
	let selectedReportVoteAggregate = $derived(
		selectedReport === null ? null : createVoteAggregate(selectedReport.tasks)
	);
	let selectedReportEvaluationDelegationPath = $derived(
		selectedReport === null
			? null
			: findReportEvaluationDelegationPath(selectedReport)
	);
	let selectedReportCanDelegateEvaluation = $derived(
		selectedReport !== null && selectedReport.tasks.some((task) => evaluationController.getReportTaskAgent(task) !== null)
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
	let canExecuteSelectedWorkOrder = $derived(
		selectedWorkOrder !== null &&
			(selectedWorkOrder.status === 'active' || selectedWorkOrder.status === 'failed') &&
			selectedWorkOrder.tasks.length > 0 &&
			selectedWorkOrder.tasks.every((task) => (task.agentIds ?? []).length > 0) &&
			!isWriting
	);
	const promptPreview = createQueuePanelPromptPreview({
		workOrder: () => selectedWorkOrder,
		isWriting: () => isWriting,
		captureWorkspaceTarget: captureWorkspaceOperationTarget,
		readExecutionContext: readExecutionContextForWorkspace,
		clearFeedback: () => { error = null; parseError = null; status = null; },
		setError: (value) => { parseError = getQueueExecutionErrorMessage(value); }
	});
	const closePromptPreviewDialog = promptPreview.closePromptPreviewDialog;
	let canCompleteSelectedWorkOrder = $derived(
		selectedWorkOrder !== null &&
			selectedWorkOrder.status !== 'archived' &&
			selectedWorkOrder.status !== 'running' &&
			!isWriting
	);
	let canCancelSelectedWorkOrderExecution = $derived(
		selectedWorkOrder !== null && selectedWorkOrder.status === 'running' && !isCancellingExecution
	);
	const fileActions = createQueuePanelFileActions({
		files: () => files,
		messages: () => messages,
		isWriting: () => isWriting,
		captureWorkspaceTarget: captureWorkspaceOperationTarget,
		setWriting: (value) => { isWriting = value; },
		clearFeedback: () => { error = null; parseError = null; status = null; },
		setError: (value) => { error = value; }, setStatus: (value) => { status = value; },
		removeFiles: removeQueueFilesFromState
	});
	const closeQueueContextMenu = fileActions.closeQueueContextMenu;

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
		const nextSignature = workspaceSignature;

		if (ensureSignature === nextSignature) {
			return;
	}

		return untrack(() => {
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
			closePromptPreviewDialog();
			fileActions.closeQueueContextMenu();
			reviews = [];
			readFilePaths = readQueuePanelReadFilePaths(workspace.id);
			queueExecutionFilter = 'all';
			queueReadFilter = 'all';
			queueKindFilter = 'all';
			queuePriorityFilter = 'all';
			queueSortOption = 'created-desc';
			completedReportNotifications = createQueueCompletedReportNotifications();
			isRefreshing = false;
			isReading = false;
			isWriting = false;
			isCancellingExecution = false;
			evaluationController.resetWorkspace();
			workOrderEditor.finishManualWorkOrderDialog();
			artifactReadGeneration += 1;
			const emptyWorkspaceRegistries = createEmptyQueuePanelWorkspaceRegistryState(workspace.id);
			skillRegistry = emptyWorkspaceRegistries.skillRegistry;
			agentRegistry = emptyWorkspaceRegistries.agentRegistry;
			personaRegistry = emptyWorkspaceRegistries.personaRegistry;
			projectRegistry = emptyWorkspaceRegistries.projectRegistry;
			referenceRegistry = emptyWorkspaceRegistries.referenceRegistry;
			workOrderEditor.clearRecordSelections();
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
});

	$effect(() => {
		if (refreshSignature === refreshSignal) {
			return;
	}

		refreshSignature = refreshSignal;
		untrack(() => { void refreshQueueFiles(); });
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

	function createExecutionKey(workspacePath: string, workOrderId: string) {
		return JSON.stringify([workspacePath, workOrderId]);
	}

	function captureWorkspaceOperationTarget() {
		const workspaceId = workspace.id;
		const workspacePath = workspace.path;
		const generation = workspaceDataReadGeneration;
		return {
			workspaceId,
			workspacePath,
			isCurrent: () => workspaceDataReadIsCurrent(workspaceId, workspacePath, generation)
		};
	}

	async function readExecutionContextForWorkspace(
		target = captureWorkspaceOperationTarget()
	): Promise<QueueExecutionContext> {
		const result = await executionContextReader.read({
			workspaceId: target.workspaceId,
			workspacePath: target.workspacePath
		});

		if (target.isCurrent()) {
			skillRegistry = result.skillRegistry;
			agentRegistry = result.agentRegistry;
			referenceRegistry = result.referenceRegistry;
			personaRegistry = result.personaRegistry;
		}

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
		const target = captureWorkspaceOperationTarget();
		const refreshingWorkOrder = selectedWorkOrder;

		try {
			const result = await refreshQueuePanelFiles({
				workspaceId: target.workspaceId,
				workspacePath: target.workspacePath,
				currentFiles: files,
				currentReadFilePaths: readFilePaths,
				readCurrentReadFilePaths: () => readFilePaths,
				isCurrent: target.isCurrent,
				selectedWorkOrder: refreshingWorkOrder,
				recoverStaleRunning: !isWriting && !isCancellingExecution,
				completedReportNotifications,
				showCompletedReportNotification: (title, relativePath) => {
					if (target.isCurrent()) showCompletedReportNotification(title, relativePath);
				}
			});

			if (!target.isCurrent() || result === null) return;

			if (result.ok) {
				files = result.files;
				readFilePaths = result.readFilePaths;
				if (selectedWorkOrder === refreshingWorkOrder) {
					selectedWorkOrder = result.selectedWorkOrder;
				}
				if (!options.silent) {
					status = null;
				}
				return;
			}

			error = result.error;
		} finally {
			if (target.isCurrent()) {
				isRefreshing = false;
				queueAutoRefreshScheduler?.reschedule();
			}
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
		error = null;
		parseError = null;
		status = null;
		resetQueueArtifactSelectionState();
		isReading = true;
		const target = captureWorkspaceOperationTarget();
		const readGeneration = ++artifactReadGeneration;
		const isCurrent = () => target.isCurrent() && artifactReadGeneration === readGeneration;

		try {
			const result = await readQueuePanelArtifactSelection(target.workspacePath, file);
			if (!isCurrent()) return;

			if (!result.ok) {
				applyQueueArtifactSelectionFailure(result);
				return;
			}

			applyQueueArtifactSelection(result.selection);
			markQueueFileRead(result.selection.relativePath);
	} finally {
			if (isCurrent()) isReading = false;
	}
}

	function resetQueueArtifactSelectionState() {
		artifactReadGeneration += 1;
		isReading = false;
		evaluationController.resetSelection();
		selectedReport = null;
		selectedReportPath = null;
		selectedWorkOrder = null;
		selectedWorkOrderPath = null;
		selectedProposal = null;
		selectedProposalPath = null;
		closePromptPreviewDialog();
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
		resetQueueArtifactSelectionState();
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
			closePromptPreviewDialog();
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

	function openNewWorkOrderDialog() {
		workOrderEditor.openNewWorkOrderDialog();
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

		workOrderEditor.openEditWorkOrderTaskDialog(task);
		error = null;
		parseError = null;
		status = null;
}

	function closeNewWorkOrderDialog() {
		workOrderEditor.closeNewWorkOrderDialog();
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

		const target = captureWorkspaceOperationTarget();
		isWriting = true;
		error = null;
		parseError = null;
		status = null;

		try {
			const result = await delegateQueuePanelReportEvaluation({
				workspacePath: target.workspacePath,
				reportPath: selectedReportPath,
				report: selectedReport,
				evaluatorSkillId: WORKDUCK_AGENT_RESPONSE_EVALUATOR_SKILL_ID
			});
			if (!target.isCurrent()) return;

			if (result.ok) {
				status = messages.queue.evaluationDelegated.replace('{relativePath}', result.relativePath);
				await refreshQueueFiles({ silent: true });
				return;
			}

			error = result.error;
		} finally {
			if (target.isCurrent()) isWriting = false;
		}
	}

	async function handleCreateManualWorkOrder(event: SubmitEvent) {
		event.preventDefault();

		if (!workOrderEditor.canCreateManualWorkOrder) {
			return;
		}

		const target = captureWorkspaceOperationTarget();
		isWriting = true;
		error = null;
		status = null;

		try {
			if (workOrderEditor.workOrderDialogMode === 'edit') {
				await handleUpdateManualWorkOrder(target);
				return;
			}

			const result = await createQueuePanelManualWorkOrder({
				workspacePath: target.workspacePath,
				draft: workOrderEditor.createManualWorkOrderSaveDraft()
			});
			if (!target.isCurrent()) return;

			if (result.ok) {
				status = messages.queue.createdFile.replace('{relativePath}', result.relativePath);
				workOrderEditor.finishManualWorkOrderDialog();
				await refreshQueueFiles({ silent: true });
				return;
			}

			error = result.error;
		} finally {
			if (target.isCurrent()) isWriting = false;
		}
	}

	async function handleUpdateManualWorkOrder(
		target: ReturnType<typeof captureWorkspaceOperationTarget>
	) {
		if (
			selectedWorkOrder === null ||
			selectedWorkOrderPath === null ||
			workOrderEditor.editingWorkOrderTaskId === null
		) {
			return;
		}

		const result = await updateQueuePanelManualWorkOrder({
			workspacePath: target.workspacePath,
			workOrderPath: selectedWorkOrderPath,
			workOrder: selectedWorkOrder,
			taskId: workOrderEditor.editingWorkOrderTaskId,
			draft: workOrderEditor.createManualWorkOrderSaveDraft()
		});
		if (!target.isCurrent()) return;

		if (result.ok) {
			selectedWorkOrder = result.workOrder;
			selectedWorkOrderPath = result.relativePath;
			status = messages.queue.updatedFile.replace('{relativePath}', result.relativePath);
			workOrderEditor.finishManualWorkOrderDialog();
			await refreshQueueFiles({ silent: true });
			return;
		}

		error = result.error;
	}

	async function handleConfirmExecuteWorkOrder() {
		if (selectedWorkOrder === null || selectedWorkOrderPath === null || !canExecuteSelectedWorkOrder) {
			return;
		}
		const promptEstimate = promptPreview.promptEstimate;
		if (promptEstimate === null) {
			parseError = getQueueExecutionErrorMessage('queue-execution-confirmation-required');
			return;
		}

		const target = captureWorkspaceOperationTarget();
		const executableWorkOrder = selectedWorkOrder;
		const workOrderPath = selectedWorkOrderPath;
		const confirmationToken = promptEstimate.confirmationToken;
		closePromptPreviewDialog();
		const executionId = crypto.randomUUID();
		const executionKey = createExecutionKey(target.workspacePath, executableWorkOrder.ref.id);
		activeExecutions.set(executionKey, executionId);

		isWriting = true;
		error = null;
		parseError = null;
		status = messages.queue.executing;

		try {
			const executionResult = await executeQueuePanelWorkOrder({
				executionId,
				workspacePath: target.workspacePath,
				workOrderPath,
				workOrder: executableWorkOrder,
				confirmationToken,
				readExecutionContext: () => readExecutionContextForWorkspace(target),
				readVault: () => readEnvironmentVaultSession(target.workspaceId),
				onRunningWorkOrderSaved: async (runningWorkOrder) => {
					if (!target.isCurrent()) return;
					if (
						selectedWorkOrder?.ref.id === executableWorkOrder.ref.id &&
						selectedWorkOrderPath === workOrderPath
					) {
						selectedWorkOrder = runningWorkOrder;
					}
					await prepareDesktopNotificationPermission();
				}
			});

			if (target.isCurrent()) await applyQueuePanelWorkOrderExecutionResult(executionResult, target);
	} finally {
			if (activeExecutions.get(executionKey) === executionId) {
				activeExecutions.delete(executionKey);
			}
			if (target.isCurrent()) isWriting = false;
	}
}

	async function applyQueuePanelWorkOrderExecutionResult(
		result: QueuePanelWorkOrderExecutionResult,
		target: ReturnType<typeof captureWorkspaceOperationTarget>
	) {
		if (!target.isCurrent()) return;
		if (!result.ok) {
			await applyQueuePanelWorkOrderExecutionFailure(result, target);
			return;
		}

		await applyQueuePanelWorkOrderExecutionSuccess(result, target);
}

	async function applyQueuePanelWorkOrderExecutionSuccess(
		result: QueuePanelWorkOrderExecutionSuccessResult,
		target: ReturnType<typeof captureWorkspaceOperationTarget>
	) {
		if (!target.isCurrent()) return;
		if (selectedWorkOrder?.ref.id === result.workOrder.ref.id) selectedWorkOrder = result.workOrder;
		status = messages.queue.executedFile.replace('{relativePath}', result.reportRelativePath);
		completedReportNotifications.rememberPath(result.reportRelativePath);
		showCompletedReportNotification(result.report.ref.label, result.reportRelativePath);
		await refreshQueueFiles({ silent: true });
}

	async function applyQueuePanelWorkOrderExecutionFailure(
		result: QueuePanelWorkOrderExecutionFailureResult,
		target: ReturnType<typeof captureWorkspaceOperationTarget>
	) {
		if (!target.isCurrent()) return;
		parseError = getQueueExecutionErrorMessage(result.error);

		if (result.workOrder !== null) {
			if (selectedWorkOrder?.ref.id === result.workOrder.ref.id) selectedWorkOrder = result.workOrder;
			await refreshQueueFiles({ silent: true });
		}

		if (target.isCurrent()) status = null;
}

	async function handleCancelWorkOrderExecution() {
		if (selectedWorkOrder === null || !canCancelSelectedWorkOrderExecution) {
			return;
	}

		const target = captureWorkspaceOperationTarget();
		const cancellingWorkOrder = selectedWorkOrder;
		const workOrderPath = selectedWorkOrderPath;
		const selectionGeneration = artifactReadGeneration;
		const selectionIsCurrent = () => target.isCurrent() && artifactReadGeneration === selectionGeneration;
		isCancellingExecution = true;
		parseError = null;
		status = messages.queue.cancellingExecution;

		try {
			const executionId =
				activeExecutions.get(createExecutionKey(target.workspacePath, cancellingWorkOrder.ref.id)) ?? null;
			const cancelResult = await cancelQueuePanelWorkOrder({
				executionId,
				workspacePath: target.workspacePath,
				workOrderPath,
				workOrderId: cancellingWorkOrder.ref.id
			});
			if (!target.isCurrent()) return;

			if (cancelResult.ok && cancelResult.recoveredWorkOrder !== null) {
				if (selectionIsCurrent()) {
					selectedWorkOrder = cancelResult.recoveredWorkOrder;
					status = null;
				}
				await refreshQueueFiles({ silent: true });
				return;
			}

			if (!cancelResult.ok && selectionIsCurrent()) {
				parseError = getQueueExecutionErrorMessage(cancelResult.error);
				status = null;
			}
		} finally {
			if (target.isCurrent()) isCancellingExecution = false;
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

		const target = captureWorkspaceOperationTarget();
		const completingWorkOrder = selectedWorkOrder;
		const workOrderPath = selectedWorkOrderPath;
		const selectionGeneration = artifactReadGeneration;
		const selectionIsCurrent = () => target.isCurrent() && artifactReadGeneration === selectionGeneration;
		isWriting = true;
		error = null;
		parseError = null;

		try {
			const completionResult = await completeQueuePanelWorkOrder({
				workspacePath: target.workspacePath,
				workOrderPath,
				workOrder: completingWorkOrder
			});
			if (!target.isCurrent()) return;

			if (!completionResult.ok) {
				if (selectionIsCurrent()) error = completionResult.error;
				return;
			}

			if (selectionIsCurrent()) {
				selectedWorkOrder = completionResult.workOrder;
				status = messages.queue.completedFile.replace(
					'{relativePath}',
					completionResult.relativePath
				);
			}
			await refreshQueueFiles({ silent: true });
		} finally {
			if (target.isCurrent()) isWriting = false;
		}
	}

	async function applyQueuePanelEvaluationSaveState(
		result: QueuePanelEvaluationSaveResult,
		target: ReturnType<typeof captureWorkspaceOperationTarget>,
		selectionIsCurrent: () => boolean
	) {
		if (!target.isCurrent()) return;
		if (result.agentRegistry !== null) {
			agentRegistry = result.agentRegistry;
		}
		if (result.personaRegistry !== null) {
			personaRegistry = result.personaRegistry;
		}

		if (result.report !== null && result.reportRelativePath !== null) {
			if (selectionIsCurrent()) selectedReport = result.report;
			completedReportNotifications.rememberPath(result.reportRelativePath);
			await refreshQueueFiles({ silent: true });
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
		workOrderEditor,
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
		get bulkDeleteIncludesPending() { return fileActions.bulkDeleteIncludesPending; },
		set bulkDeleteIncludesPending(value: boolean) { fileActions.bulkDeleteIncludesPending = value; },
		get bulkDeleteTargetCount() { return fileActions.bulkDeleteTargetCount; },
		get canBulkDeleteQueueFiles() { return fileActions.canBulkDeleteQueueFiles; },
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
		get promptPreviews() { return promptPreview.promptPreviews; },
		get promptEstimate() { return promptPreview.promptEstimate; },
		get reviews() { return reviews; },
		get reviewDecisionOptions() { return reviewDecisionOptions; },
		get allSkills() { return allSkills; },
		get allAgents() { return allAgents; },
		get allProjects() { return allProjects; },
		get allRepositories() { return allRepositories; },
		get isRefreshing() { return isRefreshing; },
		get isReading() { return isReading; },
		get isWriting() { return isWriting; },
		get isPreviewingPrompt() { return promptPreview.isPreviewingPrompt; },
		get isCancellingExecution() { return isCancellingExecution; },
		get isSavingEvaluation() { return evaluationController.isSavingEvaluation; },
		get evaluationDialog() { return evaluationController.evaluationDialog; },
		get evaluationScores() { return evaluationController.evaluationScores; },
		get queueContextMenu() { return fileActions.queueContextMenu; },
		get queueContextMenuElement() { return fileActions.queueContextMenuElement; },
		set queueContextMenuElement(value: HTMLElement | undefined) { fileActions.queueContextMenuElement = value; },
		get hasSelectedQueueArtifact() { return hasSelectedQueueArtifact; },
		get canExecuteSelectedWorkOrder() { return canExecuteSelectedWorkOrder; },
		get canPreviewSelectedWorkOrderPrompt() { return promptPreview.canPreviewSelectedWorkOrderPrompt; },
		get canCompleteSelectedWorkOrder() { return canCompleteSelectedWorkOrder; },
		get canCancelSelectedWorkOrderExecution() { return canCancelSelectedWorkOrderExecution; },
		refreshQueueFiles,
		getExecutionFilterLabel: presentation.getExecutionFilterLabel,
		getReadFilterLabel: presentation.getReadFilterLabel,
		openNewWorkOrderDialog,
		handleQueueCardClick,
		openQueueContextMenu: fileActions.openQueueContextMenu,
		getQueueCardClass,
		isSelectedQueueFile,
		getQueuePriorityLabel: presentation.getQueuePriorityLabel,
		getKindFilterLabel: presentation.getKindFilterLabel,
		getQueuePriorityFilterLabel: presentation.getQueuePriorityFilterLabel,
		getQueueSortLabel: presentation.getQueueSortLabel,
		getQueueResponseFormatLabel: presentation.getQueueResponseFormatLabel,
		getQueueExecutionStateLabel: presentation.getQueueExecutionStateLabel,
		getQueueFolderLocalizedError,
		handleDelegateReportEvaluation,
		updateReviewDecision,
		updateReviewComment,
		openEvaluationDialog: evaluationController.openEvaluationDialog,
		getVoteChoiceLabel: presentation.getVoteChoiceLabel,
		getReportTaskAgent: evaluationController.getReportTaskAgent,
		getReviewDecisionLabel: presentation.getReviewDecisionLabel,
		isReportTaskEvaluationRecorded: evaluationController.isReportTaskEvaluationRecorded,
		handlePreviewWorkOrderPrompt: promptPreview.handlePreviewWorkOrderPrompt,
		closePromptPreviewDialog,
		handleExecuteWorkOrder: promptPreview.handlePreviewWorkOrderPrompt,
		handleConfirmExecuteWorkOrder,
		handleCancelWorkOrderExecution,
		handleCompleteWorkOrder,
		openEditWorkOrderTaskDialog,
		handleBulkDeleteQueueFiles: fileActions.handleBulkDeleteQueueFiles,
		getQueueResponseLanguageLabel: presentation.getQueueResponseLanguageLabel,
		getQueueTaskKindLabel: presentation.getQueueTaskKindLabel,
		getQueueTaskProjectLabels: presentation.getQueueTaskProjectLabels,
		getQueueTaskRepositoryLabels: presentation.getQueueTaskRepositoryLabels,
		getQueueTaskSkillLabels: presentation.getQueueTaskSkillLabels,
		getQueueTaskAgentLabels: presentation.getQueueTaskAgentLabels,
		getQueueTaskReferenceLabels: presentation.getQueueTaskReferenceLabels,
		handleDeleteContextQueueFile: fileActions.handleDeleteContextQueueFile,
		closeEvaluationDialog: evaluationController.closeEvaluationDialog,
		updateEvaluationScore: evaluationController.updateEvaluationScore,
		handleSaveEvaluation: evaluationController.handleSaveEvaluation,
		closeNewWorkOrderDialog,
		handleCreateManualWorkOrder,
		getSkillDisplayName: presentation.getSkillDisplayName,
		getAgentDisplayName: presentation.getAgentDisplayName,
		getProjectDisplayName: presentation.getProjectDisplayName,
		getRepositoryDisplayName: presentation.getRepositoryDisplayName,
		getReferenceDisplayName: presentation.getReferenceDisplayName
};
}

export type QueuePanelController = ReturnType<typeof createQueuePanelController>;
