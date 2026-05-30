import { isObjectRecord } from '$lib/shared/object-record';
export const REFERENCE_REGISTRY_VERSION = 1;
export const REFERENCE_TITLE_MAX_LENGTH = 180;
export const REFERENCE_SOURCE_URL_MAX_LENGTH = 2_048;
export const REFERENCE_CONTENT_MAX_LENGTH = 20_000;
export const REFERENCE_TAG_MAX_LENGTH = 48;
export const REFERENCE_TAGS_MAX_COUNT = 12;

export type ReferenceRegistryError =
	| 'reference-title-required'
	| 'reference-body-or-source-required'
	| 'reference-source-url-invalid'
	| 'reference-content-too-long'
	| 'reference-tags-too-many'
	| 'reference-tag-too-long'
	| 'reference-title-duplicate'
	| 'reference-not-found'
	| 'reference-registry-invalid';

export interface ReferenceRecord {
	readonly id: string;
	readonly title: string;
	readonly sourceUrl: string;
	readonly tags: readonly string[];
	readonly projectIds: readonly string[];
	readonly repositoryIds: readonly string[];
	readonly content: string;
	readonly createdAt: string;
	readonly updatedAt: string;
}

export interface ReferenceRegistry {
	readonly version: typeof REFERENCE_REGISTRY_VERSION;
	readonly workspaceId: string;
	readonly references: readonly ReferenceRecord[];
	readonly updatedAt: string;
}

export interface ReferenceInput {
	readonly id?: string | null;
	readonly title: string;
	readonly sourceUrl: string;
	readonly tags: readonly string[];
	readonly projectIds?: readonly string[];
	readonly repositoryIds?: readonly string[];
	readonly content: string;
}

export type ReferenceRegistryMutationResult =
	| {
			readonly ok: true;
			readonly registry: ReferenceRegistry;
	  }
	| {
			readonly ok: false;
			readonly registry: ReferenceRegistry;
			readonly error: ReferenceRegistryError;
	  };

export function createEmptyReferenceRegistry(
	workspaceId: string,
	now = new Date()
): ReferenceRegistry {
	return {
		version: REFERENCE_REGISTRY_VERSION,
		workspaceId,
		references: [],
		updatedAt: now.toISOString()
	};
}

export function parseReferenceRegistry(serializedRegistry: string, workspaceId: string) {
	try {
		return normalizeReferenceRegistry(JSON.parse(serializedRegistry), workspaceId);
	} catch {
		return null;
	}
}

export function serializeReferenceRegistry(registry: ReferenceRegistry) {
	return JSON.stringify(normalizeReferenceRegistry(registry, registry.workspaceId) ?? registry);
}

export function upsertReference(
	registry: ReferenceRegistry,
	input: ReferenceInput,
	now = new Date()
): ReferenceRegistryMutationResult {
	const normalizedRegistry = normalizeReferenceRegistry(registry, registry.workspaceId) ?? registry;
	const referenceId = normalizeRecordId(input.id ?? null);
	const title = normalizeReferenceTitle(input.title);
	const sourceUrl = normalizeReferenceSourceUrl(input.sourceUrl);
	const tagsResult = validateAndNormalizeReferenceTags(input.tags);
	const projectIds = normalizeReferenceRecordIds(input.projectIds ?? []);
	const repositoryIds = normalizeReferenceRecordIds(input.repositoryIds ?? []);
	const contentResult = validateAndNormalizeReferenceContent(input.content);

	if (title.length === 0) {
		return { ok: false, registry: normalizedRegistry, error: 'reference-title-required' };
	}

	if (sourceUrl === null) {
		return { ok: false, registry: normalizedRegistry, error: 'reference-source-url-invalid' };
	}

	if (!tagsResult.ok) {
		return { ok: false, registry: normalizedRegistry, error: tagsResult.error };
	}

	if (!contentResult.ok) {
		return { ok: false, registry: normalizedRegistry, error: contentResult.error };
	}

	const tags = tagsResult.tags;
	const content = contentResult.content;

	if (sourceUrl.length === 0 && content.length === 0) {
		return { ok: false, registry: normalizedRegistry, error: 'reference-body-or-source-required' };
	}

	const matchingReference = normalizedRegistry.references.find(
		(reference) => reference.id === referenceId
	);
	const titleKey = createReferenceTitleKey(title);
	const titleAlreadyExists = normalizedRegistry.references.some(
		(reference) => reference.id !== referenceId && createReferenceTitleKey(reference.title) === titleKey
	);

	if (titleAlreadyExists) {
		return { ok: false, registry: normalizedRegistry, error: 'reference-title-duplicate' };
	}

	if (referenceId !== null && matchingReference === undefined) {
		return { ok: false, registry: normalizedRegistry, error: 'reference-not-found' };
	}

	const timestamp = now.toISOString();
	const nextReference = {
		id: referenceId ?? createReferenceId(),
		title,
		sourceUrl,
		tags,
		projectIds,
		repositoryIds,
		content,
		createdAt: matchingReference?.createdAt ?? timestamp,
		updatedAt: timestamp
	} satisfies ReferenceRecord;
	const references =
		matchingReference === undefined
			? [...normalizedRegistry.references, nextReference]
			: normalizedRegistry.references.map((reference) =>
					reference.id === nextReference.id ? nextReference : reference
				);

	return {
		ok: true,
		registry: {
			...normalizedRegistry,
			references: sortReferences(references),
			updatedAt: timestamp
		}
	};
}

