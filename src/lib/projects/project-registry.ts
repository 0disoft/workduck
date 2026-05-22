import { isObjectRecord } from '$lib/shared/object-record';
import { normalizeWorkspacePathForStorage } from '$lib/workspaces/workspace-path-format';
import { createProjectFolderNameFromDisplayName } from './project-folder-name';

export const WORKDUCK_PROJECT_REGISTRY_VERSION = 1;
export const PROJECT_NAME_MAX_LENGTH = 80;
export const PROJECT_DESCRIPTION_MAX_LENGTH = 160;
export const PROJECT_NODE_PATH_MAX_LENGTH = 1024;
export const PROJECT_TAG_MAX_LENGTH = 32;
export const PROJECT_TAGS_MAX_COUNT = 12;
export const PROJECT_REPOSITORY_NAME_MAX_LENGTH = 120;
export const PROJECT_REPOSITORY_PATH_MAX_LENGTH = 1024;
export const PROJECT_REPOSITORY_REMOTE_URL_MAX_LENGTH = 2048;

export type ProjectNodeKind = 'project' | 'group';

export type ProjectRegistryError =
	| 'project-name-required'
	| 'project-name-duplicate'
	| 'project-parent-not-found'
	| 'project-parent-invalid'
	| 'project-node-not-found'
	| 'project-path-required'
	| 'project-path-duplicate'
	| 'project-repository-target-invalid'
	| 'project-repository-not-found'
	| 'project-repository-name-required'
	| 'project-repository-source-required'
	| 'project-repository-path-required'
	| 'project-repository-path-outside-workspace'
	| 'project-repository-path-duplicate'
	| 'project-repository-remote-url-invalid'
	| 'project-repository-remote-url-duplicate';

export interface ProjectRepositoryLinkRecord {
	readonly id: string;
	readonly name: string;
	readonly path: string | null;
	readonly remoteUrl: string | null;
	readonly githubCredentialSecretId: string | null;
	readonly tags: readonly string[];
	readonly createdAt: string;
	readonly updatedAt: string;
}

export interface ProjectNodeRecord {
	readonly id: string;
	readonly kind: ProjectNodeKind;
	readonly parentId: string | null;
	readonly name: string;
	readonly description: string;
	readonly path: string;
	readonly githubCredentialSecretId: string | null;
	readonly tags: readonly string[];
	readonly repositories: readonly ProjectRepositoryLinkRecord[];
	readonly createdAt: string;
	readonly updatedAt: string;
}

export interface ProjectRegistry {
	readonly version: typeof WORKDUCK_PROJECT_REGISTRY_VERSION;
	readonly workspaceId: string;
	readonly nodes: readonly ProjectNodeRecord[];
	readonly updatedAt: string;
}

export interface ProjectNodeInput {
	readonly kind: ProjectNodeKind;
	readonly parentId?: string | null;
	readonly name: string;
	readonly description?: string;
	readonly path: string;
	readonly githubCredentialSecretId?: string | null;
	readonly tags?: readonly string[];
}

export interface ProjectRepositoryLinkInput {
	readonly nodeId: string;
	readonly name: string;
	readonly path?: string | null;
	readonly remoteUrl?: string | null;
	readonly githubCredentialSecretId?: string | null;
	readonly tags?: readonly string[];
}

export interface ProjectRepositoryRemoveInput {
	readonly nodeId: string;
	readonly repositoryId: string;
}

export interface ProjectRepositoryPathUpdateInput {
	readonly nodeId: string;
	readonly repositoryId: string;
	readonly path: string;
}

export interface ProjectNodeTagsUpdateInput {
	readonly nodeId: string;
	readonly tags: readonly string[];
}

export interface ProjectNodeDescriptionUpdateInput {
	readonly nodeId: string;
	readonly description: string;
}

export interface ProjectRepositoryTagsUpdateInput {
	readonly nodeId: string;
	readonly repositoryId: string;
	readonly tags: readonly string[];
}

export interface ProjectNodeGithubCredentialUpdateInput {
	readonly nodeId: string;
	readonly githubCredentialSecretId: string | null;
}

export interface ProjectRepositoryGithubCredentialUpdateInput {
	readonly nodeId: string;
	readonly repositoryId: string;
	readonly githubCredentialSecretId: string | null;
}

