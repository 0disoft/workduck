/* llmnav/1 module
id=workduck.projects.registry-domain
role=Define and enforce versioned project, group, and repository registry normalization, hierarchy, and immutable mutations.
owns=project registry domain|project hierarchy validation|repository link mutations
excludes=registry storage transport|Git repository operations
search=project registry model|validate project hierarchy|mutate repository links
invariant=Every successful parse or mutation passes through the same normalization rules before returning a versioned registry.
stability=contract
*/
import {
	type ProjectRepositoryLinkRecord,
	type ProjectNodeRecord,
	type ProjectRegistry,
	type ProjectNodeInput,
	type ProjectRepositoryLinkInput,
	type ProjectRepositoryRemoveInput,
	type ProjectRepositoryPathUpdateInput,
	type ProjectRepositoryRemoteUrlUpdateInput,
	type ProjectRepositoryRemoteUrlBackfillInput,
	type ProjectRepositoryFavoriteUpdateInput,
	type ProjectNodeTagsUpdateInput,
	type ProjectNodeDescriptionUpdateInput,
	type ProjectNodeNameUpdateInput,
	type ProjectNodePathUpdateInput,
	type ProjectRepositoryTagsUpdateInput,
	type ProjectNodeGithubCredentialUpdateInput,
	type ProjectRepositoryGithubCredentialUpdateInput,
	type ProjectRegistryMutationResult,
	type ProjectRegistryBackfillResult,
	type ProjectTreeRow
} from './project-schema';
import {
	normalizeProjectRegistry,
	normalizeProjectName,
	normalizeProjectDescription,
	normalizeProjectPath,
	normalizeProjectTags,
	normalizeRepositoryName,
	normalizeRepositoryPath,
	normalizeRepositoryRemoteUrl,
	normalizeRecordId,
	createNameKey,
	createProjectPathKey,
	createRepositoryPathKey,
	createRepositoryRemoteUrlKey
} from './project-registry-normalization';

export * from './project-schema';
export {
	createEmptyProjectRegistry,
	parseProjectRegistry,
	parseStoredProjectRegistry,
	normalizeStoredProjectRegistry,
	normalizeProjectRegistry,
	serializeProjectRegistry
} from './project-registry-normalization';

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

		if (parent.kind !== 'project' && parent.kind !== 'group') {
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
	const upstreamRemoteUrl = normalizeRepositoryRemoteUrl(input.upstreamRemoteUrl ?? '');
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

	if ((input.upstreamRemoteUrl ?? '').trim().length > 0 && upstreamRemoteUrl.length === 0) {
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
		upstreamRemoteUrl: upstreamRemoteUrl.length === 0 ? null : upstreamRemoteUrl,
		githubCredentialSecretId,
		favorite: false,
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

export function setProjectNodeName(
	registry: ProjectRegistry,
	input: ProjectNodeNameUpdateInput,
	now = new Date()
): ProjectRegistryMutationResult {
	const normalizedRegistry = normalizeProjectRegistry(registry, registry.workspaceId);
	const targetNode = normalizedRegistry.nodes.find((node) => node.id === input.nodeId);

	if (targetNode === undefined) {
		return { ok: false, registry: normalizedRegistry, error: 'project-node-not-found' };
	}

	const name = normalizeProjectName(input.name);

	if (name.length === 0) {
		return { ok: false, registry: normalizedRegistry, error: 'project-name-required' };
	}

	if (hasSiblingWithName(normalizedRegistry.nodes, targetNode.parentId, name, targetNode.id)) {
		return { ok: false, registry: normalizedRegistry, error: 'project-name-duplicate' };
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
							name,
							updatedAt: timestamp
						}
					: node
			),
			updatedAt: timestamp
		}
	};
}

