import type { ProjectContextMenuTarget, ProjectDialogState } from './project-board-types';
import type { ProjectNodeRecord } from './project-registry';

export function getProjectDialogTargetNode(
	nodes: readonly ProjectNodeRecord[],
	dialog: ProjectDialogState | null
) {
	const targetNodeId = dialog?.targetNodeId ?? null;

	return targetNodeId === null
		? null
		: nodes.find((node) => node.id === targetNodeId) ?? null;
}

export function getProjectContextMenuNode(
	nodes: readonly ProjectNodeRecord[],
	target: ProjectContextMenuTarget | null
) {
	if (target?.type !== 'node') {
		return null;
	}

	return nodes.find((candidateNode) => candidateNode.id === target.nodeId) ?? null;
}

export function getProjectRepositoryTarget(
	nodes: readonly ProjectNodeRecord[],
	nodeId: string,
	repositoryId: string
) {
	const node = nodes.find((candidateNode) => candidateNode.id === nodeId);

	if (node === undefined || node.kind !== 'group') {
		return null;
	}

	const repository = node.repositories.find(
		(candidateRepository) => candidateRepository.id === repositoryId
	);

	return repository === undefined ? null : { node, repository };
}

export function getProjectContextMenuRepository(
	nodes: readonly ProjectNodeRecord[],
	target: ProjectContextMenuTarget | null
) {
	if (target?.type !== 'repository') {
		return null;
	}

	return getProjectRepositoryTarget(nodes, target.nodeId, target.repositoryId);
}