export type ProjectRegistryMutationResult =
	| {
			readonly ok: true;
			readonly registry: ProjectRegistry;
	  }
	| {
			readonly ok: false;
			readonly registry: ProjectRegistry;
			readonly error: ProjectRegistryError;
	  };

export interface ProjectTreeRow {
	readonly node: ProjectNodeRecord;
	readonly depth: number;
}

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

export function addProjectNode(
	registry: ProjectRegistry,
	input: ProjectNodeInput,
	now = new Date()
): ProjectRegistryMutationResult {
	const normalizedRegistry = normalizeProjectRegistry(registry, registry.workspaceId);
	const name = normalizeProjectName(input.name);
	const description = normalizeProjectDescription(input.description ?? '');
	const path = normalizeProjectPath(input.path);
	const githubCredentialSecretId = normalizeRecordId(input.githubCredentialSecretId ?? null);
	const tags = normalizeProjectTags(input.tags ?? []);
	const timestamp = now.toISOString();

	if (name.length === 0) {
		return { ok: false, registry: normalizedRegistry, error: 'project-name-required' };
	}

	if (path.length === 0) {
		return { ok: false, registry: normalizedRegistry, error: 'project-path-required' };
	}

	const parentId = input.kind === 'project' ? null : normalizeRecordId(input.parentId);

	if (input.kind === 'group') {
		if (parentId === null) {
			return { ok: false, registry: normalizedRegistry, error: 'project-parent-not-found' };
		}

		const parent = normalizedRegistry.nodes.find((node) => node.id === parentId);

		if (parent === undefined) {
			return { ok: false, registry: normalizedRegistry, error: 'project-parent-not-found' };
		}

		if (parent.kind !== 'project') {
			return { ok: false, registry: normalizedRegistry, error: 'project-parent-invalid' };
		}
	}

	if (hasSiblingWithName(normalizedRegistry.nodes, parentId, name)) {
		return { ok: false, registry: normalizedRegistry, error: 'project-name-duplicate' };
	}

	if (hasNodeWithPath(normalizedRegistry.nodes, path)) {
		return { ok: false, registry: normalizedRegistry, error: 'project-path-duplicate' };
	}

	const nextNode = {
		id: createProjectRecordId('project-node'),
		kind: input.kind,
		parentId,
		name,
		description,
		path,
		githubCredentialSecretId,
		tags,
		repositories: [],
		createdAt: timestamp,
		updatedAt: timestamp
	} satisfies ProjectNodeRecord;

	return {
		ok: true,
		registry: {
			...normalizedRegistry,
			nodes: [...normalizedRegistry.nodes, nextNode],
			updatedAt: timestamp
		}
	};
}

