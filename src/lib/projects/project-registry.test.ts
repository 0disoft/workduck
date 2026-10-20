import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
	addProjectNode,
	addProjectRepositoryLink,
	createEmptyProjectRegistry,
	createProjectTreeRows,
	parseProjectRegistry,
	parseStoredProjectRegistry,
	serializeProjectRegistry,
	setProjectRepositoryFavorite,
	setProjectRepositoryRemoteUrl,
	type ProjectNodeRecord
} from './project-registry';

const fixtureTimestamp = '2026-10-04T00:00:00.000Z';

function fixtureNode(id: string, parentId: string | null): ProjectNodeRecord {
	return {
		id, kind: parentId === null ? 'project' : 'group', parentId,
		name: id, description: '', path: '', githubCredentialSecretId: null,
		tags: [], repositories: [], createdAt: fixtureTimestamp, updatedAt: fixtureTimestamp
	};
}

function parseFixture(nodes: readonly ProjectNodeRecord[]) {
	return parseProjectRegistry(JSON.stringify({
		version: 1, workspaceId: 'old-workspace', nodes, updatedAt: fixtureTimestamp
	}), 'workspace-test');
}

describe('project registry canonicalization', () => {
	test('creates rows for deep groups without overflowing the call stack', () => {
		const nodes = [fixtureNode('root', null)];
		for (let index = 0; index < 12000; index += 1) {
			nodes.push(fixtureNode(`group-${index}`, index === 0 ? 'root' : `group-${index - 1}`));
		}
		const rows = createProjectTreeRows(nodes.toReversed());
		assert.equal(rows.length, nodes.length);
		assert.deepEqual(rows.map(row => row.node.id), nodes.map(node => node.id));
		assert.equal(rows.at(-1)?.depth, 12000);
	});

	test('preserves preorder and root order while ignoring repeated IDs and unreachable groups', () => {
		const nodes = [fixtureNode('root-a', null), fixtureNode('root-b', null),
			fixtureNode('first', 'root-a'), fixtureNode('second', 'root-a'),
			fixtureNode('nested', 'first'), fixtureNode('nested', 'root-b'),
			fixtureNode('orphan', 'missing')];
		assert.deepEqual(createProjectTreeRows(nodes).map(row => [row.node.id, row.depth]), [
			['root-a', 0], ['first', 1], ['nested', 2], ['second', 1], ['root-b', 0]
		]);
	});

	test('normalizes a deep reversed hierarchy without truncation or recursion', () => {
		const nodes = [fixtureNode('root', null)];
		for (let index = 0; index < 6000; index += 1) {
			nodes.push({
				...fixtureNode(`group-${index}`, index === 0 ? 'root' : `group-${index - 1}`),
				path: `projects/group-${index}`
			});
		}
		const parsed = parseFixture(nodes.toReversed());
		assert.equal(parsed.nodes.length, nodes.length);
		assert.deepEqual(parsed.nodes.map(node => node.id), nodes.map(node => node.id));
	});

	test('resolves reversed ancestors and drops orphaned or cyclic groups', () => {
		const parsed = parseFixture([
			fixtureNode('leaf', 'middle'), fixtureNode('middle', 'group'),
			fixtureNode('group', 'root'), fixtureNode('root', null),
			fixtureNode('orphan', 'missing'), fixtureNode('cycle-a', 'cycle-b'),
			fixtureNode('cycle-b', 'cycle-a')
		]);
		assert.deepEqual(parsed.nodes.map(node => [node.id, node.path]), [
			['root', 'projects/root'], ['group', 'projects/root/group'],
			['middle', 'projects/root/group/middle'], ['leaf', 'projects/root/group/middle/leaf']
		]);
		assert.equal(parsed.workspaceId, 'workspace-test');
		assert.deepEqual(parseProjectRegistry(serializeProjectRegistry(parsed), parsed.workspaceId), parsed);
	});

	test('keeps eligibility order when competing branches share a repository path', () => {
		const repository = {
			id: 'repository', name: 'Repository', path: 'C:/workspace/repository',
			remoteUrl: null, upstreamRemoteUrl: null, githubCredentialSecretId: null,
			favorite: true, tags: ['#TS', 'ts', '  local tools  '],
			createdAt: fixtureTimestamp, updatedAt: fixtureTimestamp
		};
		const parsed = parseFixture([
			{ ...fixtureNode('leaf-a', 'group-a'), repositories: [repository] },
			fixtureNode('group-a', 'root'), fixtureNode('group-b', 'root'),
			{ ...fixtureNode('leaf-b', 'group-b'), repositories: [repository] },
			fixtureNode('root', null)
		]);
		assert.deepEqual(parsed.nodes.map(node => node.id), ['root', 'group-a', 'group-b', 'leaf-b', 'leaf-a']);
		assert.deepEqual(parsed.nodes.find(node => node.id === 'leaf-a')?.repositories, []);
		assert.deepEqual(parsed.nodes.find(node => node.id === 'leaf-b')?.repositories[0]?.tags, ['TS', 'local-tools']);
	});

	test('keeps the first eligible node ID while rejecting sibling-name and path collisions', () => {
		const parsed = parseFixture([
			fixtureNode('duplicate', 'unavailable'), fixtureNode('root', null),
			fixtureNode('duplicate', 'root'),
			{ ...fixtureNode('same-name', 'root'), name: 'DUPLICATE' },
			{ ...fixtureNode('same-path', 'root'), path: 'projects/root/duplicate' },
			fixtureNode('independent', 'root')
		]);
		assert.deepEqual(parsed.nodes.map(node => node.id), ['root', 'duplicate', 'independent']);
		assert.equal(parsed.nodes[1]?.parentId, 'root');
	});

	test('rejects stored registries when normalization would discard nodes or repositories', () => {
		const root = fixtureNode('root', null);
		for (const value of [
			{ version: 1 },
			{ version: 1, nodes: 'invalid' },
			{ version: 1, nodes: [null] },
			{ version: 1, nodes: [root, root] },
			{ version: 1, nodes: [fixtureNode('orphan', 'missing')] },
			{ version: 1, nodes: [{ ...root, repositories: [null] }] },
			{ version: 1, nodes: [{ ...root, repositories: {} }] }
		]) {
			assert.deepEqual(parseStoredProjectRegistry(JSON.stringify(value), 'workspace-test'), {
				ok: false, error: 'project-registry-json-invalid'
			});
		}
		const supported = { version: 1, nodes: [root], updatedAt: fixtureTimestamp };
		const accepted = parseStoredProjectRegistry(JSON.stringify(supported), 'workspace-test');
		assert.equal(accepted.ok, true);
		if (accepted.ok) assert.equal(accepted.registry.nodes.length, 1);
		assert.equal(parseStoredProjectRegistry(JSON.stringify(createEmptyProjectRegistry('workspace-test')), 'workspace-test').ok, true);
	});

	test('keeps strict storage errors distinct from the forgiving domain parser', () => {
		assert.deepEqual(parseStoredProjectRegistry('{', 'workspace-test'), { ok: false, error: 'project-registry-json-invalid' });
		assert.deepEqual(parseStoredProjectRegistry('{"version":2}', 'workspace-test'), { ok: false, error: 'project-registry-version-unsupported' });
		assert.deepEqual(parseProjectRegistry('{', 'workspace-test').nodes, []);
	});
});

