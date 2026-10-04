/* llmnav/1 module
id=workduck.queue.presentation
role=Project live Queue catalog records and language messages into sorted skill options and display labels.
owns=Queue context record indexes|Queue context record labels|localized Queue display labels|skill display ordering
excludes=artifact selection|execution workflows|registry persistence
search=Queue task context names|Queue localized labels|Queue skill option sorting
invariant=Display labels use current catalogs and language; indexes preserve first matches, missing IDs remain visible, and display ordering leaves source records unchanged.
stability=architecture
*/
import type { AgentRecord } from '#lib/agents/agent-registry.ts';
import type { WorkduckMessages } from '#lib/i18n/workduck-language.ts';
import type { ProjectNodeRecord } from '#lib/projects/project-registry.ts';
import type { ProjectRepositorySelectionOption } from '#lib/projects/project-repository-selection.ts';
import type { ReferenceRecord } from '#lib/references/reference-registry.ts';
import type { WorkduckSkillRecord } from '#lib/skills/skill-registry.ts';
import type { WorkduckQueueExecutionState, WorkduckQueueResponseFormat, WorkduckQueueResponseLanguage, WorkduckQueueResultReportTask, WorkduckQueueReviewDecision, WorkduckQueueWorkOrderTask, WorkduckQueueWorkPriority } from './queue-artifacts';
import type { QueueExecutionFilter, QueueKindFilter, QueuePriorityFilter, QueueReadFilter, QueueSortOption } from './queue-panel-types';
import type { WorkduckQueueTaskKind } from './queue-voting';
import {
	getAgentDisplayName as getAgentDisplayNameFromRecord,
	getExecutionFilterLabel as getLocalizedExecutionFilterLabel,
	getKindFilterLabel as getLocalizedKindFilterLabel,
	getQueueExecutionStateLabel as getLocalizedQueueExecutionStateLabel,
	getQueuePriorityFilterLabel as getLocalizedQueuePriorityFilterLabel,
	getQueuePriorityLabel as getLocalizedQueuePriorityLabel,
	getQueueResponseFormatLabel as getLocalizedQueueResponseFormatLabel,
	getQueueResponseLanguageLabel as getLocalizedQueueResponseLanguageLabel,
	getQueueSortLabel as getLocalizedQueueSortLabel,
	getQueueTaskKindLabel as getLocalizedQueueTaskKindLabel,
	getProjectDisplayName as getProjectDisplayNameFromRecord,
	getReadFilterLabel as getLocalizedReadFilterLabel,
	getReferenceDisplayName as getReferenceDisplayNameFromRecord,
	getReviewDecisionLabel as getLocalizedReviewDecisionLabel,
	getSkillDisplayName as getLocalizedSkillDisplayName,
	getVoteChoiceLabel as getLocalizedVoteChoiceLabel
} from './queue-panel-labels';
interface QueuePanelPresentationInput {
	readonly messages: () => WorkduckMessages;
	readonly skills: () => readonly WorkduckSkillRecord[];
	readonly agents: () => readonly AgentRecord[];
	readonly projects: () => readonly ProjectNodeRecord[];
	readonly repositories: () => readonly ProjectRepositorySelectionOption[];
	readonly references: () => readonly ReferenceRecord[];
}

function createFirstRecordIndex<T extends { readonly id: string }>(records: readonly T[]) {
	const indexed = new Map<string, T>();
	for (const record of records) {
		const id = record.id;
		if (!indexed.has(id)) indexed.set(id, record);
	}
	return indexed;
}

function getIndexedRecordLabel<T>(records: ReadonlyMap<string, T>, id: string, getLabel: (record: T) => string) {
	const record = records.get(id);
	return record === undefined ? id : getLabel(record);
}

