import type { WorkduckLanguageId } from '$lib/i18n/workduck-language';
import { enqueueRepositoryCommitWorkOrder } from '$lib/queue/repository-commit-work-order';
import type { QueueFolderError } from '$lib/queue/queue-folder';
import type { ProjectRepositoryGitStatus } from './project-board-selectors';
import type { ProjectNodeRecord, ProjectRepositoryLinkRecord } from './project-registry';

export function canQueueProjectRepositoryCommitWorkOrder(input: {
	readonly repository: ProjectRepositoryLinkRecord;
	readonly gitStatus: ProjectRepositoryGitStatus | undefined;
	readonly isRepositoryPathInsideWorkspace: boolean;
	readonly isRepositoryBusy: boolean;
}) {
	return (
		input.repository.path !== null &&
		input.isRepositoryPathInsideWorkspace &&
		input.gitStatus?.isGitRepository === true &&
		input.gitStatus.hasUncommittedChanges &&
		!input.isRepositoryBusy
	);
}

export async function queueProjectRepositoryCommitWorkOrder(
	input: {
		readonly workspaceId: string;
		readonly workspacePath: string;
		readonly nodes: readonly ProjectNodeRecord[];
		readonly node: ProjectNodeRecord;
		readonly repository: ProjectRepositoryLinkRecord;
		readonly languageId: WorkduckLanguageId;
		readonly queuedMessageTemplate: string;
	},
	context: {
		readonly canQueueRepositoryCommitWorkOrder: (
			repository: ProjectRepositoryLinkRecord
		) => boolean;
		readonly setCommitWorkOrderTargetRepositoryId: (repositoryId: string | null) => void;
		readonly setFormError: (error: null) => void;
		readonly setQueueFolderError: (error: QueueFolderError | null) => void;
		readonly setStatus: (status: string | null) => void;
	}
) {
	const { node, repository } = input;

	if (!context.canQueueRepositoryCommitWorkOrder(repository) || repository.path === null) {
		return;
	}

	context.setCommitWorkOrderTargetRepositoryId(repository.id);
	context.setFormError(null);
	context.setQueueFolderError(null);
	context.setStatus(null);

	try {
		const rootProjectId = resolveRootProjectId(input.nodes, node);
		const result = await enqueueRepositoryCommitWorkOrder({
			workspaceId: input.workspaceId,
			workspacePath: input.workspacePath,
			repositoryName: repository.name,
			repositoryPath: repository.path,
			source: 'project',
			responseLanguage: input.languageId,
			projectIds: rootProjectId === null ? [] : [rootProjectId]
		});

		if (!result.ok) {
			context.setQueueFolderError(result.error);
			return;
		}

		context.setStatus(
			input.queuedMessageTemplate.replace('{relativePath}', result.relativePath)
		);
	} finally {
		context.setCommitWorkOrderTargetRepositoryId(null);
	}
}

function resolveRootProjectId(
	nodes: readonly ProjectNodeRecord[],
	node: ProjectNodeRecord
) {
	let currentNode: ProjectNodeRecord | undefined = node;

	while (currentNode !== undefined && currentNode.kind !== 'project') {
		currentNode = nodes.find((candidate) => candidate.id === currentNode?.parentId);
	}

	return currentNode?.id ?? null;
}
