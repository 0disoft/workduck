import type { ProjectFormError } from './project-board-errors';
import type { ProjectRepositoryOperation } from './project-board-operations';
import type {
	ProjectRepositoryActionContext
} from './project-board-repository-actions';
import {
	finishProjectRepositoryOperationForBoard,
	getProjectRepositoryOperation,
	isProjectRepositoryBusy,
	isProjectRepositoryOperationRunning,
	startProjectRepositoryOperation
} from './project-board-operation-state';
import type {
	ProjectContextMenuTarget,
	ProjectRepositoryTarget
} from './project-board-types';
import type { ProjectRepositoryGitCredentialInput } from './project-repository';
import type {
	ProjectNodeRecord,
	ProjectRegistry,
	ProjectRepositoryLinkRecord
} from './project-registry';
import type {
	ProjectRepositoryOperationName,
	ProjectRepositoryOperationStorageError
} from './project-operation-storage';

export function createProjectBoardRepositoryActionContext(input: {
	readonly workspaceId: string;
	readonly workspacePath: string;
	readonly registry: ProjectRegistry;
	readonly isCurrent: () => boolean;
	readonly operations: () => Record<string, ProjectRepositoryOperation>;
	readonly setOperations: (operations: Record<string, ProjectRepositoryOperation>) => void;
	readonly setOperationStorageError: (error: ProjectRepositoryOperationStorageError | null) => void;
	readonly isRepositoryBusy: (repositoryId: string) => boolean;
	readonly isRepositoryPathInsideWorkspace: (repositoryPath: string) => boolean;
	readonly resolveCredential: (
		target: ProjectRepositoryTarget
	) => ProjectRepositoryGitCredentialInput | null | undefined;
	readonly persistRegistry: (nextRegistry: ProjectRegistry) => Promise<boolean>;
	readonly refreshRepositoryGitStatus: (repositoryId: string, path: string | null) => Promise<void>;
	readonly setFormError: (error: ProjectFormError | null) => void;
	readonly setStatus: (status: string | null) => void;
	readonly setSelectedGroupId: (groupId: string) => void;
	readonly setCloneTarget: (target: ProjectContextMenuTarget | null) => void;
	readonly setGitActionTarget: (target: ProjectContextMenuTarget | null) => void;
	readonly setIsPublishingRepository: (isPublishing: boolean) => void;
	readonly closePublishRepositoryDialog: () => void;
	readonly operationMessages: ProjectRepositoryActionContext['operationMessages'];
}): ProjectRepositoryActionContext {
	let ownedOperations: Record<string, ProjectRepositoryOperation> = {};
	const whileCurrent = <Args extends unknown[]>(callback: (...args: Args) => void) =>
		(...args: Args) => { if (input.isCurrent()) callback(...args); };
	const finishOperation = async (
		target: ProjectRepositoryTarget,
		name: ProjectRepositoryOperationName,
		state: 'succeeded' | 'failed',
		error: ProjectFormError | null
	) => {
		await finishProjectBoardRepositoryOperation({
			workspaceId: input.workspaceId, node: target.node, repository: target.repository,
			name, state, error, operations: ownedOperations,
			setOperations: next => {
				ownedOperations = next;
				if (input.isCurrent()) input.setOperations({
					...input.operations(), [target.repository.id]: next[target.repository.id]!
				});
			},
			setOperationStorageError: whileCurrent(input.setOperationStorageError)
		});
	};
	return {
		isCurrent: input.isCurrent,
		workspacePath: input.workspacePath,
		registry: input.registry,
		isRepositoryBusy: repositoryId => !input.isCurrent() || input.isRepositoryBusy(repositoryId),
		isRepositoryPathInsideWorkspace: path => input.isCurrent() && input.isRepositoryPathInsideWorkspace(path),
		resolveCredential: target => input.isCurrent() ? input.resolveCredential(target) : undefined,
		startOperation: (repositoryId, name) => {
			if (!input.isCurrent()) return;
			const next = startProjectBoardRepositoryOperation(input.operations(), repositoryId, name);
			ownedOperations = { ...ownedOperations, [repositoryId]: next[repositoryId]! };
			input.setOperations(next);
		},
		succeedOperation: (target, name) => finishOperation(target, name, 'succeeded', null),
		failOperation: (target, name, error) => finishOperation(target, name, 'failed', error),
		persistRegistry: input.persistRegistry,
		refreshRepositoryGitStatus: async (repositoryId, path) => {
			if (input.isCurrent()) await input.refreshRepositoryGitStatus(repositoryId, path);
		},
		setFormError: whileCurrent(input.setFormError),
		setStatus: whileCurrent(input.setStatus),
		setSelectedGroupId: whileCurrent(input.setSelectedGroupId),
		setCloneTarget: whileCurrent(input.setCloneTarget),
		setGitActionTarget: whileCurrent(input.setGitActionTarget),
		setIsPublishingRepository: whileCurrent(input.setIsPublishingRepository),
		closePublishRepositoryDialog: whileCurrent(input.closePublishRepositoryDialog),
		operationMessages: input.operationMessages
	};
}

export function startProjectBoardRepositoryOperation(
	operations: Record<string, ProjectRepositoryOperation>,
	repositoryId: string,
	name: ProjectRepositoryOperationName
) {
	return startProjectRepositoryOperation(operations, repositoryId, name);
}

export async function finishProjectBoardRepositoryOperation(input: {
	readonly workspaceId: string;
	readonly node: ProjectNodeRecord;
	readonly repository: ProjectRepositoryLinkRecord;
	readonly name: ProjectRepositoryOperationName;
	readonly state: 'succeeded' | 'failed';
	readonly error: string | null;
	readonly operations: Record<string, ProjectRepositoryOperation>;
	readonly setOperations: (operations: Record<string, ProjectRepositoryOperation>) => void;
	readonly setOperationStorageError: (error: ProjectRepositoryOperationStorageError | null) => void;
}) {
	await finishProjectRepositoryOperationForBoard(
		{
			workspaceId: input.workspaceId,
			node: input.node,
			repository: input.repository,
			name: input.name,
			state: input.state,
			error: input.error,
			operations: input.operations
		},
		{
			setOperations: input.setOperations,
			setOperationStorageError: input.setOperationStorageError
		}
	);
}

export function getProjectBoardRepositoryOperation(
	operations: Record<string, ProjectRepositoryOperation>,
	repositoryId: string
) {
	return getProjectRepositoryOperation(operations, repositoryId);
}

export function isProjectBoardRepositoryBusy(
	operations: Record<string, ProjectRepositoryOperation>,
	repositoryId: string
) {
	return isProjectRepositoryBusy(operations, repositoryId);
}

export function isProjectBoardRepositoryOperationRunning(
	operations: Record<string, ProjectRepositoryOperation>,
	repositoryId: string,
	name: ProjectRepositoryOperationName
) {
	return isProjectRepositoryOperationRunning(operations, repositoryId, name);
}
