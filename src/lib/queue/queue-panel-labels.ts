import type { AgentRecord } from '$lib/agents/agent-registry';
import type { WorkduckMessages } from '$lib/i18n/workduck-language';
import type { ProjectNodeRecord } from '$lib/projects/project-registry';
import type { ReferenceRecord } from '$lib/references/reference-registry';
import {
	WORKDUCK_AGENT_RESPONSE_EVALUATOR_SKILL_ID,
	WORKDUCK_API_SCHEMA_ARCHITECT_SKILL_ID,
	WORKDUCK_CODE_REVIEWER_SKILL_ID,
	WORKDUCK_COMMIT_HANDOFF_WRITER_SKILL_ID,
	WORKDUCK_PROPOSAL_WRITER_SKILL_ID,
	WORKDUCK_RELEASE_NOTE_WRITER_SKILL_ID,
	WORKDUCK_REVISION_ASSISTANT_SKILL_ID,
	WORKDUCK_TECH_DEBT_JANITOR_SKILL_ID,
	WORKDUCK_WRITING_ASSISTANT_SKILL_ID,
	isDefaultSkillRecord,
	type WorkduckSkillRecord
} from '$lib/skills/skill-registry';
import type {
	WorkduckQueueExecutionState,
	WorkduckQueueResponseFormat,
	WorkduckQueueResponseLanguage,
	WorkduckQueueResultReportTask,
	WorkduckQueueReviewDecision,
	WorkduckQueueWorkOrderTask,
	WorkduckQueueWorkPriority
} from './queue-artifacts';
import { normalizeQueueResponseFormat } from './queue-artifacts';
import type { QueueFileEntry } from './queue-folder';
import type {
	QueueExecutionFilter,
	QueueKindFilter,
	QueuePriorityFilter,
	QueueReadFilter,
	QueueSortOption
} from './queue-panel-types';
import type { WorkduckQueueTaskKind } from './queue-voting';

export function getFileKindLabel(messages: WorkduckMessages, kind: QueueFileEntry['kind']) {
	switch (kind) {
		case 'result-report':
			return messages.queue.fileKinds.resultReport;
		case 'work-order':
			return messages.queue.fileKinds.workOrder;
		case 'proposal':
			return messages.queue.fileKinds.proposal;
		case 'unsupported':
			return messages.queue.fileKinds.unsupported;
	}
}

export function getExecutionFilterLabel(
	messages: WorkduckMessages,
	filter: QueueExecutionFilter
) {
	switch (filter) {
		case 'all':
			return messages.common.all;
		case 'pending':
			return messages.queue.executionStates.pending;
		case 'running':
			return messages.queue.executionStates.running;
		case 'failed':
			return messages.queue.executionStates.failed;
		case 'completed':
			return messages.queue.executionStates.completed;
	}
}

export function getReadFilterLabel(messages: WorkduckMessages, filter: QueueReadFilter) {
	switch (filter) {
		case 'all':
			return messages.common.all;
		case 'unread':
			return messages.queue.readStates.unread;
		case 'read':
			return messages.queue.readStates.read;
	}
}

export function getKindFilterLabel(messages: WorkduckMessages, filter: QueueKindFilter) {
	return filter === 'all' ? messages.queue.allFileKinds : getFileKindLabel(messages, filter);
}

export function getQueuePriorityFilterLabel(
	messages: WorkduckMessages,
	filter: QueuePriorityFilter
) {
	return filter === 'all' ? messages.queue.allPriorities : getQueuePriorityLabel(messages, filter);
}

export function getQueueSortLabel(messages: WorkduckMessages, sortOption: QueueSortOption) {
	return messages.queue.sortOptions[sortOption];
}

export function getQueueExecutionStateLabel(
	messages: WorkduckMessages,
	executionState: WorkduckQueueExecutionState | null
) {
	return executionState === null ? '' : messages.queue.executionStates[executionState];
}

export function getQueuePriorityLabel(
	messages: WorkduckMessages,
	priority: WorkduckQueueWorkPriority
) {
	return messages.queue.priorities[priority];
}

export function getQueueResponseLanguageLabel(
	messages: WorkduckMessages,
	language: WorkduckQueueResponseLanguage
) {
	return messages.queue.responseLanguages[language];
}

export function getQueueResponseFormatLabel(
	messages: WorkduckMessages,
	format: WorkduckQueueResponseFormat
) {
	return messages.queue.responseFormats[format];
}

export function getQueueStructuredResponseLabels(
	messages: WorkduckMessages,
	format: WorkduckQueueResponseFormat | undefined
) {
	return messages.queue.structuredResponseFormats[normalizeQueueResponseFormat(format)];
}

