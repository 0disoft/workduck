import type { ProjectFormError } from './project-board-errors';
import type { WorkduckMessages } from '$lib/i18n/workduck-message-contract';
import type {
	ProjectDeleteCandidate,
	ProjectDialogMode,
	ProjectDialogState,
	ProjectRepositorySourceMode
} from './project-board-types';

type ProjectDeleteDialogMessages = WorkduckMessages['projects']['deleteDialog'];

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

export function getProjectDeleteDialogTitle(
	deleteCandidate: ProjectDeleteCandidate | null,
	messages: ProjectDeleteDialogMessages
) {
	if (deleteCandidate?.type === 'repository') {
		return messages.titles.repository;
	}

	return deleteCandidate?.node.kind === 'group' ? messages.titles.group : messages.titles.project;
}

export function getProjectDeleteDialogText(
	deleteCandidate: ProjectDeleteCandidate | null,
	messages: ProjectDeleteDialogMessages
) {
	const name =
		deleteCandidate?.type === 'repository'
			? deleteCandidate.repository.name
			: deleteCandidate?.node.name ?? 'this item';

	if (deleteCandidate?.type === 'node') {
		const affectedItems = [
			formatAffectedItemCount(
				deleteCandidate.childGroupCount,
				messages.affectedGroup,
				messages.affectedGroups
			),
			formatAffectedItemCount(
				deleteCandidate.childRepositoryCount,
				messages.affectedRepository,
				messages.affectedRepositories
			)
		].filter((item) => item.length > 0);

		if (affectedItems.length > 0) {
			return messages.textWithAffected
				.replace('{name}', name)
				.replace('{affected}', affectedItems.join(', '));
		}
	}

	return messages.text.replace('{name}', name);
}

export function getProjectDeleteLocalFolderLabel(
	deleteCandidate: ProjectDeleteCandidate | null,
	messages: ProjectDeleteDialogMessages
) {
	if (deleteCandidate?.type === 'repository') {
		return messages.localRepositoryFolder;
	}

	return deleteCandidate?.node.kind === 'project'
		? messages.localProjectFolder
		: messages.localGroupFolder;
}

export function getProjectDeleteLocalFolderUnavailableText(
	deleteCandidate: ProjectDeleteCandidate | null,
	messages: ProjectDeleteDialogMessages
) {
	if (deleteCandidate?.type === 'repository') {
		return messages.localRepositoryFolderUnavailable;
	}

	return messages.localFolderUnavailable;
}

export function getProjectDeleteSuccessStatus(
	deleteCandidate: ProjectDeleteCandidate,
	shouldDeleteLocalFolder: boolean,
	messages: ProjectDeleteDialogMessages
) {
	if (deleteCandidate.type === 'repository') {
		return shouldDeleteLocalFolder
			? messages.repositoryAndFolderRemoved
			: messages.repositoryRemoved;
	}

	if (deleteCandidate.node.kind === 'project') {
		return shouldDeleteLocalFolder ? messages.projectAndFolderRemoved : messages.projectRemoved;
	}

	return shouldDeleteLocalFolder ? messages.groupAndFolderRemoved : messages.groupRemoved;
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

function formatAffectedItemCount(count: number, singularTemplate: string, pluralTemplate: string) {
	if (count <= 0) {
		return '';
	}

	return (count === 1 ? singularTemplate : pluralTemplate).replace('{count}', count.toString());
}