export function addProjectRepositoryLink(
	registry: ProjectRegistry,
	input: ProjectRepositoryLinkInput,
	now = new Date()
): ProjectRegistryMutationResult {
	const normalizedRegistry = normalizeProjectRegistry(registry, registry.workspaceId);
	const name = normalizeRepositoryName(input.name);
	const path = normalizeRepositoryPath(input.path ?? '');
	const remoteUrl = normalizeRepositoryRemoteUrl(input.remoteUrl ?? '');
	const githubCredentialSecretId = normalizeRecordId(input.githubCredentialSecretId ?? null);
	const tags = normalizeProjectTags(input.tags ?? []);
	const targetNode = normalizedRegistry.nodes.find((node) => node.id === input.nodeId);

	if (targetNode === undefined) {
		return { ok: false, registry: normalizedRegistry, error: 'project-node-not-found' };
	}

	if (targetNode.kind !== 'group') {
		return { ok: false, registry: normalizedRegistry, error: 'project-repository-target-invalid' };
	}

	if (name.length === 0) {
		return { ok: false, registry: normalizedRegistry, error: 'project-repository-name-required' };
	}

	if (path.length === 0 && remoteUrl.length === 0) {
		return { ok: false, registry: normalizedRegistry, error: 'project-repository-source-required' };
	}

	if ((input.remoteUrl ?? '').trim().length > 0 && remoteUrl.length === 0) {
		return { ok: false, registry: normalizedRegistry, error: 'project-repository-remote-url-invalid' };
	}

	if (
		path.length > 0 &&
		normalizedRegistry.nodes.some(
			(node) =>
				node.kind === 'group' &&
				node.repositories.some(
					(repository) =>
						repository.path !== null && createRepositoryPathKey(repository.path) === createRepositoryPathKey(path)
				)
		)
	) {
		return { ok: false, registry: normalizedRegistry, error: 'project-repository-path-duplicate' };
	}

	if (
		remoteUrl.length > 0 &&
		normalizedRegistry.nodes.some(
			(node) =>
				node.kind === 'group' &&
				node.repositories.some(
					(repository) =>
						repository.remoteUrl !== null &&
						createRepositoryRemoteUrlKey(repository.remoteUrl) === createRepositoryRemoteUrlKey(remoteUrl)
				)
		)
	) {
		return {
			ok: false,
			registry: normalizedRegistry,
			error: 'project-repository-remote-url-duplicate'
		};
	}

	const timestamp = now.toISOString();
	const nextRepository = {
		id: createProjectRecordId('repository'),
		name,
		path: path.length === 0 ? null : path,
		remoteUrl: remoteUrl.length === 0 ? null : remoteUrl,
		githubCredentialSecretId,
		tags,
		createdAt: timestamp,
		updatedAt: timestamp
	} satisfies ProjectRepositoryLinkRecord;

	return {
		ok: true,
		registry: {
			...normalizedRegistry,
			nodes: normalizedRegistry.nodes.map((node) =>
				node.id === targetNode.id
					? {
							...node,
							repositories: [...node.repositories, nextRepository],
							updatedAt: timestamp
						}
					: node
			),
			updatedAt: timestamp
		}
	};
}

export function setProjectNodeTags(
	registry: ProjectRegistry,
	input: ProjectNodeTagsUpdateInput,
	now = new Date()
): ProjectRegistryMutationResult {
	const normalizedRegistry = normalizeProjectRegistry(registry, registry.workspaceId);
	const targetNode = normalizedRegistry.nodes.find((node) => node.id === input.nodeId);

	if (targetNode === undefined) {
		return { ok: false, registry: normalizedRegistry, error: 'project-node-not-found' };
	}

	const timestamp = now.toISOString();
	const tags = normalizeProjectTags(input.tags);

	return {
		ok: true,
		registry: {
			...normalizedRegistry,
			nodes: normalizedRegistry.nodes.map((node) =>
				node.id === targetNode.id
					? {
							...node,
							tags,
							updatedAt: timestamp
						}
					: node
			),
			updatedAt: timestamp
		}
	};
}

export function setProjectNodeDescription(
	registry: ProjectRegistry,
	input: ProjectNodeDescriptionUpdateInput,
	now = new Date()
): ProjectRegistryMutationResult {
	const normalizedRegistry = normalizeProjectRegistry(registry, registry.workspaceId);
	const targetNode = normalizedRegistry.nodes.find((node) => node.id === input.nodeId);

	if (targetNode === undefined) {
		return { ok: false, registry: normalizedRegistry, error: 'project-node-not-found' };
	}

	const timestamp = now.toISOString();
	const description = normalizeProjectDescription(input.description);

	return {
		ok: true,
		registry: {
			...normalizedRegistry,
			nodes: normalizedRegistry.nodes.map((node) =>
				node.id === targetNode.id
					? {
							...node,
							description,
							updatedAt: timestamp
						}
					: node
			),
			updatedAt: timestamp
		}
	};
}

export function setProjectRepositoryTags(
	registry: ProjectRegistry,
	input: ProjectRepositoryTagsUpdateInput,
	now = new Date()
): ProjectRegistryMutationResult {
	const normalizedRegistry = normalizeProjectRegistry(registry, registry.workspaceId);
	const targetNode = normalizedRegistry.nodes.find((node) => node.id === input.nodeId);

	if (targetNode === undefined) {
		return { ok: false, registry: normalizedRegistry, error: 'project-node-not-found' };
	}

	if (targetNode.kind !== 'group') {
		return { ok: false, registry: normalizedRegistry, error: 'project-repository-target-invalid' };
	}

	if (!targetNode.repositories.some((repository) => repository.id === input.repositoryId)) {
		return { ok: false, registry: normalizedRegistry, error: 'project-repository-not-found' };
	}

	const timestamp = now.toISOString();
	const tags = normalizeProjectTags(input.tags);

	return {
		ok: true,
		registry: {
			...normalizedRegistry,
			nodes: normalizedRegistry.nodes.map((node) =>
				node.id === targetNode.id
					? {
							...node,
							repositories: node.repositories.map((repository) =>
								repository.id === input.repositoryId
									? {
											...repository,
											tags,
											updatedAt: timestamp
										}
									: repository
							),
							updatedAt: timestamp
						}
					: node
			),
			updatedAt: timestamp
		}
	};
}

