import {
	createQueueWorkOrderFileName,
	createQueueWorkOrderForReportEvaluation,
	serializeQueueArtifact,
	type WorkduckQueueResultReport,
	type WorkduckQueueWorkOrder
} from './queue-artifacts';
import { writeQueueWorkOrderFile, type QueueFolderError } from './queue-folder';

export type QueuePanelReportEvaluationDelegationResult =
	| {
			readonly ok: true;
			readonly workOrder: WorkduckQueueWorkOrder;
			readonly relativePath: string;
	  }
	| {
			readonly ok: false;
			readonly error: QueueFolderError;
	  };

export interface QueuePanelReportEvaluationDelegationInput {
	readonly workspacePath: string;
	readonly reportPath: string | null;
	readonly report: WorkduckQueueResultReport;
	readonly evaluatorSkillId: string;
}

export async function delegateQueuePanelReportEvaluation(
	input: QueuePanelReportEvaluationDelegationInput
): Promise<QueuePanelReportEvaluationDelegationResult> {
	const workOrder = createQueueWorkOrderForReportEvaluation(input.report, {
		workspacePath: input.workspacePath,
		reportPath: input.reportPath,
		evaluatorSkillId: input.evaluatorSkillId
	});
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
