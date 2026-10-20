/* llmnav/1 module
id=workduck.skills.schema
role=Define skill record contracts, stable built-in identities, output kinds, and validation limits.
owns=skill record schema|skill registry versions|skill validation limits|built-in skill identities
excludes=default prompt content|registry mutations|skill persistence
search=skill record schema|skill validation limits|skill output types
invariant=Skill records and validation share one contract independent of catalog content and storage.
stability=contract
*/
export const SKILL_REGISTRY_VERSION = 3;
export const SKILL_NAME_MAX_LENGTH = 120;
export const SKILL_DESCRIPTION_MAX_LENGTH = 420;
export const SKILL_INSTRUCTIONS_MAX_LENGTH = 8_000;
export const SKILL_OUTPUT_TYPES_MAX_COUNT = 6;
export const SKILL_OPTION_GROUPS_MAX_COUNT = 8;
export const SKILL_OPTIONS_PER_GROUP_MAX_COUNT = 30;
export const SKILL_OPTION_LABEL_MAX_LENGTH = 80;
export const SKILL_OPTION_DESCRIPTION_MAX_LENGTH = 220;
export const WORKDUCK_PROPOSAL_WRITER_SKILL_ID = 'workduck.skill.proposal-writer';
export const WORKDUCK_WRITING_ASSISTANT_SKILL_ID = 'workduck.skill.writing-assistant';
export const WORKDUCK_REVISION_ASSISTANT_SKILL_ID = 'workduck.skill.revision-assistant';
export const WORKDUCK_AGENT_RESPONSE_EVALUATOR_SKILL_ID =
	'workduck.skill.agent-response-evaluator';
export const WORKDUCK_CODE_REVIEWER_SKILL_ID = 'workduck.skill.code-reviewer';
export const WORKDUCK_COMMIT_HANDOFF_WRITER_SKILL_ID =
	'workduck.skill.commit-handoff-writer';
export const WORKDUCK_TECH_DEBT_JANITOR_SKILL_ID = 'workduck.skill.tech-debt-janitor';
export const WORKDUCK_RELEASE_NOTE_WRITER_SKILL_ID = 'workduck.skill.release-note-writer';
export const WORKDUCK_API_SCHEMA_ARCHITECT_SKILL_ID =
	'workduck.skill.api-schema-architect';

export const workduckSkillOutputTypeOptions = [
	{ id: 'writing', label: 'Writing' },
	{ id: 'revision', label: 'Revision' },
	{ id: 'work-order', label: 'Work order' },
	{ id: 'proposal', label: 'Proposal' },
	{ id: 'result-report', label: 'Result report' },
	{ id: 'agent-evaluation', label: 'Agent evaluation' }
] as const;

export type WorkduckSkillOutputType = (typeof workduckSkillOutputTypeOptions)[number]['id'];

export type SkillRegistryError =
	| 'skill-name-required'
	| 'skill-name-duplicate'
	| 'skill-output-type-required'
	| 'skill-instructions-required'
	| 'skill-not-found'
	| 'skill-registry-invalid';

export interface WorkduckSkillRecord {
	readonly id: string;
	readonly name: string;
	readonly description: string;
	readonly outputTypes: readonly WorkduckSkillOutputType[];
	readonly instructions: string;
	readonly optionGroups: readonly WorkduckSkillOptionGroup[];
	readonly createdAt: string;
	readonly updatedAt: string;
}

export type WorkduckSkillOptionSelectionMode = 'single' | 'multiple';

export interface WorkduckSkillOptionGroup {
	readonly id: string;
	readonly label: string;
	readonly description: string;
	readonly selectionMode: WorkduckSkillOptionSelectionMode;
	readonly options: readonly WorkduckSkillOption[];
}

export interface WorkduckSkillOption {
	readonly id: string;
	readonly label: string;
	readonly description: string;
}

export interface SkillRegistry {
	readonly version: typeof SKILL_REGISTRY_VERSION;
	readonly revision: number;
	readonly workspaceId: string;
	readonly skills: readonly WorkduckSkillRecord[];
	readonly updatedAt: string;
}

export interface SkillInput {
	readonly id?: string | null;
	readonly name: string;
	readonly description: string;
	readonly outputTypes: readonly WorkduckSkillOutputType[];
	readonly instructions: string;
	readonly optionGroups?: readonly WorkduckSkillOptionGroup[];
}

export type SkillRegistryMutationResult =
	| {
			readonly ok: true;
			readonly registry: SkillRegistry;
	  }
	| {
			readonly ok: false;
			readonly registry: SkillRegistry;
			readonly error: SkillRegistryError;
	  };
