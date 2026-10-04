/* llmnav/1 module
id=workduck.projects.registry-normalization
role=Parse and canonicalize project registries while preserving hierarchy eligibility and collision precedence.
owns=project registry parsing|hierarchy canonicalization|repository deduplication|shared field normalization
excludes=registry mutation intents|registry persistence|Git operations
search=project registry parsing|hierarchy canonicalization|repository deduplication|shared field normalization
invariant=Strict storage parsing rejects unsupported versions; canonicalization accepts only reachable unique nodes and repository sources.
stability=architecture
*/
import {
	WORKDUCK_PROJECT_REGISTRY_VERSION,
	PROJECT_NAME_MAX_LENGTH,
	PROJECT_DESCRIPTION_MAX_LENGTH,
	PROJECT_NODE_PATH_MAX_LENGTH,
	PROJECT_TAG_MAX_LENGTH,
	PROJECT_TAGS_MAX_COUNT,
	PROJECT_REPOSITORY_NAME_MAX_LENGTH,
	PROJECT_REPOSITORY_PATH_MAX_LENGTH,
	PROJECT_REPOSITORY_REMOTE_URL_MAX_LENGTH,
	type ProjectNodeKind,
	type ProjectRepositoryLinkRecord,
	type ProjectNodeRecord,
	type ProjectRegistry,
	type ProjectRegistryParseResult
} from './project-schema';
import { isObjectRecord } from '#lib/shared/object-record.ts';
import { normalizeWorkspacePathForStorage } from '#lib/workspaces/workspace-path-format.ts';
import { createProjectFolderNameFromDisplayName } from './project-folder-name';

export function createEmptyProjectRegistry(workspaceId: string, now = new Date()): ProjectRegistry {
	return {
		version: WORKDUCK_PROJECT_REGISTRY_VERSION,
		workspaceId,
		nodes: [],
		updatedAt: now.toISOString()
	};
}

export function parseProjectRegistry(
	serializedRegistry: string | null,
	workspaceId: string
): ProjectRegistry {
	if (serializedRegistry === null) {
		return createEmptyProjectRegistry(workspaceId);
	}

	try {
		return normalizeProjectRegistry(JSON.parse(serializedRegistry), workspaceId);
	} catch {
		return createEmptyProjectRegistry(workspaceId);
	}
}

export function parseStoredProjectRegistry(
	serializedRegistry: string,
	workspaceId: string
): ProjectRegistryParseResult {
	try {
		return normalizeStoredProjectRegistry(JSON.parse(serializedRegistry), workspaceId);
	} catch {
		return { ok: false, error: 'project-registry-json-invalid' };
	}
}

export function normalizeStoredProjectRegistry(
	value: unknown,
	workspaceId: string
): ProjectRegistryParseResult {
	if (!isObjectRecord(value)) {
		return { ok: false, error: 'project-registry-json-invalid' };
	}

	const version = readProjectRegistryVersion(value.version);

	switch (version) {
		case WORKDUCK_PROJECT_REGISTRY_VERSION:
			return { ok: true, registry: normalizeProjectRegistry(value, workspaceId) };
		default:
			return { ok: false, error: 'project-registry-version-unsupported' };
	}
}

export function normalizeProjectRegistry(value: unknown, workspaceId: string): ProjectRegistry {
	if (!isObjectRecord(value) || value.version !== WORKDUCK_PROJECT_REGISTRY_VERSION) {
		return createEmptyProjectRegistry(workspaceId);
	}

	const rawNodes = Array.isArray(value.nodes) ? value.nodes : [];
	const candidateNodes = rawNodes.flatMap((rawNode) => {
		const node = parseProjectNodeRecord(rawNode);

		return node === null ? [] : [node];
	});
	const nodes = normalizeProjectNodes(candidateNodes);
	const updatedAt = readTrimmedString(value.updatedAt);

	return {
		version: WORKDUCK_PROJECT_REGISTRY_VERSION,
		workspaceId,
		nodes,
		updatedAt: updatedAt.length === 0 ? new Date(0).toISOString() : updatedAt
	};
}

