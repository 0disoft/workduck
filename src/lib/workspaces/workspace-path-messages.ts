import type { WorkspacePathError, WorkspacePathValidationError } from './workspace-path';

export function getWorkspacePathErrorMessage(error: WorkspacePathError | WorkspacePathValidationError) {
	switch (error) {
		case 'workspace-path-required':
			return 'Workspace path is required.';
		case 'workspace-path-not-absolute':
			return 'Workspace path must be an absolute folder path.';
		case 'workspace-path-not-found':
			return 'Workspace path does not exist.';
		case 'workspace-path-not-directory':
			return 'Workspace path must be a folder.';
		case 'workspace-path-permission-denied':
			return 'Workspace path is not readable.';
		case 'workspace-path-unreadable':
			return 'Workspace path could not be checked.';
		case 'workspace-path-validation-unavailable':
			return 'Workspace path can only be checked in the desktop app.';
		case 'workspace-path-selection-unavailable':
			return 'Workspace folder picker is unavailable.';
		case 'workspace-path-selection-failed':
			return 'Workspace folder could not be selected.';
	}
}