export function setProjectRepositoryLocalPath(
	registry: ProjectRegistry,
	input: ProjectRepositoryPathUpdateInput,
	now = new Date()
): ProjectRegistryMutationResult {
	const normalizedRegistry = normalizeProjectRegistry(registry, registry.workspaceId);
	const path = normalizeRepositoryPath(input.path);
	const targetNode = normalizedRegistry.nodes.find((node) => node.id === input.nodeId);

	if (targetNode === undefined) {
		return { ok: false, registry: normalizedRegistry, error: 'project-node-not-found' };
	}

	if (targetNode.kind !== 'group') {
		return { ok: false, registry: normalizedRegistry, error: 'project-repository-target-invalid' };
	}

	if (!targetNode.repositories.some((repository) => repository.id === input.repositoryId)) {
		return { ok: false, registry: normalizedRegistry, error: 'project-repository-not-found' };
	}

	if (path.length === 0) {
		return { ok: false, registry: normalizedRegistry, error: 'project-repository-path-required' };
	}

	const pathKey = createRepositoryPathKey(path);

	if (
		normalizedRegistry.nodes.some(
			(node) =>
				node.kind === 'group' &&
				node.repositories.some(
					(repository) =>
						repository.id !== input.repositoryId &&
						repository.path !== null &&
						createRepositoryPathKey(repository.path) === pathKey
				)
		)
	) {
		return { ok: false, registry: normalizedRegistry, error: 'project-repository-path-duplicate' };
	}

	const timestamp = now.toISOString();

	return {
		ok: true,
		registry: {
			...normalizedRegistry,
			nodes: normalizedRegistry.nodes.map((node) =>
				node.id === targetNode.id
					? {
							...node,
							repositories: node.repositories.map((repository) =>
								repository.id === input.repositoryId
									? {
											...repository,
											path,
											updatedAt: timestamp
										}
									: repository
							),
							updatedAt: timestamp
						}
					: node
			),
			updatedAt: timestamp
		}
	};
}

export function setProjectNodeGithubCredential(
	registry: ProjectRegistry,
	input: ProjectNodeGithubCredentialUpdateInput,
	now = new Date()
): ProjectRegistryMutationResult {
	const normalizedRegistry = normalizeProjectRegistry(registry, registry.workspaceId);
	const targetNode = normalizedRegistry.nodes.find((node) => node.id === input.nodeId);

	if (targetNode === undefined) {
		return { ok: false, registry: normalizedRegistry, error: 'project-node-not-found' };
	}

	const timestamp = now.toISOString();
	const githubCredentialSecretId = normalizeRecordId(input.githubCredentialSecretId);

	return {
		ok: true,
		registry: {
			...normalizedRegistry,
			nodes: normalizedRegistry.nodes.map((node) =>
				node.id === targetNode.id
					? {
							...node,
							githubCredentialSecretId,
							updatedAt: timestamp
						}
					: node
			),
			updatedAt: timestamp
		}
	};
}

export function setProjectRepositoryGithubCredential(
	registry: ProjectRegistry,
	input: ProjectRepositoryGithubCredentialUpdateInput,
	now = new Date()
): ProjectRegistryMutationResult {
	const normalizedRegistry = normalizeProjectRegistry(registry, registry.workspaceId);
	const targetNode = normalizedRegistry.nodes.find((node) => node.id === input.nodeId);

	if (targetNode === undefined) {
		return { ok: false, registry: normalizedRegistry, error: 'project-node-not-found' };
	}

	if (targetNode.kind !== 'group') {
		return { ok: false, registry: normalizedRegistry, error: 'project-repository-target-invalid' };
	}

	if (!targetNode.repositories.some((repository) => repository.id === input.repositoryId)) {
		return { ok: false, registry: normalizedRegistry, error: 'project-repository-not-found' };
	}

	const timestamp = now.toISOString();
	const githubCredentialSecretId = normalizeRecordId(input.githubCredentialSecretId);

	return {
		ok: true,
		registry: {
			...normalizedRegistry,
			nodes: normalizedRegistry.nodes.map((node) =>
				node.id === targetNode.id
					? {
							...node,
							repositories: node.repositories.map((repository) =>
								repository.id === input.repositoryId
									? {
											...repository,
											githubCredentialSecretId,
											updatedAt: timestamp
										}
									: repository
							),
							updatedAt: timestamp
						}
					: node
			),
			updatedAt: timestamp
		}
	};
}

