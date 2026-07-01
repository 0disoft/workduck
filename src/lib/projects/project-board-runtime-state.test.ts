import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import type { ProjectRepositoryGitStatus } from './project-board-selectors';
import { createProjectRepositoryRemoteUrlBackfills } from './project-board-runtime-state';
import {
	addProjectNode,
	addProjectRepositoryLink,
	createEmptyProjectRegistry,
	type ProjectRegistry
} from './project-registry';

function createGitPathNotFoundStatus(): ProjectRepositoryGitStatus {
	return {
		isGitRepository: false,
		hasRemote: false,
		originUrl: null,
		upstreamRemoteUrl: null,
		aheadCount: 0,
		behindCount: 0,
		hasUncommittedChanges: false,
		branch: null,
		error: 'project-repository-git-path-not-found'
	};
}

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

function addRepository(
	registry: ProjectRegistry,
	input: {
		readonly nodeId: string;
		readonly name: string;
		readonly path?: string;
		readonly remoteUrl?: string;
	}
) {
	const result = addProjectRepositoryLink(registry, input);

	if (!result.ok) {
		throw new Error(result.error);
	}

	const repository = result.registry.nodes
		.find((node) => node.id === input.nodeId)
		?.repositories.find((candidate) => candidate.name === input.name);

	if (repository === undefined) {
		throw new Error(`repository missing: ${input.name}`);
	}

	return { registry: result.registry, repository };
}

describe('createProjectRepositoryRemoteUrlBackfills', () => {
	test('infers a missing folder repository remote URL from a single GitHub owner in the project', () => {
		const { registry, group } = createRegistryWithGroup();
		const seeded = addRepository(registry, {
			nodeId: group.id,
			name: 'seed',
			remoteUrl: 'https://github.com/0disoft/seed'
		});
		const missing = addRepository(seeded.registry, {
			nodeId: group.id,
			name: 'akraz',
			path: 'C:\\workspace\\projects\\project\\group\\akraz'
		});

		const backfills = createProjectRepositoryRemoteUrlBackfills(missing.registry, {
			[missing.repository.id]: createGitPathNotFoundStatus()
		});

		assert.deepEqual(backfills, [
			{
				repositoryId: missing.repository.id,
				remoteUrl: 'https://github.com/0disoft/akraz',
				upstreamRemoteUrl: null
			}
		]);
	});

	test('does not infer a remote URL when a project has multiple GitHub owners', () => {
		const { registry, group } = createRegistryWithGroup();
		const firstSeed = addRepository(registry, {
			nodeId: group.id,
			name: 'first-seed',
			remoteUrl: 'https://github.com/0disoft/first-seed'
		});
		const secondSeed = addRepository(firstSeed.registry, {
			nodeId: group.id,
			name: 'second-seed',
			remoteUrl: 'https://github.com/example/second-seed'
		});
		const missing = addRepository(secondSeed.registry, {
			nodeId: group.id,
			name: 'akraz',
			path: 'C:\\workspace\\projects\\project\\group\\akraz'
		});

		const backfills = createProjectRepositoryRemoteUrlBackfills(missing.registry, {
			[missing.repository.id]: createGitPathNotFoundStatus()
		});

		assert.deepEqual(backfills, []);
	});
});
