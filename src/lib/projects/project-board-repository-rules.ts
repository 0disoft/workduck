import type { ProjectRepositoryOperation } from './project-board-operations';
import { getRepositoryOperationLabel } from './project-board-operations';
import type { ProjectRepositoryGitStatus } from './project-board-selectors';
import type { ProjectRepositoryLinkRecord } from './project-registry';

export function getProjectRepositoryCardKind(
	repository: ProjectRepositoryLinkRecord,
	operation: ProjectRepositoryOperation | null,
	gitStatus: ProjectRepositoryGitStatus | undefined,
	isCloneTarget: boolean,
	isGitActionTarget: boolean
) {
	if (operation?.state === 'running') {
		return getRepositoryOperationLabel(operation.name);
	}

	if (isCloneTarget) {
		return 'Cloning';
	}

	if (isGitActionTarget) {
		return 'Working';
	}

	if (repository.path === null) {
		return 'Remote';
	}

	if (gitStatus?.isGitRepository) {
		return gitStatus.hasRemote ? 'Git' : 'Local Git';
	}

	return gitStatus === undefined ? 'Checking' : 'Folder';
}

export function canCloneProjectRepository(
	repository: ProjectRepositoryLinkRecord,
	isRepositoryBusy: boolean
) {
	return repository.remoteUrl !== null && repository.path === null && !isRepositoryBusy;
}

export function canInitializeProjectRepository(
	repository: ProjectRepositoryLinkRecord,
	gitStatus: ProjectRepositoryGitStatus | undefined,
	isRepositoryPathInsideWorkspace: boolean,
	isRepositoryBusy: boolean
) {
	return (
		repository.path !== null &&
		isRepositoryPathInsideWorkspace &&
		gitStatus !== undefined &&
		!gitStatus.isGitRepository &&
		gitStatus.error === null &&
		!isRepositoryBusy
	);
}

export function canPublishProjectRepositoryToGithub(
	repository: ProjectRepositoryLinkRecord,
	gitStatus: ProjectRepositoryGitStatus | undefined,
	isRepositoryPathInsideWorkspace: boolean,
	hasPublishTarget: boolean,
	isRepositoryBusy: boolean
) {
	return (
		repository.path !== null &&
		isRepositoryPathInsideWorkspace &&
		gitStatus?.isGitRepository === true &&
		!gitStatus.hasRemote &&
		!hasPublishTarget &&
		!isRepositoryBusy
	);
}

export function canRunRemoteProjectRepositoryGitAction(
	repository: ProjectRepositoryLinkRecord,
	gitStatus: ProjectRepositoryGitStatus | undefined,
	isRepositoryPathInsideWorkspace: boolean,
	isRepositoryBusy: boolean
) {
	return (
		repository.path !== null &&
		isRepositoryPathInsideWorkspace &&
		gitStatus?.isGitRepository === true &&
		gitStatus.hasRemote &&
		!isRepositoryBusy
	);
}
