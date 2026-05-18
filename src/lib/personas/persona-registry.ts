export const PERSONA_REGISTRY_VERSION = 1;
export const PERSONA_NAME_MAX_LENGTH = 120;
export const PERSONA_DESCRIPTION_MAX_LENGTH = 420;
export const PERSONA_INSTRUCTIONS_MAX_LENGTH = 8_000;
export const PERSONA_SPECTRUM_MIN_LEVEL = 1;
export const PERSONA_SPECTRUM_MAX_LEVEL = 5;
export const PERSONA_SPECTRUM_DEFAULT_LEVEL = 3;

export const personaSpectrumDefinitions = [
	{ id: 'developmentApproach' },
	{ id: 'qualityStandard' },
	{ id: 'structureBias' },
	{ id: 'productivityStrategy' },
	{ id: 'operationPhilosophy' },
	{ id: 'collaborationPhilosophy' }
] as const;

export const personaSpectrumLevels = [1, 2, 3, 4, 5] as const;
export const personaStyleDefinitions = [
	{ id: 'responseLength', options: ['short', 'standard', 'detailed'] },
	{ id: 'emotionalTone', options: ['calm', 'neutral', 'bright'] },
	{ id: 'judgmentAttitude', options: ['critical', 'balanced', 'supportive'] },
	{ id: 'confidenceLevel', options: ['cautious', 'realistic', 'decisive'] },
	{ id: 'socialDistance', options: ['formal', 'comfortable', 'friendly'] }
] as const;

export type PersonaSpectrumId = (typeof personaSpectrumDefinitions)[number]['id'];
export type PersonaSpectrumLevel = (typeof personaSpectrumLevels)[number];
export type PersonaSpectrumValues = Readonly<Record<PersonaSpectrumId, PersonaSpectrumLevel>>;
export type PersonaStyleId = (typeof personaStyleDefinitions)[number]['id'];
export type PersonaStyleOption<StyleId extends PersonaStyleId> = Extract<
	(typeof personaStyleDefinitions)[number],
	{ readonly id: StyleId }
>['options'][number];
export type PersonaStyleValues = {
	readonly [StyleId in PersonaStyleId]: PersonaStyleOption<StyleId>;
};

export type PersonaRegistryError =
	| 'persona-name-required'
	| 'persona-name-duplicate'
	| 'persona-not-found'
	| 'persona-registry-invalid';

export interface PersonaRecord {
	readonly id: string;
	readonly name: string;
	readonly description: string;
	readonly instructions: string;
	readonly spectrums: PersonaSpectrumValues;
	readonly styles: PersonaStyleValues;
	readonly createdAt: string;
	readonly updatedAt: string;
}

export interface PersonaRegistry {
	readonly version: typeof PERSONA_REGISTRY_VERSION;
	readonly workspaceId: string;
	readonly personas: readonly PersonaRecord[];
	readonly updatedAt: string;
}

export interface PersonaInput {
	readonly id?: string | null;
	readonly name: string;
	readonly description: string;
	readonly instructions?: string;
	readonly spectrums?: PersonaSpectrumValues | null;
	readonly styles?: PersonaStyleValues | null;
}

export type PersonaRegistryMutationResult =
	| {
			readonly ok: true;
			readonly registry: PersonaRegistry;
	  }
	| {
			readonly ok: false;
			readonly registry: PersonaRegistry;
			readonly error: PersonaRegistryError;
	  };

export function createEmptyPersonaRegistry(workspaceId: string, now = new Date()): PersonaRegistry {
	return {
		version: PERSONA_REGISTRY_VERSION,
		workspaceId,
		personas: [],
		updatedAt: now.toISOString()
	};
}

export function parsePersonaRegistry(serializedRegistry: string, workspaceId: string) {
	try {
		return normalizePersonaRegistry(JSON.parse(serializedRegistry), workspaceId);
	} catch {
		return null;
	}
}

export function serializePersonaRegistry(registry: PersonaRegistry) {
	return JSON.stringify(normalizePersonaRegistry(registry, registry.workspaceId) ?? registry);
}

export function createDefaultPersonaSpectrumValues(): PersonaSpectrumValues {
	return personaSpectrumDefinitions.reduce(
		(values, definition) => ({
			...values,
			[definition.id]: PERSONA_SPECTRUM_DEFAULT_LEVEL
		}),
		{} as Record<PersonaSpectrumId, PersonaSpectrumLevel>
	);
}

