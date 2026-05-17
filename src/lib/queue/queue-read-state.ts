import type { QueueFileEntry } from './queue-folder';

export const QUEUE_READ_STATE_CHANGED_EVENT = 'workduck:queue-read-state-changed';
export const QUEUE_FILES_CHANGED_EVENT = 'workduck:queue-files-changed';

const QUEUE_READ_STORAGE_KEY_PREFIX = 'workduck.queueReadFiles.v1';

interface QueueWorkspaceChangedDetail {
	readonly workspaceId: string;
}

export function readQueueReadFilePaths(workspaceId: string) {
	if (typeof window === 'undefined') {
		return [];
	}

	try {
		const storedValue = window.localStorage.getItem(createQueueReadStorageKey(workspaceId));
		const parsedValue: unknown = storedValue === null ? [] : JSON.parse(storedValue);

		return Array.isArray(parsedValue)
			? parsedValue.filter((item): item is string => typeof item === 'string')
			: [];
	} catch {
		return [];
	}
}

export function writeQueueReadFilePaths(workspaceId: string, relativePaths: readonly string[]) {
	if (typeof window === 'undefined') {
		return;
	}

	try {
		window.localStorage.setItem(
			createQueueReadStorageKey(workspaceId),
			JSON.stringify([...new Set(relativePaths)])
		);
		dispatchQueueReadStateChanged(workspaceId);
	} catch {
		return;
	}
}

export function countUnreadQueueFiles(
	files: readonly QueueFileEntry[],
	readFilePaths: readonly string[]
) {
	const readFilePathSet = new Set(readFilePaths);

	return files.filter((file) => file.kind !== 'unsupported' && !readFilePathSet.has(file.relativePath))
		.length;
}

export function dispatchQueueFilesChanged(workspaceId: string) {
	dispatchQueueWorkspaceChanged(QUEUE_FILES_CHANGED_EVENT, workspaceId);
}

export function subscribeQueueReadStateChanged(callback: (workspaceId: string) => void) {
	return subscribeQueueWorkspaceChanged(QUEUE_READ_STATE_CHANGED_EVENT, callback);
}

export function subscribeQueueFilesChanged(callback: (workspaceId: string) => void) {
	return subscribeQueueWorkspaceChanged(QUEUE_FILES_CHANGED_EVENT, callback);
}

function subscribeQueueWorkspaceChanged(
	eventName: string,
	callback: (workspaceId: string) => void
) {
	if (typeof window === 'undefined') {
		return () => {};
	}

	const handleQueueWorkspaceChanged = (event: Event) => {
		const detail = (event as CustomEvent<QueueWorkspaceChangedDetail>).detail;

		if (typeof detail?.workspaceId !== 'string') {
			return;
		}

		callback(detail.workspaceId);
	};

	window.addEventListener(eventName, handleQueueWorkspaceChanged);

	return () => {
		window.removeEventListener(eventName, handleQueueWorkspaceChanged);
	};
}

function createQueueReadStorageKey(workspaceId: string) {
	return `${QUEUE_READ_STORAGE_KEY_PREFIX}:${workspaceId}`;
}

function dispatchQueueReadStateChanged(workspaceId: string) {
	dispatchQueueWorkspaceChanged(QUEUE_READ_STATE_CHANGED_EVENT, workspaceId);
}

function dispatchQueueWorkspaceChanged(eventName: string, workspaceId: string) {
	window.dispatchEvent(
		new CustomEvent<QueueWorkspaceChangedDetail>(eventName, {
			detail: { workspaceId }
		})
	);
}