function createRegistryWithGroup() {
	const registry = createEmptyProjectRegistry('workspace-test');
	const projectResult = addProjectNode(registry, {
		kind: 'project',
		name: 'Project',
		path: 'projects/project'
	});

	if (!projectResult.ok) {
		throw new Error(projectResult.error);
	}

	const project = projectResult.registry.nodes.find((node) => node.kind === 'project');

	if (project === undefined) {
		throw new Error('project missing');
	}

	const groupResult = addProjectNode(projectResult.registry, {
		kind: 'group',
		parentId: project.id,
		name: 'Group',
		path: 'projects/project/group'
	});

	if (!groupResult.ok) {
		throw new Error(groupResult.error);
	}

	const group = groupResult.registry.nodes.find((node) => node.kind === 'group');

	if (group === undefined) {
		throw new Error('group missing');
	}

	return { registry: groupResult.registry, group };
}

describe('setProjectRepositoryRemoteUrl', () => {
	test('adds a remote URL to an existing folder repository link', () => {
		const { registry, group } = createRegistryWithGroup();
		const repositoryResult = addProjectRepositoryLink(registry, {
			nodeId: group.id,
			name: 'example',
			path: 'C:\\workspace\\projects\\project\\group\\example'
		});

		if (!repositoryResult.ok) {
			throw new Error(repositoryResult.error);
		}

		const repository = repositoryResult.registry.nodes
			.find((node) => node.id === group.id)
			?.repositories.find((candidate) => candidate.name === 'example');

		if (repository === undefined) {
			throw new Error('repository missing');
		}

		const result = setProjectRepositoryRemoteUrl(repositoryResult.registry, {
			nodeId: group.id,
			repositoryId: repository.id,
			remoteUrl: 'https://github.com/example/example.git'
		});

		assert.equal(result.ok, true);

		if (result.ok) {
			const updatedRepository = result.registry.nodes
				.find((node) => node.id === group.id)
				?.repositories.find((candidate) => candidate.id === repository.id);

			assert.equal(updatedRepository?.remoteUrl, 'https://github.com/example/example.git');
			assert.equal(updatedRepository?.path, repository.path);
		}
	});

	test('does not clear the only source for a remote-only repository link', () => {
		const { registry, group } = createRegistryWithGroup();
		const repositoryResult = addProjectRepositoryLink(registry, {
			nodeId: group.id,
			name: 'example',
			remoteUrl: 'https://github.com/example/example.git'
		});

		if (!repositoryResult.ok) {
			throw new Error(repositoryResult.error);
		}

		const repository = repositoryResult.registry.nodes
			.find((node) => node.id === group.id)
			?.repositories.find((candidate) => candidate.name === 'example');

		if (repository === undefined) {
			throw new Error('repository missing');
		}

		const result = setProjectRepositoryRemoteUrl(repositoryResult.registry, {
			nodeId: group.id,
			repositoryId: repository.id,
			remoteUrl: ''
		});

		assert.equal(result.ok, false);

		if (!result.ok) {
			assert.equal(result.error, 'project-repository-source-required');
		}
	});
});