export function serializeProjectRegistry(registry: ProjectRegistry): string {
	return JSON.stringify(normalizeProjectRegistry(registry, registry.workspaceId));
}

function normalizeProjectNodes(nodes: readonly ProjectNodeRecord[]): readonly ProjectNodeRecord[] {
	const rootNodes: ProjectNodeRecord[] = [];
	const normalizedNodes: ProjectNodeRecord[] = [];
	const seenNodeIds = new Set<string>();
	const seenRepositoryPaths = new Set<string>();
	const seenRepositoryRemoteUrls = new Set<string>();
	const seenNodePaths = new Set<string>();
	const seenRootNames = new Set<string>();

	for (const node of nodes) {
		if (seenNodeIds.has(node.id) || node.kind !== 'project' || node.parentId !== null) {
			continue;
		}

		const nameKey = createNameKey(node.name);
		const path = normalizeProjectPath(node.path) || createDefaultProjectPath(null, node.name);
		const pathKey = createProjectPathKey(path);

		if (seenRootNames.has(nameKey) || seenNodePaths.has(pathKey)) {
			continue;
		}

		seenNodeIds.add(node.id);
		seenRootNames.add(nameKey);
		seenNodePaths.add(pathKey);
		const normalizedNode = {
			...node,
			description: normalizeProjectDescription(node.description),
			path,
			githubCredentialSecretId: normalizeRecordId(node.githubCredentialSecretId),
			tags: normalizeProjectTags(node.tags),
			repositories: filterUniqueRepositories(
				node.repositories,
				seenRepositoryPaths,
				seenRepositoryRemoteUrls
			)
		};

		rootNodes.push(normalizedNode);
		normalizedNodes.push(normalizedNode);
	}

	const pathByNodeId = new Map(rootNodes.map((node) => [node.id, node.path]));
	const seenChildNames = new Map<string, Set<string>>();
	const groupIndexesByParentId = new Map<string, number[]>();
	for (let index = 0; index < nodes.length; index += 1) {
		const node = nodes[index]!;
		if (node.kind !== 'group' || node.parentId === null) continue;
		const indexes = groupIndexesByParentId.get(node.parentId) ?? [];
		indexes.push(index);
		groupIndexesByParentId.set(node.parentId, indexes);
	}

	let pendingIndexes: number[] = [];
	let nextPassIndexes: number[] = [];
	for (const root of rootNodes) {
		for (const index of groupIndexesByParentId.get(root.id) ?? []) {
			pushScheduledNode(pendingIndexes, index);
		}
	}

	while (pendingIndexes.length > 0 || nextPassIndexes.length > 0) {
		if (pendingIndexes.length === 0) {
			pendingIndexes = nextPassIndexes;
			nextPassIndexes = [];
		}
		const index = popScheduledNode(pendingIndexes);
		const node = nodes[index]!;
		if (seenNodeIds.has(node.id) || node.parentId === null) continue;

		const parentPath = pathByNodeId.get(node.parentId);

		if (parentPath === undefined) continue;

		const nameKey = createNameKey(node.name);
		const path = normalizeProjectPath(node.path) || createDefaultProjectPath(parentPath, node.name);
		const pathKey = createProjectPathKey(path);
		const siblingNames = seenChildNames.get(node.parentId) ?? new Set<string>();

		if (siblingNames.has(nameKey) || seenNodePaths.has(pathKey)) continue;

		seenNodeIds.add(node.id);
		seenNodePaths.add(pathKey);
		siblingNames.add(nameKey);
		seenChildNames.set(node.parentId, siblingNames);
		normalizedNodes.push({
			...node,
			description: normalizeProjectDescription(node.description),
			path,
			githubCredentialSecretId: normalizeRecordId(node.githubCredentialSecretId),
			tags: normalizeProjectTags(node.tags),
			repositories: filterUniqueRepositories(
				node.repositories,
				seenRepositoryPaths,
				seenRepositoryRemoteUrls
			)
		});
		pathByNodeId.set(node.id, path);
		for (const childIndex of groupIndexesByParentId.get(node.id) ?? []) {
			// Preserve the original scan's eligibility order and collision winners.
			pushScheduledNode(childIndex > index ? pendingIndexes : nextPassIndexes, childIndex);
		}
	}

	return normalizedNodes;
}