export function removeProjectNode(
	registry: ProjectRegistry,
	nodeId: string,
	now = new Date()
): ProjectRegistryMutationResult {
	const normalizedRegistry = normalizeProjectRegistry(registry, registry.workspaceId);
	const targetNode = normalizedRegistry.nodes.find((node) => node.id === nodeId);

	if (targetNode === undefined) {
		return { ok: false, registry: normalizedRegistry, error: 'project-node-not-found' };
	}

	const nodeIdsToRemove = collectProjectNodeSubtreeIds(normalizedRegistry.nodes, targetNode.id);
	const timestamp = now.toISOString();

	return {
		ok: true,
		registry: {
			...normalizedRegistry,
			nodes: normalizedRegistry.nodes.filter((node) => !nodeIdsToRemove.has(node.id)),
			updatedAt: timestamp
		}
	};
}

export function removeProjectRepositoryLink(
	registry: ProjectRegistry,
	input: ProjectRepositoryRemoveInput,
	now = new Date()
): ProjectRegistryMutationResult {
	const normalizedRegistry = normalizeProjectRegistry(registry, registry.workspaceId);
	const targetNode = normalizedRegistry.nodes.find((node) => node.id === input.nodeId);

	if (targetNode === undefined) {
		return { ok: false, registry: normalizedRegistry, error: 'project-node-not-found' };
	}

	if (targetNode.kind !== 'group') {
		return { ok: false, registry: normalizedRegistry, error: 'project-repository-target-invalid' };
	}

	if (!targetNode.repositories.some((repository) => repository.id === input.repositoryId)) {
		return { ok: false, registry: normalizedRegistry, error: 'project-repository-not-found' };
	}

	const timestamp = now.toISOString();

	return {
		ok: true,
		registry: {
			...normalizedRegistry,
			nodes: normalizedRegistry.nodes.map((node) =>
				node.id === targetNode.id
					? {
							...node,
							repositories: node.repositories.filter(
								(repository) => repository.id !== input.repositoryId
							),
							updatedAt: timestamp
						}
					: node
			),
			updatedAt: timestamp
		}
	};
}

export function createProjectTreeRows(nodes: readonly ProjectNodeRecord[]): readonly ProjectTreeRow[] {
	const rootNodes = nodes.filter((node) => node.kind === 'project' && node.parentId === null);
	const rows: ProjectTreeRow[] = [];

	for (const rootNode of rootNodes) {
		rows.push({ node: rootNode, depth: 0 });

		for (const childNode of nodes.filter((node) => node.parentId === rootNode.id)) {
			rows.push({ node: childNode, depth: 1 });
		}
	}

	return rows;
}

function collectProjectNodeSubtreeIds(nodes: readonly ProjectNodeRecord[], rootNodeId: string) {
	const nodeIds = new Set<string>([rootNodeId]);
	let changed = true;

	while (changed) {
		changed = false;

		for (const node of nodes) {
			if (node.parentId !== null && nodeIds.has(node.parentId) && !nodeIds.has(node.id)) {
				nodeIds.add(node.id);
				changed = true;
			}
		}
	}

	return nodeIds;
}

