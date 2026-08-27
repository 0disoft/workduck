import type { AgentRegistry } from '$lib/agents/agent-registry';
import type { ProjectRegistry } from '$lib/projects/project-registry';
import type { ProjectRepositoryTaskRunRecord } from '$lib/projects/project-repository-task';
import type { QueueFileEntry } from '$lib/queue/queue-folder';
import type { ReferenceRegistry } from '$lib/references/reference-registry';

export type CommandPaletteItemKind =
	| 'command'
	| 'project'
	| 'group'
	| 'repository'
	| 'queue-work-order'
	| 'queue-result-report'
	| 'queue-proposal'
	| 'agent'
	| 'reference'
	| 'run'
	| 'artifact';

export interface CommandPaletteItem {
	readonly id: string;
	readonly kind: CommandPaletteItemKind;
	readonly title: string;
	readonly description: string;
	readonly href: string;
	readonly searchText: string;
}

export interface WorkspaceCommandPaletteIndexInput {
	readonly projectRegistry: ProjectRegistry;
	readonly agentRegistry: AgentRegistry;
	readonly referenceRegistry: ReferenceRegistry;
	readonly queueFiles: readonly QueueFileEntry[];
	readonly taskRuns: readonly ProjectRepositoryTaskRunRecord[];
}

interface RankedCommandPaletteItem {
	readonly item: CommandPaletteItem;
	readonly score: number;
	readonly sourceIndex: number;
}

export function buildWorkspaceCommandPaletteItems(
	input: WorkspaceCommandPaletteIndexInput
): readonly CommandPaletteItem[] {
	const items: CommandPaletteItem[] = [];
	const projectNodeById = new Map(input.projectRegistry.nodes.map((node) => [node.id, node]));

	for (const node of input.projectRegistry.nodes) {
		const parentName = node.parentId === null ? '' : (projectNodeById.get(node.parentId)?.name ?? '');
		items.push({
			id: `${node.kind}:${node.id}`,
			kind: node.kind,
			title: node.name,
			description: compactText([parentName, node.description, node.path].filter(Boolean).join(' · ')),
			href: '/',
			searchText: createSearchText([
				node.id,
				node.name,
				parentName,
				node.description,
				node.path,
				...node.tags
			])
		});

		for (const repository of node.repositories) {
			items.push({
				id: `repository:${repository.id}`,
				kind: 'repository',
				title: repository.name,
				description: compactText(
					[
						node.name,
						repository.path ?? '',
						repository.remoteUrl ?? repository.upstreamRemoteUrl ?? ''
					]
						.filter(Boolean)
						.join(' · ')
				),
				href: '/',
				searchText: createSearchText([
					repository.id,
					repository.name,
					node.name,
					repository.path ?? '',
					repository.remoteUrl ?? '',
					repository.upstreamRemoteUrl ?? '',
					...repository.tags
				])
			});
		}
	}

	for (const file of input.queueFiles) {
		const kind = mapQueueFileKind(file.kind);
		if (kind === null) {
			continue;
		}

		items.push({
			id: `queue:${file.relativePath}`,
			kind,
			title: stripQueueFileSuffix(file.fileName),
			description: file.relativePath,
			href: '/queue',
			searchText: createSearchText([file.fileName, file.relativePath, file.kind])
		});
	}

	for (const agent of input.agentRegistry.agents) {
		items.push({
			id: `agent:${agent.id}`,
			kind: 'agent',
			title: agent.name,
			description: compactText(
				[agent.executionProvider, agent.modelId ?? ''].filter(Boolean).join(' · ')
			),
			href: '/agents',
			searchText: createSearchText([
				agent.id,
				agent.name,
				agent.executionProvider,
				agent.modelId ?? ''
			])
		});
	}

	for (const reference of input.referenceRegistry.references) {
		items.push({
			id: `reference:${reference.id}`,
			kind: 'reference',
			title: reference.title,
			description: compactText(reference.sourceUrl || reference.content),
			href: '/references',
			searchText: createSearchText([
				reference.id,
				reference.title,
				reference.sourceUrl,
				reference.content,
				...reference.tags,
				...reference.projectIds,
				...reference.repositoryIds
			])
		});
	}

	for (const run of input.taskRuns) {
		const repositoryName = getPathLeaf(run.repositoryPath);
		items.push({
			id: `run:${run.id}`,
			kind: 'run',
			title: `${humanizeIdentifier(run.task)} · ${repositoryName}`,
			description: compactText([run.state, run.startedAt, run.command].join(' · ')),
			href: '/terminals',
			searchText: createSearchText([
				run.id,
				run.task,
				run.state,
				run.repositoryPath,
				run.command,
				run.outputTail ?? ''
			])
		});
	}

	return deduplicateCommandPaletteItems(items);
}