export function getSkillDisplayName(messages: WorkduckMessages, skill: WorkduckSkillRecord) {
	if (!isDefaultSkillRecord(skill)) {
		return skill.name;
	}

	switch (skill.id) {
		case WORKDUCK_PROPOSAL_WRITER_SKILL_ID:
			return messages.skills.seedSkills.proposalWriter.name;
		case WORKDUCK_WRITING_ASSISTANT_SKILL_ID:
			return messages.skills.seedSkills.writingAssistant.name;
		case WORKDUCK_REVISION_ASSISTANT_SKILL_ID:
			return messages.skills.seedSkills.revisionAssistant.name;
		case WORKDUCK_CODE_REVIEWER_SKILL_ID:
			return messages.skills.seedSkills.codeReviewer.name;
		case WORKDUCK_COMMIT_HANDOFF_WRITER_SKILL_ID:
			return messages.skills.seedSkills.commitHandoffWriter.name;
		case WORKDUCK_TECH_DEBT_JANITOR_SKILL_ID:
			return messages.skills.seedSkills.techDebtJanitor.name;
		case WORKDUCK_RELEASE_NOTE_WRITER_SKILL_ID:
			return messages.skills.seedSkills.releaseNoteWriter.name;
		case WORKDUCK_API_SCHEMA_ARCHITECT_SKILL_ID:
			return messages.skills.seedSkills.apiSchemaArchitect.name;
		case WORKDUCK_AGENT_RESPONSE_EVALUATOR_SKILL_ID:
			return messages.skills.seedSkills.agentResponseEvaluator.name;
		default:
			return skill.name;
	}
}

export function getQueueTaskKindLabel(
	messages: WorkduckMessages,
	kind: WorkduckQueueTaskKind | undefined
) {
	switch (kind) {
		case 'direct-message':
			return messages.queue.workTypes.directMessage;
		case 'vote':
			return messages.queue.workTypes.vote;
		default:
			return messages.queue.workTypes.instruction;
	}
}

export function getVoteChoiceLabel(
	messages: WorkduckMessages,
	task: WorkduckQueueResultReportTask
) {
	const vote = task.vote;

	if (vote === undefined || vote.ballot.parseStatus !== 'parsed') {
		return messages.queue.vote.unparsed;
	}

	const option = vote.options.find((candidate) => candidate.id === vote.ballot.choiceId);

	return option === undefined ? vote.ballot.choiceId : option.label;
}

export function getReviewDecisionLabel(
	messages: WorkduckMessages,
	decision: Exclude<WorkduckQueueReviewDecision, 'pending'>
) {
	switch (decision) {
		case 'approved':
			return messages.queue.reviewDecisions.approved;
		case 'needs-work':
			return messages.queue.reviewDecisions.needsWork;
		case 'rollback':
			return messages.queue.reviewDecisions.rollback;
	}
}

export function getRecordLabelById<T extends { readonly id: string }>(
	records: readonly T[],
	recordId: string,
	getLabel: (record: T) => string
) {
	const record = records.find((candidate) => candidate.id === recordId);

	return record === undefined ? recordId : getLabel(record);
}

export function createTaskRecordLabels(
	task: WorkduckQueueWorkOrderTask,
	getSkillLabel: (skillId: string) => string,
	getAgentLabel: (agentId: string) => string,
	getReferenceLabel: (referenceId: string) => string
) {
	return {
		skills: (task.skillIds ?? []).map(getSkillLabel),
		agents: (task.agentIds ?? []).map(getAgentLabel),
		references: (task.referenceIds ?? []).map(getReferenceLabel)
	};
}

export function getReportTaskAgent(
	task: WorkduckQueueResultReportTask,
	agents: readonly AgentRecord[]
) {
	const idMatch = /^task_(.+)_[a-z0-9]+$/i.exec(task.id);
	const candidateAgentId = idMatch?.[1] ?? '';
	const idMatchAgent = agents.find((agent) => agent.id === candidateAgentId);

	if (idMatchAgent !== undefined) {
		return idMatchAgent;
	}

	const titleAgentName = task.title.split(':')[0]?.trim() ?? '';

	if (titleAgentName.length === 0) {
		return null;
	}

	return agents.find((agent) => agent.name === titleAgentName) ?? null;
}

export function getAgentDisplayName(agent: AgentRecord) {
	return agent.name;
}

export function getProjectDisplayName(project: ProjectNodeRecord) {
	return project.name;
}

export function getReferenceDisplayName(reference: ReferenceRecord) {
	return reference.title;
}
