import {
	createManualQueueWorkOrder,
	createQueueWorkOrderFileName,
	serializeQueueArtifact,
	updateQueueWorkOrderTask,
	type WorkduckQueueResponseFormat,
	type WorkduckQueueResponseLanguage,
	type WorkduckQueueWorkOrder,
	type WorkduckQueueWorkPriority
} from './queue-artifacts';
import {
	updateQueueWorkOrderFile,
	writeQueueWorkOrderFile,
	type QueueFolderError
} from './queue-folder';
import type {
	WorkduckQueueTaskKind,
	WorkduckQueueVoteSpec
} from './queue-voting';

export interface QueuePanelManualWorkOrderSaveDraft {
	readonly title: string;
	readonly body: string;
	readonly priority: WorkduckQueueWorkPriority;
	readonly skillIds: readonly string[];
	readonly agentIds: readonly string[];
	readonly referenceIds: readonly string[];
	readonly projectIds: readonly string[];
	readonly repositoryIds: readonly string[];
	readonly kindInput: QueuePanelManualWorkOrderKindInput;
}

export type QueuePanelManualWorkOrderSaveResult =
	| {
			readonly ok: true;
			readonly workOrder: WorkduckQueueWorkOrder;
			readonly relativePath: string;
	  }
	| {
			readonly ok: false;
			readonly error: QueueFolderError;
	  };

interface QueuePanelManualWorkOrderKindInput {
	readonly kind?: WorkduckQueueTaskKind;
	readonly vote?: WorkduckQueueVoteSpec | null;
	readonly responseLanguage?: WorkduckQueueResponseLanguage;
	readonly responseFormat?: WorkduckQueueResponseFormat;
}

export interface QueuePanelManualWorkOrderCreateInput {
	readonly workspacePath: string;
	readonly draft: QueuePanelManualWorkOrderSaveDraft;
}

export interface QueuePanelManualWorkOrderUpdateInput {
	readonly workspacePath: string;
	readonly workOrderPath: string;
	readonly workOrder: WorkduckQueueWorkOrder;
	readonly taskId: string;
	readonly draft: QueuePanelManualWorkOrderSaveDraft;
}

export async function createQueuePanelManualWorkOrder(
	input: QueuePanelManualWorkOrderCreateInput
): Promise<QueuePanelManualWorkOrderSaveResult> {
	const workOrder = createManualWorkOrderFromDraft(input.draft);
	const writeResult = await writeQueueWorkOrderFile(
		input.workspacePath,
		createQueueWorkOrderFileName(workOrder),
		serializeQueueArtifact(workOrder)
	);

	if (!writeResult.ok) {
		return {
			ok: false,
			error: writeResult.error
		};
	}

	return {
		ok: true,
		workOrder,
		relativePath: writeResult.relativePath
	};
}

export async function updateQueuePanelManualWorkOrder(
	input: QueuePanelManualWorkOrderUpdateInput
): Promise<QueuePanelManualWorkOrderSaveResult> {
	const workOrder = updateManualWorkOrderFromDraft(
		input.workOrder,
		input.taskId,
		input.draft
	);
	const writeResult = await updateQueueWorkOrderFile(
		input.workspacePath,
		input.workOrderPath,
		serializeQueueArtifact(workOrder)
	);

	if (!writeResult.ok) {
		return {
			ok: false,
			error: writeResult.error
		};
	}

	return {
		ok: true,
		workOrder,
		relativePath: writeResult.relativePath
	};
}

function createManualWorkOrderFromDraft(draft: QueuePanelManualWorkOrderSaveDraft) {
	return createManualQueueWorkOrder(
		draft.title,
		draft.body,
		draft.priority,
		draft.skillIds,
		draft.agentIds,
		draft.referenceIds,
		{
			...draft.kindInput,
			projectIds: draft.projectIds,
			repositoryIds: draft.repositoryIds
		}
	);
}

function updateManualWorkOrderFromDraft(
	workOrder: WorkduckQueueWorkOrder,
	taskId: string,
	draft: QueuePanelManualWorkOrderSaveDraft
) {
	return updateQueueWorkOrderTask(workOrder, taskId, {
		title: draft.title,
		body: draft.body,
		priority: draft.priority,
		projectIds: draft.projectIds,
		repositoryIds: draft.repositoryIds,
		skillIds: draft.skillIds,
		agentIds: draft.agentIds,
		referenceIds: draft.referenceIds,
		...draft.kindInput
	});
}
