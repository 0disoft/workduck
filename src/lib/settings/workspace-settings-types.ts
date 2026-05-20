import type { WorkduckMessages } from '$lib/i18n/workduck-message-contract';
import type {
	WorkspaceRegistry,
	WorkspaceRegistryError
} from '$lib/workspaces/workspace-registry';
import type { WorkspacePasswordError } from '$lib/workspaces/workspace-password';
import type { WorkspacePathError } from '$lib/workspaces/workspace-path';
import type { WorkspaceRepositorySetupError } from '$lib/workspaces/workspace-repository-setup';
import type {
	WorkspaceRepositoryGithubVisibility,
	WorkspaceRepositoryGitError
} from '$lib/workspaces/workspace-repository-git';

export const GITHUB_REPOSITORY_NAME_MAX_LENGTH = 100;
export const GITHUB_REPOSITORY_COMMIT_MESSAGE_MAX_LENGTH = 200;
export const DEFAULT_WORKSPACE_REPOSITORY_COMMIT_MESSAGE =
	'chore: bootstrap workspace repository';

export type WorkspaceRepositoryChoice = 'no' | 'yes';
export type WorkspaceRepositoryGitAction = 'fetch' | 'pull' | 'push';
export type WorkspaceFormError =
	| WorkspaceRegistryError
	| WorkspacePathError
	| WorkspacePasswordError
	| 'workspace-repository-choice-required'
	| WorkspaceRepositoryGitError;
export type WorkspaceUnlockIntent = 'switch' | 'remove' | 'repair';
export type WorkspaceRecord = WorkspaceRegistry['workspaces'][number];
export type WorkspaceRepositoryGitStatus =
	| {
			readonly ok: true;
			readonly isLoading: boolean;
			readonly isGitRepository: boolean;
			readonly hasRemote: boolean;
			readonly aheadCount: number;
			readonly behindCount: number;
			readonly branch: string | null;
	  }
	| {
			readonly ok: false;
			readonly isLoading: boolean;
			readonly error: WorkspaceRepositoryGitError;
	  };

export interface WorkspaceSettingsViewModel {
	readonly messages: WorkduckMessages;
	readonly registry: WorkspaceRegistry;
	readonly workspaceName: string;
	readonly workspacePathDisplay: string;
	readonly workspacePassword: string;
	readonly workspaceRepositoryChoice: WorkspaceRepositoryChoice | null;
	readonly initializeWorkspaceGit: boolean;
	readonly installWorkspaceMustflow: boolean;
	readonly installWorkspaceGitignore: boolean;
	readonly useWorkspaceAsRepository: boolean;
	readonly canSelectWorkspacePath: boolean;
	readonly isSelectingWorkspacePath: boolean;
	readonly formError: WorkspaceFormError | null;
	readonly canAddWorkspace: boolean;
	readonly isAddingWorkspace: boolean;
	readonly repositorySetupError: WorkspaceRepositorySetupError | null;
	readonly storageError: string | null;
	readonly repositorySetupStatus: string | null;
	readonly workspaceRepositoryGitStatus: string | null;
	readonly hasLoaded: boolean;
	readonly workspaceUnlockId: string | null;
	readonly workspaceUnlockIntent: WorkspaceUnlockIntent | null;
	readonly workspacePathRepairId: string | null;
	readonly workspaceRepositorySetupCandidate: WorkspaceRecord | null;
	readonly prepareWorkspaceGit: boolean;
	readonly prepareWorkspaceMustflow: boolean;
	readonly prepareWorkspaceGitignore: boolean;
	readonly isPreparingWorkspaceRepository: boolean;
	readonly workspaceRepositoryPublishCandidate: WorkspaceRecord | null;
	readonly workspaceRepositoryName: string;
	readonly workspaceRepositoryCommitMessage: string;
	readonly workspaceRepositoryVisibility: WorkspaceRepositoryGithubVisibility;
	readonly isPublishingWorkspaceRepository: boolean;
	readonly canSubmitWorkspaceRepositoryPublish: boolean;
	readonly workspaceRemoveCandidate: WorkspaceRecord | null;
}

