import { AGENT_EVALUATION_DELEGATION_INSTRUCTIONS } from '$lib/agents/agent-evaluation';

export const SKILL_REGISTRY_VERSION = 1;
export const SKILL_NAME_MAX_LENGTH = 120;
export const SKILL_DESCRIPTION_MAX_LENGTH = 420;
export const SKILL_INSTRUCTIONS_MAX_LENGTH = 8_000;
export const SKILL_OUTPUT_TYPES_MAX_COUNT = 5;
export const WORKDUCK_AGENT_RESPONSE_EVALUATOR_SKILL_ID =
	'workduck.skill.agent-response-evaluator';

export const workduckSkillOutputTypeOptions = [
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
	| 'skill-built-in-readonly'
	| 'skill-registry-invalid';

export interface WorkduckSkillRecord {
	readonly id: string;
	readonly name: string;
	readonly description: string;
	readonly outputTypes: readonly WorkduckSkillOutputType[];
	readonly instructions: string;
	readonly builtIn: boolean;
	readonly createdAt: string;
	readonly updatedAt: string;
}

export interface SkillRegistry {
	readonly version: typeof SKILL_REGISTRY_VERSION;
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

const BUILT_IN_SKILLS = [
	{
		id: 'workduck.skill.proposal-writer',
		name: 'Proposal writer',
		description: 'Compare options and produce a proposal with recommendation and follow-up work.',
		outputTypes: ['proposal'],
		instructions:
			'Return a workduck.queue-proposal/v1 artifact. Compare viable options, state tradeoffs, choose one recommendation, and include only concrete follow-up work orders when action is needed.'
	},
	{
		id: WORKDUCK_AGENT_RESPONSE_EVALUATOR_SKILL_ID,
		name: 'Agent response evaluator',
		description: 'Rate an agent response with the five-criterion 1-9 rubric.',
		outputTypes: ['agent-evaluation'],
		instructions: AGENT_EVALUATION_DELEGATION_INSTRUCTIONS
	}
] as const satisfies readonly Omit<WorkduckSkillRecord, 'builtIn' | 'createdAt' | 'updatedAt'>[];

const BUILT_IN_TIMESTAMP = '2026-05-16T00:00:00.000Z';

export function createEmptySkillRegistry(workspaceId: string, now = new Date()): SkillRegistry {
	return {
		version: SKILL_REGISTRY_VERSION,
		workspaceId,
		skills: [],
		updatedAt: now.toISOString()
	};
}

export function getBuiltInSkills(): readonly WorkduckSkillRecord[] {
	return BUILT_IN_SKILLS.map((skill) => ({
		...skill,
		builtIn: true,
		createdAt: BUILT_IN_TIMESTAMP,
		updatedAt: BUILT_IN_TIMESTAMP
	}));
}

export function getAllSkills(registry: SkillRegistry): readonly WorkduckSkillRecord[] {
	return sortSkills([...getBuiltInSkills(), ...normalizeSkillRegistry(registry, registry.workspaceId).skills]);
}

export function parseSkillRegistry(serializedRegistry: string, workspaceId: string) {
	try {
		return normalizeSkillRegistry(JSON.parse(serializedRegistry), workspaceId);
	} catch {
		return null;
	}
}

export function serializeSkillRegistry(registry: SkillRegistry) {
	return JSON.stringify(normalizeSkillRegistry(registry, registry.workspaceId) ?? registry);
}

export function upsertSkill(
	registry: SkillRegistry,
	input: SkillInput,
	now = new Date()
): SkillRegistryMutationResult {
	const normalizedRegistry = normalizeSkillRegistry(registry, registry.workspaceId) ?? registry;
	const skillId = normalizeRecordId(input.id ?? null);
	const name = normalizeSkillName(input.name);
	const description = normalizeSkillDescription(input.description);
	const outputTypes = normalizeSkillOutputTypes(input.outputTypes);
	const instructions = normalizeSkillInstructions(input.instructions);

	if (skillId !== null && isBuiltInSkillId(skillId)) {
		return { ok: false, registry: normalizedRegistry, error: 'skill-built-in-readonly' };
	}

	if (name.length === 0) {
		return { ok: false, registry: normalizedRegistry, error: 'skill-name-required' };
	}

	if (outputTypes.length === 0) {
		return { ok: false, registry: normalizedRegistry, error: 'skill-output-type-required' };
	}

	if (instructions.length === 0) {
		return { ok: false, registry: normalizedRegistry, error: 'skill-instructions-required' };
	}

	const matchingSkill = normalizedRegistry.skills.find((skill) => skill.id === skillId);
	const nameKey = createSkillNameKey(name);
	const nameAlreadyExists = [...getBuiltInSkills(), ...normalizedRegistry.skills].some(
		(skill) => skill.id !== skillId && createSkillNameKey(skill.name) === nameKey
	);

	if (nameAlreadyExists) {
		return { ok: false, registry: normalizedRegistry, error: 'skill-name-duplicate' };
	}

	if (skillId !== null && matchingSkill === undefined) {
		return { ok: false, registry: normalizedRegistry, error: 'skill-not-found' };
	}

	const timestamp = now.toISOString();
	const nextSkill = {
		id: skillId ?? createSkillId(),
		name,
		description,
		outputTypes,
		instructions,
		builtIn: false,
		createdAt: matchingSkill?.createdAt ?? timestamp,
		updatedAt: timestamp
	} satisfies WorkduckSkillRecord;
	const skills =
		matchingSkill === undefined
			? [...normalizedRegistry.skills, nextSkill]
			: normalizedRegistry.skills.map((skill) =>
					skill.id === nextSkill.id ? nextSkill : skill
				);

	return {
		ok: true,
		registry: {
			...normalizedRegistry,
			skills: sortSkills(skills),
			updatedAt: timestamp
		}
	};
}

export function removeSkill(
	registry: SkillRegistry,
	skillId: string,
	now = new Date()
): SkillRegistryMutationResult {
	const normalizedRegistry = normalizeSkillRegistry(registry, registry.workspaceId) ?? registry;

	if (isBuiltInSkillId(skillId)) {
		return { ok: false, registry: normalizedRegistry, error: 'skill-built-in-readonly' };
	}

	if (!normalizedRegistry.skills.some((skill) => skill.id === skillId)) {
		return { ok: false, registry: normalizedRegistry, error: 'skill-not-found' };
	}

	return {
		ok: true,
		registry: {
			...normalizedRegistry,
			skills: normalizedRegistry.skills.filter((skill) => skill.id !== skillId),
			updatedAt: now.toISOString()
		}
	};
}

export function normalizeSkillIds(value: unknown): string[] {
	if (!Array.isArray(value)) {
		return [];
	}

	const skillIds: string[] = [];

	for (const item of value) {
		const skillId = normalizeRecordId(item);

		if (skillId === null || skillIds.includes(skillId)) {
			continue;
		}

		skillIds.push(skillId);
	}

	return skillIds;
}

function normalizeSkillRegistry(value: unknown, workspaceId: string): SkillRegistry {
	if (!isObjectRecord(value) || value.version !== SKILL_REGISTRY_VERSION) {
		return createEmptySkillRegistry(workspaceId);
	}

	if (typeof value.workspaceId !== 'string' || value.workspaceId !== workspaceId) {
		return createEmptySkillRegistry(workspaceId);
	}

	const rawSkills = Array.isArray(value.skills) ? value.skills : [];
	const seenSkillIds = new Set<string>();
	const seenSkillNames = new Set<string>();
	const skills: WorkduckSkillRecord[] = [];

	for (const rawSkill of rawSkills) {
		const skill = parseSkillRecord(rawSkill);

		if (skill === null || skill.builtIn) {
			continue;
		}

		const skillNameKey = createSkillNameKey(skill.name);

		if (seenSkillIds.has(skill.id) || seenSkillNames.has(skillNameKey) || isBuiltInSkillId(skill.id)) {
			continue;
		}

		seenSkillIds.add(skill.id);
		seenSkillNames.add(skillNameKey);
		skills.push(skill);
	}

	return {
		version: SKILL_REGISTRY_VERSION,
		workspaceId,
		skills: sortSkills(skills),
		updatedAt: readTrimmedString(value.updatedAt)
	};
}

function parseSkillRecord(value: unknown): WorkduckSkillRecord | null {
	if (!isObjectRecord(value)) {
		return null;
	}

	const id = normalizeRecordId(value.id);
	const name = normalizeSkillName(readTrimmedString(value.name));
	const description = normalizeSkillDescription(readTrimmedString(value.description));
	const outputTypes = normalizeSkillOutputTypes(value.outputTypes);
	const instructions = normalizeSkillInstructions(readRawString(value.instructions));
	const createdAt = readTrimmedString(value.createdAt);
	const updatedAt = readTrimmedString(value.updatedAt);

	if (id === null || name.length === 0 || outputTypes.length === 0 || instructions.length === 0) {
		return null;
	}

	return {
		id,
		name,
		description,
		outputTypes,
		instructions,
		builtIn: false,
		createdAt: createdAt.length === 0 ? updatedAt : createdAt,
		updatedAt: updatedAt.length === 0 ? createdAt : updatedAt
	};
}

function normalizeSkillOutputTypes(value: unknown): WorkduckSkillOutputType[] {
	if (!Array.isArray(value)) {
		return [];
	}

	const allowedTypes = new Set(workduckSkillOutputTypeOptions.map((option) => option.id));
	const outputTypes: WorkduckSkillOutputType[] = [];

	for (const item of value) {
		if (typeof item !== 'string' || !allowedTypes.has(item as WorkduckSkillOutputType)) {
			continue;
		}

		const outputType = item as WorkduckSkillOutputType;

		if (!outputTypes.includes(outputType)) {
			outputTypes.push(outputType);
		}

		if (outputTypes.length >= SKILL_OUTPUT_TYPES_MAX_COUNT) {
			break;
		}
	}

	return outputTypes;
}

function isBuiltInSkillId(skillId: string) {
	return BUILT_IN_SKILLS.some((skill) => skill.id === skillId);
}

function sortSkills(skills: readonly WorkduckSkillRecord[]) {
	return [...skills].sort((left, right) => {
		if (left.builtIn !== right.builtIn) {
			return left.builtIn ? -1 : 1;
		}

		return left.name.localeCompare(right.name, 'en-US', { sensitivity: 'base' });
	});
}

function normalizeSkillName(value: string) {
	return value.trim().replace(/\s+/g, ' ').slice(0, SKILL_NAME_MAX_LENGTH);
}

function normalizeSkillDescription(value: string) {
	return value.trim().replace(/\s+/g, ' ').slice(0, SKILL_DESCRIPTION_MAX_LENGTH);
}

function normalizeSkillInstructions(value: string) {
	return value.trim().slice(0, SKILL_INSTRUCTIONS_MAX_LENGTH);
}

function normalizeRecordId(value: unknown) {
	const id = readTrimmedString(value);

	return id.length === 0 ? null : id;
}

function createSkillId() {
	if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
		return crypto.randomUUID();
	}

	return `skill-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function createSkillNameKey(name: string) {
	return normalizeSkillName(name).toLocaleLowerCase('en-US');
}

function readRawString(value: unknown) {
	return typeof value === 'string' ? value : '';
}

function readTrimmedString(value: unknown) {
	return typeof value === 'string' ? value.trim() : '';
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}