export function removeReference(
	registry: ReferenceRegistry,
	referenceId: string,
	now = new Date()
): ReferenceRegistryMutationResult {
	const normalizedRegistry = normalizeReferenceRegistry(registry, registry.workspaceId) ?? registry;

	if (!normalizedRegistry.references.some((reference) => reference.id === referenceId)) {
		return { ok: false, registry: normalizedRegistry, error: 'reference-not-found' };
	}

	return {
		ok: true,
		registry: {
			...normalizedRegistry,
			references: normalizedRegistry.references.filter((reference) => reference.id !== referenceId),
			updatedAt: now.toISOString()
		}
	};
}

function normalizeReferenceRegistry(value: unknown, workspaceId: string): ReferenceRegistry | null {
	if (!isObjectRecord(value) || value.version !== REFERENCE_REGISTRY_VERSION) {
		return null;
	}

	if (typeof value.workspaceId !== 'string' || value.workspaceId !== workspaceId) {
		return null;
	}

	const rawReferences = Array.isArray(value.references) ? value.references : [];
	const seenReferenceIds = new Set<string>();
	const seenReferenceTitles = new Set<string>();
	const references: ReferenceRecord[] = [];

	for (const rawReference of rawReferences) {
		const reference = parseReferenceRecord(rawReference);

		if (reference === null) {
			continue;
		}

		const referenceTitleKey = createReferenceTitleKey(reference.title);

		if (seenReferenceIds.has(reference.id) || seenReferenceTitles.has(referenceTitleKey)) {
			continue;
		}

		seenReferenceIds.add(reference.id);
		seenReferenceTitles.add(referenceTitleKey);
		references.push(reference);
	}

	return {
		version: REFERENCE_REGISTRY_VERSION,
		workspaceId,
		references: sortReferences(references),
		updatedAt: readTrimmedString(value.updatedAt)
	};
}

function parseReferenceRecord(value: unknown): ReferenceRecord | null {
	if (!isObjectRecord(value)) {
		return null;
	}

	const id = normalizeRecordId(value.id);
	const title = normalizeReferenceTitle(readTrimmedString(value.title));
	const sourceUrl = normalizeReferenceSourceUrl(readTrimmedString(value.sourceUrl));
	const tags = normalizeReferenceTags(value.tags);
	const projectIds = normalizeReferenceRecordIds(value.projectIds);
	const repositoryIds = normalizeReferenceRecordIds(value.repositoryIds);
	const content = normalizeReferenceContent(readRawString(value.content));
	const createdAt = readTrimmedString(value.createdAt);
	const updatedAt = readTrimmedString(value.updatedAt);

	if (id === null || title.length === 0 || sourceUrl === null || (sourceUrl.length === 0 && content.length === 0)) {
		return null;
	}

	return {
		id,
		title,
		sourceUrl,
		tags,
		projectIds,
		repositoryIds,
		content,
		createdAt: createdAt.length === 0 ? updatedAt : createdAt,
		updatedAt: updatedAt.length === 0 ? createdAt : updatedAt
	};
}

function sortReferences(references: readonly ReferenceRecord[]) {
	return [...references].sort((left, right) => {
		const updatedAtComparison = right.updatedAt.localeCompare(left.updatedAt);

		if (updatedAtComparison !== 0) {
			return updatedAtComparison;
		}

		return left.title.localeCompare(right.title, 'en-US', { sensitivity: 'base' });
	});
}

