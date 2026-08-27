import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { createEmptyAgentEvaluationSummary } from '$lib/agents/agent-evaluation';
import {
	buildWorkspaceCommandPaletteItems,
	deduplicateCommandPaletteItems,
	filterCommandPaletteItems,
	type CommandPaletteItem
} from './command-palette-index';

describe('command palette index', () => {
	test('ranks an exact title ahead of metadata-only matches', () => {
		const items: readonly CommandPaletteItem[] = [
			createItem('reference:1', 'reference', 'Deployment notes', 'billing release deployment'),
			createItem('project:1', 'project', 'Billing', 'deployment notes'),
			createItem('repository:1', 'repository', 'billing-api', 'deployment worker')
		];

		const results = filterCommandPaletteItems(items, 'billing', 10);

		assert.deepEqual(
			results.map((item) => item.id),
			['project:1', 'repository:1', 'reference:1']
		);
	});

	test('requires every query token to match the same item', () => {
		const items: readonly CommandPaletteItem[] = [
			createItem('repository:1', 'repository', 'billing-api', 'github production'),
			createItem('repository:2', 'repository', 'billing-worker', 'local only'),
			createItem('reference:1', 'reference', 'GitHub notes', 'unrelated project')
		];

		const results = filterCommandPaletteItems(items, 'billing github', 10);

		assert.deepEqual(results.map((item) => item.id), ['repository:1']);
	});

	test('indexes projects, repositories, queue items, agents, references, and runs', () => {
		const items = buildWorkspaceCommandPaletteItems({
			projectRegistry: {
				version: 1,
				workspaceId: 'workspace-1',
				nodes: [
					{
						id: 'project-1',
						kind: 'project',
						parentId: null,
						name: 'Billing',
						description: 'Subscription services',
						path: 'billing',
						githubCredentialSecretId: null,
						tags: ['revenue'],
						repositories: [
							{
								id: 'repository-1',
								name: 'billing-api',
								path: 'C:\\workspace\\billing-api',
								remoteUrl: 'https://github.com/example/billing-api',
								upstreamRemoteUrl: null,
								githubCredentialSecretId: null,
								favorite: true,
								tags: ['typescript'],
								createdAt: '2026-08-21T00:00:00Z',
								updatedAt: '2026-08-21T00:00:00Z'
							}
						],
						createdAt: '2026-08-21T00:00:00Z',
						updatedAt: '2026-08-21T00:00:00Z'
					}
				],
				updatedAt: '2026-08-21T00:00:00Z'
			},
			agentRegistry: {
				version: 6,
				revision: 1,
				workspaceId: 'workspace-1',
				agents: [
					{
						id: 'agent-1',
						name: 'Release reviewer',
						environmentSecretId: 'secret-1',
						personaId: null,
						executionProvider: 'openai',
						modelId: 'gpt-release',
						evaluationSummary: createEmptyAgentEvaluationSummary(),
						evaluationKeys: [],
						evaluationResetAt: null,
						createdAt: '2026-08-21T00:00:00Z',
						updatedAt: '2026-08-21T00:00:00Z'
					}
				],
				updatedAt: '2026-08-21T00:00:00Z'
			},
			referenceRegistry: {
				version: 1,
				workspaceId: 'workspace-1',
				references: [
					{
						id: 'reference-1',
						title: 'Billing release checklist',
						sourceUrl: 'https://example.com/checklist',
						tags: ['release'],
						projectIds: ['project-1'],
						repositoryIds: ['repository-1'],
						content: 'Verify migrations before publishing.',
						createdAt: '2026-08-21T00:00:00Z',
						updatedAt: '2026-08-21T00:00:00Z'
					}
				],
				updatedAt: '2026-08-21T00:00:00Z'
			},
			queueFiles: [
				{
					relativePath: 'queue/work-orders/release.workduck-work-order.json',
					fileName: 'release.workduck-work-order.json',
					kind: 'work-order'
				}
			],
			taskRuns: [
				{
					id: 'run-1',
					task: 'build',
					repositoryPath: 'C:\\workspace\\billing-api',
					command: 'bun run build',
					state: 'succeeded',
					exitCode: 0,
					startedAt: '2026-08-21T00:00:00Z',
					finishedAt: '2026-08-21T00:01:00Z',
					outputTail: 'done',
					recordPath: 'C:\\workspace\\.workduck\\run.json'
				}
			]
		});

		assert.equal(filterCommandPaletteItems(items, 'github typescript', 10)[0]?.kind, 'repository');
		assert.equal(filterCommandPaletteItems(items, 'release work order', 10)[0]?.kind, 'queue-work-order');
		assert.equal(filterCommandPaletteItems(items, 'gpt release', 10)[0]?.kind, 'agent');
		assert.equal(filterCommandPaletteItems(items, 'migration checklist', 10)[0]?.kind, 'reference');
		assert.equal(filterCommandPaletteItems(items, 'bun build succeeded', 10)[0]?.kind, 'run');
	});

	test('keeps the first result for duplicate stable IDs', () => {
		const first = createItem('command:projects', 'command', 'Projects', 'first');
		const second = createItem('command:projects', 'command', 'Projects duplicate', 'second');

		assert.deepEqual(deduplicateCommandPaletteItems([first, second]), [first]);
	});
});

function createItem(
	id: string,
	kind: CommandPaletteItem['kind'],
	title: string,
	description: string
): CommandPaletteItem {
	return {
		id,
		kind,
		title,
		description,
		href: '/',
		searchText: `${title} ${description}`
	};
}
