<script lang="ts">
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
	import PageTitleRow from '$lib/ui/PageTitleRow.svelte';
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
		agentEvaluationCriteriaDefinitions,
		createAgentEvaluationDelegationPrompt,
		createDefaultAgentEvaluationScores,
		normalizeAgentEvaluationScore,
		type AgentEvaluationCriterionId,
		type AgentEvaluationScores
	} from '$lib/agents/agent-evaluation';
	import {
		createEmptyPersonaRegistry,
		type PersonaRecord,
		type PersonaRegistry
	} from '$lib/personas/persona-registry';
	import {
		readPersonaRegistry,
		subscribePersonaRegistry
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
		createEmptySkillRegistry,
		getAllSkills,
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
		createQueueWorkOrderFromReportReview,
		defaultQueueWorkPriority,
		normalizeQueueWorkPriority,
		parseQueueProposal,
		parseQueueResultReport,
		parseQueueWorkOrder,
		readQueueArtifactExecutionState,
		readQueueArtifactId,
		readQueueArtifactAgentName,
		readQueueArtifactTitle,
		readQueueWorkPriorityLabel,
		queueWorkPriorities,
		serializeQueueArtifact,
		type QueueReportTaskReview,
		type WorkduckQueueProposal,
		type WorkduckQueueExecutionState,
		type WorkduckQueueResultReport,
		type WorkduckQueueResultReportTask,
		type WorkduckQueueWorkPriority,
		type WorkduckQueueWorkOrder,
		type WorkduckQueueWorkOrderTask,
		updateQueueWorkOrderTask,
		type WorkduckQueueReviewDecision
	} from './queue-artifacts';
	import { readEnvironmentVaultSession } from '$lib/environment/environment-vault-session';
	import type { AgentExecutionError } from '$lib/agents/agent-execution';
	import { executeQueueWorkOrder, type QueueExecutionError } from './queue-execution';
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
		createVoteSpec,
		formatVoteCriteriaInput,
		type WorkduckQueueVoteOption,
		type WorkduckQueueVoteSpec,
		type WorkduckQueueTaskKind
	} from './queue-voting';
	import {
		dispatchQueueFilesChanged,
		readQueueReadFilePaths,
		writeQueueReadFilePaths
	} from './queue-read-state';

	interface Props {
		readonly workspace: WorkspaceRecord;
		readonly title: string;
		readonly refreshSignal?: number;
	}

	const QUEUE_AUTO_REFRESH_INTERVAL_MS = 30_000;
	const QUEUE_CONTEXT_MENU_MARGIN_PX = 12;
	const reviewDecisionOptions = [
		{ value: 'approved' },
		{ value: 'needs-work' },
		{ value: 'rollback' }
	] as const satisfies readonly {
		readonly value: Exclude<WorkduckQueueReviewDecision, 'pending'>;
	}[];

	const queueExecutionFilterOptions = [
		{ id: 'all' },
		{ id: 'pending' },
		{ id: 'completed' }
	] as const;
	const queueReadFilterOptions = [
		{ id: 'all' },
		{ id: 'unread' },
		{ id: 'read' }
	] as const;
	const manualVoteOptionCountDefaults = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const;

	type QueueExecutionFilter = (typeof queueExecutionFilterOptions)[number]['id'];
	type QueueReadFilter = (typeof queueReadFilterOptions)[number]['id'];
	type ManualVoteOptionInput = {
		readonly rowId: string;
		readonly id: string;
		readonly label: string;
		readonly description: string;
	};
	type QueueCardEntry = QueueFileEntry & {
		readonly isRead: boolean;
		readonly artifactId: string;
		readonly agentName: string;
		readonly title: string;
		readonly priority: WorkduckQueueWorkPriority | null;
		readonly executionState: WorkduckQueueExecutionState | null;
	};
	type WorkOrderDialogMode = 'create' | 'edit';
	type QueueExecutionContext = {
		readonly agents: readonly AgentRecord[];
		readonly skills: readonly WorkduckSkillRecord[];
		readonly references: readonly ReferenceRecord[];
		readonly personas: readonly PersonaRecord[];
	};
	type QueueContextMenuState = {
		readonly x: number;
		readonly y: number;
		readonly file: QueueCardEntry;
	};
	type AgentEvaluationDialogState = {
		readonly task: WorkduckQueueResultReportTask;
		readonly agent: AgentRecord;
	};
	type AgentEvaluationMode = 'manual' | 'ai-delegated';

	let { workspace, title, refreshSignal = 0 }: Props = $props();

	let appearanceSettings = $state<AppearanceSettings>(createDefaultAppearanceSettings());
	let files = $state<readonly QueueCardEntry[]>([]);
	let readFilePaths = $state<readonly string[]>([]);
	let queueExecutionFilter = $state<QueueExecutionFilter>('all');
	let queueReadFilter = $state<QueueReadFilter>('all');
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
	let isNewWorkOrderDialogOpen = $state(false);
	let workOrderDialogMode = $state<WorkOrderDialogMode>('create');
	let editingWorkOrderTaskId = $state<string | null>(null);
	let manualWorkOrderTitle = $state('');
	let manualWorkOrderBody = $state('');
	let manualWorkOrderPriority = $state<WorkduckQueueWorkPriority>(defaultQueueWorkPriority);
	let manualWorkOrderKind = $state<WorkduckQueueTaskKind>('instruction');
	let manualVoteOptionCount = $state(2);
	let manualVoteOptions = $state<readonly ManualVoteOptionInput[]>(createManualVoteOptions(2));
	let manualVoteCriteriaInput = $state('');
	let selectedManualSkillIds = $state<string[]>([]);
	let selectedManualAgentIds = $state<string[]>([]);
	let selectedManualReferenceIds = $state<string[]>([]);
	let skillRegistry = $state<SkillRegistry>(createEmptySkillRegistry(''));
	let agentRegistry = $state<AgentRegistry>(createEmptyAgentRegistry(''));
	let personaRegistry = $state<PersonaRegistry>(createEmptyPersonaRegistry(''));
	let referenceRegistry = $state<ReferenceRegistry>(createEmptyReferenceRegistry(''));
	let isRefreshing = $state(false);
	let isReading = $state(false);
	let isWriting = $state(false);
	let isSavingEvaluation = $state(false);
	let evaluationDialog = $state<AgentEvaluationDialogState | null>(null);
	let evaluationScores = $state<AgentEvaluationScores>(createDefaultAgentEvaluationScores());
	let evaluationMode = $state<AgentEvaluationMode>('manual');
	let queueContextMenu = $state<QueueContextMenuState | null>(null);
	let queueContextMenuElement = $state<HTMLElement | undefined>(undefined);
	let ensureSignature = $state('');
	let refreshSignature = $state(0);
	let messages = $derived(getWorkduckMessages(appearanceSettings.languageId));
	let evaluationDelegationPrompt = $derived(
		evaluationDialog === null
			? ''
			: createAgentEvaluationDelegationPrompt({
					workspacePath: workspace.path,
					agentId: evaluationDialog.agent.id,
					agentName: evaluationDialog.agent.name,
					taskTitle: evaluationDialog.task.title,
					taskBody: evaluationDialog.task.title,
					response: evaluationDialog.task.summary
				})
	);
	let queueItemCountLabel = $derived(
		messages.queue.registeredCount.replace('{count}', files.length.toString())
	);
	let allSkills = $derived(getAllSkills(skillRegistry));
	let allAgents = $derived(agentRegistry.agents);
	let allReferences = $derived(referenceRegistry.references);
	let manualWorkOrderSkillSummary = $derived(
		createSelectionSummary(selectedManualSkillIds, messages.queue.noSkill, getSkillLabelById)
	);
	let manualWorkOrderAgentSummary = $derived(
		createSelectionSummary(selectedManualAgentIds, messages.queue.noAgent, getAgentLabelById)
	);
	let manualWorkOrderReferenceSummary = $derived(
		createSelectionSummary(
			selectedManualReferenceIds,
			messages.queue.noReference,
			getReferenceLabelById
		)
	);
	let selectedReportVoteAggregate = $derived(
		selectedReport === null ? null : createVoteAggregate(selectedReport.tasks)
	);
	let manualVoteOptionCountChoices = $derived(createManualVoteOptionCountChoices(manualVoteOptionCount));
	let manualValidVoteOptionCount = $derived(
		manualVoteOptions.filter((option) => option.label.trim().length > 0).length
	);
	let followUpTaskCount = $derived(
		reviews.filter((review) => review.decision === 'needs-work' || review.decision === 'rollback')
			.length
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

			if (!matchesExecutionFilter || !matchesReadFilter) {
				return false;
			}

			return true;
		})
	);
	let hasSelectedQueueArtifact = $derived(
		selectedReport !== null || selectedWorkOrder !== null || selectedProposal !== null
	);
	let canCreateManualWorkOrder = $derived(
			manualWorkOrderTitle.trim().length > 0 &&
			manualWorkOrderBody.trim().length > 0 &&
			(manualWorkOrderKind !== 'vote' || manualValidVoteOptionCount >= 2) &&
			!isWriting
	);
	let canExecuteSelectedWorkOrder = $derived(
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
		queueContextMenu = null;
		queueContextMenuElement = undefined;
		reviews = [];
		readFilePaths = readQueueReadFilePaths(workspace.id);
		queueExecutionFilter = 'all';
		queueReadFilter = 'all';
		skillRegistry = createEmptySkillRegistry(workspace.id);
		agentRegistry = createEmptyAgentRegistry(workspace.id);
		personaRegistry = createEmptyPersonaRegistry(workspace.id);
		referenceRegistry = createEmptyReferenceRegistry(workspace.id);
		selectedManualSkillIds = [];
		selectedManualAgentIds = [];
		selectedManualReferenceIds = [];
		void readSkillsForWorkspace(workspace.id, workspace.path);
		void readAgentsForWorkspace(workspace.id, workspace.path);
		void readPersonasForWorkspace(workspace.id, workspace.path);
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
		const unsubscribeReferenceRegistry = subscribeReferenceRegistry(workspace.id, (nextRegistry) => {
			referenceRegistry = nextRegistry;
		});

		return () => {
			unsubscribeSkillRegistry();
			unsubscribeAgentRegistry();
			unsubscribePersonaRegistry();
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
				const nextFiles = await createQueueCardEntries(result.files);
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
		manualWorkOrderKind = 'instruction';
		resetManualVoteFields();
		selectedManualSkillIds = [];
		selectedManualAgentIds = [];
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
		manualWorkOrderKind = task.kind === 'vote' ? 'vote' : 'instruction';
		loadManualVoteFields(task.vote);
		selectedManualSkillIds = [...(task.skillIds ?? [])];
		selectedManualAgentIds = [...(task.agentIds ?? [])];
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
		manualWorkOrderKind = 'instruction';
		resetManualVoteFields();
		selectedManualSkillIds = [];
		selectedManualAgentIds = [];
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

	async function createQueueCardEntries(queueFiles: readonly QueueFileEntry[]) {
		const entries = await Promise.all(
			queueFiles.map(async (file): Promise<QueueCardEntry> => {
				if (file.kind === 'unsupported') {
					return {
						...file,
						isRead: readFilePaths.includes(file.relativePath),
						artifactId: '',
						agentName: '',
						title: file.fileName,
						priority: null,
						executionState: null
					};
				}

				const readResult = await readQueueFile(workspace.path, file.relativePath);
				const artifactTitle = readResult.ok ? readQueueArtifactTitle(readResult.content) : '';

				return {
					...file,
					isRead: readFilePaths.includes(file.relativePath),
					artifactId: readResult.ok ? readQueueArtifactId(readResult.content) : '',
					agentName: readResult.ok ? readQueueArtifactAgentName(readResult.content) : '',
					title: artifactTitle.length > 0 ? artifactTitle : file.fileName,
					priority:
						readResult.ok && file.kind === 'work-order'
							? readQueueWorkPriorityLabel(readResult.content)
							: null,
					executionState: readResult.ok
						? readQueueArtifactExecutionState(readResult.content)
						: null
				};
			})
		);

		return entries;
	}

	function createQueueFilesSignature(queueFiles: readonly QueueCardEntry[]) {
		return queueFiles.map((file) => `${file.relativePath}:${file.kind}`).join('\n');
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

	async function handleCreateWorkOrder() {
		if (selectedReport === null || isWriting) {
			return;
		}

		const workOrder = createQueueWorkOrderFromReportReview(selectedReport, reviews);

		if (workOrder.tasks.length === 0) {
			status = messages.queue.noFollowUpSelected;
			return;
		}

		isWriting = true;
		error = null;
		status = null;

		try {
			const result = await writeQueueWorkOrderFile(
				workspace.path,
				createQueueWorkOrderFileName(workOrder),
				serializeQueueArtifact(workOrder)
			);

			if (result.ok) {
				status = messages.queue.createdFile.replace('{relativePath}', result.relativePath);
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
				manualWorkOrderTitle,
				manualWorkOrderBody,
				manualWorkOrderPriority,
				createManualWorkOrderSkillIds(),
				createManualWorkOrderAgentIds(),
				createManualWorkOrderReferenceIds(),
				createManualWorkOrderKindInput()
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
				manualWorkOrderKind = 'instruction';
				resetManualVoteFields();
				selectedManualSkillIds = [];
				selectedManualAgentIds = [];
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
			title: manualWorkOrderTitle,
			body: manualWorkOrderBody,
			priority: manualWorkOrderPriority,
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
			manualWorkOrderKind = 'instruction';
			resetManualVoteFields();
			selectedManualSkillIds = [];
			selectedManualAgentIds = [];
			selectedManualReferenceIds = [];
			editingWorkOrderTaskId = null;
			workOrderDialogMode = 'create';
			await refreshQueueFiles({ silent: true });
			return;
		}

		error = result.error;
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

	function getFileKindLabel(kind: QueueFileEntry['kind']) {
		switch (kind) {
			case 'result-report':
				return messages.queue.fileKinds.resultReport;
			case 'work-order':
				return messages.queue.fileKinds.workOrder;
			case 'proposal':
				return messages.queue.fileKinds.proposal;
			case 'unsupported':
				return messages.queue.fileKinds.unsupported;
		}
	}

	function getExecutionFilterLabel(filter: QueueExecutionFilter) {
		switch (filter) {
			case 'all':
				return messages.common.all;
			case 'pending':
				return messages.queue.executionStates.pending;
			case 'completed':
				return messages.queue.executionStates.completed;
		}
	}

	function getReadFilterLabel(filter: QueueReadFilter) {
		switch (filter) {
			case 'all':
				return messages.common.all;
			case 'unread':
				return messages.queue.readStates.unread;
			case 'read':
				return messages.queue.readStates.read;
		}
	}

	function getQueueExecutionStateLabel(executionState: WorkduckQueueExecutionState | null) {
		if (executionState === null) {
			return '';
		}

		return messages.queue.executionStates[executionState];
	}

	function getQueuePriorityLabel(priority: WorkduckQueueWorkPriority) {
		return messages.queue.priorities[priority];
	}

	function createManualWorkOrderSkillIds() {
		return selectedManualSkillIds;
	}

	function createManualWorkOrderAgentIds() {
		return selectedManualAgentIds;
	}

	function createManualWorkOrderReferenceIds() {
		return selectedManualReferenceIds;
	}

	function getSkillDisplayName(skill: WorkduckSkillRecord) {
		return skill.id === 'workduck.skill.proposal-writer'
			? messages.skills.builtIn.proposalWriter.name
			: skill.name;
	}

	function getAgentDisplayName(agent: AgentRecord) {
		return agent.name;
	}

	function getReferenceDisplayName(reference: ReferenceRecord) {
		return reference.title;
	}

	function getSkillLabelById(skillId: string) {
		const skill = allSkills.find((candidate) => candidate.id === skillId);

		return skill === undefined ? skillId : getSkillDisplayName(skill);
	}

	function getAgentLabelById(agentId: string) {
		const agent = allAgents.find((candidate) => candidate.id === agentId);

		return agent === undefined ? agentId : getAgentDisplayName(agent);
	}

	function getReferenceLabelById(referenceId: string) {
		const reference = allReferences.find((candidate) => candidate.id === referenceId);

		return reference === undefined ? referenceId : getReferenceDisplayName(reference);
	}

	function createSelectionSummary(
		selectedIds: readonly string[],
		emptyLabel: string,
		getLabel: (id: string) => string
	) {
		if (selectedIds.length === 0) {
			return emptyLabel;
		}

		if (selectedIds.length === 1) {
			const selectedId = selectedIds[0];

			return selectedId === undefined ? emptyLabel : getLabel(selectedId);
		}

		return messages.queue.selectionCount.replace('{count}', selectedIds.length.toString());
	}

	function toggleManualWorkOrderSkill(skillId: string, isSelected: boolean) {
		selectedManualSkillIds = updateSelectedRecordIds(selectedManualSkillIds, skillId, isSelected);
	}

	function toggleManualWorkOrderAgent(agentId: string, isSelected: boolean) {
		selectedManualAgentIds = updateSelectedRecordIds(selectedManualAgentIds, agentId, isSelected);
	}

	function toggleManualWorkOrderReference(referenceId: string, isSelected: boolean) {
		selectedManualReferenceIds = updateSelectedRecordIds(
			selectedManualReferenceIds,
			referenceId,
			isSelected
		);
	}

	function resetManualVoteFields() {
		manualVoteOptionCount = 2;
		manualVoteOptions = createManualVoteOptions(2);
		manualVoteCriteriaInput = '';
	}

	function loadManualVoteFields(vote: WorkduckQueueVoteSpec | undefined) {
		manualVoteCriteriaInput = formatVoteCriteriaInput(vote);

		if (vote === undefined || vote.options.length === 0) {
			manualVoteOptionCount = 2;
			manualVoteOptions = createManualVoteOptions(2);
			return;
		}

		const nextCount = Math.max(2, vote.options.length);

		manualVoteOptionCount = nextCount;
		manualVoteOptions = createManualVoteOptions(nextCount, vote.options);
	}

	function setManualVoteOptionCount(value: string) {
		const nextCount = normalizeManualVoteOptionCount(value);

		manualVoteOptionCount = nextCount;
		manualVoteOptions = createManualVoteOptions(nextCount, manualVoteOptions);
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

	function createManualVoteOptionsText() {
		return manualVoteOptions
			.map((option) => {
				const label = option.label.trim();

				if (label.length === 0) {
					return '';
				}

				const id = option.id.trim();
				const description = option.description.trim();
				const labelWithId = id.length > 0 ? `${id}: ${label}` : label;

				return description.length > 0 ? `${labelWithId} - ${description}` : labelWithId;
			})
			.filter((option) => option.length > 0)
			.join('\n');
	}

	function createManualWorkOrderKindInput() {
		if (manualWorkOrderKind !== 'vote') {
			return { kind: 'instruction' as const, vote: null };
		}

		return {
			kind: 'vote' as const,
			vote: createVoteSpec({
				question: manualWorkOrderBody,
				optionsText: createManualVoteOptionsText(),
				criteriaText: manualVoteCriteriaInput
			})
		};
	}

	function createManualVoteOptions(
		count: number,
		sourceOptions: readonly (ManualVoteOptionInput | WorkduckQueueVoteOption)[] = []
	): readonly ManualVoteOptionInput[] {
		return Array.from({ length: count }, (_, index) =>
			createManualVoteOption(index, sourceOptions[index])
		);
	}

	function createManualVoteOption(
		index: number,
		sourceOption: ManualVoteOptionInput | WorkduckQueueVoteOption | undefined
	): ManualVoteOptionInput {
		if (sourceOption === undefined) {
			return {
				rowId: `manual-vote-option-${index + 1}`,
				id: '',
				label: '',
				description: ''
			};
		}

		return {
			rowId: 'rowId' in sourceOption ? sourceOption.rowId : `manual-vote-option-${index + 1}`,
			id: sourceOption.id,
			label: sourceOption.label,
			description: sourceOption.description ?? ''
		};
	}

	function createManualVoteOptionCountChoices(currentCount: number) {
		const choices = new Set<number>(manualVoteOptionCountDefaults);
		choices.add(currentCount);

		return Array.from(choices).sort((left, right) => left - right);
	}

	function normalizeManualVoteOptionCount(value: string) {
		const numericValue = Number(value);

		if (!Number.isFinite(numericValue)) {
			return 2;
		}

		return Math.max(2, Math.min(50, Math.round(numericValue)));
	}

	function updateSelectedRecordIds(
		selectedIds: readonly string[],
		recordId: string,
		isSelected: boolean
	) {
		const normalizedRecordId = recordId.trim();

		if (normalizedRecordId.length === 0) {
			return [...selectedIds];
		}

		if (!isSelected) {
			return selectedIds.filter((selectedId) => selectedId !== normalizedRecordId);
		}

		return selectedIds.includes(normalizedRecordId)
			? [...selectedIds]
			: [...selectedIds, normalizedRecordId];
	}

	function getQueueTaskSkillLabels(task: WorkduckQueueWorkOrderTask) {
		return (task.skillIds ?? []).map(getSkillLabelById);
	}

	function getQueueTaskAgentLabels(task: WorkduckQueueWorkOrderTask) {
		return (task.agentIds ?? []).map(getAgentLabelById);
	}

	function getQueueTaskReferenceLabels(task: WorkduckQueueWorkOrderTask) {
		return (task.referenceIds ?? []).map(getReferenceLabelById);
	}

	function getQueueTaskKindLabel(kind: WorkduckQueueTaskKind | undefined) {
		return kind === 'vote' ? messages.queue.workTypes.vote : messages.queue.workTypes.instruction;
	}

	function getVoteChoiceLabel(task: WorkduckQueueResultReportTask) {
		const vote = task.vote;

		if (vote === undefined || vote.ballot.parseStatus !== 'parsed') {
			return messages.queue.vote.unparsed;
		}

		const option = vote.options.find((candidate) => candidate.id === vote.ballot.choiceId);

		return option === undefined ? vote.ballot.choiceId : option.label;
	}

	function getReviewDecisionLabel(decision: Exclude<WorkduckQueueReviewDecision, 'pending'>) {
		switch (decision) {
			case 'approved':
				return messages.queue.reviewDecisions.approved;
			case 'needs-work':
				return messages.queue.reviewDecisions.needsWork;
			case 'rollback':
				return messages.queue.reviewDecisions.rollback;
		}
	}

	function getReportTaskAgent(task: WorkduckQueueResultReportTask) {
		const idMatch = /^task_(.+)_[a-z0-9]+$/i.exec(task.id);
		const candidateAgentId = idMatch?.[1] ?? '';
		const idMatchAgent = allAgents.find((agent) => agent.id === candidateAgentId);

		if (idMatchAgent !== undefined) {
			return idMatchAgent;
		}

		const titleAgentName = task.title.split(':')[0]?.trim() ?? '';

		if (titleAgentName.length === 0) {
			return null;
		}

		return allAgents.find((agent) => agent.name === titleAgentName) ?? null;
	}

	function openEvaluationDialog(task: WorkduckQueueResultReportTask) {
		const agent = getReportTaskAgent(task);

		if (agent === null || isWriting || isSavingEvaluation) {
			return;
		}

		evaluationDialog = { task, agent };
		evaluationScores = createDefaultAgentEvaluationScores();
		evaluationMode = 'manual';
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
		evaluationMode = 'manual';
	}

	function updateEvaluationScore(criterionId: AgentEvaluationCriterionId, value: string) {
		evaluationScores = {
			...evaluationScores,
			[criterionId]: normalizeAgentEvaluationScore(value)
		};
	}

	async function copyEvaluationDelegationPrompt() {
		if (evaluationDelegationPrompt.length === 0) {
			return;
		}

		if (typeof navigator === 'undefined' || navigator.clipboard === undefined) {
			parseError = messages.queue.evaluation.clipboardUnavailable;
			return;
		}

		try {
			await navigator.clipboard.writeText(evaluationDelegationPrompt);
			status = messages.queue.evaluation.promptCopied;
		} catch {
			parseError = messages.queue.evaluation.clipboardUnavailable;
		}
	}

	async function handleSaveEvaluation(event: SubmitEvent) {
		event.preventDefault();

		if (evaluationDialog === null || isSavingEvaluation || evaluationMode !== 'manual') {
			return;
		}

		isSavingEvaluation = true;
		error = null;
		parseError = null;
		status = null;

		try {
			const latestAgentRegistryResult = await readAgentRegistry(workspace.id, workspace.path);
			const mutation = recordAgentEvaluation(
				latestAgentRegistryResult.registry,
				evaluationDialog.agent.id,
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

			status = messages.queue.evaluation.saved;
			evaluationDialog = null;
			evaluationScores = createDefaultAgentEvaluationScores();
			evaluationMode = 'manual';
		} finally {
			isSavingEvaluation = false;
		}
	}

	function getQueueFolderLocalizedError(error: QueueFolderError) {
		switch (error) {
			case 'queue-folder-workspace-required':
				return messages.queue.errors.workspaceRequired;
			case 'queue-folder-workspace-not-absolute':
				return messages.queue.errors.workspaceNotAbsolute;
			case 'queue-folder-workspace-not-found':
				return messages.queue.errors.workspaceNotFound;
			case 'queue-folder-workspace-not-directory':
				return messages.queue.errors.workspaceNotDirectory;
			case 'queue-folder-workspace-permission-denied':
				return messages.queue.errors.workspacePermissionDenied;
			case 'queue-folder-workspace-unreadable':
				return messages.queue.errors.workspaceUnreadable;
			case 'queue-folder-root-invalid':
				return messages.queue.errors.rootInvalid;
			case 'queue-folder-create-failed':
				return messages.queue.errors.createFailed;
			case 'queue-folder-open-failed':
				return messages.queue.errors.openFailed;
			case 'queue-folder-list-failed':
				return messages.queue.errors.listFailed;
			case 'queue-folder-file-invalid':
				return messages.queue.errors.fileInvalid;
			case 'queue-folder-file-not-found':
				return messages.queue.errors.fileNotFound;
			case 'queue-folder-file-read-failed':
				return messages.queue.errors.fileReadFailed;
			case 'queue-folder-file-write-failed':
				return messages.queue.errors.fileWriteFailed;
			case 'queue-folder-file-delete-failed':
				return messages.queue.errors.fileDeleteFailed;
			case 'queue-folder-file-already-exists':
				return messages.queue.errors.fileAlreadyExists;
			case 'queue-folder-unavailable':
				return messages.queue.errors.unavailable;
		}
	}

	function getQueueExecutionErrorMessage(executionError: QueueExecutionError) {
		switch (executionError) {
			case 'queue-execution-no-task':
				return messages.queue.errors.executionNoTask;
			case 'queue-execution-no-agent':
				return messages.queue.errors.executionNoAgent;
			case 'queue-execution-vault-locked':
				return messages.queue.errors.executionVaultLocked;
			default:
				return getAgentExecutionErrorMessage(executionError);
		}
	}

	function getAgentExecutionErrorMessage(agentError: AgentExecutionError) {
		switch (agentError) {
			case 'agent-execution-agent-not-found':
				return messages.queue.errors.executionAgentNotFound;
			case 'agent-execution-secret-not-found':
				return messages.queue.errors.executionSecretNotFound;
			case 'agent-execution-provider-unsupported':
				return messages.queue.errors.executionProviderUnsupported;
			case 'agent-execution-api-key-required':
				return messages.queue.errors.executionApiKeyRequired;
			case 'agent-execution-prompt-required':
				return messages.queue.errors.executionPromptRequired;
			case 'agent-execution-model-required':
				return messages.queue.errors.executionModelRequired;
			case 'agent-execution-request-invalid':
				return messages.queue.errors.executionRequestInvalid;
			case 'agent-execution-authentication-failed':
				return messages.queue.errors.executionAuthenticationFailed;
			case 'agent-execution-rate-limited':
				return messages.queue.errors.executionRateLimited;
			case 'agent-execution-provider-rejected':
				return messages.queue.errors.executionProviderRejected;
			case 'agent-execution-provider-unavailable':
				return messages.queue.errors.executionProviderUnavailable;
			case 'agent-execution-response-invalid':
				return messages.queue.errors.executionResponseInvalid;
			case 'agent-execution-unavailable':
				return messages.queue.errors.executionUnavailable;
		}
	}
</script>

<section class="workduck-queue-panel" aria-label={messages.navigation.queue}>
	<header class="workduck-page-header">
		<PageTitleRow {title} meta={queueItemCountLabel} />
		<div class="workduck-page-actions workduck-queue-header-actions">
			<div class="workduck-queue-filters" aria-label={messages.queue.executionFilters}>
				{#each queueExecutionFilterOptions as option}
					<button
						class="workduck-project-sync-filter-button"
						class:workduck-project-sync-filter-button-active={queueExecutionFilter === option.id}
						type="button"
						aria-pressed={queueExecutionFilter === option.id}
						onclick={() => (queueExecutionFilter = option.id)}
					>
						{getExecutionFilterLabel(option.id)}
					</button>
				{/each}
			</div>
			<div class="workduck-queue-filters" aria-label={messages.queue.readFilters}>
				{#each queueReadFilterOptions as option}
					<button
						class="workduck-project-sync-filter-button"
						class:workduck-project-sync-filter-button-active={queueReadFilter === option.id}
						type="button"
						aria-pressed={queueReadFilter === option.id}
						onclick={() => (queueReadFilter = option.id)}
					>
						{getReadFilterLabel(option.id)}
					</button>
				{/each}
			</div>
			<button
				class="workduck-button workduck-button-secondary"
				type="button"
				aria-keyshortcuts="F5"
				disabled={isRefreshing}
				onclick={() => void refreshQueueFiles()}
			>
				{messages.common.refresh} (F5)
			</button>
		</div>
	</header>

	{#if error !== null}
		<p class="workduck-inline-error" aria-live="polite">{getQueueFolderLocalizedError(error)}</p>
	{:else if parseError !== null}
		<p class="workduck-inline-error" aria-live="polite">{parseError}</p>
	{/if}

	<div class="workduck-queue-layout">
		<section class="workduck-queue-list" aria-label={messages.queue.list}>
			<button
				class="workduck-list-add-card"
				type="button"
				aria-haspopup="dialog"
				onclick={(event) => {
					event.stopPropagation();
					openNewWorkOrderDialog();
				}}
			>
				{messages.queue.addWork}
			</button>

			{#if files.length > 0 && filteredFiles.length === 0}
				<p class="workduck-empty-state">{messages.queue.noMatches}</p>
			{:else if files.length > 0}
				{#each filteredFiles as file (file.relativePath)}
					<button
						class={getQueueCardClass(file)}
						type="button"
						disabled={isReading || file.kind === 'unsupported'}
						aria-pressed={isSelectedQueueFile(file)}
						onclick={() => handleQueueCardClick(file)}
						oncontextmenu={(event) => openQueueContextMenu(event, file)}
					>
						<div class="workduck-queue-file-details">
							<strong>{file.title}</strong>
							<span>{getFileKindLabel(file.kind)}</span>
							{#if file.kind === 'work-order' && file.artifactId.length > 0}
								<span>{messages.queue.workOrderId}: {file.artifactId}</span>
							{/if}
							{#if file.agentName.length > 0}
								<span>{file.agentName}</span>
							{/if}
							{#if file.priority !== null}
								<span>{getQueuePriorityLabel(file.priority)}</span>
							{/if}
						</div>
						<div class="workduck-queue-card-badges">
							<span
								class="workduck-queue-read-state"
								class:workduck-queue-read-state-unread={!file.isRead}
							>
								{file.isRead ? messages.queue.readStates.read : messages.queue.readStates.unread}
							</span>
							{#if file.executionState !== null}
								<span class="workduck-queue-execution-state">
									{getQueueExecutionStateLabel(file.executionState)}
								</span>
							{/if}
						</div>
					</button>
				{/each}
			{/if}
		</section>

		<section
			class="workduck-queue-detail"
			class:workduck-queue-detail-empty={!hasSelectedQueueArtifact}
			aria-label={messages.queue.detail}
		>
		{#if selectedReport !== null}
			<section class="workduck-queue-review" aria-label={messages.queue.resultReportReview}>
				<div class="workduck-queue-review-header">
					<div class="workduck-queue-file-details">
						<strong>{selectedReport.ref.label}</strong>
						{#if selectedReportPath !== null}
							<span>{selectedReportPath}</span>
						{/if}
					</div>
					<button
						class="workduck-button workduck-button-primary"
						type="button"
						disabled={isWriting || followUpTaskCount === 0}
						onclick={handleCreateWorkOrder}
					>
						{isWriting ? messages.queue.creating : messages.queue.createWorkOrder}
					</button>
				</div>

				{#if selectedReportVoteAggregate !== null}
					<section class="workduck-queue-vote-summary" aria-label={messages.queue.vote.result}>
						<strong>{messages.queue.vote.result}</strong>
						<div class="workduck-queue-vote-options">
							{#each selectedReportVoteAggregate.optionCounts as optionCount (optionCount.option.id)}
								<div
									class="workduck-queue-vote-option"
									class:workduck-queue-vote-option-winner={selectedReportVoteAggregate.winnerIds.includes(
										optionCount.option.id
									)}
								>
									<span>{optionCount.option.label}</span>
									<small>
										{messages.queue.vote.count.replace('{count}', optionCount.count.toString())}
										{#if optionCount.averageConfidence !== null}
											 · {messages.queue.vote.confidence.replace(
												'{score}',
												optionCount.averageConfidence.toString()
											)}
										{/if}
									</small>
								</div>
							{/each}
						</div>
						{#if selectedReportVoteAggregate.invalidCount > 0}
							<small class="workduck-queue-vote-invalid">
								{messages.queue.vote.invalid.replace(
									'{count}',
									selectedReportVoteAggregate.invalidCount.toString()
								)}
							</small>
						{/if}
					</section>
				{/if}

				<div class="workduck-queue-review-tasks">
					{#each selectedReport.tasks as task (task.id)}
						{@const review = reviews.find((item) => item.taskId === task.id)}
						{@const reportTaskAgent = getReportTaskAgent(task)}
						<article class="workduck-queue-review-task">
							<header class="workduck-queue-review-task-header">
								<strong>{task.title}</strong>
								{#if task.vote !== undefined}
									<div class="workduck-queue-review-task-pills">
										<span class="workduck-queue-task-pill">
											{messages.queue.vote.choice}: {getVoteChoiceLabel(task)}
										</span>
										{#if task.vote.ballot.confidence !== null}
											<span class="workduck-queue-task-pill">
												{messages.queue.vote.confidence.replace(
													'{score}',
													task.vote.ballot.confidence.toString()
												)}
											</span>
										{/if}
									</div>
								{/if}
								<button
									class="workduck-button workduck-button-secondary workduck-queue-task-edit-button"
									type="button"
									disabled={reportTaskAgent === null || isSavingEvaluation}
									onclick={() => openEvaluationDialog(task)}
								>
									{messages.queue.evaluation.action}
								</button>
							</header>
							<p>{task.summary}</p>

							{#if task.filesChanged.length > 0}
								<div class="workduck-queue-review-list">
									<span>{messages.common.files}</span>
									<ul>
										{#each task.filesChanged as file}
											<li>{file}</li>
										{/each}
									</ul>
								</div>
							{/if}

							{#if task.verification.length > 0}
								<div class="workduck-queue-review-list">
									<span>{messages.common.checks}</span>
									<ul>
										{#each task.verification as check}
											<li>{check}</li>
										{/each}
									</ul>
								</div>
							{/if}

							{#if task.risks.length > 0}
								<div class="workduck-queue-review-list">
									<span>{messages.common.risks}</span>
									<ul>
										{#each task.risks as risk}
											<li>{risk}</li>
										{/each}
									</ul>
								</div>
							{/if}

							<div class="workduck-queue-review-decisions">
								{#each reviewDecisionOptions as option}
									<label>
										<input
											type="radio"
											name={`review-${task.id}`}
											checked={review?.decision === option.value}
											onchange={() => updateReviewDecision(task.id, option.value)}
										/>
										<span>{getReviewDecisionLabel(option.value)}</span>
									</label>
								{/each}
							</div>

							{#if review?.decision === 'needs-work' || review?.decision === 'rollback'}
								<label class="workduck-form-field">
									{messages.common.comment}
									<textarea
										class="workduck-input workduck-project-description-input"
										value={review.comment}
										oninput={(event) =>
											updateReviewComment(task.id, event.currentTarget.value)}
									></textarea>
								</label>
							{/if}
						</article>
					{/each}
				</div>
			</section>
		{:else if selectedWorkOrder !== null}
			<section class="workduck-queue-review" aria-label={messages.queue.workOrderView}>
				<div class="workduck-queue-review-header">
					<div class="workduck-queue-file-details">
						<strong>{selectedWorkOrder.ref.label}</strong>
						<span>{messages.queue.workOrderId}: {selectedWorkOrder.ref.id}</span>
					</div>
					<button
						class="workduck-button workduck-button-primary"
						type="button"
						disabled={!canExecuteSelectedWorkOrder}
						onclick={handleExecuteWorkOrder}
					>
						{isWriting ? messages.queue.executing : messages.queue.executeWorkOrder}
					</button>
				</div>

				<div class="workduck-queue-review-tasks">
					{#each selectedWorkOrder.tasks as task (task.id)}
						<article class="workduck-queue-review-task">
							<header class="workduck-queue-review-task-header">
								<strong>{task.title}</strong>
								<div class="workduck-queue-review-task-pills">
									<span
										class="workduck-queue-task-pill workduck-queue-priority-pill"
										data-priority={normalizeQueueWorkPriority(task.priority)}
									>
										{getQueuePriorityLabel(normalizeQueueWorkPriority(task.priority))}
									</span>
									<span class="workduck-queue-task-pill">{getQueueTaskKindLabel(task.kind)}</span>
									{#if task.kind === 'vote' && task.vote !== undefined}
										<span class="workduck-queue-task-pill">
											{messages.queue.vote.optionCount.replace(
												'{count}',
												task.vote.options.length.toString()
											)}
										</span>
									{/if}
									{#if task.decision !== undefined}
										<span class="workduck-queue-task-pill">{task.decision}</span>
									{/if}
									{#each getQueueTaskSkillLabels(task) as skillLabel (skillLabel)}
										<span class="workduck-queue-task-pill">{skillLabel}</span>
									{/each}
									{#each getQueueTaskAgentLabels(task) as agentLabel (agentLabel)}
										<span class="workduck-queue-task-pill">{agentLabel}</span>
									{/each}
									{#each getQueueTaskReferenceLabels(task) as referenceLabel (referenceLabel)}
										<span class="workduck-queue-task-pill">{referenceLabel}</span>
									{/each}
								</div>
								<button
									class="workduck-button workduck-button-secondary workduck-queue-task-edit-button"
									type="button"
									disabled={isWriting}
									onclick={() => openEditWorkOrderTaskDialog(task)}
								>
									{messages.common.edit}
								</button>
							</header>
							<p>{task.body}</p>

							{#if task.sourceReportTaskId !== undefined}
								<div class="workduck-queue-review-list">
									<span>{messages.common.source}</span>
									<ul>
										<li>{task.sourceReportTaskId}</li>
									</ul>
								</div>
							{/if}
						</article>
					{/each}
				</div>
			</section>
		{:else if selectedProposal !== null}
			<section class="workduck-queue-review" aria-label={messages.queue.proposalView}>
				<div class="workduck-queue-review-header">
					<div class="workduck-queue-file-details">
						<strong>{selectedProposal.ref.label}</strong>
						{#if selectedProposalPath !== null}
							<span>{selectedProposalPath}</span>
						{/if}
					</div>
				</div>

				<div class="workduck-queue-review-tasks">
					<article class="workduck-queue-review-task">
						<header class="workduck-queue-review-task-header">
							<strong>{messages.common.question}</strong>
						</header>
						<p>{selectedProposal.question}</p>
						<div class="workduck-queue-review-list">
							<span>{messages.common.summary}</span>
							<ul>
								<li>{selectedProposal.summary}</li>
							</ul>
						</div>
					</article>

					{#each selectedProposal.options as option (option.id)}
						<article class="workduck-queue-review-task">
							<header class="workduck-queue-review-task-header">
								<strong>{option.name}</strong>
								{#if selectedProposal.recommendation?.optionId === option.id}
									<span class="workduck-queue-task-pill">{messages.common.recommended}</span>
								{/if}
							</header>
							<p>{option.summary}</p>

							{#if option.strengths.length > 0}
								<div class="workduck-queue-review-list">
									<span>{messages.common.strengths}</span>
									<ul>
										{#each option.strengths as strength}
											<li>{strength}</li>
										{/each}
									</ul>
								</div>
							{/if}

							{#if option.risks.length > 0}
								<div class="workduck-queue-review-list">
									<span>{messages.common.risks}</span>
									<ul>
										{#each option.risks as risk}
											<li>{risk}</li>
										{/each}
									</ul>
								</div>
							{/if}
						</article>
					{/each}

					{#if selectedProposal.recommendation !== null}
						<article class="workduck-queue-review-task">
							<header class="workduck-queue-review-task-header">
								<strong>{messages.common.recommendation}</strong>
							</header>
							<p>{selectedProposal.recommendation.reason}</p>
						</article>
					{/if}

					{#if selectedProposal.nextWorkOrders.length > 0}
						<article class="workduck-queue-review-task">
							<header class="workduck-queue-review-task-header">
								<strong>{messages.queue.nextWorkOrders}</strong>
							</header>
							<div class="workduck-queue-review-list">
								<ul>
									{#each selectedProposal.nextWorkOrders as task (task.id)}
										<li>{task.title}</li>
									{/each}
								</ul>
							</div>
						</article>
					{/if}
				</div>
			</section>
		{/if}
		</section>
	</div>
</section>

{#if status !== null}
	<p class="workduck-status-toast" aria-live="polite">{status}</p>
{/if}

{#if queueContextMenu !== null}
	<div
		class="workduck-context-menu"
		role="menu"
		aria-label={messages.queue.contextMenu}
		style={`left: ${queueContextMenu.x}px; top: ${queueContextMenu.y}px;`}
		bind:this={queueContextMenuElement}
	>
		<button
			class="workduck-context-menu-item workduck-context-menu-item-danger"
			type="button"
			role="menuitem"
			disabled={isWriting}
			onclick={() => void handleDeleteContextQueueFile()}
		>
			{messages.common.remove}
		</button>
	</div>
{/if}

{#if evaluationDialog !== null}
	<div class="workduck-dialog-backdrop" role="presentation" onclick={(event) => {
		if (event.target === event.currentTarget) {
			closeEvaluationDialog();
		}
	}}>
		<div
			class="workduck-dialog workduck-project-dialog"
			role="dialog"
			aria-modal="true"
			aria-labelledby="queue-evaluation-dialog-title"
		>
			<form class="workduck-project-dialog-form" onsubmit={handleSaveEvaluation}>
				<h2 id="queue-evaluation-dialog-title" class="workduck-dialog-title">
					{messages.queue.evaluation.title}
				</h2>

				<div class="workduck-queue-evaluation-target">
					<strong>{evaluationDialog.agent.name}</strong>
					<span>{evaluationDialog.task.title}</span>
				</div>

				<div class="workduck-queue-evaluation-mode">
					<strong>{messages.queue.evaluation.mode}</strong>
					<div class="workduck-queue-review-decisions">
						<label>
							<input
								type="radio"
								name="queue-evaluation-mode"
								checked={evaluationMode === 'manual'}
								disabled={isSavingEvaluation}
								onchange={() => {
									evaluationMode = 'manual';
								}}
							/>
							<span>{messages.queue.evaluation.manual}</span>
						</label>
						<label>
							<input
								type="radio"
								name="queue-evaluation-mode"
								checked={evaluationMode === 'ai-delegated'}
								disabled={isSavingEvaluation}
								onchange={() => {
									evaluationMode = 'ai-delegated';
								}}
							/>
							<span>{messages.queue.evaluation.aiDelegated}</span>
						</label>
					</div>
				</div>

				{#if evaluationMode === 'manual'}
					<div class="workduck-queue-evaluation-grid">
						{#each agentEvaluationCriteriaDefinitions as criterion (criterion.id)}
							{@const criterionMessages = messages.agents.evaluation.criteria[criterion.id]}
							<label class="workduck-queue-evaluation-row" for={`queue-evaluation-${criterion.id}`}>
								<span>
									<strong>{criterionMessages.label}</strong>
									<small>{criterionMessages.description}</small>
								</span>
								<select
									id={`queue-evaluation-${criterion.id}`}
									class="workduck-select workduck-queue-evaluation-score"
									value={evaluationScores[criterion.id]}
									disabled={isSavingEvaluation}
									onchange={(event) =>
										updateEvaluationScore(criterion.id, event.currentTarget.value)}
								>
									{#each [1, 2, 3, 4, 5, 6, 7, 8, 9] as score}
										<option value={score}>{score}</option>
									{/each}
								</select>
							</label>
						{/each}
					</div>
				{:else}
					<label class="workduck-form-field" for="queue-evaluation-delegation-prompt">
						<span>{messages.queue.evaluation.delegationPrompt}</span>
						<textarea
							id="queue-evaluation-delegation-prompt"
							class="workduck-input workduck-project-description-input"
							readonly
							value={evaluationDelegationPrompt}
						></textarea>
					</label>
				{/if}

				<div class="workduck-dialog-actions">
					<button
						class="workduck-button workduck-button-secondary"
						type="button"
						disabled={isSavingEvaluation}
						onclick={closeEvaluationDialog}
					>
						{messages.common.cancel}
					</button>
					{#if evaluationMode === 'ai-delegated'}
						<button
							class="workduck-button workduck-button-secondary"
							type="button"
							onclick={() => void copyEvaluationDelegationPrompt()}
						>
							{messages.queue.evaluation.copyPrompt}
						</button>
					{:else}
						<button class="workduck-button workduck-button-primary" type="submit" disabled={isSavingEvaluation}>
							{isSavingEvaluation ? messages.queue.evaluation.saving : messages.common.save}
						</button>
					{/if}
				</div>
			</form>
		</div>
	</div>
{/if}

{#if isNewWorkOrderDialogOpen}
	<div class="workduck-dialog-backdrop" role="presentation" onclick={(event) => {
		if (event.target === event.currentTarget) {
			closeNewWorkOrderDialog();
		}
	}}>
		<div
			class="workduck-dialog workduck-project-dialog workduck-work-order-dialog"
			role="dialog"
			aria-modal="true"
			aria-labelledby="new-work-order-dialog-title"
		>
			<form class="workduck-project-dialog-form" onsubmit={handleCreateManualWorkOrder}>
				<h2 id="new-work-order-dialog-title" class="workduck-dialog-title">
					{workOrderDialogTitle}
				</h2>

				<div class="workduck-work-order-dialog-grid">
					<div class="workduck-work-order-dialog-column">
						<label class="workduck-form-field" for="new-work-order-title">
							<span>{messages.queue.workTitle}</span>
							<input
								id="new-work-order-title"
								class="workduck-input"
								type="text"
								bind:value={manualWorkOrderTitle}
								autocomplete="off"
								disabled={isWriting}
							/>
						</label>

						<label class="workduck-form-field" for="new-work-order-kind">
							<span>{messages.queue.workType}</span>
							<select
								id="new-work-order-kind"
								class="workduck-select"
								bind:value={manualWorkOrderKind}
								disabled={isWriting}
							>
								<option value="instruction">{messages.queue.workTypes.instruction}</option>
								<option value="vote">{messages.queue.workTypes.vote}</option>
							</select>
						</label>

						<label class="workduck-form-field" for="new-work-order-priority">
							<span>{messages.queue.workPriority}</span>
							<select
								id="new-work-order-priority"
								class="workduck-select"
								bind:value={manualWorkOrderPriority}
								disabled={isWriting}
							>
								{#each queueWorkPriorities as priority}
									<option value={priority}>{getQueuePriorityLabel(priority)}</option>
								{/each}
							</select>
						</label>

						<label class="workduck-form-field" for="new-work-order-body">
							<span>{manualWorkOrderKind === 'vote' ? messages.queue.vote.question : messages.queue.workBody}</span>
							<textarea
								id="new-work-order-body"
								class="workduck-input workduck-project-description-input"
								bind:value={manualWorkOrderBody}
								disabled={isWriting}
							></textarea>
						</label>

						{#if manualWorkOrderKind === 'vote'}
							<label class="workduck-form-field" for="new-work-order-vote-criteria">
								<span>{messages.queue.vote.criteria}</span>
								<textarea
									id="new-work-order-vote-criteria"
									class="workduck-input workduck-project-description-input"
									bind:value={manualVoteCriteriaInput}
									disabled={isWriting}
								></textarea>
							</label>
						{/if}
					</div>

					<div class="workduck-work-order-dialog-column">
						<div class="workduck-form-field">
							<span>{messages.common.skill}</span>
							<details class="workduck-multi-select">
								<summary class="workduck-multi-select-summary">
									<span>{manualWorkOrderSkillSummary}</span>
								</summary>
								<div class="workduck-multi-select-options">
									{#if allSkills.length === 0}
										<span class="workduck-multi-select-empty">{messages.queue.noSkill}</span>
									{:else}
										{#each allSkills as skill (skill.id)}
											<label class="workduck-multi-select-option">
												<input
													type="checkbox"
													checked={selectedManualSkillIds.includes(skill.id)}
													disabled={isWriting}
													onchange={(event) =>
														toggleManualWorkOrderSkill(skill.id, event.currentTarget.checked)}
												/>
												<span>{getSkillDisplayName(skill)}</span>
											</label>
										{/each}
									{/if}
								</div>
							</details>
						</div>

						<div class="workduck-form-field">
							<span>{messages.queue.workAgents}</span>
							<details class="workduck-multi-select">
								<summary class="workduck-multi-select-summary">
									<span>{manualWorkOrderAgentSummary}</span>
								</summary>
								<div class="workduck-multi-select-options">
									{#if allAgents.length === 0}
										<span class="workduck-multi-select-empty">{messages.queue.noAgent}</span>
									{:else}
										{#each allAgents as agent (agent.id)}
											<label class="workduck-multi-select-option">
												<input
													type="checkbox"
													checked={selectedManualAgentIds.includes(agent.id)}
													disabled={isWriting}
													onchange={(event) =>
														toggleManualWorkOrderAgent(agent.id, event.currentTarget.checked)}
												/>
												<span>{getAgentDisplayName(agent)}</span>
											</label>
										{/each}
									{/if}
								</div>
							</details>
						</div>

						<div class="workduck-form-field">
							<span>{messages.queue.workReferences}</span>
							<details class="workduck-multi-select">
								<summary class="workduck-multi-select-summary">
									<span>{manualWorkOrderReferenceSummary}</span>
								</summary>
								<div class="workduck-multi-select-options">
									{#if allReferences.length === 0}
										<span class="workduck-multi-select-empty">{messages.queue.noReference}</span>
									{:else}
										{#each allReferences as reference (reference.id)}
											<label class="workduck-multi-select-option">
												<input
													type="checkbox"
													checked={selectedManualReferenceIds.includes(reference.id)}
													disabled={isWriting}
													onchange={(event) =>
														toggleManualWorkOrderReference(reference.id, event.currentTarget.checked)}
												/>
												<span>{getReferenceDisplayName(reference)}</span>
											</label>
										{/each}
									{/if}
								</div>
							</details>
						</div>

						{#if manualWorkOrderKind === 'vote'}
							<label class="workduck-form-field" for="new-work-order-vote-option-count">
								<span>{messages.queue.vote.optionCountInput}</span>
								<select
									id="new-work-order-vote-option-count"
									class="workduck-select"
									value={manualVoteOptionCount}
									disabled={isWriting}
									onchange={(event) => setManualVoteOptionCount(event.currentTarget.value)}
								>
									{#each manualVoteOptionCountChoices as count}
										<option value={count}>{count}</option>
									{/each}
								</select>
							</label>

							<div class="workduck-form-field">
								<span>{messages.queue.vote.options}</span>
								<div class="workduck-vote-option-list">
									{#each manualVoteOptions as option, index (option.rowId)}
										<div class="workduck-vote-option-row">
											<span class="workduck-vote-option-index">{index + 1}</span>
											<input
												class="workduck-input"
												type="text"
												value={option.label}
												aria-label={`${messages.queue.vote.optionName} ${index + 1}`}
												placeholder={messages.queue.vote.optionName}
												autocomplete="off"
												disabled={isWriting}
												oninput={(event) =>
													updateManualVoteOption(index, 'label', event.currentTarget.value)}
											/>
											<input
												class="workduck-input"
												type="text"
												value={option.description}
												aria-label={`${messages.queue.vote.optionDescription} ${index + 1}`}
												placeholder={messages.queue.vote.optionDescription}
												autocomplete="off"
												disabled={isWriting}
												oninput={(event) =>
													updateManualVoteOption(index, 'description', event.currentTarget.value)}
											/>
										</div>
									{/each}
								</div>
							</div>
						{/if}
					</div>
				</div>

				<div class="workduck-dialog-actions">
					<button class="workduck-button workduck-button-secondary" type="button" onclick={closeNewWorkOrderDialog}>
						{messages.common.cancel}
					</button>
					<button class="workduck-button workduck-button-primary" type="submit" disabled={!canCreateManualWorkOrder}>
						{isWriting ? messages.queue.creating : workOrderDialogSubmitLabel}
					</button>
				</div>
			</form>
		</div>
	</div>
{/if}
