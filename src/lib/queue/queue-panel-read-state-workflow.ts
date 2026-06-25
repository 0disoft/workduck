import {
	readQueueReadFilePaths,
	writeQueueReadFilePaths
} from './queue-read-state';
import type { QueueCardEntry } from './queue-panel-types';

export interface QueuePanelReadFilePathsInput {
	readonly workspaceId: string;
	readonly readFilePaths: readonly string[];
}

export interface QueuePanelReadFileRemovalInput {
	readonly workspaceId: string;
	readonly currentReadFilePaths: readonly string[];
	readonly relativePaths: readonly string[];
}

export interface QueuePanelFileReadMarkInput {
	readonly workspaceId: string;
	readonly currentFiles: readonly QueueCardEntry[];
	readonly currentReadFilePaths: readonly string[];
	readonly isAlreadyRead: boolean;
	readonly relativePath: string;
}

export interface QueuePanelFileReadMarkResult {
	readonly files: readonly QueueCardEntry[];
	readonly readFilePaths: readonly string[];
}

export function readQueuePanelReadFilePaths(workspaceId: string) {
	return readQueueReadFilePaths(workspaceId);
}

export function saveQueuePanelReadFilePaths(input: QueuePanelReadFilePathsInput) {
	writeQueueReadFilePaths(input.workspaceId, input.readFilePaths);

	return input.readFilePaths;
}

export function removeQueuePanelReadFilePaths(input: QueuePanelReadFileRemovalInput) {
	const relativePathSet = new Set(input.relativePaths);
	const nextReadFilePaths = input.currentReadFilePaths.filter(
		(relativePath) => !relativePathSet.has(relativePath)
	);

	writeQueueReadFilePaths(input.workspaceId, nextReadFilePaths);

	return nextReadFilePaths;
}

export function markQueuePanelFileRead(
	input: QueuePanelFileReadMarkInput
): QueuePanelFileReadMarkResult {
	if (input.isAlreadyRead) {
		return {
			files: markQueuePanelFileReadInEntries(input.currentFiles, input.relativePath),
			readFilePaths: input.currentReadFilePaths
		};
	}

	const nextReadFilePaths = [...input.currentReadFilePaths, input.relativePath];

	writeQueueReadFilePaths(input.workspaceId, nextReadFilePaths);

	return {
		files: markQueuePanelFileReadInEntries(input.currentFiles, input.relativePath),
		readFilePaths: nextReadFilePaths
	};
}

function markQueuePanelFileReadInEntries(
	files: readonly QueueCardEntry[],
	relativePath: string
) {
	if (!files.some((file) => file.relativePath === relativePath && !file.isRead)) {
		return files;
	}

	return files.map((file) =>
		file.relativePath === relativePath ? { ...file, isRead: true } : file
	);
}
