import { enMessages } from '$lib/i18n/locales/en';
import type { WorkduckMessages } from '$lib/i18n/workduck-message-contract';
import type { ProjectFolderError } from './project-folder';
import type { ProjectRepositoryCloneError, ProjectRepositoryGitError } from './project-repository';
import type { ProjectRepositoryOperationStorageError } from './project-operation-storage';
import type { ProjectRepositoryTaskError } from './project-repository-task';
import type { ProjectRegistryError } from './project-registry';
import type { ProjectRegistryStorageError } from './project-storage';

export type ProjectCredentialError =
	| 'project-github-credential-required'
	| 'project-github-credential-vault-locked'
	| 'project-github-credential-missing'
	| 'project-github-credential-invalid';

export type ProjectFormError =
	| ProjectRegistryError
	| ProjectFolderError
	| ProjectRepositoryCloneError
	| ProjectRepositoryGitError
	| ProjectRepositoryTaskError
	| ProjectRegistryStorageError
	| ProjectRepositoryOperationStorageError
	| ProjectCredentialError;

export type ProjectFormErrorMessages = WorkduckMessages['projects']['errors'];

export function getProjectFormErrorMessage(
	error: ProjectFormError,
	messages: ProjectFormErrorMessages = enMessages.projects.errors
) {
	return messages[error] ?? enMessages.projects.errors[error];
}