describe('setProjectRepositoryFavorite', () => {
	test('toggles a repository favorite flag without moving the repository link', () => {
		const { registry, group } = createRegistryWithGroup();
		const repositoryResult = addProjectRepositoryLink(registry, {
			nodeId: group.id,
			name: 'example',
			path: 'C:\\workspace\\projects\\project\\group\\example'
		});

		if (!repositoryResult.ok) {
			throw new Error(repositoryResult.error);
		}

		const repository = repositoryResult.registry.nodes
			.find((node) => node.id === group.id)
			?.repositories.find((candidate) => candidate.name === 'example');

		if (repository === undefined) {
			throw new Error('repository missing');
		}

		const result = setProjectRepositoryFavorite(repositoryResult.registry, {
			nodeId: group.id,
			repositoryId: repository.id,
			favorite: true
		});

		assert.equal(result.ok, true);

		if (result.ok) {
			const updatedGroup = result.registry.nodes.find((node) => node.id === group.id);
			const updatedRepository = updatedGroup?.repositories.find(
				(candidate) => candidate.id === repository.id
			);

			assert.equal(updatedRepository?.favorite, true);
			assert.equal(updatedRepository?.path, repository.path);
			assert.equal(updatedGroup?.repositories.length, 1);
		}
	});

	test('defaults missing favorite flags to false when parsing older registries', () => {
		const parsed = parseProjectRegistry(
			JSON.stringify({
				version: 1,
				workspaceId: 'workspace-test',
				updatedAt: '2026-07-09T00:00:00.000Z',
				nodes: [
					{
						id: 'project-old',
						kind: 'project',
						parentId: null,
						name: 'Project',
						description: '',
						path: 'projects/project',
						githubCredentialSecretId: null,
						tags: [],
						repositories: [],
						createdAt: '2026-07-09T00:00:00.000Z',
						updatedAt: '2026-07-09T00:00:00.000Z'
					},
					{
						id: 'group-old',
						kind: 'group',
						parentId: 'project-old',
						name: 'Group',
						description: '',
						path: 'projects/project/group',
						githubCredentialSecretId: null,
						tags: [],
						repositories: [
							{
								id: 'repository-old',
								name: 'example',
								path: 'C:\\workspace\\projects\\project\\group\\example',
								remoteUrl: null,
								upstreamRemoteUrl: null,
								githubCredentialSecretId: null,
								tags: [],
								createdAt: '2026-07-09T00:00:00.000Z',
								updatedAt: '2026-07-09T00:00:00.000Z'
							}
						],
						createdAt: '2026-07-09T00:00:00.000Z',
						updatedAt: '2026-07-09T00:00:00.000Z'
					}
				]
			}),
			'workspace-test'
		);

		const repository = parsed.nodes
			.find((node) => node.id === 'group-old')
			?.repositories.find((candidate) => candidate.id === 'repository-old');

		assert.equal(repository?.favorite, false);
	});
});
