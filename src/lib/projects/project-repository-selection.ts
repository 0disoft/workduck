import type { ProjectNodeRecord } from './project-registry';

export interface ProjectRepositorySelectionOption {
	readonly id: string;
	readonly name: string;
	readonly label: string;
	readonly description: string;
	readonly tags: readonly string[];
	readonly searchText: string;
}

export function createProjectRepositorySelectionOptions(
	nodes: readonly ProjectNodeRecord[]
): readonly ProjectRepositorySelectionOption[] {
	const projectById = new Map(
		nodes
			.filter((node) => node.kind === 'project')
			.map((node) => [node.id, node])
	);
	const options: ProjectRepositorySelectionOption[] = [];
	const seenRepositoryIds = new Set<string>();

	for (const group of nodes.filter((node) => node.kind === 'group')) {
		const project = group.parentId === null ? undefined : projectById.get(group.parentId);
		const groupPath = [project?.name, group.name].filter(Boolean).join(' / ');

		for (const repository of group.repositories) {
			if (seenRepositoryIds.has(repository.id)) {
				continue;
			}

			const label = [groupPath, repository.name].filter(Boolean).join(' / ');
			const description = repository.tags.join(', ');
			const searchText = [
				label,
				repository.path ?? '',
				repository.remoteUrl ?? '',
				repository.name,
				...repository.tags
			]
				.join(' ')
				.toLocaleLowerCase('en-US');

			options.push({
				id: repository.id,
				name: repository.name,
				label,
				description,
				tags: repository.tags,
				searchText
			});
			seenRepositoryIds.add(repository.id);
		}
	}

	return options.sort((left, right) =>
		left.label.localeCompare(right.label, undefined, {
			numeric: true,
			sensitivity: 'base'
		})
	);
}

export function filterProjectRepositorySelectionOptions(
	options: readonly ProjectRepositorySelectionOption[],
	query: string
) {
	const normalizedQuery = query.trim().toLocaleLowerCase('en-US');

	if (normalizedQuery.length === 0) {
		return options;
	}

	return options.filter((option) => option.searchText.includes(normalizedQuery));
}
