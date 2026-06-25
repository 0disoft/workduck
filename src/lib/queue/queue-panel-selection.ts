import type {
	QueueReportTaskReview,
	WorkduckQueueProposal,
	WorkduckQueueResultReport,
	WorkduckQueueWorkOrder
} from './queue-artifacts';
import type { QueueFileEntry, QueueFolderError } from './queue-folder';
import {
	readQueueProposalSelection,
	readQueueResultReportSelection,
	readQueueWorkOrderSelection
} from './workflows/queue-artifact-selection';

export type QueuePanelArtifactSelection =
	| {
			readonly kind: 'result-report';
			readonly report: WorkduckQueueResultReport;
			readonly relativePath: string;
			readonly reviews: readonly QueueReportTaskReview[];
	  }
	| {
			readonly kind: 'work-order';
			readonly workOrder: WorkduckQueueWorkOrder;
			readonly relativePath: string;
	  }
	| {
			readonly kind: 'proposal';
			readonly proposal: WorkduckQueueProposal;
			readonly relativePath: string;
	  };

export type QueuePanelArtifactSelectionResult =
	| {
			readonly ok: true;
			readonly selection: QueuePanelArtifactSelection;
	  }
	| {
			readonly ok: false;
			readonly error: QueueFolderError;
	  }
	| {
			readonly ok: false;
			readonly parseError: string;
	  };

export async function readQueuePanelArtifactSelection(
	workspacePath: string,
	file: QueueFileEntry
): Promise<QueuePanelArtifactSelectionResult> {
	if (file.kind === 'result-report') {
		const result = await readQueueResultReportSelection(workspacePath, file);

		if (!result.ok) {
			return result;
		}

		return {
			ok: true,
			selection: {
				kind: 'result-report',
				report: result.report,
				relativePath: result.relativePath,
				reviews: result.reviews
			}
		};
	}

	if (file.kind === 'work-order') {
		const result = await readQueueWorkOrderSelection(workspacePath, file);

		if (!result.ok) {
			return result;
		}

		return {
			ok: true,
			selection: {
				kind: 'work-order',
				workOrder: result.workOrder,
				relativePath: result.relativePath
			}
		};
	}

	if (file.kind === 'proposal') {
		const result = await readQueueProposalSelection(workspacePath, file);

		if (!result.ok) {
			return result;
		}

		return {
			ok: true,
			selection: {
				kind: 'proposal',
				proposal: result.proposal,
				relativePath: result.relativePath
			}
		};
	}

	return {
		ok: false,
		parseError: 'Unsupported queue file type.'
	};
}