export function filterCommandPaletteItems(
	items: readonly CommandPaletteItem[],
	query: string,
	limit = 20
): readonly CommandPaletteItem[] {
	const normalizedQuery = normalizeSearchText(query);
	const boundedLimit = Number.isFinite(limit) ? Math.max(1, Math.trunc(limit)) : 20;

	if (normalizedQuery.length === 0) {
		return deduplicateCommandPaletteItems(items)
			.filter((item) => item.kind === 'command')
			.slice(0, boundedLimit);
	}

	const queryTokens = normalizedQuery.split(' ').filter(Boolean);
	const ranked = deduplicateCommandPaletteItems(items).flatMap((item, sourceIndex) => {
		const normalizedTitle = normalizeSearchText(item.title);
		const normalizedDescription = normalizeSearchText(item.description);
		const normalizedSearchText = normalizeSearchText(item.searchText);

		if (!queryTokens.every((token) => normalizedSearchText.includes(token))) {
			return [];
		}

		return [
			{
				item,
				score: scoreCommandPaletteItem(
					item,
					normalizedQuery,
					queryTokens,
					normalizedTitle,
					normalizedDescription
				),
				sourceIndex
			} satisfies RankedCommandPaletteItem
		];
	});

	return ranked
		.sort(
			(left, right) =>
				right.score - left.score ||
				left.sourceIndex - right.sourceIndex ||
				left.item.title.localeCompare(right.item.title)
		)
		.slice(0, boundedLimit)
		.map(({ item }) => item);
}

export function deduplicateCommandPaletteItems(
	items: readonly CommandPaletteItem[]
): readonly CommandPaletteItem[] {
	const seenIds = new Set<string>();
	const uniqueItems: CommandPaletteItem[] = [];

	for (const item of items) {
		if (seenIds.has(item.id)) {
			continue;
		}

		seenIds.add(item.id);
		uniqueItems.push(item);
	}

	return uniqueItems;
}

function scoreCommandPaletteItem(
	item: CommandPaletteItem,
	normalizedQuery: string,
	queryTokens: readonly string[],
	normalizedTitle: string,
	normalizedDescription: string
) {
	let score = item.kind === 'command' ? 20 : 0;

	if (normalizedTitle === normalizedQuery) {
		score += 1_000;
	} else if (normalizedTitle.startsWith(normalizedQuery)) {
		score += 700;
	} else if (normalizedTitle.includes(normalizedQuery)) {
		score += 420;
	} else if (normalizedDescription.includes(normalizedQuery)) {
		score += 180;
	}

	const titleWords = normalizedTitle.split(' ');
	for (const token of queryTokens) {
		if (normalizedTitle === token) {
			score += 160;
		} else if (normalizedTitle.startsWith(token)) {
			score += 120;
		} else if (titleWords.some((word) => word.startsWith(token))) {
			score += 90;
		} else if (normalizedTitle.includes(token)) {
			score += 60;
		} else if (normalizedDescription.includes(token)) {
			score += 25;
		} else {
			score += 10;
		}
	}

	return score;
}

function mapQueueFileKind(kind: QueueFileEntry['kind']): CommandPaletteItemKind | null {
	switch (kind) {
		case 'work-order':
			return 'queue-work-order';
		case 'result-report':
			return 'queue-result-report';
		case 'proposal':
			return 'queue-proposal';
		case 'unsupported':
			return null;
	}
}

function stripQueueFileSuffix(fileName: string) {
	return fileName
		.replace(/\.workduck-(?:work-order|result-report|proposal)\.json$/u, '')
		.replace(/\.json$/u, '');
}

function createSearchText(values: readonly string[]) {
	return normalizeSearchText(values.filter(Boolean).join(' '));
}

function normalizeSearchText(value: string) {
	return value.normalize('NFKC').toLocaleLowerCase().replace(/\s+/gu, ' ').trim();
}

function compactText(value: string, maxLength = 180) {
	const normalized = value.replace(/\s+/gu, ' ').trim();

	return normalized.length <= maxLength ? normalized : `${normalized.slice(0, maxLength - 1)}…`;
}

function humanizeIdentifier(value: string) {
	return value.replaceAll('-', ' ');
}

function getPathLeaf(path: string) {
	const segments = path.split(/[\\/]/u).filter(Boolean);

	return segments.at(-1) ?? path;
}
