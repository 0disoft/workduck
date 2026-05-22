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
	readonly workspacePath: string;
	readonly registry: ProjectRegistry;
	readonly isRepositoryBusy: (repositoryId: string) => boolean;
	readonly isRepositoryPathInsideWorkspace: (repositoryPath: string) => boolean;
	readonly resolveCredential: (
		target: ProjectRepositoryTarget
	) => ProjectRepositoryGitCredentialInput | null | undefined;
	readonly startOperation: (repositoryId: string, name: ProjectRepositoryOperationName) => void;
	readonly succeedOperation: (
		target: ProjectRepositoryTarget,
		name: ProjectRepositoryOperationName
	) => Promise<void>;
	readonly failOperation: (
		target: ProjectRepositoryTarget,
		name: ProjectRepositoryOperationName,
		error: ProjectFormError
	) => Promise<void>;
	readonly persistRegistry: (nextRegistry: ProjectRegistry) => Promise<boolean>;
	readonly refreshRepositoryGitStatus: (repositoryId: string, path: string | null) => Promise<void>;
	readonly setFormError: (error: ProjectFormError | null) => void;
	readonly setStatus: (status: string | null) => void;
	readonly setSelectedGroupId: (groupId: string) => void;
	readonly setCloneTarget: (target: ProjectContextMenuTarget | null) => void;
	readonly setGitActionTarget: (target: ProjectContextMenuTarget | null) => void;
	readonly setIsPublishingRepository: (isPublishing: boolean) => void;
	readonly closePublishRepositoryDialog: () => void;
}): ProjectRepositoryActionContext {
	return {
		workspacePath: input.workspacePath,
		registry: input.registry,
		isRepositoryBusy: input.isRepositoryBusy,
		isRepositoryPathInsideWorkspace: input.isRepositoryPathInsideWorkspace,
		resolveCredential: input.resolveCredential,
		startOperation: input.startOperation,
		succeedOperation: input.succeedOperation,
		failOperation: input.failOperation,
		persistRegistry: input.persistRegistry,
		refreshRepositoryGitStatus: input.refreshRepositoryGitStatus,
		setFormError: input.setFormError,
		setStatus: input.setStatus,
		setSelectedGroupId: input.setSelectedGroupId,
		setCloneTarget: input.setCloneTarget,
		setGitActionTarget: input.setGitActionTarget,
		setIsPublishingRepository: input.setIsPublishingRepository,
		closePublishRepositoryDialog: input.closePublishRepositoryDialog
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
