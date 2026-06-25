import type { QueueCardEntry } from './queue-panel-types';

export interface QueueCompletedReportNotifications {
	reset: () => void;
	rememberPath: (relativePath: string) => void;
	notifyNewReports: (
		nextFiles: readonly QueueCardEntry[],
		showNotification: (title: string, relativePath: string) => void
	) => void;
}

export function createQueueCompletedReportNotifications(): QueueCompletedReportNotifications {
	let knownCompletedReportPaths = new Set<string>();
	let isPrimed = false;

	return {
		reset: () => {
			knownCompletedReportPaths = new Set();
			isPrimed = false;
		},
		rememberPath: (relativePath) => {
			knownCompletedReportPaths.add(relativePath);
			isPrimed = true;
		},
		notifyNewReports: (nextFiles, showNotification) => {
			const completedReportFiles = nextFiles.filter(isCompletedResultReportFile);
			const nextCompletedReportPaths = new Set(
				completedReportFiles.map((file) => file.relativePath)
			);

			if (!isPrimed) {
				knownCompletedReportPaths = nextCompletedReportPaths;
				isPrimed = true;
				return;
			}

			for (const file of completedReportFiles) {
				if (!knownCompletedReportPaths.has(file.relativePath)) {
					showNotification(file.title, file.relativePath);
				}
			}

			knownCompletedReportPaths = nextCompletedReportPaths;
		}
	};
}

function isCompletedResultReportFile(file: QueueCardEntry) {
	return file.kind === 'result-report' && file.executionState === 'completed';
}
