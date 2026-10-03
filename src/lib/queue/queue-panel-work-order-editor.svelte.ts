/* llmnav/1 module
id=workduck.queue.work-order-editor
role=Own reactive manual work order drafts, dialog transitions, context selections, and save-ready form values.
owns=manual draft state|skill and vote option selection|form validation|dialog lifecycle
excludes=Queue file persistence|provider execution|workspace registry loading
search=manual work order draft|edit Queue task form|work order skill options
invariant=Each editor owns its draft and keeps form bindings reactive; save values use the existing Queue draft rules.
stability=architecture
*/
import type { WorkduckMessages } from '#lib/i18n/workduck-message-contract.ts';
import type { ReferenceRecord } from '#lib/references/reference-registry.ts';
import type { WorkduckSkillRecord } from '#lib/skills/skill-registry.ts';
import {
	QUEUE_WORK_ORDER_BODY_MAX_LENGTH,
	QUEUE_WORK_ORDER_TITLE_MAX_LENGTH,
	type WorkduckQueueWorkOrderTask,
	type WorkduckQueueWorkPriority,
	type WorkduckQueueResponseLanguage,
	type WorkduckQueueResponseFormat
} from './queue-artifacts';
import {
	createManualWorkOrderKindInput as createManualWorkOrderKindInputFromFields,
	createSelectionSummary,
	sortReferencesForProjectSelection
} from './queue-panel-helpers';
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
import type { QueuePanelManualWorkOrderSaveDraft } from './queue-panel-manual-work-order-save-workflow';
import type { ManualVoteOptionInput, WorkOrderDialogMode } from './queue-panel-types';
import type { WorkduckQueueTaskKind } from './queue-voting';

interface QueuePanelWorkOrderEditorInput {
	readonly messages: () => WorkduckMessages;
	readonly skills: () => readonly WorkduckSkillRecord[];
	readonly references: () => readonly ReferenceRecord[];
	readonly isWriting: () => boolean;
	readonly responseLanguage: () => WorkduckQueueResponseLanguage;
	readonly getSkillLabelById: (id: string) => string;
	readonly getAgentLabelById: (id: string) => string;
	readonly getProjectLabelById: (id: string) => string;
	readonly getRepositoryLabelById: (id: string) => string;
	readonly getReferenceLabelById: (id: string) => string;
	readonly getSkillDisplayName: (skill: WorkduckSkillRecord) => string;
}