export function setProjectNodePath(
	registry: ProjectRegistry,
	input: ProjectNodePathUpdateInput,
	now = new Date()
): ProjectRegistryMutationResult {
	const normalizedRegistry = normalizeProjectRegistry(registry, registry.workspaceId);
	const targetNode = normalizedRegistry.nodes.find((node) => node.id === input.nodeId);

	if (targetNode === undefined) {
		return { ok: false, registry: normalizedRegistry, error: 'project-node-not-found' };
	}

	const path = normalizeProjectPath(input.path);

	if (path.length === 0) {
		return { ok: false, registry: normalizedRegistry, error: 'project-path-required' };
	}

	if (hasNodeWithPath(normalizedRegistry.nodes, path, targetNode.id)) {
		return { ok: false, registry: normalizedRegistry, error: 'project-path-duplicate' };
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
							path,
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

export function setProjectRepositoryFavorite(
	registry: ProjectRegistry,
	input: ProjectRepositoryFavoriteUpdateInput,
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
							repositories: node.repositories.map((repository) =>
								repository.id === input.repositoryId
									? {
											...repository,
											favorite: input.favorite,
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

export function setProjectRepositoryRemoteUrl(
	registry: ProjectRegistry,
	input: ProjectRepositoryRemoteUrlUpdateInput,
	now = new Date()
): ProjectRegistryMutationResult {
	const normalizedRegistry = normalizeProjectRegistry(registry, registry.workspaceId);
	const remoteUrl = normalizeRepositoryRemoteUrl(input.remoteUrl ?? '');
	const targetNode = normalizedRegistry.nodes.find((node) => node.id === input.nodeId);

	if (targetNode === undefined) {
		return { ok: false, registry: normalizedRegistry, error: 'project-node-not-found' };
	}

	if (targetNode.kind !== 'group') {
		return { ok: false, registry: normalizedRegistry, error: 'project-repository-target-invalid' };
	}

	const targetRepository = targetNode.repositories.find(
		(repository) => repository.id === input.repositoryId
	);

	if (targetRepository === undefined) {
		return { ok: false, registry: normalizedRegistry, error: 'project-repository-not-found' };
	}

	if ((input.remoteUrl ?? '').trim().length > 0 && remoteUrl.length === 0) {
		return { ok: false, registry: normalizedRegistry, error: 'project-repository-remote-url-invalid' };
	}

	if (remoteUrl.length === 0 && targetRepository.path === null) {
		return { ok: false, registry: normalizedRegistry, error: 'project-repository-source-required' };
	}

	if (remoteUrl.length > 0) {
		const remoteUrlKey = createRepositoryRemoteUrlKey(remoteUrl);

		if (
			normalizedRegistry.nodes.some(
				(node) =>
					node.kind === 'group' &&
					node.repositories.some(
						(repository) =>
							repository.id !== input.repositoryId &&
							repository.remoteUrl !== null &&
							createRepositoryRemoteUrlKey(repository.remoteUrl) === remoteUrlKey
					)
			)
		) {
			return {
				ok: false,
				registry: normalizedRegistry,
				error: 'project-repository-remote-url-duplicate'
			};
		}
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
											remoteUrl: remoteUrl.length === 0 ? null : remoteUrl,
											upstreamRemoteUrl:
												remoteUrl.length === 0 ? null : repository.upstreamRemoteUrl,
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

export function backfillProjectRepositoryRemoteUrls(
	registry: ProjectRegistry,
	inputs: readonly ProjectRepositoryRemoteUrlBackfillInput[],
	now = new Date()
): ProjectRegistryBackfillResult {
	const normalizedRegistry = normalizeProjectRegistry(registry, registry.workspaceId);

	if (inputs.length === 0) {
		return { registry: normalizedRegistry, changed: false };
	}

	const inputByRepositoryId = new Map(
		inputs.map((input) => [
			input.repositoryId,
			{
				remoteUrl: normalizeRepositoryRemoteUrl(input.remoteUrl ?? ''),
				upstreamRemoteUrl: normalizeRepositoryRemoteUrl(input.upstreamRemoteUrl ?? '')
			}
		])
	);
	const seenRepositoryRemoteUrls = new Set<string>();

	for (const node of normalizedRegistry.nodes) {
		if (node.kind !== 'group') {
			continue;
		}

		for (const repository of node.repositories) {
			if (repository.remoteUrl !== null) {
				seenRepositoryRemoteUrls.add(createRepositoryRemoteUrlKey(repository.remoteUrl));
			}
		}
	}

	const timestamp = now.toISOString();
	let changed = false;

	const nodes = normalizedRegistry.nodes.map((node) => {
		if (node.kind !== 'group') {
			return node;
		}

		let nodeChanged = false;
		const repositories = node.repositories.map((repository) => {
			if (repository.remoteUrl !== null) {
				return repository;
			}

			const input = inputByRepositoryId.get(repository.id);

			if (input === undefined || input.remoteUrl.length === 0) {
				return repository;
			}

			const remoteUrlKey = createRepositoryRemoteUrlKey(input.remoteUrl);

			if (seenRepositoryRemoteUrls.has(remoteUrlKey)) {
				return repository;
			}

			seenRepositoryRemoteUrls.add(remoteUrlKey);
			nodeChanged = true;
			changed = true;

			return {
				...repository,
				remoteUrl: input.remoteUrl,
				upstreamRemoteUrl:
					repository.upstreamRemoteUrl ??
					(input.upstreamRemoteUrl.length === 0 ? null : input.upstreamRemoteUrl),
				updatedAt: timestamp
			};
		});

		return nodeChanged
			? {
					...node,
					repositories,
					updatedAt: timestamp
				}
			: node;
	});

	return {
		registry: changed
			? {
					...normalizedRegistry,
					nodes,
					updatedAt: timestamp
				}
			: normalizedRegistry,
		changed
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
	const childNodesByParentId = groupProjectNodesByParentId(nodes);
	const rows: ProjectTreeRow[] = [];
	const visitedNodeIds = new Set<string>();

	for (const node of rootNodes) {
		appendProjectTreeRows(rows, childNodesByParentId, visitedNodeIds, node, 0);
	}

	return rows;
}

function appendProjectTreeRows(
	rows: ProjectTreeRow[],
	childNodesByParentId: ReadonlyMap<string, readonly ProjectNodeRecord[]>,
	visitedNodeIds: Set<string>,
	node: ProjectNodeRecord,
	depth: number
) {
	if (visitedNodeIds.has(node.id)) {
		return;
	}

	visitedNodeIds.add(node.id);
	rows.push({ node, depth });

	for (const childNode of childNodesByParentId.get(node.id) ?? []) {
		appendProjectTreeRows(rows, childNodesByParentId, visitedNodeIds, childNode, depth + 1);
	}
}

function groupProjectNodesByParentId(nodes: readonly ProjectNodeRecord[]) {
	const childNodesByParentId = new Map<string, ProjectNodeRecord[]>();

	for (const node of nodes) {
		if (node.parentId === null) {
			continue;
		}

		const childNodes = childNodesByParentId.get(node.parentId) ?? [];
		childNodes.push(node);
		childNodesByParentId.set(node.parentId, childNodes);
	}

	return childNodesByParentId;
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

function hasSiblingWithName(
	nodes: readonly ProjectNodeRecord[],
	parentId: string | null,
	name: string,
	ignoreNodeId: string | null = null
) {
	const nameKey = createNameKey(name);

	return nodes.some(
		(node) =>
			node.id !== ignoreNodeId &&
			node.parentId === parentId &&
			createNameKey(node.name) === nameKey
	);
}

function hasNodeWithPath(
	nodes: readonly ProjectNodeRecord[],
	path: string,
	ignoreNodeId: string | null = null
) {
	const pathKey = createProjectPathKey(path);

	return nodes.some(
		(node) => node.id !== ignoreNodeId && createProjectPathKey(node.path) === pathKey
	);
}

function createProjectRecordId(prefix: string) {
	if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
		return crypto.randomUUID();
	}

	return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
