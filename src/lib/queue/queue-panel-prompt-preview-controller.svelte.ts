/* llmnav/1 module
id=workduck.queue.prompt-preview-controller
role=Own Queue prompt preview admission, estimates, and selection-scoped async dialog state.
owns=preview eligibility|prompt dialog state|request generation|estimate lifetime
excludes=provider execution|execution context loading|execution confirmation consumption
search=Queue prompt preview lifetime|closed prompt estimate|late prompt preview result
invariant=Only the latest open preview for the captured workspace and selected work order receives an estimate; closing invalidates pending responses.
stability=architecture
*/
import type { WorkduckQueueWorkOrder } from './queue-artifacts';
import type { QueueExecutionError, WorkduckQueueExecutionEstimate, WorkduckQueuePromptPreview } from './queue-execution';
import type { QueueExecutionContext } from './queue-panel-types';
import { previewQueuePanelWorkOrderPrompt } from './queue-panel-prompt-preview-workflow';

interface QueuePromptPreviewWorkspaceTarget {
	readonly workspaceId: string;
	readonly workspacePath: string;
	readonly isCurrent: () => boolean;
}
interface QueuePromptPreviewInput {
	readonly workOrder: () => WorkduckQueueWorkOrder | null;
	readonly isWriting: () => boolean;
	readonly captureWorkspaceTarget: () => QueuePromptPreviewWorkspaceTarget;
	readonly readExecutionContext: (target: QueuePromptPreviewWorkspaceTarget) => Promise<QueueExecutionContext>;
	readonly clearFeedback: () => void;
	readonly setError: (error: QueueExecutionError) => void;
}

export function createQueuePanelPromptPreview(input: QueuePromptPreviewInput) {
	let promptPreviews = $state<readonly WorkduckQueuePromptPreview[] | null>(null);
	let promptEstimate = $state<WorkduckQueueExecutionEstimate | null>(null);
	let isPreviewingPrompt = $state(false);
	let promptPreviewGeneration = 0;
	let canPreviewSelectedWorkOrderPrompt = $derived.by(() => {
		const workOrder = input.workOrder();
		return workOrder !== null &&
			(workOrder.status === 'active' || workOrder.status === 'failed') &&
			workOrder.tasks.length > 0 &&
			workOrder.tasks.every((task) => (task.agentIds ?? []).length > 0) &&
			!input.isWriting() && !isPreviewingPrompt;
	});

	async function handlePreviewWorkOrderPrompt() {
		const selectedWorkOrder = input.workOrder();
		if (
			selectedWorkOrder === null ||
			!canPreviewSelectedWorkOrderPrompt ||
			isPreviewingPrompt
		) {
			return;
	}

		isPreviewingPrompt = true;
		input.clearFeedback();
		const target = input.captureWorkspaceTarget();
		const previewWorkOrder = selectedWorkOrder;
		const previewGeneration = ++promptPreviewGeneration;
		const isCurrent = () =>
			target.isCurrent() &&
			promptPreviewGeneration === previewGeneration &&
			input.workOrder() === previewWorkOrder;

		try {
			const previewResult = await previewQueuePanelWorkOrderPrompt({
				workOrder: previewWorkOrder,
				readExecutionContext: () => input.readExecutionContext(target)
			});
			if (!isCurrent()) return;

			if (!previewResult.ok) {
				input.setError(previewResult.error);
				promptPreviews = null;
				promptEstimate = null;
				return;
			}

			promptPreviews = previewResult.previews;
			promptEstimate = previewResult.estimate;
	} finally {
			if (target.isCurrent() && promptPreviewGeneration === previewGeneration) {
				isPreviewingPrompt = false;
			}
	}
}

	function closePromptPreviewDialog() {
		promptPreviewGeneration += 1;
		isPreviewingPrompt = false;
		promptPreviews = null;
		promptEstimate = null;
	}


	return {
		get promptPreviews() { return promptPreviews; },
		get promptEstimate() { return promptEstimate; },
		get isPreviewingPrompt() { return isPreviewingPrompt; },
		get canPreviewSelectedWorkOrderPrompt() { return canPreviewSelectedWorkOrderPrompt; },
		handlePreviewWorkOrderPrompt,
		closePromptPreviewDialog
	};
}
