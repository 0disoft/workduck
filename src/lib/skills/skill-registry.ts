/* llmnav/1 module
id=workduck.skills.registry
role=Normalize and migrate workspace skill registries while preserving custom skills and built-in overrides.
owns=skill registry normalization|legacy skill migration|skill mutations|built-in override detection
excludes=default prompt authoring|skill persistence|queue execution
search=skill registry migration|custom skill validation|skill editing
invariant=Legacy registries receive version-appropriate defaults, current removals persist, and invalid mutations preserve the registry.
stability=architecture
*/
import { isObjectRecord } from '#lib/shared/object-record.ts';
import {
	SKILL_REGISTRY_VERSION,
	SKILL_NAME_MAX_LENGTH,
	SKILL_DESCRIPTION_MAX_LENGTH,
	SKILL_INSTRUCTIONS_MAX_LENGTH,
	SKILL_OUTPUT_TYPES_MAX_COUNT,
	SKILL_OPTION_GROUPS_MAX_COUNT,
	SKILL_OPTIONS_PER_GROUP_MAX_COUNT,
	SKILL_OPTION_LABEL_MAX_LENGTH,
	SKILL_OPTION_DESCRIPTION_MAX_LENGTH,
	WORKDUCK_CODE_REVIEWER_SKILL_ID,
	WORKDUCK_COMMIT_HANDOFF_WRITER_SKILL_ID,
	WORKDUCK_TECH_DEBT_JANITOR_SKILL_ID,
	WORKDUCK_RELEASE_NOTE_WRITER_SKILL_ID,
	WORKDUCK_API_SCHEMA_ARCHITECT_SKILL_ID,
	workduckSkillOutputTypeOptions,
	type WorkduckSkillOutputType,
	type WorkduckSkillRecord,
	type WorkduckSkillOptionGroup,
	type WorkduckSkillOption,
	type SkillRegistry,
	type SkillInput,
	type SkillRegistryMutationResult
} from './skill-schema';
import { DEFAULT_SKILLS, DEFAULT_SKILL_TIMESTAMP } from './skill-defaults';
export * from './skill-schema';

export function createEmptySkillRegistry(workspaceId: string, now = new Date()): SkillRegistry {
	return {
		version: SKILL_REGISTRY_VERSION,
		workspaceId,
		skills: getDefaultSkills(),
		updatedAt: now.toISOString()
	};
}

export function getDefaultSkills(): readonly WorkduckSkillRecord[] {
	return DEFAULT_SKILLS.map((skill) => ({
		...skill,
		createdAt: DEFAULT_SKILL_TIMESTAMP,
		updatedAt: DEFAULT_SKILL_TIMESTAMP
	}));
}

export function getAllSkills(registry: SkillRegistry): readonly WorkduckSkillRecord[] {
	return normalizeSkillRegistry(registry, registry.workspaceId).skills;
}

