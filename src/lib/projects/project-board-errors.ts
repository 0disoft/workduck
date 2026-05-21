import type { SecretVaultCryptoError } from '$lib/environment/secret-vault-crypto';
import type { ProjectFolderError } from './project-folder';
import type { ProjectRepositoryCloneError, ProjectRepositoryGitError } from './project-repository';
import type { ProjectRepositoryOperationStorageError } from './project-operation-storage';
import type { ProjectRepositoryTaskError } from './project-repository-task';
import type { ProjectRegistryError } from './project-registry';
import type { ProjectRegistryStorageError } from './project-storage';

export type ProjectCredentialError =
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

export function getProjectFormErrorMessage(error: ProjectFormError) {
	switch (error) {
		case 'project-github-credential-vault-locked':
			return 'Unlock Environment to use the selected GitHub credential.';
		case 'project-github-credential-missing':
			return 'Selected GitHub credential was not found.';
		case 'project-github-credential-invalid':
			return 'Selected GitHub credential must be a GitHub token.';
		case 'project-name-required':
			return 'Name is required.';
		case 'project-name-duplicate':
			return 'Name already exists here.';
		case 'project-parent-not-found':
			return 'Parent project was not found.';
		case 'project-parent-invalid':
			return 'Groups can only be added under a project.';
		case 'project-node-not-found':
			return 'Project was not found.';
		case 'project-path-required':
			return 'Project path is required.';
		case 'project-path-duplicate':
			return 'Project path is already registered.';
		case 'project-repository-target-invalid':
			return 'Repositories can only be linked to groups.';
		case 'project-repository-not-found':
			return 'Repository link was not found.';
		case 'project-folder-workspace-required':
			return 'Workspace path is required.';
		case 'project-folder-workspace-not-absolute':
			return 'Workspace path must be absolute.';
		case 'project-folder-workspace-not-found':
			return 'Workspace path was not found.';
		case 'project-folder-workspace-not-directory':
			return 'Workspace path must be a folder.';
		case 'project-folder-workspace-permission-denied':
			return 'Workspace path is not writable.';
		case 'project-folder-workspace-unreadable':
			return 'Workspace path could not be checked.';
		case 'project-folder-root-invalid':
			return 'Projects folder is not usable.';
		case 'project-folder-parent-required':
		case 'project-folder-parent-invalid':
		case 'project-folder-parent-not-found':
			return 'Parent folder is not usable.';
		case 'project-folder-path-required':
			return 'Project folder path is required.';
		case 'project-folder-path-invalid':
			return 'Project folder path is not usable.';
		case 'project-folder-name-required':
			return 'Name is required.';
		case 'project-folder-name-invalid':
			return 'Name cannot be used as a folder.';
		case 'project-folder-conflict':
			return 'Folder path is not usable.';
		case 'project-folder-create-failed':
			return 'Folder could not be created.';
		case 'project-folder-open-path-required':
			return 'Folder path is required.';
		case 'project-folder-open-path-not-absolute':
			return 'Folder path must be absolute.';
		case 'project-folder-open-path-not-found':
			return 'Folder path was not found.';
		case 'project-folder-open-path-not-directory':
			return 'Folder path must be a folder.';
		case 'project-folder-open-path-permission-denied':
			return 'Folder path could not be opened.';
		case 'project-folder-open-failed':
			return 'Folder could not be opened.';
		case 'project-folder-delete-path-required':
			return 'Folder path is required.';
		case 'project-folder-delete-path-not-absolute':
			return 'Folder path must be absolute.';
		case 'project-folder-delete-path-not-found':
			return 'Folder path was not found.';
		case 'project-folder-delete-path-not-directory':
			return 'Folder path must be a folder.';
		case 'project-folder-delete-path-outside-workspace':
			return 'Only folders under this workspace projects folder can be deleted here.';
		case 'project-folder-delete-path-permission-denied':
			return 'Folder path could not be deleted.';
		case 'project-folder-delete-failed':
			return 'Folder could not be deleted.';
		case 'project-folder-unavailable':
			return 'Project folders are available in the desktop app.';
		case 'project-repository-name-required':
			return 'Repository name is required.';
		case 'project-repository-source-required':
			return 'Repository folder or URL is required.';
		case 'project-repository-path-required':
			return 'Repository path is required.';
		case 'project-repository-path-outside-workspace':
			return 'Repository path must stay inside the current workspace.';
		case 'project-repository-path-duplicate':
			return 'Repository path is already linked.';
		case 'project-repository-remote-url-invalid':
			return 'Repository URL is not usable.';
		case 'project-repository-remote-url-duplicate':
			return 'Repository URL is already registered.';
		case 'project-repository-clone-unavailable':
			return 'Repository clone is available in the desktop app.';
		case 'project-repository-workspace-required':
		case 'project-repository-workspace-not-absolute':
		case 'project-repository-workspace-not-found':
		case 'project-repository-workspace-not-directory':
		case 'project-repository-workspace-permission-denied':
		case 'project-repository-workspace-unreadable':
			return 'Workspace path is not usable.';
		case 'project-repository-group-path-required':
		case 'project-repository-group-path-invalid':
		case 'project-repository-group-path-not-found':
		case 'project-repository-group-path-not-directory':
			return 'Repository group folder is not usable.';
		case 'project-repository-name-invalid':
			return 'Repository name cannot be used as a folder.';
		case 'project-repository-remote-url-required':
			return 'Repository URL is required.';
		case 'project-repository-clone-target-exists':
			return 'Clone target folder already exists.';
		case 'project-repository-clone-command-unavailable':
			return 'Git command was not found.';
		case 'project-repository-clone-command-timed-out':
			return 'Repository clone timed out.';
		case 'project-repository-clone-token-invalid':
			return 'GitHub token is invalid or expired. Update the GitHub PAT in Environment variables.';
		case 'project-repository-clone-permission-denied':
			return 'GitHub token does not have repository access. Check repository selection and Contents read permission.';
		case 'project-repository-clone-repository-not-found':
			return 'Repository was not found. For private repositories, GitHub may show this when the token has no access.';
		case 'project-repository-clone-organization-restricted':
			return 'GitHub organization access is restricted. Authorize the token for the organization or SSO.';
		case 'project-repository-clone-access-denied':
			return 'Repository access was denied by GitHub. Check URL, token access, and organization policy.';
		case 'project-repository-clone-auth-required':
			return 'Repository clone needs Git authentication. Select a GitHub credential for this project.';
		case 'project-repository-clone-failed':
			return 'Repository clone failed. Check the URL, network, and Git credentials.';
		case 'project-repository-git-path-required':
			return 'Repository path is required.';
		case 'project-repository-git-path-not-absolute':
			return 'Repository path must be absolute.';
		case 'project-repository-git-path-not-found':
			return 'Repository path was not found.';
		case 'project-repository-git-path-not-directory':
			return 'Repository path must be a folder.';
		case 'project-repository-git-path-permission-denied':
			return 'Repository path is not readable.';
		case 'project-repository-git-path-unreadable':
			return 'Repository path could not be checked.';
		case 'project-repository-git-command-unavailable':
			return 'Git command was not found.';
		case 'project-repository-git-command-failed':
			return 'Git command failed. Check the repository path and Git installation.';
		case 'project-repository-git-command-timed-out':
			return 'Git command timed out.';
		case 'project-repository-git-not-repository':
			return 'Repository folder is not initialized for Git.';
		case 'project-repository-git-init-failed':
			return 'Git repository could not be initialized.';
		case 'project-repository-git-remote-missing':
			return 'Git remote is not configured.';
		case 'project-repository-git-push-auth-required':
			return 'Git push needs authentication.';
		case 'project-repository-git-push-empty':
			return 'Repository has no commits to push.';
		case 'project-repository-git-push-failed':
			return 'Git push failed. Check the remote URL, branch, network, and credentials.';
		case 'project-repository-git-fetch-auth-required':
			return 'Git fetch needs authentication.';
		case 'project-repository-git-fetch-failed':
			return 'Git fetch failed. Check the remote URL, network, and credentials.';
		case 'project-repository-git-pull-auth-required':
			return 'Git pull needs authentication.';
		case 'project-repository-git-pull-conflict':
			return 'Git pull needs manual conflict resolution.';
		case 'project-repository-git-pull-failed':
			return 'Git pull failed. Check the remote URL, branch, network, and credentials.';
		case 'project-repository-github-repo-name-required':
			return 'GitHub repository name is required.';
		case 'project-repository-github-repo-name-invalid':
			return 'GitHub repository name is not usable.';
		case 'project-repository-github-commit-message-required':
			return 'Commit message is required.';
		case 'project-repository-github-commit-message-invalid':
			return 'Commit message is not usable.';
		case 'project-repository-github-visibility-invalid':
			return 'GitHub visibility is not usable.';
		case 'project-repository-github-cli-unavailable':
			return 'GitHub CLI was not found.';
		case 'project-repository-github-auth-required':
			return 'GitHub CLI needs authentication.';
		case 'project-repository-github-remote-exists':
			return 'Git remote origin already exists.';
		case 'project-repository-github-empty':
			return 'Repository has no commits to publish.';
		case 'project-repository-github-commit-identity-missing':
			return 'Git author name or email is not configured.';
		case 'project-repository-github-commit-index-locked':
			return 'Git index is locked by another process.';
		case 'project-repository-github-commit-hook-failed':
			return 'Initial commit was blocked by a Git hook.';
		case 'project-repository-github-commit-failed':
			return 'Initial commit could not be created.';
		case 'project-repository-github-create-failed':
			return 'GitHub repository could not be created. Check GitHub CLI authentication and repository name.';
		case 'project-repository-task-unavailable':
			return 'Repository tasks are available in the desktop app.';
		case 'project-repository-task-workspace-required':
		case 'project-repository-task-workspace-not-absolute':
		case 'project-repository-task-workspace-not-found':
		case 'project-repository-task-workspace-not-directory':
		case 'project-repository-task-workspace-unreadable':
			return 'Workspace path is not usable.';
		case 'project-repository-task-path-required':
		case 'project-repository-task-path-not-absolute':
		case 'project-repository-task-path-not-found':
		case 'project-repository-task-path-not-directory':
		case 'project-repository-task-path-unreadable':
			return 'Repository path is not usable.';
		case 'project-repository-task-path-outside-workspace':
			return 'Repository path must stay inside the current workspace.';
		case 'project-repository-task-invalid':
			return 'Repository task is not usable.';
		case 'project-repository-task-command-unavailable':
			return 'No matching command was found for this repository.';
		case 'project-repository-task-terminal-unavailable':
			return 'No supported terminal was found.';
		case 'project-repository-task-launch-failed':
			return 'Repository task could not be started.';
		case 'project-registry-read-failed':
			return 'Projects could not be loaded.';
		case 'project-registry-write-failed':
			return 'Projects could not be saved.';
		case 'project-repository-operation-read-failed':
			return 'Repository operation records could not be loaded.';
		case 'project-repository-operation-write-failed':
			return 'Repository operation record could not be saved.';
	}
}

export function createSecretVaultErrorMessage(nextError: SecretVaultCryptoError) {
	if (nextError === 'secret-vault-password-required') {
		return 'Environment vault password is required.';
	}

	if (nextError === 'secret-vault-unavailable') {
		return 'Environment vault is available in the desktop app.';
	}

	return 'Environment vault password did not match.';
}
