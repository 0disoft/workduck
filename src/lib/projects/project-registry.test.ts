import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
	addProjectNode,
	addProjectRepositoryLink,
	createEmptyProjectRegistry,
	setProjectRepositoryRemoteUrl
} from './project-registry';

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