export function isDefaultSkillRecord(skill: WorkduckSkillRecord) {
	const defaultSkill = DEFAULT_SKILLS.find((candidate) => candidate.id === skill.id);

	if (defaultSkill === undefined) {
		return false;
	}

	if (skill.createdAt === DEFAULT_SKILL_TIMESTAMP && skill.updatedAt === DEFAULT_SKILL_TIMESTAMP) {
		return true;
	}

	return (
		defaultSkill.name === skill.name &&
		defaultSkill.description === skill.description &&
		defaultSkill.instructions === skill.instructions &&
		defaultSkill.outputTypes.length === skill.outputTypes.length &&
		defaultSkill.outputTypes.every((outputType, index) => skill.outputTypes[index] === outputType) &&
		skillOptionGroupsAreEqual(defaultSkill.optionGroups, skill.optionGroups)
	);
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
	const optionGroups = normalizeSkillOptionGroups(input.optionGroups ?? []);

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
	const nameAlreadyExists = normalizedRegistry.skills.some(
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
		optionGroups,
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
	if (!isObjectRecord(value) || !isSupportedSkillRegistryVersion(value.version)) {
		return createEmptySkillRegistry(workspaceId);
	}

	if (typeof value.workspaceId !== 'string' || value.workspaceId !== workspaceId) {
		return createEmptySkillRegistry(workspaceId);
	}

	const rawSkills = [
		...getDefaultSkillsForRegistryVersion(value.version),
		...(Array.isArray(value.skills) ? value.skills : [])
	];
	const seenSkillIds = new Set<string>();
	const seenSkillNames = new Set<string>();
	const skills: WorkduckSkillRecord[] = [];

	for (const rawSkill of rawSkills) {
		const skill = parseSkillRecord(rawSkill);

		if (skill === null) {
			continue;
		}

		const skillNameKey = createSkillNameKey(skill.name);

		if (seenSkillIds.has(skill.id) || seenSkillNames.has(skillNameKey)) {
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

function isSupportedSkillRegistryVersion(
	version: unknown
): version is 1 | 2 | typeof SKILL_REGISTRY_VERSION {
	return version === 1 || version === 2 || version === SKILL_REGISTRY_VERSION;
}

function getDefaultSkillsForRegistryVersion(
	version: 1 | 2 | typeof SKILL_REGISTRY_VERSION
): readonly WorkduckSkillRecord[] {
	if (version === 1) {
		return getDefaultSkills();
	}

	if (version === 2) {
		return getDefaultSkills().filter(isWorkflowDefaultSkill);
	}

	return [];
}

function isWorkflowDefaultSkill(skill: WorkduckSkillRecord) {
	return (
		skill.id === WORKDUCK_CODE_REVIEWER_SKILL_ID ||
		skill.id === WORKDUCK_COMMIT_HANDOFF_WRITER_SKILL_ID ||
		skill.id === WORKDUCK_TECH_DEBT_JANITOR_SKILL_ID ||
		skill.id === WORKDUCK_RELEASE_NOTE_WRITER_SKILL_ID ||
		skill.id === WORKDUCK_API_SCHEMA_ARCHITECT_SKILL_ID
	);
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
	const optionGroups = Array.isArray(value.optionGroups)
		? normalizeSkillOptionGroups(value.optionGroups)
		: getDefaultSkillOptionGroups(id);
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
		optionGroups,
		createdAt: createdAt.length === 0 ? updatedAt : createdAt,
		updatedAt: updatedAt.length === 0 ? createdAt : updatedAt
	};
}

function getDefaultSkillOptionGroups(skillId: string | null) {
	const defaultSkill =
		skillId === null ? undefined : DEFAULT_SKILLS.find((candidate) => candidate.id === skillId);

	return defaultSkill === undefined ? [] : normalizeSkillOptionGroups(defaultSkill.optionGroups);
}

function normalizeSkillOptionGroups(value: unknown): WorkduckSkillOptionGroup[] {
	if (!Array.isArray(value)) {
		return [];
	}

	const optionGroups: WorkduckSkillOptionGroup[] = [];
	const seenGroupIds = new Set<string>();

	for (const item of value) {
		if (!isObjectRecord(item)) {
			continue;
		}

		const label = normalizeSkillOptionLabel(readTrimmedString(item.label));
		const id = normalizeRecordId(item.id) ?? createOptionRecordId(label);
		const description = normalizeSkillOptionDescription(readTrimmedString(item.description));
		const selectionMode = item.selectionMode === 'multiple' ? 'multiple' : 'single';
		const options = normalizeSkillOptions(item.options);

		if (id === null || label.length === 0 || options.length === 0 || seenGroupIds.has(id)) {
			continue;
		}

		seenGroupIds.add(id);
		optionGroups.push({ id, label, description, selectionMode, options });

		if (optionGroups.length >= SKILL_OPTION_GROUPS_MAX_COUNT) {
			break;
		}
	}

	return optionGroups;
}

function normalizeSkillOptions(value: unknown): WorkduckSkillOption[] {
	if (!Array.isArray(value)) {
		return [];
	}

	const options: WorkduckSkillOption[] = [];
	const seenOptionIds = new Set<string>();

	for (const item of value) {
		if (!isObjectRecord(item)) {
			continue;
		}

		const label = normalizeSkillOptionLabel(readTrimmedString(item.label));
		const id = normalizeRecordId(item.id) ?? createOptionRecordId(label);
		const description = normalizeSkillOptionDescription(readTrimmedString(item.description));

		if (id === null || label.length === 0 || seenOptionIds.has(id)) {
			continue;
		}

		seenOptionIds.add(id);
		options.push({ id, label, description });

		if (options.length >= SKILL_OPTIONS_PER_GROUP_MAX_COUNT) {
			break;
		}
	}

	return options;
}

function skillOptionGroupsAreEqual(
	leftGroups: readonly WorkduckSkillOptionGroup[],
	rightGroups: readonly WorkduckSkillOptionGroup[]
) {
	return (
		leftGroups.length === rightGroups.length &&
		leftGroups.every((leftGroup, groupIndex) => {
			const rightGroup = rightGroups[groupIndex];

			return (
				rightGroup !== undefined &&
				leftGroup.id === rightGroup.id &&
				leftGroup.label === rightGroup.label &&
				leftGroup.description === rightGroup.description &&
				leftGroup.selectionMode === rightGroup.selectionMode &&
				leftGroup.options.length === rightGroup.options.length &&
				leftGroup.options.every((leftOption, optionIndex) => {
					const rightOption = rightGroup.options[optionIndex];

					return (
						rightOption !== undefined &&
						leftOption.id === rightOption.id &&
						leftOption.label === rightOption.label &&
						leftOption.description === rightOption.description
					);
				})
			);
		})
	);
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

function sortSkills(skills: readonly WorkduckSkillRecord[]) {
	return [...skills].sort((left, right) =>
		left.name.localeCompare(right.name, undefined, { numeric: true, sensitivity: 'base' })
	);
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

function normalizeSkillOptionLabel(value: string) {
	return value.trim().replace(/\s+/g, ' ').slice(0, SKILL_OPTION_LABEL_MAX_LENGTH);
}

function normalizeSkillOptionDescription(value: string) {
	return value.trim().replace(/\s+/g, ' ').slice(0, SKILL_OPTION_DESCRIPTION_MAX_LENGTH);
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

function createOptionRecordId(label: string) {
	const baseId = label
		.trim()
		.toLocaleLowerCase()
		.replace(/[^0-9a-z가-힣]+/gu, '-')
		.replace(/^-+|-+$/gu, '')
		.slice(0, 48);

	return baseId.length === 0 ? null : baseId;
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
