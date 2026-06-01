import type { WorkduckMessages } from '$lib/i18n/workduck-message-contract';
import { WORKSPACE_PASSWORD_MIN_LENGTH } from '$lib/workspaces/workspace-password';
import type { WorkspacePathError } from '$lib/workspaces/workspace-path';
import type { WorkspaceRepositorySetupError } from '$lib/workspaces/workspace-repository-setup';
import type { WorkspaceFormError } from './workspace-settings-types';

export function getWorkspaceFormErrorMessage(
	messages: WorkduckMessages,
	error: WorkspaceFormError
) {
	switch (error) {
		case 'workspace-name-required':
			return messages.settings.workspaces.errors.nameRequired;
		case 'workspace-path-required':
		case 'workspace-path-not-absolute':
		case 'workspace-path-not-found':
		case 'workspace-path-not-directory':
		case 'workspace-path-permission-denied':
		case 'workspace-path-unreadable':
		case 'workspace-path-validation-unavailable':
		case 'workspace-path-selection-unavailable':
		case 'workspace-path-selection-failed':
			return getWorkspacePathErrorMessage(messages, error);
		case 'workspace-path-duplicate':
			return messages.workspace.pathErrors.pathDuplicate;
		case 'workspace-password-required':
			return messages.settings.workspaces.errors.passwordRequired;
		case 'workspace-password-too-short':
			return messages.settings.workspaces.errors.passwordTooShort.replace(
				'{minLength}',
				String(WORKSPACE_PASSWORD_MIN_LENGTH)
			);
		case 'workspace-password-hash-failed':
			return messages.settings.workspaces.errors.passwordProtectFailed;
		case 'workspace-password-invalid-hash':
			return messages.settings.workspaces.errors.passwordInvalidHash;
		case 'workspace-password-unavailable':
			return messages.settings.workspaces.errors.passwordUnavailable;
		case 'workspace-password-hash-invalid':
			return messages.settings.workspaces.errors.passwordHashInvalid;
		case 'workspace-not-found':
			return messages.workspace.pathErrors.workspaceNotFound;
		case 'workspace-repository-choice-required':
			return messages.settings.workspaces.errors.repositoryChoiceRequired;
		case 'project-repository-git-path-required':
			return messages.settings.workspaces.errors.repositoryGitPathRequired;
		case 'project-repository-git-path-not-absolute':
			return messages.settings.workspaces.errors.repositoryGitPathNotAbsolute;
		case 'project-repository-git-path-not-found':
			return messages.settings.workspaces.errors.repositoryGitPathNotFound;
		case 'project-repository-git-path-not-directory':
			return messages.settings.workspaces.errors.repositoryGitPathNotDirectory;
		case 'project-repository-git-path-permission-denied':
			return messages.settings.workspaces.errors.repositoryGitPathPermissionDenied;
		case 'project-repository-git-path-unreadable':
			return messages.settings.workspaces.errors.repositoryGitPathUnreadable;
		case 'project-repository-git-command-unavailable':
			return messages.settings.workspaces.errors.repositoryGitCommandUnavailable;
		case 'project-repository-git-command-failed':
			return messages.settings.workspaces.errors.repositoryGitCommandFailed;
		case 'project-repository-git-command-timed-out':
			return messages.settings.workspaces.errors.repositoryGitCommandTimedOut;
		case 'project-repository-git-not-repository':
			return messages.settings.workspaces.errors.repositoryGitNotRepository;
		case 'project-repository-git-init-failed':
			return messages.settings.workspaces.errors.repositoryGitInitFailed;
		case 'project-repository-git-remote-missing':
			return messages.settings.workspaces.errors.repositoryGitRemoteMissing;
		case 'project-repository-git-push-auth-required':
			return messages.settings.workspaces.errors.repositoryGitPushAuthRequired;
		case 'project-repository-git-push-empty':
			return messages.settings.workspaces.errors.repositoryGitPushEmpty;
		case 'project-repository-git-push-failed':
			return messages.settings.workspaces.errors.repositoryGitPushFailed;
		case 'project-repository-git-fetch-auth-required':
			return messages.settings.workspaces.errors.repositoryGitFetchAuthRequired;
		case 'project-repository-git-fetch-failed':
			return messages.settings.workspaces.errors.repositoryGitFetchFailed;
		case 'project-repository-git-pull-auth-required':
			return messages.settings.workspaces.errors.repositoryGitPullAuthRequired;
		case 'project-repository-git-pull-conflict':
			return messages.settings.workspaces.errors.repositoryGitPullConflict;
		case 'project-repository-git-pull-failed':
			return messages.settings.workspaces.errors.repositoryGitPullFailed;
		case 'project-repository-github-repo-name-required':
			return messages.settings.workspaces.errors.repositoryGithubNameRequired;
		case 'project-repository-github-repo-name-invalid':
			return messages.settings.workspaces.errors.repositoryGithubNameInvalid;
		case 'project-repository-github-commit-message-required':
			return messages.settings.workspaces.errors.repositoryGithubCommitMessageRequired;
		case 'project-repository-github-commit-message-invalid':
			return messages.settings.workspaces.errors.repositoryGithubCommitMessageInvalid;
		case 'project-repository-github-visibility-invalid':
			return messages.settings.workspaces.errors.repositoryGithubVisibilityInvalid;
		case 'project-repository-github-cli-unavailable':
			return messages.settings.workspaces.errors.repositoryGithubCliUnavailable;
		case 'project-repository-github-auth-required':
			return messages.settings.workspaces.errors.repositoryGithubAuthRequired;
		case 'project-repository-github-remote-exists':
			return messages.settings.workspaces.errors.repositoryGithubRemoteExists;
		case 'project-repository-github-empty':
			return messages.settings.workspaces.errors.repositoryGithubEmpty;
		case 'project-repository-github-commit-identity-missing':
			return messages.settings.workspaces.errors.repositoryGithubCommitIdentityMissing;
		case 'project-repository-github-commit-index-locked':
			return messages.settings.workspaces.errors.repositoryGithubCommitIndexLocked;
		case 'project-repository-github-commit-hook-failed':
			return messages.settings.workspaces.errors.repositoryGithubCommitHookFailed;
		case 'project-repository-github-commit-failed':
			return messages.settings.workspaces.errors.repositoryGithubCommitFailed;
		case 'project-repository-github-create-failed':
			return messages.settings.workspaces.errors.repositoryGithubCreateFailed;
	}
}

