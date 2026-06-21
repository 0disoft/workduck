import {
	createDefaultReportReviews,
	parseQueueProposal,
	parseQueueResultReport,
	parseQueueWorkOrder,
	type QueueReportTaskReview,
	type WorkduckQueueProposal,
	type WorkduckQueueResultReport,
	type WorkduckQueueWorkOrder
} from '../queue-artifacts';
import { readQueueFile, type QueueFileEntry, type QueueFolderError } from '../queue-folder';

type QueueArtifactSelectionFailure =
	| {
			readonly ok: false;
			readonly error: QueueFolderError;
	  }
	| {
			readonly ok: false;
			readonly parseError: string;
	  };

export type QueueResultReportSelection =
	| {
			readonly ok: true;
			readonly report: WorkduckQueueResultReport;
			readonly relativePath: string;
			readonly reviews: readonly QueueReportTaskReview[];
	  }
	| QueueArtifactSelectionFailure;

export type QueueWorkOrderSelection =
	| {
			readonly ok: true;
			readonly workOrder: WorkduckQueueWorkOrder;
			readonly relativePath: string;
	  }
	| QueueArtifactSelectionFailure;

export type QueueProposalSelection =
	| {
			readonly ok: true;
			readonly proposal: WorkduckQueueProposal;
			readonly relativePath: string;
	  }
	| QueueArtifactSelectionFailure;

export async function readQueueResultReportSelection(
	workspacePath: string,
	file: QueueFileEntry
): Promise<QueueResultReportSelection> {
	const result = await readQueueFile(workspacePath, file.relativePath);

	if (!result.ok) {
		return result;
	}

	const parsed = parseQueueResultReport(result.content);

	if (!parsed.ok) {
		return { ok: false, parseError: parsed.message };
	}

	return {
		ok: true,
		report: parsed.report,
		relativePath: result.relativePath,
		reviews: createDefaultReportReviews(parsed.report)
	};
}

export async function readQueueWorkOrderSelection(
	workspacePath: string,
	file: QueueFileEntry
): Promise<QueueWorkOrderSelection> {
	const result = await readQueueFile(workspacePath, file.relativePath);

	if (!result.ok) {
		return result;
	}

	const parsed = parseQueueWorkOrder(result.content);

	if (!parsed.ok) {
		return { ok: false, parseError: parsed.message };
	}

	return {
		ok: true,
		workOrder: parsed.workOrder,
		relativePath: result.relativePath
	};
}

export async function readQueueProposalSelection(
	workspacePath: string,
	file: QueueFileEntry
): Promise<QueueProposalSelection> {
	const result = await readQueueFile(workspacePath, file.relativePath);

	if (!result.ok) {
		return result;
	}

	const parsed = parseQueueProposal(result.content);

	if (!parsed.ok) {
		return { ok: false, parseError: parsed.message };
	}

	return {
		ok: true,
		proposal: parsed.proposal,
		relativePath: result.relativePath
	};
}