function normalizeReferenceTitle(value: string) {
	return value.trim().replace(/\s+/g, ' ').slice(0, REFERENCE_TITLE_MAX_LENGTH);
}

function normalizeReferenceSourceUrl(value: string) {
	const sourceUrl = value.trim().slice(0, REFERENCE_SOURCE_URL_MAX_LENGTH);

	if (sourceUrl.length === 0) {
		return '';
	}

	for (const candidateUrl of createReferenceSourceUrlCandidates(sourceUrl)) {
		try {
			const parsedUrl = new URL(candidateUrl);

			if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
				continue;
			}

			return parsedUrl.toString();
		} catch {
			continue;
		}
	}

	return null;
}

function createReferenceSourceUrlCandidates(sourceUrl: string) {
	if (/^[a-z][a-z0-9+.-]*:/i.test(sourceUrl)) {
		return [sourceUrl];
	}

	return [`https://${sourceUrl}`];
}

function validateAndNormalizeReferenceTags(value: unknown):
	| { readonly ok: true; readonly tags: string[] }
	| { readonly ok: false; readonly error: ReferenceRegistryError } {
	if (!Array.isArray(value)) {
		return { ok: true, tags: [] };
	}

	const tags: string[] = [];
	const tagKeys = new Set<string>();

	for (const item of value) {
		const tag = normalizeReferenceTagText(readTrimmedString(item));
		const tagKey = tag.toLocaleLowerCase('en-US');

		if (tag.length === 0 || tagKeys.has(tagKey)) {
			continue;
		}

		if (tag.length > REFERENCE_TAG_MAX_LENGTH) {
			return { ok: false, error: 'reference-tag-too-long' };
		}

		if (tags.length >= REFERENCE_TAGS_MAX_COUNT) {
			return { ok: false, error: 'reference-tags-too-many' };
		}

		tags.push(tag);
		tagKeys.add(tagKey);
	}

	return { ok: true, tags };
}

function normalizeReferenceTags(value: unknown): string[] {
	if (!Array.isArray(value)) {
		return [];
	}

	const tags: string[] = [];
	const tagKeys = new Set<string>();

	for (const item of value) {
		const tag = normalizeReferenceTag(readTrimmedString(item));
		const tagKey = tag.toLocaleLowerCase('en-US');

		if (tag.length === 0 || tagKeys.has(tagKey)) {
			continue;
		}

		tags.push(tag);
		tagKeys.add(tagKey);

		if (tags.length >= REFERENCE_TAGS_MAX_COUNT) {
			break;
		}
	}

	return tags;
}

function normalizeReferenceTag(value: string) {
	return normalizeReferenceTagText(value).slice(0, REFERENCE_TAG_MAX_LENGTH);
}

function normalizeReferenceTagText(value: string) {
	return value.trim().replace(/\s+/g, ' ');
}

function normalizeReferenceRecordIds(value: unknown): string[] {
	if (!Array.isArray(value)) {
		return [];
	}

	const projectIds: string[] = [];

	for (const item of value) {
		const projectId = normalizeRecordId(item);

		if (projectId === null || projectIds.includes(projectId)) {
			continue;
		}

		projectIds.push(projectId);
	}

	return projectIds;
}

function normalizeReferenceContent(value: string) {
	return value.trim().slice(0, REFERENCE_CONTENT_MAX_LENGTH);
}

function validateAndNormalizeReferenceContent(value: string):
	| { readonly ok: true; readonly content: string }
	| { readonly ok: false; readonly error: ReferenceRegistryError } {
	const content = value.trim();

	if (content.length > REFERENCE_CONTENT_MAX_LENGTH) {
		return { ok: false, error: 'reference-content-too-long' };
	}

	return { ok: true, content };
}

function normalizeRecordId(value: unknown) {
	const id = readTrimmedString(value);

	return id.length === 0 ? null : id;
}

function createReferenceId() {
	if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
		return crypto.randomUUID();
	}

	return `reference-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function createReferenceTitleKey(title: string) {
	return normalizeReferenceTitle(title).toLocaleLowerCase('en-US');
}

function readRawString(value: unknown) {
	return typeof value === 'string' ? value : '';
}

function readTrimmedString(value: unknown) {
	return typeof value === 'string' ? value.trim() : '';
}