export function createRandomPersonaSpectrumValues(): PersonaSpectrumValues {
	return personaSpectrumDefinitions.reduce(
		(values, definition) => ({
			...values,
			[definition.id]: personaSpectrumLevels[Math.floor(Math.random() * personaSpectrumLevels.length)]
		}),
		{} as Record<PersonaSpectrumId, PersonaSpectrumLevel>
	);
}

export function createDefaultPersonaStyleValues(): PersonaStyleValues {
	return {
		responseLength: 'standard',
		emotionalTone: 'neutral',
		judgmentAttitude: 'balanced',
		confidenceLevel: 'realistic',
		socialDistance: 'comfortable'
	};
}

export function createRandomPersonaStyleValues(): PersonaStyleValues {
	return personaStyleDefinitions.reduce((values, definition) => {
		const option = definition.options[Math.floor(Math.random() * definition.options.length)];

		return {
			...values,
			[definition.id]: option
		};
	}, {} as Record<PersonaStyleId, string>) as PersonaStyleValues;
}

export function upsertPersona(
	registry: PersonaRegistry,
	input: PersonaInput,
	now = new Date()
): PersonaRegistryMutationResult {
	const normalizedRegistry = normalizePersonaRegistry(registry, registry.workspaceId) ?? registry;
	const personaId = normalizeRecordId(input.id ?? null);
	const name = normalizePersonaName(input.name);
	const description = normalizePersonaDescription(input.description);
	const instructions = normalizePersonaInstructions(input.instructions ?? '');
	const spectrums = normalizePersonaSpectrumValues(input.spectrums);
	const styles = normalizePersonaStyleValues(input.styles);

	if (name.length === 0) {
		return { ok: false, registry: normalizedRegistry, error: 'persona-name-required' };
	}

	const matchingPersona = normalizedRegistry.personas.find((persona) => persona.id === personaId);
	const nameKey = createPersonaNameKey(name);
	const nameAlreadyExists = normalizedRegistry.personas.some(
		(persona) => persona.id !== personaId && createPersonaNameKey(persona.name) === nameKey
	);

	if (nameAlreadyExists) {
		return { ok: false, registry: normalizedRegistry, error: 'persona-name-duplicate' };
	}

	if (personaId !== null && matchingPersona === undefined) {
		return { ok: false, registry: normalizedRegistry, error: 'persona-not-found' };
	}

	const timestamp = now.toISOString();
	const nextPersona = {
		id: personaId ?? createPersonaId(),
		name,
		description,
		instructions,
		spectrums,
		styles,
		createdAt: matchingPersona?.createdAt ?? timestamp,
		updatedAt: timestamp
	} satisfies PersonaRecord;
	const personas =
		matchingPersona === undefined
			? [...normalizedRegistry.personas, nextPersona]
			: normalizedRegistry.personas.map((persona) =>
					persona.id === nextPersona.id ? nextPersona : persona
				);

	return {
		ok: true,
		registry: {
			...normalizedRegistry,
			personas: sortPersonas(personas),
			updatedAt: timestamp
		}
	};
}

export function removePersona(
	registry: PersonaRegistry,
	personaId: string,
	now = new Date()
): PersonaRegistryMutationResult {
	const normalizedRegistry = normalizePersonaRegistry(registry, registry.workspaceId) ?? registry;

	if (!normalizedRegistry.personas.some((persona) => persona.id === personaId)) {
		return { ok: false, registry: normalizedRegistry, error: 'persona-not-found' };
	}

	return {
		ok: true,
		registry: {
			...normalizedRegistry,
			personas: normalizedRegistry.personas.filter((persona) => persona.id !== personaId),
			updatedAt: now.toISOString()
		}
	};
}

function normalizePersonaRegistry(value: unknown, workspaceId: string): PersonaRegistry | null {
	if (!isObjectRecord(value) || value.version !== PERSONA_REGISTRY_VERSION) {
		return null;
	}

	if (typeof value.workspaceId !== 'string' || value.workspaceId !== workspaceId) {
		return null;
	}

	const rawPersonas = Array.isArray(value.personas) ? value.personas : [];
	const seenPersonaIds = new Set<string>();
	const seenPersonaNames = new Set<string>();
	const personas: PersonaRecord[] = [];

	for (const rawPersona of rawPersonas) {
		const persona = parsePersonaRecord(rawPersona);

		if (persona === null) {
			continue;
		}

		const personaNameKey = createPersonaNameKey(persona.name);

		if (seenPersonaIds.has(persona.id) || seenPersonaNames.has(personaNameKey)) {
			continue;
		}

		seenPersonaIds.add(persona.id);
		seenPersonaNames.add(personaNameKey);
		personas.push(persona);
	}

	return {
		version: PERSONA_REGISTRY_VERSION,
		workspaceId,
		personas: sortPersonas(personas),
		updatedAt: readTrimmedString(value.updatedAt)
	};
}

