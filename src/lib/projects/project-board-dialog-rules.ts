import type { ProjectFormError } from './project-board-errors';
import type {
	ProjectDeleteCandidate,
	ProjectDialogMode,
	ProjectDialogState,
	ProjectRepositorySourceMode
} from './project-board-types';

export function getProjectDialogTitle(
	mode: ProjectDialogMode | null | undefined,
	labels: {
		readonly newProject: string;
		readonly newGroup: string;
		readonly newRepository: string;
	}
) {
	if (mode === 'group') {
		return labels.newGroup;
	}

	if (mode === 'repository') {
		return labels.newRepository;
	}

	return labels.newProject;
}

export function getProjectDialogSubmitLabel(mode: ProjectDialogMode | null | undefined) {
	return mode === 'repository' ? 'Link' : 'Create';
}

export function getProjectDeleteDialogTitle(deleteCandidate: ProjectDeleteCandidate | null) {
	if (deleteCandidate?.type === 'repository') {
		return 'Remove repository';
	}

	return deleteCandidate?.node.kind === 'group' ? 'Remove group' : 'Remove project';
}

export function getProjectDeleteDialogText(deleteCandidate: ProjectDeleteCandidate | null) {
	const name =
		deleteCandidate?.type === 'repository'
			? deleteCandidate.repository.name
			: deleteCandidate?.node.name ?? 'this item';

	return `Remove ${name} from Workduck?`;
}

export function getProjectDeleteLocalFolderLabel(deleteCandidate: ProjectDeleteCandidate | null) {
	if (deleteCandidate?.type === 'repository') {
		return 'Also delete this repository folder';
	}

	return deleteCandidate?.node.kind === 'project'
		? 'Also delete this project folder'
		: 'Also delete this group folder';
}

export function getProjectDeleteLocalFolderUnavailableText(
	deleteCandidate: ProjectDeleteCandidate | null
) {
	if (deleteCandidate?.type === 'repository') {
		return 'Local folder deletion is only available for repository folders under this workspace.';
	}

	return 'Local folder deletion is only available for folders under this workspace.';
}

export function getProjectDeleteSuccessStatus(
	deleteCandidate: ProjectDeleteCandidate,
	shouldDeleteLocalFolder: boolean
) {
	if (deleteCandidate.type === 'repository') {
		return shouldDeleteLocalFolder
			? 'Repository and local folder removed.'
			: 'Repository removed.';
	}

	if (deleteCandidate.node.kind === 'project') {
		return shouldDeleteLocalFolder ? 'Project and local folder removed.' : 'Project removed.';
	}

	return shouldDeleteLocalFolder ? 'Group and local folder removed.' : 'Group removed.';
}

export function isProjectRepositoryRemoteUrlError(error: ProjectFormError | null) {
	return (
		error === 'project-repository-source-required' ||
		error === 'project-repository-remote-url-required' ||
		error === 'project-repository-remote-url-invalid' ||
		error === 'project-repository-remote-url-duplicate'
	);
}

export function canSubmitProjectDialog(
	dialog: ProjectDialogState | null,
	repositorySourceMode: ProjectRepositorySourceMode,
	formName: string,
	repositoryRemoteUrl: string
) {
	if (dialog === null) {
		return false;
	}

	if (dialog.mode !== 'repository') {
		return formName.trim().length > 0;
	}

	return repositorySourceMode === 'folder'
		? formName.trim().length > 0
		: repositoryRemoteUrl.trim().length > 0;
}