export function getWorkspacePathErrorMessage(
	messages: WorkduckMessages,
	error: WorkspacePathError
) {
	switch (error) {
		case 'workspace-path-required':
			return messages.workspace.pathErrors.pathRequired;
		case 'workspace-path-not-absolute':
			return messages.workspace.pathErrors.pathNotAbsolute;
		case 'workspace-path-not-found':
			return messages.workspace.pathErrors.pathNotFound;
		case 'workspace-path-not-directory':
			return messages.workspace.pathErrors.pathNotDirectory;
		case 'workspace-path-permission-denied':
			return messages.workspace.pathErrors.pathPermissionDenied;
		case 'workspace-path-unreadable':
			return messages.workspace.pathErrors.pathUnreadable;
		case 'workspace-path-validation-unavailable':
			return messages.workspace.pathErrors.pathValidationUnavailable;
		case 'workspace-path-selection-unavailable':
			return messages.workspace.pathErrors.pathSelectionUnavailable;
		case 'workspace-path-selection-failed':
			return messages.workspace.pathErrors.pathSelectionFailed;
	}
}

export function getWorkspaceRepositorySetupErrorMessage(
	messages: WorkduckMessages,
	error: WorkspaceRepositorySetupError
) {
	switch (error) {
		case 'workspace-repository-workspace-required':
			return messages.settings.workspaces.errors.repositoryWorkspaceRequired;
		case 'workspace-repository-workspace-not-absolute':
			return messages.settings.workspaces.errors.repositoryWorkspaceNotAbsolute;
		case 'workspace-repository-workspace-not-found':
			return messages.settings.workspaces.errors.repositoryWorkspaceNotFound;
		case 'workspace-repository-workspace-not-directory':
			return messages.settings.workspaces.errors.repositoryWorkspaceNotDirectory;
		case 'workspace-repository-workspace-permission-denied':
			return messages.settings.workspaces.errors.repositoryWorkspacePermissionDenied;
		case 'workspace-repository-workspace-unreadable':
			return messages.settings.workspaces.errors.repositoryWorkspaceUnreadable;
		case 'workspace-repository-layout-invalid':
			return messages.settings.workspaces.errors.repositoryLayoutInvalid;
		case 'workspace-repository-create-failed':
			return messages.settings.workspaces.errors.repositoryCreateFailed;
		case 'workspace-repository-git-unavailable':
			return messages.settings.workspaces.errors.repositoryGitUnavailable;
		case 'workspace-repository-git-timed-out':
			return messages.settings.workspaces.errors.repositoryGitTimedOut;
		case 'workspace-repository-git-init-failed':
			return messages.settings.workspaces.errors.repositoryGitInitFailed;
		case 'workspace-repository-mustflow-unavailable':
			return messages.settings.workspaces.errors.repositoryMustflowUnavailable;
		case 'workspace-repository-mustflow-timed-out':
			return messages.settings.workspaces.errors.repositoryMustflowTimedOut;
		case 'workspace-repository-mustflow-failed':
			return messages.settings.workspaces.errors.repositoryMustflowFailed;
		case 'workspace-repository-mustflow-package-failed':
			return messages.settings.workspaces.errors.repositoryMustflowPackageFailed;
		case 'workspace-repository-agent-instructions-failed':
			return messages.settings.workspaces.errors.repositoryAgentInstructionsFailed;
		case 'workspace-repository-gitignore-failed':
			return messages.settings.workspaces.errors.repositoryGitignoreFailed;
		case 'workspace-repository-unavailable':
			return messages.settings.workspaces.errors.repositoryUnavailable;
	}
}