function parsePersonaRecord(value: unknown): PersonaRecord | null {
	if (!isObjectRecord(value)) {
		return null;
	}

	const id = normalizeRecordId(value.id);
	const name = normalizePersonaName(readTrimmedString(value.name));
	const description = normalizePersonaDescription(readTrimmedString(value.description));
	const instructions = normalizePersonaInstructions(readRawString(value.instructions));
	const spectrums = normalizePersonaSpectrumValues(value.spectrums);
	const styles = normalizePersonaStyleValues(value.styles);
	const createdAt = readTrimmedString(value.createdAt);
	const updatedAt = readTrimmedString(value.updatedAt);

	if (id === null || name.length === 0) {
		return null;
	}

	return {
		id,
		name,
		description,
		instructions,
		spectrums,
		styles,
		createdAt: createdAt.length === 0 ? updatedAt : createdAt,
		updatedAt: updatedAt.length === 0 ? createdAt : updatedAt
	};
}

function normalizePersonaStyleValues(value: unknown): PersonaStyleValues {
	const input = isObjectRecord(value) ? value : {};
	const values = { ...createDefaultPersonaStyleValues() } as Record<PersonaStyleId, string>;

	for (const definition of personaStyleDefinitions) {
		const option = readTrimmedString(input[definition.id]);

		values[definition.id] = isPersonaStyleOption(definition, option)
			? option
			: createDefaultPersonaStyleValues()[definition.id];
	}

	return values as PersonaStyleValues;
}

function isPersonaStyleOption(
	definition: (typeof personaStyleDefinitions)[number],
	option: string
) {
	return (definition.options as readonly string[]).includes(option);
}

function normalizePersonaSpectrumValues(value: unknown): PersonaSpectrumValues {
	const input = isObjectRecord(value) ? value : {};
	const values: Record<PersonaSpectrumId, PersonaSpectrumLevel> = {
		...createDefaultPersonaSpectrumValues()
	};

	for (const definition of personaSpectrumDefinitions) {
		values[definition.id] = normalizePersonaSpectrumLevel(input[definition.id]);
	}

	return values;
}

function normalizePersonaSpectrumLevel(value: unknown): PersonaSpectrumLevel {
	const numericValue = typeof value === 'number' ? value : Number.parseInt(readTrimmedString(value), 10);

	if (!Number.isFinite(numericValue)) {
		return PERSONA_SPECTRUM_DEFAULT_LEVEL;
	}

	const normalizedValue = Math.trunc(numericValue);

	if (personaSpectrumLevels.includes(normalizedValue as PersonaSpectrumLevel)) {
		return normalizedValue as PersonaSpectrumLevel;
	}

	if (normalizedValue < PERSONA_SPECTRUM_MIN_LEVEL) {
		return PERSONA_SPECTRUM_MIN_LEVEL;
	}

	return PERSONA_SPECTRUM_MAX_LEVEL;
}

function sortPersonas(personas: readonly PersonaRecord[]) {
	return [...personas].sort((left, right) =>
		left.name.localeCompare(right.name, 'en-US', { sensitivity: 'base' })
	);
}

function normalizePersonaName(value: string) {
	return value.trim().replace(/\s+/g, ' ').slice(0, PERSONA_NAME_MAX_LENGTH);
}

function normalizePersonaDescription(value: string) {
	return value.trim().replace(/\s+/g, ' ').slice(0, PERSONA_DESCRIPTION_MAX_LENGTH);
}

function normalizePersonaInstructions(value: string) {
	return value.trim().slice(0, PERSONA_INSTRUCTIONS_MAX_LENGTH);
}

function normalizeRecordId(value: unknown) {
	const id = readTrimmedString(value);

	return id.length === 0 ? null : id;
}

function createPersonaId() {
	if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
		return crypto.randomUUID();
	}

	return `persona-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function createPersonaNameKey(name: string) {
	return normalizePersonaName(name).toLocaleLowerCase('en-US');
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