function pushScheduledNode(indexes: number[], value: number) {
	let position = indexes.length;
	indexes.push(value);
	while (position > 0) {
		const parent = Math.floor((position - 1) / 2);
		if (indexes[parent]! <= value) break;
		indexes[position] = indexes[parent]!;
		position = parent;
	}
	indexes[position] = value;
}

function popScheduledNode(indexes: number[]) {
	const first = indexes[0]!;
	const last = indexes.pop()!;
	if (indexes.length > 0) {
		let position = 0;
		while (position * 2 + 1 < indexes.length) {
			const left = position * 2 + 1;
			const right = left + 1;
			const child = right < indexes.length && indexes[right]! < indexes[left]! ? right : left;
			if (last <= indexes[child]!) break;
			indexes[position] = indexes[child]!;
			position = child;
		}
		indexes[position] = last;
	}
	return first;
}

function filterUniqueRepositories(
	repositories: readonly ProjectRepositoryLinkRecord[],
	seenRepositoryPaths: Set<string>,
	seenRepositoryRemoteUrls: Set<string>
) {
	const uniqueRepositories: ProjectRepositoryLinkRecord[] = [];

	for (const repository of repositories) {
		const pathKey =
			repository.path === null ? null : createRepositoryPathKey(repository.path);
		const remoteUrlKey =
			repository.remoteUrl === null ? null : createRepositoryRemoteUrlKey(repository.remoteUrl);

		if (
			(pathKey !== null && seenRepositoryPaths.has(pathKey)) ||
			(remoteUrlKey !== null && seenRepositoryRemoteUrls.has(remoteUrlKey))
		) {
			continue;
		}

		if (pathKey !== null) {
			seenRepositoryPaths.add(pathKey);
		}

		if (remoteUrlKey !== null) {
			seenRepositoryRemoteUrls.add(remoteUrlKey);
		}

		uniqueRepositories.push({
			...repository,
			upstreamRemoteUrl:
				repository.upstreamRemoteUrl === null
					? null
					: normalizeRepositoryRemoteUrl(repository.upstreamRemoteUrl) || null,
			githubCredentialSecretId: normalizeRecordId(repository.githubCredentialSecretId),
			favorite: repository.favorite === true,
			tags: normalizeProjectTags(repository.tags)
		});
	}

	return uniqueRepositories;
}

function parseProjectNodeRecord(value: unknown): ProjectNodeRecord | null {
	if (!isObjectRecord(value)) {
		return null;
	}

	const id = normalizeRecordId(value.id);
	const kind = normalizeProjectNodeKind(value.kind);
	const parentId = normalizeRecordId(value.parentId);
	const name = normalizeProjectName(readTrimmedString(value.name));
	const description = normalizeProjectDescription(readTrimmedString(value.description));
	const path = normalizeProjectPath(readTrimmedString(value.path));
	const githubCredentialSecretId = normalizeRecordId(value.githubCredentialSecretId);
	const tags = normalizeProjectTags(readStringArray(value.tags));
	const rawRepositories = Array.isArray(value.repositories) ? value.repositories : [];
	const repositories = rawRepositories.flatMap((rawRepository) => {
		const repository = parseRepositoryLinkRecord(rawRepository);

		return repository === null ? [] : [repository];
	});
	const createdAt = readTrimmedString(value.createdAt);
	const updatedAt = readTrimmedString(value.updatedAt);

	if (id === null || kind === null || name.length === 0) {
		return null;
	}

	return {
		id,
		kind,
		parentId: kind === 'project' ? null : parentId,
		name,
		description,
		path,
		githubCredentialSecretId,
		tags,
		repositories,
		createdAt: createdAt.length === 0 ? updatedAt : createdAt,
		updatedAt: updatedAt.length === 0 ? createdAt : updatedAt
	};
}

