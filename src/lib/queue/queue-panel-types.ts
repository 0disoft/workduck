import type { AgentRecord } from '$lib/agents/agent-registry';
import type { PersonaRecord } from '$lib/personas/persona-registry';
import type { ReferenceRecord } from '$lib/references/reference-registry';
import type { WorkduckSkillRecord } from '$lib/skills/skill-registry';
import type { QueueFileEntry } from './queue-folder';
import type {
	WorkduckQueueExecutionState,
	WorkduckQueueResultReportTask,
	WorkduckQueueWorkPriority
} from './queue-artifacts';

export const queueExecutionFilterOptions = [{ id: 'all' }, { id: 'pending' }, { id: 'completed' }] as const;
export const queueReadFilterOptions = [{ id: 'all' }, { id: 'unread' }, { id: 'read' }] as const;
export const queueKindFilterOptions = [
	{ id: 'all' },
	{ id: 'work-order' },
	{ id: 'result-report' },
	{ id: 'proposal' },
	{ id: 'unsupported' }
] as const;
export const queuePriorityFilterOptions = [
	{ id: 'all' },
	{ id: 'urgent' },
	{ id: 'high' },
	{ id: 'normal' },
	{ id: 'low' }
] as const;
export const queueSortOptions = [
	{ id: 'created-desc' },
	{ id: 'created-asc' },
	{ id: 'priority-desc' },
	{ id: 'priority-asc' }
] as const;
export type QueueExecutionFilter = (typeof queueExecutionFilterOptions)[number]['id'];
export type QueueReadFilter = (typeof queueReadFilterOptions)[number]['id'];
export type QueueKindFilter = (typeof queueKindFilterOptions)[number]['id'];
export type QueuePriorityFilter = (typeof queuePriorityFilterOptions)[number]['id'];
export type QueueSortOption = (typeof queueSortOptions)[number]['id'];

export type ManualVoteOptionInput = {
	readonly rowId: string;
	readonly id: string;
	readonly label: string;
	readonly description: string;
};

export const manualRevisionOptionGroups = [
	{ id: 'purpose' },
	{ id: 'tone' },
	{ id: 'structure' },
	{ id: 'format' }
] as const;

export const manualRevisionOptions = [
	{ id: 'clarity', groupId: 'purpose' },
	{ id: 'concise', groupId: 'purpose' },
	{ id: 'persuasive', groupId: 'purpose' },
	{ id: 'natural', groupId: 'purpose' },
	{ id: 'formal', groupId: 'tone' },
	{ id: 'casual', groupId: 'tone' },
	{ id: 'sharp', groupId: 'tone' },
	{ id: 'warm', groupId: 'tone' },
	{ id: 'paragraphFlow', groupId: 'structure' },
	{ id: 'sentenceRhythm', groupId: 'structure' },
	{ id: 'headlineLead', groupId: 'structure' },
	{ id: 'preserveMeaning', groupId: 'structure' },
	{ id: 'oneParagraph', groupId: 'format' },
	{ id: 'bulletSummary', groupId: 'format' },
	{ id: 'markdownReady', groupId: 'format' },
	{ id: 'keepLength', groupId: 'format' }
] as const;

export type ManualRevisionOptionGroupId = (typeof manualRevisionOptionGroups)[number]['id'];
export type ManualRevisionOptionId = (typeof manualRevisionOptions)[number]['id'];

export type QueueCardEntry = QueueFileEntry & {
	readonly isRead: boolean;
	readonly artifactId: string;
	readonly agentName: string;
	readonly createdAt: string;
	readonly title: string;
	readonly priority: WorkduckQueueWorkPriority | null;
	readonly executionState: WorkduckQueueExecutionState | null;
	readonly sourceReportId: string;
	readonly skillIds: readonly string[];
};

export type WorkOrderDialogMode = 'create' | 'edit';

export type QueueExecutionContext = {
	readonly agents: readonly AgentRecord[];
	readonly skills: readonly WorkduckSkillRecord[];
	readonly references: readonly ReferenceRecord[];
	readonly personas: readonly PersonaRecord[];
};

export type QueueContextMenuState = {
	readonly x: number;
	readonly y: number;
	readonly file: QueueCardEntry;
};

export type AgentEvaluationDialogState = {
	readonly task: WorkduckQueueResultReportTask;
	readonly agent: AgentRecord;
};
