import type { WorkduckQueueWorkPriority } from './queue-artifacts';
import type {
	QueueCardEntry,
	QueueExecutionFilter,
	QueueKindFilter,
	QueuePriorityFilter,
	QueueReadFilter,
	QueueSortOption
} from './queue-panel-types';

export type QueuePanelFileFilters = {
	readonly executionFilter: QueueExecutionFilter;
	readonly readFilter: QueueReadFilter;
	readonly kindFilter: QueueKindFilter;
	readonly priorityFilter: QueuePriorityFilter;
	readonly sortOption: QueueSortOption;
};

export type QueuePanelSelectionPaths = {
	readonly reportPath: string | null;
	readonly workOrderPath: string | null;
	readonly proposalPath: string | null;
};

const queuePrioritySortRank = {
	urgent: 4,
	high: 3,
	normal: 2,
	low: 1
} as const satisfies Record<WorkduckQueueWorkPriority, number>;

export function createFilteredQueueFiles(
	files: readonly QueueCardEntry[],
	filters: QueuePanelFileFilters
) {
	return files
		.filter((file) => shouldShowQueueFile(file, filters))
		.sort((left, right) => compareQueueFiles(left, right, filters.sortOption));
}

export function shouldBulkDeleteQueueFile(file: QueueCardEntry, includePending: boolean) {
	if (file.kind === 'unsupported') {
		return false;
	}

	return (
		file.executionState === 'completed' ||
		(includePending && file.executionState !== null)
	);
}

export function createQueueCardClass(
	file: QueueCardEntry,
	selectionPaths: QueuePanelSelectionPaths
) {
	return [
		'workduck-queue-file',
		file.kind === 'unsupported' ? 'workduck-queue-file-disabled' : 'workduck-queue-file-button',
		isQueueFileSelected(file, selectionPaths) ? 'workduck-queue-file-selected' : '',
		file.executionState === 'pending' ? 'workduck-queue-file-pending' : '',
		file.executionState === 'running' ? 'workduck-queue-file-running' : '',
		file.executionState === 'failed' ? 'workduck-queue-file-failed' : '',
		file.executionState === 'completed' ? 'workduck-queue-file-completed' : ''
	]
		.filter(Boolean)
		.join(' ');
}

export function isQueueFileSelected(
	file: QueueCardEntry,
	selectionPaths: QueuePanelSelectionPaths
) {
	return (
		file.relativePath === selectionPaths.reportPath ||
		file.relativePath === selectionPaths.workOrderPath ||
		file.relativePath === selectionPaths.proposalPath
	);
}

function shouldShowQueueFile(file: QueueCardEntry, filters: QueuePanelFileFilters) {
	return (
		matchesExecutionFilter(file, filters.executionFilter) &&
		matchesReadFilter(file, filters.readFilter) &&
		matchesKindFilter(file, filters.kindFilter) &&
		matchesPriorityFilter(file, filters.priorityFilter)
	);
}

function matchesExecutionFilter(file: QueueCardEntry, filter: QueueExecutionFilter) {
	return (
		filter === 'all' ||
		(filter === 'pending' && file.executionState === 'pending') ||
		(filter === 'running' && file.executionState === 'running') ||
		(filter === 'failed' && file.executionState === 'failed') ||
		(filter === 'completed' && file.executionState === 'completed')
	);
}

function matchesReadFilter(file: QueueCardEntry, filter: QueueReadFilter) {
	return (
		filter === 'all' ||
		(filter === 'unread' && !file.isRead) ||
		(filter === 'read' && file.isRead)
	);
}

function matchesKindFilter(file: QueueCardEntry, filter: QueueKindFilter) {
	return filter === 'all' || file.kind === filter;
}

function matchesPriorityFilter(file: QueueCardEntry, filter: QueuePriorityFilter) {
	return filter === 'all' || file.priority === filter;
}

function compareQueueFiles(left: QueueCardEntry, right: QueueCardEntry, sortOption: QueueSortOption) {
	switch (sortOption) {
		case 'created-asc':
			return compareQueueCreatedAt(left, right, 'asc') || compareQueueTitle(left, right);
		case 'created-desc':
			return compareQueueCreatedAt(left, right, 'desc') || compareQueueTitle(left, right);
		case 'priority-asc':
			return (
				compareQueuePriority(left, right, 'asc') ||
				compareQueueCreatedAt(left, right, 'desc') ||
				compareQueueTitle(left, right)
			);
		case 'priority-desc':
			return (
				compareQueuePriority(left, right, 'desc') ||
				compareQueueCreatedAt(left, right, 'desc') ||
				compareQueueTitle(left, right)
			);
	}
}

function compareQueueCreatedAt(
	left: QueueCardEntry,
	right: QueueCardEntry,
	direction: 'asc' | 'desc'
) {
	const leftTimestamp = getQueueCreatedAtTime(left);
	const rightTimestamp = getQueueCreatedAtTime(right);

	if (leftTimestamp === 0 && rightTimestamp === 0) {
		return 0;
	}

	if (leftTimestamp === 0) {
		return 1;
	}

	if (rightTimestamp === 0) {
		return -1;
	}

	return direction === 'asc'
		? leftTimestamp - rightTimestamp
		: rightTimestamp - leftTimestamp;
}

function compareQueuePriority(
	left: QueueCardEntry,
	right: QueueCardEntry,
	direction: 'asc' | 'desc'
) {
	const leftRank = getQueuePrioritySortRank(left);
	const rightRank = getQueuePrioritySortRank(right);

	if (leftRank === 0 && rightRank === 0) {
		return 0;
	}

	if (leftRank === 0) {
		return 1;
	}

	if (rightRank === 0) {
		return -1;
	}

	return direction === 'asc' ? leftRank - rightRank : rightRank - leftRank;
}

function compareQueueTitle(left: QueueCardEntry, right: QueueCardEntry) {
	return left.title.localeCompare(right.title);
}

function getQueueCreatedAtTime(file: QueueCardEntry) {
	const timestamp = Date.parse(file.createdAt);

	return Number.isFinite(timestamp) ? timestamp : 0;
}

function getQueuePrioritySortRank(file: QueueCardEntry) {
	return file.priority === null ? 0 : queuePrioritySortRank[file.priority];
}