function parseRepositoryLinkRecord(value: unknown): ProjectRepositoryLinkRecord | null {
	if (!isObjectRecord(value)) {
		return null;
	}

	const id = normalizeRecordId(value.id);
	const name = normalizeRepositoryName(readTrimmedString(value.name));
	const path = normalizeRepositoryPath(readTrimmedString(value.path));
	const remoteUrl = normalizeRepositoryRemoteUrl(readTrimmedString(value.remoteUrl));
	const upstreamRemoteUrl = normalizeRepositoryRemoteUrl(readTrimmedString(value.upstreamRemoteUrl));
	const githubCredentialSecretId = normalizeRecordId(value.githubCredentialSecretId);
	const favorite = value.favorite === true;
	const tags = normalizeProjectTags(readStringArray(value.tags));
	const createdAt = readTrimmedString(value.createdAt);
	const updatedAt = readTrimmedString(value.updatedAt);

	if (id === null || name.length === 0 || (path.length === 0 && remoteUrl.length === 0)) {
		return null;
	}

	return {
		id,
		name,
		path: path.length === 0 ? null : path,
		remoteUrl: remoteUrl.length === 0 ? null : remoteUrl,
		upstreamRemoteUrl: upstreamRemoteUrl.length === 0 ? null : upstreamRemoteUrl,
		githubCredentialSecretId,
		favorite,
		tags,
		createdAt: createdAt.length === 0 ? updatedAt : createdAt,
		updatedAt: updatedAt.length === 0 ? createdAt : updatedAt
	};
}

function normalizeProjectNodeKind(value: unknown): ProjectNodeKind | null {
	return value === 'project' || value === 'group' ? value : null;
}

export function normalizeProjectName(value: string) {
	return value.trim().replace(/\s+/g, ' ').slice(0, PROJECT_NAME_MAX_LENGTH);
}

export function normalizeProjectDescription(value: string) {
	return value.trim().replace(/\s+/g, ' ').slice(0, PROJECT_DESCRIPTION_MAX_LENGTH);
}

export function normalizeProjectPath(value: string) {
	const trimmedPath = value.trim().replaceAll('\\', '/').replace(/^\/+|\/+$/gu, '');

	if (trimmedPath.length === 0) {
		return '';
	}

	const segments = trimmedPath.split('/').filter(Boolean);

	if (
		segments.length < 2 ||
		segments[0] !== 'projects' ||
		segments.some((segment) => segment === '.' || segment === '..')
	) {
		return '';
	}

	return segments.join('/').slice(0, PROJECT_NODE_PATH_MAX_LENGTH);
}

