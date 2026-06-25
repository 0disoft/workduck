import type {
	WorkduckQueueExecutionState,
	WorkduckQueueWorkPriority
} from '../queue-artifacts';

export function readQueueWorkPriorityLabel(content: string) {
	try {
		const parsed: unknown = JSON.parse(content);

		if (!isRecord(parsed)) {
			return null;
		}

		const priority = readHighestQueueWorkPriorityFromTasks(parsed.tasks);

		return priority ?? null;
	} catch {
		return null;
	}
}

export interface QueueArtifactSummary {
	readonly artifactId: string;
	readonly agentName: string;
	readonly createdAt: string;
	readonly title: string;
	readonly priority: WorkduckQueueWorkPriority | null;
	readonly executionState: WorkduckQueueExecutionState | null;
	readonly sourceReportId: string;
	readonly skillIds: readonly string[];
}

export function readQueueArtifactSummary(content: string): QueueArtifactSummary | null {
	try {
		const parsed: unknown = JSON.parse(content);

		if (!isRecord(parsed)) {
			return null;
		}

		return {
			artifactId: readQueueArtifactIdFromRecord(parsed),
			agentName: readQueueArtifactAgentNameFromRecord(parsed),
			createdAt: readQueueArtifactCreatedAtFromRecord(parsed),
			title: readQueueArtifactTitleFromRecord(parsed),
			priority: readHighestQueueWorkPriorityFromTasks(parsed.tasks),
			executionState: readQueueArtifactExecutionStateFromRecord(parsed),
			sourceReportId: readQueueArtifactSourceReportIdFromRecord(parsed),
			skillIds: readQueueArtifactSkillIdsFromRecord(parsed)
		};
	} catch {
		return null;
	}
}

export function readQueueArtifactExecutionState(content: string): WorkduckQueueExecutionState | null {
	try {
		const parsed: unknown = JSON.parse(content);

		if (!isRecord(parsed)) {
			return null;
		}

		return readQueueArtifactExecutionStateFromRecord(parsed);
	} catch {
		return null;
	}
}

export function readQueueArtifactAgentName(content: string) {
	try {
		const parsed: unknown = JSON.parse(content);

		if (!isRecord(parsed)) {
			return '';
		}

		return readQueueArtifactAgentNameFromRecord(parsed);
	} catch {
		return '';
	}
}

export function readQueueArtifactCreatedAt(content: string) {
	try {
		const parsed: unknown = JSON.parse(content);

		if (!isRecord(parsed)) {
			return '';
		}

		return readQueueArtifactCreatedAtFromRecord(parsed);
	} catch {
		return '';
	}
}

export function readQueueArtifactTitle(content: string) {
	try {
		const parsed: unknown = JSON.parse(content);

		if (!isRecord(parsed)) {
			return '';
		}

		return readQueueArtifactTitleFromRecord(parsed);
	} catch {
		return '';
	}
}

export function readQueueArtifactId(content: string) {
	try {
		const parsed: unknown = JSON.parse(content);

		if (!isRecord(parsed)) {
			return '';
		}

		return readQueueArtifactIdFromRecord(parsed);
	} catch {
		return '';
	}
}

export function readQueueArtifactSourceReportId(content: string) {
	try {
		const parsed: unknown = JSON.parse(content);

		if (!isRecord(parsed)) {
			return '';
		}

		return readQueueArtifactSourceReportIdFromRecord(parsed);
	} catch {
		return '';
	}
}

export function readQueueArtifactSkillIds(content: string) {
	try {
		const parsed: unknown = JSON.parse(content);

		if (!isRecord(parsed)) {
			return [];
		}

		return readQueueArtifactSkillIdsFromRecord(parsed);
	} catch {
		return [];
	}
}

function readQueueArtifactExecutionStateFromRecord(
	parsed: Record<string, unknown>
): WorkduckQueueExecutionState | null {
	if (parsed.status === 'archived') {
		return 'completed';
	}

	if (parsed.status === 'running') {
		return 'running';
	}

	if (parsed.status === 'failed') {
		return 'failed';
	}

	switch (parsed.schemaVersion) {
		case 'workduck.queue-result-report/v1':
			return 'completed';
		case 'workduck.queue-work-order/v1':
		case 'workduck.queue-proposal/v1':
			return 'pending';
		default:
			return null;
	}
}

function readQueueArtifactAgentNameFromRecord(parsed: Record<string, unknown>) {
	const directAgentName = readOptionalText(parsed.agentName);

	if (directAgentName.length > 0) {
		return directAgentName;
	}

	if (isRecord(parsed.agent)) {
		return readOptionalText(parsed.agent.name);
	}

	return '';
}

function readQueueArtifactCreatedAtFromRecord(parsed: Record<string, unknown>) {
	return readOptionalText(parsed.createdAt);
}

function readQueueArtifactTitleFromRecord(parsed: Record<string, unknown>) {
	return isRecord(parsed.ref) ? readOptionalText(parsed.ref.label) : '';
}

function readQueueArtifactIdFromRecord(parsed: Record<string, unknown>) {
	return isRecord(parsed.ref) ? readOptionalText(parsed.ref.id) : '';
}

function readQueueArtifactSourceReportIdFromRecord(parsed: Record<string, unknown>) {
	return isRecord(parsed.sourceReport) ? readOptionalText(parsed.sourceReport.id) : '';
}

function readQueueArtifactSkillIdsFromRecord(parsed: Record<string, unknown>) {
	if (!Array.isArray(parsed.tasks)) {
		return [];
	}

	return parsed.tasks.flatMap((task) => {
		if (!isRecord(task) || !Array.isArray(task.skillIds)) {
			return [];
		}

		return task.skillIds.filter((skillId): skillId is string => typeof skillId === 'string');
	});
}

function readHighestQueueWorkPriorityFromTasks(value: unknown) {
	if (!Array.isArray(value)) {
		return null;
	}

	const priorities = value
		.map((task) => (isRecord(task) ? normalizeQueueWorkPriority(task.priority) : null))
		.filter((priority) => priority !== null);

	if (priorities.includes('urgent')) {
		return 'urgent';
	}

	if (priorities.includes('high')) {
		return 'high';
	}

	if (priorities.includes('normal')) {
		return 'normal';
	}

	if (priorities.includes('low')) {
		return 'low';
	}

	return null;
}

function normalizeQueueWorkPriority(value: unknown): WorkduckQueueWorkPriority {
	return isQueueWorkPriority(value) ? value : 'normal';
}

function isQueueWorkPriority(value: unknown): value is WorkduckQueueWorkPriority {
	return (
		value === 'low' ||
		value === 'normal' ||
		value === 'high' ||
		value === 'urgent'
	);
}

function readOptionalText(value: unknown) {
	return typeof value === 'string' ? value.trim() : '';
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}