export function createQueuePanelWorkOrderEditor(input: QueuePanelWorkOrderEditorInput) {
	const initialManualWorkOrderDraft = createEmptyManualWorkOrderDraft();
	const {
		getSkillLabelById,
		getAgentLabelById,
		getProjectLabelById,
		getRepositoryLabelById,
		getReferenceLabelById,
		getSkillDisplayName
	} = input;
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
	let prioritizedReferences = $derived(
		sortReferencesForProjectSelection(
			input.references(),
			selectedManualProjectIds,
			selectedManualRepositoryIds
		)
	);
	let manualWorkOrderSkillSummary = $derived(
		createSelectionSummary(
			selectedManualSkillIds,
			input.messages().queue.noSkill,
			input.messages().queue.selectionCount,
			getSkillLabelById
		)
	);
	let manualWorkOrderAgentSummary = $derived(
		createSelectionSummary(
			selectedManualAgentIds,
			input.messages().queue.noAgent,
			input.messages().queue.selectionCount,
			getAgentLabelById
		)
	);
	let manualWorkOrderProjectSummary = $derived(
		createSelectionSummary(
			selectedManualProjectIds,
			input.messages().queue.noProject,
			input.messages().queue.selectionCount,
			getProjectLabelById
		)
	);
	let manualWorkOrderRepositorySummary = $derived(
		createSelectionSummary(
			selectedManualRepositoryIds,
			input.messages().queue.noRepository,
			input.messages().queue.selectionCount,
			getRepositoryLabelById
		)
	);
	let manualWorkOrderReferenceSummary = $derived(
		createSelectionSummary(
			selectedManualReferenceIds,
			input.messages().queue.noReference,
			input.messages().queue.selectionCount,
			getReferenceLabelById
		)
	);
	let manualSkillOptionsAreVisible = $derived(
		manualWorkOrderKind === 'instruction' &&
			input.skills().some(
				(skill) => selectedManualSkillIds.includes(skill.id) && skill.optionGroups.length > 0
			)
	);
	let manualValidVoteOptionCount = $derived(
		manualVoteOptions.filter((option) => option.label.trim().length > 0).length
	);
	let canCreateManualWorkOrder = $derived(
			getManualWorkOrderTitle().length > 0 &&
			manualWorkOrderBody.trim().length > 0 &&
			manualWorkOrderTitle.trim().length <= QUEUE_WORK_ORDER_TITLE_MAX_LENGTH &&
			manualWorkOrderBody.trim().length <= QUEUE_WORK_ORDER_BODY_MAX_LENGTH &&
			(manualWorkOrderKind !== 'vote' || manualValidVoteOptionCount >= 2) &&
			!input.isWriting()
	);
	let workOrderDialogTitle = $derived(
		workOrderDialogMode === 'create' ? input.messages().queue.newWork : input.messages().queue.editWork
	);
	let workOrderDialogSubmitLabel = $derived(
		workOrderDialogMode === 'create' ? input.messages().common.add : input.messages().common.save
	);

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

	function resetManualWorkOrderDraft(options: {
		readonly responseLanguage?: WorkduckQueueResponseLanguage;
	} = {}) {
		applyManualWorkOrderDraft(createEmptyManualWorkOrderDraft(options));
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
		resetManualWorkOrderDraft({ responseLanguage: input.responseLanguage() });
	}
	function openEditWorkOrderTaskDialog(task: WorkduckQueueWorkOrderTask) {
		isNewWorkOrderDialogOpen = true;
		workOrderDialogMode = 'edit';
		editingWorkOrderTaskId = task.id;
		applyManualWorkOrderDraft(createManualWorkOrderDraftFromTask(task));
	}
	function closeNewWorkOrderDialog() {
		if (!input.isWriting()) finishManualWorkOrderDialog();
	}
	function clearRecordSelections() {
		selectedManualSkillIds = [];
		selectedManualSkillOptionIds = [];
		selectedManualAgentIds = [];
		selectedManualProjectIds = [];
		selectedManualRepositoryIds = [];
		selectedManualReferenceIds = [];
	}
	function createManualWorkOrderSaveDraft(): QueuePanelManualWorkOrderSaveDraft {
		return {
			title: getManualWorkOrderTitle(),
			body: createManualWorkOrderBody(),
			priority: manualWorkOrderPriority,
			skillIds: selectedManualSkillIds,
			agentIds: selectedManualAgentIds,
			referenceIds: selectedManualReferenceIds,
			projectIds: selectedManualProjectIds,
			repositoryIds: selectedManualRepositoryIds,
			kindInput: createManualWorkOrderKindInput()
		};
	}

	function toggleManualWorkOrderSkill(skillId: string, isSelected: boolean) {
		const nextSelection = updateManualWorkOrderSkillSelection({
			selectedSkillIds: selectedManualSkillIds,
			selectedSkillOptionIds: selectedManualSkillOptionIds,
			skillId,
			isSelected,
			kind: manualWorkOrderKind,
			skills: input.skills(),
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
			directMessageLabel: input.messages().queue.workTypes.directMessage
		});
	}

	function createManualWorkOrderBody() {
		return createManualWorkOrderBodyWithSkillOptions({
			body: manualWorkOrderBody,
			skillOptionsAreVisible: manualSkillOptionsAreVisible,
			selectedSkillOptionIds: selectedManualSkillOptionIds,
			skills: input.skills(),
			skillOptionsTitle: input.messages().queue.skillOptions.title,
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

	return {
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
		get prioritizedReferences() { return prioritizedReferences; },
		get canCreateManualWorkOrder() { return canCreateManualWorkOrder; },
		get workOrderDialogTitle() { return workOrderDialogTitle; },
		get workOrderDialogSubmitLabel() { return workOrderDialogSubmitLabel; },
		get manualSkillOptionsAreVisible() { return manualSkillOptionsAreVisible; },
		get manualWorkOrderSkillSummary() { return manualWorkOrderSkillSummary; },
		get manualWorkOrderAgentSummary() { return manualWorkOrderAgentSummary; },
		get manualWorkOrderProjectSummary() { return manualWorkOrderProjectSummary; },
		get manualWorkOrderRepositorySummary() { return manualWorkOrderRepositorySummary; },
		get manualWorkOrderReferenceSummary() { return manualWorkOrderReferenceSummary; },
		get workOrderDialogMode() { return workOrderDialogMode; },
		get editingWorkOrderTaskId() { return editingWorkOrderTaskId; },
		openNewWorkOrderDialog,
		openEditWorkOrderTaskDialog,
		closeNewWorkOrderDialog,
		finishManualWorkOrderDialog,
		clearRecordSelections,
		createManualWorkOrderSaveDraft,
		toggleManualWorkOrderSkill,
		toggleManualSkillOption,
		toggleManualWorkOrderAgent,
		toggleManualWorkOrderProject,
		toggleManualWorkOrderRepository,
		toggleManualWorkOrderReference,
		addManualVoteOption,
		removeManualVoteOption,
		updateManualVoteOption,
	};
}
