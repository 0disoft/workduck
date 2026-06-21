import { createQueueCardEntries } from '../queue-card-entry';
import { listQueueFiles, type QueueFolderError } from '../queue-folder';
import { createQueueFilesSignature } from '../queue-panel-helpers';
import type { QueueCardEntry } from '../queue-panel-types';
import { pruneQueueReadFilePaths } from '../queue-read-state';
import {
	recoverStaleRunningWorkOrders,
	type StaleRunningWorkOrderRecovery
} from './stale-running-recovery';

export type QueueRefreshResult =
	| {
			readonly ok: true;
			readonly files: readonly QueueCardEntry[];
			readonly readFilePaths: readonly string[];
			readonly readFilePathsChanged: boolean;
			readonly queueFilesChanged: boolean;
			readonly recoveredStaleRunningWorkOrders: readonly StaleRunningWorkOrderRecovery[];
	  }
	| {
			readonly ok: false;
			readonly error: QueueFolderError;
	  };

export async function loadQueueFilesForWorkspace(input: {
	readonly workspacePath: string;
	readonly currentFiles: readonly QueueCardEntry[];
	readonly currentReadFilePaths: readonly string[];
	readonly recoverStaleRunning: boolean;
}): Promise<QueueRefreshResult> {
	const result = await listQueueFiles(input.workspacePath);

	if (!result.ok) {
		return result;
	}

	const nextReadFilePaths = pruneQueueReadFilePaths(input.currentReadFilePaths, result.files);
	let nextFiles = await createQueueCardEntries(
		input.workspacePath,
		nextReadFilePaths,
		result.files
	);
	const staleRecoveries = input.recoverStaleRunning
		? await recoverStaleRunningWorkOrders({
				workspacePath: input.workspacePath,
				queueFiles: nextFiles
			})
		: [];

	if (staleRecoveries.length > 0) {
		nextFiles = await createQueueCardEntries(
			input.workspacePath,
			nextReadFilePaths,
			result.files
		);
	}

	return {
		ok: true,
		files: nextFiles,
		readFilePaths: nextReadFilePaths,
		readFilePathsChanged: nextReadFilePaths.length !== input.currentReadFilePaths.length,
		queueFilesChanged: createQueueFilesSignature(input.currentFiles) !== createQueueFilesSignature(nextFiles),
		recoveredStaleRunningWorkOrders: staleRecoveries
	};
}
