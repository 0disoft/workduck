import {
	previewQueueWorkOrderPrompt,
	type QueueExecutionError,
	type WorkduckQueuePromptPreview
} from './queue-execution';
import type { WorkduckQueueWorkOrder } from './queue-artifacts';
import type { QueueExecutionContext } from './queue-panel-types';

export type QueuePanelPromptPreviewResult =
	| {
			readonly ok: true;
			readonly previews: readonly WorkduckQueuePromptPreview[];
	  }
	| {
			readonly ok: false;
			readonly error: QueueExecutionError;
	  };

export interface QueuePanelPromptPreviewInput {
	readonly workOrder: WorkduckQueueWorkOrder;
	readonly readExecutionContext: () => Promise<QueueExecutionContext>;
}

export async function previewQueuePanelWorkOrderPrompt(
	input: QueuePanelPromptPreviewInput
): Promise<QueuePanelPromptPreviewResult> {
	const executionContext = await input.readExecutionContext();

	return previewQueueWorkOrderPrompt({
		workOrder: input.workOrder,
		agents: executionContext.agents,
		skills: executionContext.skills,
		references: executionContext.references,
		personas: executionContext.personas
	});
}
