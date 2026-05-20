import { openProjectFolderPath, openProjectNodeFolder } from './project-folder';
import type { ProjectFormError } from './project-board-errors';
import {
	getProjectContextMenuNode,
	getProjectRepositoryTarget
} from './project-board-targets';
import type {
	ProjectContextMenuTarget,
	ProjectDeleteCandidate,
	ProjectGithubCredentialEditorTarget,
	ProjectTagEditorTarget
} from './project-board-types';
import type { ProjectNodeRecord } from './project-registry';

type ResolveResult<T> =
	| {
			readonly ok: true;
			readonly value: T;
	  }
	| {
			readonly ok: false;
			readonly error: ProjectFormError | null;
	  };

export async function openProjectContextFolder(
	input: {
		readonly workspacePath: string;
		readonly nodes: readonly ProjectNodeRecord[];
		readonly target: ProjectContextMenuTarget | null;
		readonly isOpening: boolean;
	},
	context: {
		readonly setIsOpening: (isOpening: boolean) => void;
		readonly setFormError: (error: ProjectFormError | null) => void;
		readonly setStatus: (status: string | null) => void;
	}
) {
	if (input.target === null || input.isOpening) {
		return;
	}

	context.setIsOpening(true);
	context.setFormError(null);
	context.setStatus(null);

	try {
		const result =
			input.target.type === 'node'
				? await openNodeFolder(input.workspacePath, input.nodes, input.target.nodeId)
				: await openRepositoryFolder(input.nodes, input.target.nodeId, input.target.repositoryId);

		if (!result.ok) {
			context.setFormError(result.error);
			return;
		}

		context.setStatus('Folder opened.');
	} finally {
		context.setIsOpening(false);
	}
}

export function resolveContextDeleteCandidate(
	nodes: readonly ProjectNodeRecord[],
	target: ProjectContextMenuTarget | null
): ResolveResult<ProjectDeleteCandidate> {
	if (target === null) {
		return { ok: false, error: null };
	}

	if (target.type === 'node') {
		const node = getProjectContextMenuNode(nodes, target);

		return node === null
			? { ok: false, error: 'project-node-not-found' }
			: { ok: true, value: { type: 'node', node } };
	}

	const repositoryTarget = getProjectRepositoryTarget(nodes, target.nodeId, target.repositoryId);

	return repositoryTarget === null
		? { ok: false, error: 'project-repository-not-found' }
		: { ok: true, value: { type: 'repository', ...repositoryTarget } };
}

export function resolveContextTagEditorTarget(
	nodes: readonly ProjectNodeRecord[],
	target: ProjectContextMenuTarget | null
): ResolveResult<ProjectTagEditorTarget> {
	return resolveNodeOrRepositoryTarget(nodes, target);
}

export function resolveContextGithubCredentialEditorTarget(
	nodes: readonly ProjectNodeRecord[],
	target: ProjectContextMenuTarget | null
): ResolveResult<ProjectGithubCredentialEditorTarget> {
	return resolveNodeOrRepositoryTarget(nodes, target);
}

export function resolveContextDescriptionEditorTarget(
	nodes: readonly ProjectNodeRecord[],
	target: ProjectContextMenuTarget | null
): ResolveResult<ProjectNodeRecord> {
	if (target?.type !== 'node') {
		return { ok: false, error: null };
	}

	const node = getProjectContextMenuNode(nodes, target);

	return node === null
		? { ok: false, error: 'project-node-not-found' }
		: { ok: true, value: node };
}

function resolveNodeOrRepositoryTarget(
	nodes: readonly ProjectNodeRecord[],
	target: ProjectContextMenuTarget | null
) {
	if (target === null) {
		return { ok: false, error: null } as const;
	}

	if (target.type === 'node') {
		const node = getProjectContextMenuNode(nodes, target);

		return node === null
			? ({ ok: false, error: 'project-node-not-found' } as const)
			: ({ ok: true, value: { type: 'node', node } } as const);
	}

	const repositoryTarget = getProjectRepositoryTarget(nodes, target.nodeId, target.repositoryId);

	return repositoryTarget === null
		? ({ ok: false, error: 'project-repository-not-found' } as const)
		: ({ ok: true, value: { type: 'repository', ...repositoryTarget } } as const);
}

async function openNodeFolder(
	workspacePath: string,
	nodes: readonly ProjectNodeRecord[],
	nodeId: string
) {
	const node = nodes.find((candidateNode) => candidateNode.id === nodeId);

	return node === undefined
		? ({ ok: false, error: 'project-node-not-found' } as const)
		: openProjectNodeFolder(workspacePath, node.path);
}

async function openRepositoryFolder(
	nodes: readonly ProjectNodeRecord[],
	nodeId: string,
	repositoryId: string
) {
	const target = getProjectRepositoryTarget(nodes, nodeId, repositoryId);

	return target === null || target.repository.path === null
		? ({ ok: false, error: 'project-repository-not-found' } as const)
		: openProjectFolderPath(target.repository.path);
}