export function createQueuePanelPresentation(input: QueuePanelPresentationInput) {
	let messages = $derived(input.messages());
	let allSkills = $derived(sortSkillsForDisplay(input.skills()));
	let allAgents = $derived(input.agents());
	let allProjects = $derived(input.projects());
	let allRepositories = $derived(input.repositories());
	let allReferences = $derived(input.references());
	let skillsById = $derived(createFirstRecordIndex(allSkills));
	let agentsById = $derived(createFirstRecordIndex(allAgents));
	let projectsById = $derived(createFirstRecordIndex(allProjects));
	let repositoriesById = $derived(createFirstRecordIndex(allRepositories));
	let referencesById = $derived(createFirstRecordIndex(allReferences));

	function getExecutionFilterLabel(filter: QueueExecutionFilter) {
		return getLocalizedExecutionFilterLabel(messages, filter);
	}

	function getReadFilterLabel(filter: QueueReadFilter) {
		return getLocalizedReadFilterLabel(messages, filter);
	}

	function getKindFilterLabel(filter: QueueKindFilter) {
		return getLocalizedKindFilterLabel(messages, filter);
	}

	function getQueueExecutionStateLabel(executionState: WorkduckQueueExecutionState | null) {
		return getLocalizedQueueExecutionStateLabel(messages, executionState);
	}

	function getQueuePriorityLabel(priority: WorkduckQueueWorkPriority) {
		return getLocalizedQueuePriorityLabel(messages, priority);
	}

	function getQueuePriorityFilterLabel(filter: QueuePriorityFilter) {
		return getLocalizedQueuePriorityFilterLabel(messages, filter);
	}

	function getQueueSortLabel(sortOption: QueueSortOption) {
		return getLocalizedQueueSortLabel(messages, sortOption);
	}

	function getQueueResponseLanguageLabel(language: WorkduckQueueResponseLanguage) {
		return getLocalizedQueueResponseLanguageLabel(messages, language);
	}

	function getQueueResponseFormatLabel(format: WorkduckQueueResponseFormat) {
		return getLocalizedQueueResponseFormatLabel(messages, format);
	}

	function getSkillDisplayName(skill: WorkduckSkillRecord) {
		return getLocalizedSkillDisplayName(messages, skill);
	}

	function sortSkillsForDisplay(skills: readonly WorkduckSkillRecord[]) {
		return [...skills].sort((left, right) =>
			getSkillDisplayName(left).localeCompare(getSkillDisplayName(right), undefined, {
				numeric: true,
				sensitivity: 'base'
			})
		);
	}

	function getAgentDisplayName(agent: AgentRecord) {
		return getAgentDisplayNameFromRecord(agent);
	}

	function getProjectDisplayName(project: ProjectNodeRecord) {
		return getProjectDisplayNameFromRecord(project);
	}

	function getRepositoryDisplayName(repository: ProjectRepositorySelectionOption) {
		return repository.label;
	}

	function getReferenceDisplayName(reference: ReferenceRecord) {
		return getReferenceDisplayNameFromRecord(reference);
	}

	function getSkillLabelById(skillId: string) {
		return getIndexedRecordLabel(skillsById, skillId, getSkillDisplayName);
	}

	function getAgentLabelById(agentId: string) {
		return getIndexedRecordLabel(agentsById, agentId, getAgentDisplayName);
	}

	function getProjectLabelById(projectId: string) {
		return getIndexedRecordLabel(projectsById, projectId, getProjectDisplayName);
	}

	function getRepositoryLabelById(repositoryId: string) {
		return getIndexedRecordLabel(repositoriesById, repositoryId, getRepositoryDisplayName);
	}

	function getReferenceLabelById(referenceId: string) {
		return getIndexedRecordLabel(referencesById, referenceId, getReferenceDisplayName);
	}

	function getQueueTaskSkillLabels(task: WorkduckQueueWorkOrderTask) {
		return (task.skillIds ?? []).map(getSkillLabelById);
	}

	function getQueueTaskAgentLabels(task: WorkduckQueueWorkOrderTask) {
		return (task.agentIds ?? []).map(getAgentLabelById);
	}

	function getQueueTaskProjectLabels(task: WorkduckQueueWorkOrderTask) {
		return (task.projectIds ?? []).map(getProjectLabelById);
	}

	function getQueueTaskRepositoryLabels(task: WorkduckQueueWorkOrderTask) {
		return (task.repositoryIds ?? []).map(getRepositoryLabelById);
	}

	function getQueueTaskReferenceLabels(task: WorkduckQueueWorkOrderTask) {
		return (task.referenceIds ?? []).map(getReferenceLabelById);
	}

	function getQueueTaskKindLabel(kind: WorkduckQueueTaskKind | undefined) {
		return getLocalizedQueueTaskKindLabel(messages, kind);
	}

	function getVoteChoiceLabel(task: WorkduckQueueResultReportTask) {
		return getLocalizedVoteChoiceLabel(messages, task);
	}

	function getReviewDecisionLabel(decision: Exclude<WorkduckQueueReviewDecision, 'pending'>) {
		return getLocalizedReviewDecisionLabel(messages, decision);
	}

	return {
		get allSkills() { return allSkills; },
		getExecutionFilterLabel,
		getReadFilterLabel,
		getKindFilterLabel,
		getQueueExecutionStateLabel,
		getQueuePriorityLabel,
		getQueuePriorityFilterLabel,
		getQueueSortLabel,
		getQueueResponseLanguageLabel,
		getQueueResponseFormatLabel,
		getSkillDisplayName,
		getAgentDisplayName,
		getProjectDisplayName,
		getRepositoryDisplayName,
		getReferenceDisplayName,
		getSkillLabelById,
		getAgentLabelById,
		getProjectLabelById,
		getRepositoryLabelById,
		getReferenceLabelById,
		getQueueTaskSkillLabels,
		getQueueTaskAgentLabels,
		getQueueTaskProjectLabels,
		getQueueTaskRepositoryLabels,
		getQueueTaskReferenceLabels,
		getQueueTaskKindLabel,
		getVoteChoiceLabel,
		getReviewDecisionLabel,
	};
}