export function normalizeProjectTags(values: readonly string[]) {
	const tags: string[] = [];
	const tagKeys = new Set<string>();

	for (const value of values) {
		const tag = value
			.trim()
			.replace(/^#+/u, '')
			.replace(/\s+/gu, '-')
			.slice(0, PROJECT_TAG_MAX_LENGTH);
		const tagKey = createNameKey(tag);

		if (tag.length === 0 || tagKeys.has(tagKey)) {
			continue;
		}

		tags.push(tag);
		tagKeys.add(tagKey);

		if (tags.length >= PROJECT_TAGS_MAX_COUNT) {
			break;
		}
	}

	return tags;
}

export function normalizeRepositoryName(value: string) {
	return value.trim().replace(/\s+/g, ' ').slice(0, PROJECT_REPOSITORY_NAME_MAX_LENGTH);
}

export function normalizeRepositoryPath(value: string) {
	return normalizeWorkspacePathForStorage(value).slice(0, PROJECT_REPOSITORY_PATH_MAX_LENGTH);
}

export function normalizeRepositoryRemoteUrl(value: string) {
	const trimmedUrl = value.trim().slice(0, PROJECT_REPOSITORY_REMOTE_URL_MAX_LENGTH);

	return isValidRepositoryRemoteUrl(trimmedUrl) ? trimmedUrl : '';
}

export function normalizeRecordId(value: unknown) {
	const id = readTrimmedString(value);

	return id.length === 0 ? null : id;
}

function readProjectRegistryVersion(value: unknown) {
	return typeof value === 'number' && Number.isInteger(value) ? value : null;
}

export function createNameKey(name: string) {
	return name.toLocaleLowerCase('en-US');
}

export function createProjectPathKey(path: string) {
	return normalizeProjectPath(path).toLocaleLowerCase('en-US');
}

function createDefaultProjectPath(parentPath: string | null, name: string) {
	const segment = normalizeProjectPathSegment(name);

	return parentPath === null ? `projects/${segment}` : `${parentPath}/${segment}`;
}

function normalizeProjectPathSegment(value: string) {
	return createProjectFolderNameFromDisplayName(value, PROJECT_NAME_MAX_LENGTH);
}

export function createRepositoryPathKey(path: string) {
	return normalizeRepositoryPath(path).replaceAll('\\', '/').toLocaleLowerCase('en-US');
}

export function createRepositoryRemoteUrlKey(remoteUrl: string) {
	return normalizeRepositoryRemoteUrl(remoteUrl).replace(/\.git$/iu, '').toLocaleLowerCase('en-US');
}

function isValidRepositoryRemoteUrl(remoteUrl: string) {
	if (remoteUrl.length === 0 || remoteUrl.length > PROJECT_REPOSITORY_REMOTE_URL_MAX_LENGTH) {
		return false;
	}

	if (/\s/u.test(remoteUrl) || hasControlCharacter(remoteUrl)) {
		return false;
	}

	if (remoteUrl.includes('://')) {
		return isValidRepositoryUrlWithScheme(remoteUrl);
	}

	return isValidScpLikeRepositoryUrl(remoteUrl);
}

function isValidRepositoryUrlWithScheme(remoteUrl: string) {
	try {
		const url = new URL(remoteUrl);
		const allowedProtocol =
			url.protocol === 'https:' ||
			url.protocol === 'http:' ||
			url.protocol === 'ssh:' ||
			url.protocol === 'git:';

		if (!allowedProtocol || url.hostname.length === 0 || url.pathname.length <= 1) {
			return false;
		}

		if (
			(url.protocol === 'https:' || url.protocol === 'http:') &&
			(url.username.length > 0 || url.password.length > 0)
		) {
			return false;
		}

		return true;
	} catch {
		return false;
	}
}

function isValidScpLikeRepositoryUrl(remoteUrl: string) {
	const separatorIndex = remoteUrl.indexOf(':');

	if (separatorIndex <= 0 || separatorIndex === remoteUrl.length - 1) {
		return false;
	}

	const authority = remoteUrl.slice(0, separatorIndex);
	const path = remoteUrl.slice(separatorIndex + 1);
	const atIndex = authority.indexOf('@');

	if (atIndex <= 0 || atIndex === authority.length - 1) {
		return false;
	}

	return !path.startsWith('/') && path.length > 0 && !authority.includes('/');
}

function hasControlCharacter(value: string) {
	return [...value].some((character) => {
		const codePoint = character.codePointAt(0) ?? 0;

		return codePoint < 0x20 || codePoint === 0x7f;
	});
}

function readTrimmedString(value: unknown) {
	return typeof value === 'string' ? value.trim() : '';
}

function readStringArray(value: unknown) {
	return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}