export interface WorkspaceSettingsActions {
	readonly getWorkspaceErrorMessage: (error: WorkspaceFormError) => string;
	readonly getWorkspaceRepositorySetupErrorMessage: (
		error: WorkspaceRepositorySetupError
	) => string;
	readonly isWorkspacePathError: (error: WorkspaceFormError | null) => boolean;
	readonly handleWorkspaceNameInput: (event: Event) => void;
	readonly handleWorkspacePathInput: (event: Event) => void;
	readonly handleWorkspacePathSelect: () => Promise<void>;
	readonly handleWorkspacePasswordInput: (event: Event) => void;
	readonly handleWorkspaceSubmit: (event: SubmitEvent) => Promise<void>;
	readonly selectWorkspaceRepositoryChoice: (choice: WorkspaceRepositoryChoice) => void;
	readonly setInitializeWorkspaceGit: (checked: boolean) => void;
	readonly setInstallWorkspaceMustflow: (checked: boolean) => void;
	readonly setInstallWorkspaceGitignore: (checked: boolean) => void;
	readonly getWorkspaceRepositoryGitStatus: (
		workspaceId: string
	) => WorkspaceRepositoryGitStatus | null;
	readonly workspaceIsActive: (workspace: WorkspaceRecord) => boolean;
	readonly workspaceIsUnlocked: (workspace: WorkspaceRecord) => boolean;
	readonly handleWorkspaceUnlocked: (workspaceId: string) => void;
	readonly clearWorkspaceUnlockRequest: () => void;
	readonly clearWorkspacePathRepair: () => void;
	readonly requestWorkspaceUnlock: (workspaceId: string, intent: WorkspaceUnlockIntent) => void;
	readonly requestWorkspaceRepositorySetup: (workspaceId: string) => void;
	readonly requestWorkspaceRepositoryPublish: (workspaceId: string) => void;
	readonly workspaceRepositoryCanPrepare: (workspaceId: string) => boolean;
	readonly workspaceRepositoryCanPublish: (workspaceId: string) => boolean;
	readonly workspaceRepositoryHasRemote: (workspaceId: string) => boolean;
	readonly workspaceRepositoryCanRunRemoteAction: (
		workspaceId: string,
		action: WorkspaceRepositoryGitAction
	) => boolean;
	readonly getWorkspaceRepositoryGitActionLabel: (
		workspaceId: string,
		action: WorkspaceRepositoryGitAction,
		idleLabel: string
	) => string;
	readonly runWorkspaceRepositoryGitAction: (
		workspaceId: string,
		action: WorkspaceRepositoryGitAction
	) => Promise<void>;
	readonly handleWorkspaceRepair: (workspaceId: string) => void;
	readonly handleWorkspaceSwitch: (workspaceId: string) => void;
	readonly handleWorkspaceLock: (workspaceId: string) => void;
	readonly handleWorkspaceRemove: (workspaceId: string) => void;
	readonly clearWorkspaceRepositorySetup: () => void;
	readonly setPrepareWorkspaceGit: (checked: boolean) => void;
	readonly setPrepareWorkspaceMustflow: (checked: boolean) => void;
	readonly setPrepareWorkspaceGitignore: (checked: boolean) => void;
	readonly confirmWorkspaceRepositorySetup: () => Promise<void>;
	readonly handleWorkspaceRepositorySetupBackdropClick: (event: MouseEvent) => void;
	readonly clearWorkspaceRepositoryPublish: () => void;
	readonly selectWorkspaceRepositoryVisibility: (
		visibility: WorkspaceRepositoryGithubVisibility
	) => void;
	readonly handleWorkspaceRepositoryNameInput: (event: Event) => void;
	readonly handleWorkspaceRepositoryCommitMessageInput: (event: Event) => void;
	readonly handleWorkspaceRepositoryPublishSubmit: (event: SubmitEvent) => Promise<void>;
	readonly handleWorkspaceRepositoryPublishBackdropClick: (event: MouseEvent) => void;
	readonly clearWorkspaceRemoveConfirmation: () => void;
	readonly confirmWorkspaceRemove: () => void | Promise<void>;
	readonly handleWorkspaceRemoveConfirmationBackdropClick: (event: MouseEvent) => void;
	readonly handleWorkspaceRemoveConfirmationKeydown: (event: KeyboardEvent) => void;
}
