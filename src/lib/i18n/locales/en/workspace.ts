export const enWorkspaceMessages = {
		addWorkspaceInSettings: 'Add a workspace in Settings.',
		locked: 'Workspace locked',
		folderUnavailable: 'Workspace folder unavailable',
		checkingFolder: 'Checking workspace folder...',
		path: 'Path',
		reconnect: 'Reconnect',
		chooseFolder: 'Choose workspace folder',
		unlock: {
			submit: 'Unlock',
			tryAgainIn: 'Try again in {seconds}s.',
			passwordRequired: 'Password is required.',
			passwordMismatch: 'Password did not match.',
			passwordMismatchWithAttempts:
				'Password did not match. {attemptsRemaining} attempts left.',
			unavailable: 'Unlock is available in the desktop app.',
			invalidHash: 'Workspace lock data could not be read.'
		},
		pathErrors: {
			pathRequired: 'Workspace path is required.',
			pathNotAbsolute: 'Workspace path must be an absolute folder path.',
			pathNotFound: 'Workspace path does not exist.',
			pathNotDirectory: 'Workspace path must be a folder.',
			pathPermissionDenied: 'Workspace path is not readable.',
			pathUnreadable: 'Workspace path could not be checked.',
			pathValidationUnavailable: 'Workspace path can only be checked in the desktop app.',
			pathSelectionUnavailable: 'Workspace folder picker is unavailable.',
			pathSelectionFailed: 'Workspace folder could not be selected.',
			pathDuplicate: 'Workspace path is already registered.',
			workspaceNotFound: 'Workspace was not found.',
			registryReadFailed: 'Workspace settings could not be loaded.',
			registryWriteFailed: 'Workspace settings could not be saved.'
		}
	} as const;