function normalizeProjectNodes(nodes: readonly ProjectNodeRecord[]): readonly ProjectNodeRecord[] {
	const rootNodes: ProjectNodeRecord[] = [];
	const childNodes: ProjectNodeRecord[] = [];
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
		rootNodes.push({
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
	}

	const keptRootIds = new Set(rootNodes.map((node) => node.id));
	const pathByNodeId = new Map(rootNodes.map((node) => [node.id, node.path]));
	const seenChildNames = new Map<string, Set<string>>();

	for (const node of nodes) {
		if (seenNodeIds.has(node.id) || node.kind !== 'group' || node.parentId === null) {
			continue;
		}

		if (!keptRootIds.has(node.parentId)) {
			continue;
		}

		const nameKey = createNameKey(node.name);
		const parentPath = pathByNodeId.get(node.parentId);

		if (parentPath === undefined) {
			continue;
		}

		const path = normalizeProjectPath(node.path) || createDefaultProjectPath(parentPath, node.name);
		const pathKey = createProjectPathKey(path);
		const siblingNames = seenChildNames.get(node.parentId) ?? new Set<string>();

		if (siblingNames.has(nameKey) || seenNodePaths.has(pathKey)) {
			continue;
		}

		seenNodeIds.add(node.id);
		seenNodePaths.add(pathKey);
		siblingNames.add(nameKey);
		seenChildNames.set(node.parentId, siblingNames);
		childNodes.push({
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
	}

	return [...rootNodes, ...childNodes];
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
			githubCredentialSecretId: normalizeRecordId(repository.githubCredentialSecretId),
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
	const githubCredentialSecretId = normalizeRecordId(value.githubCredentialSecretId);
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
		githubCredentialSecretId,
		tags,
		createdAt: createdAt.length === 0 ? updatedAt : createdAt,
		updatedAt: updatedAt.length === 0 ? createdAt : updatedAt
	};
}

function hasSiblingWithName(
	nodes: readonly ProjectNodeRecord[],
	parentId: string | null,
	name: string
) {
	const nameKey = createNameKey(name);

	return nodes.some((node) => node.parentId === parentId && createNameKey(node.name) === nameKey);
}

function hasNodeWithPath(nodes: readonly ProjectNodeRecord[], path: string) {
	const pathKey = createProjectPathKey(path);

	return nodes.some((node) => createProjectPathKey(node.path) === pathKey);
}

function normalizeProjectNodeKind(value: unknown): ProjectNodeKind | null {
	return value === 'project' || value === 'group' ? value : null;
}

function normalizeProjectName(value: string) {
	return value.trim().replace(/\s+/g, ' ').slice(0, PROJECT_NAME_MAX_LENGTH);
}

function normalizeProjectDescription(value: string) {
	return value.trim().replace(/\s+/g, ' ').slice(0, PROJECT_DESCRIPTION_MAX_LENGTH);
}

function normalizeProjectPath(value: string) {
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

function normalizeProjectTags(values: readonly string[]) {
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

function normalizeRepositoryName(value: string) {
	return value.trim().replace(/\s+/g, ' ').slice(0, PROJECT_REPOSITORY_NAME_MAX_LENGTH);
}

function normalizeRepositoryPath(value: string) {
	return normalizeWorkspacePathForStorage(value).slice(0, PROJECT_REPOSITORY_PATH_MAX_LENGTH);
}

function normalizeRepositoryRemoteUrl(value: string) {
	const trimmedUrl = value.trim().slice(0, PROJECT_REPOSITORY_REMOTE_URL_MAX_LENGTH);

	return isValidRepositoryRemoteUrl(trimmedUrl) ? trimmedUrl : '';
}

function normalizeRecordId(value: unknown) {
	const id = readTrimmedString(value);

	return id.length === 0 ? null : id;
}

function createProjectRecordId(prefix: string) {
	if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
		return crypto.randomUUID();
	}

	return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function createNameKey(name: string) {
	return name.toLocaleLowerCase('en-US');
}

function createProjectPathKey(path: string) {
	return normalizeProjectPath(path).toLocaleLowerCase('en-US');
}

function createDefaultProjectPath(parentPath: string | null, name: string) {
	const segment = normalizeProjectPathSegment(name);

	return parentPath === null ? `projects/${segment}` : `${parentPath}/${segment}`;
}

function normalizeProjectPathSegment(value: string) {
	return createProjectFolderNameFromDisplayName(value, PROJECT_NAME_MAX_LENGTH);
}

function createRepositoryPathKey(path: string) {
	return normalizeRepositoryPath(path).replaceAll('\\', '/').toLocaleLowerCase('en-US');
}

function createRepositoryRemoteUrlKey(remoteUrl: string) {
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
