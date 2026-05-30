export interface ProjectBoardCloseState {
	readonly hasDialog: boolean;
	readonly hasDeleteCandidate: boolean;
	readonly hasTagEditor: boolean;
	readonly hasDescriptionEditor: boolean;
	readonly hasDetailsEditor: boolean;
	readonly hasPublishTarget: boolean;
	readonly hasGithubCredentialEditor: boolean;
	readonly isSavingTags: boolean;
	readonly isSavingDescription: boolean;
	readonly isSavingDetails: boolean;
	readonly isPublishingRepository: boolean;
	readonly isSubmitting: boolean;
	readonly isEnvironmentVaultBusy: boolean;
}

export interface ProjectBoardCloseActions {
	readonly closeDialog: () => void;
	readonly closeDeleteDialog: () => void;
	readonly closeTagEditor: () => void;
	readonly closeDescriptionEditor: () => void;
	readonly closeDetailsEditor: () => void;
	readonly closePublishRepositoryDialog: () => void;
	readonly closeGithubCredentialEditor: () => void;
	readonly closeContextMenu: () => void;
}

export function closeProjectBoardOverlayFromEscape(
	state: ProjectBoardCloseState,
	actions: ProjectBoardCloseActions
) {
	if (state.hasDialog) {
		actions.closeDialog();
		return;
	}

	if (state.hasDeleteCandidate) {
		actions.closeDeleteDialog();
		return;
	}

	if (state.hasTagEditor) {
		if (!state.isSavingTags) {
			actions.closeTagEditor();
		}
		return;
	}

	if (state.hasDescriptionEditor) {
		if (!state.isSavingDescription) {
			actions.closeDescriptionEditor();
		}
		return;
	}

	if (state.hasDetailsEditor) {
		if (!state.isSavingDetails) {
			actions.closeDetailsEditor();
		}
		return;
	}

	if (state.hasPublishTarget) {
		if (!state.isPublishingRepository) {
			actions.closePublishRepositoryDialog();
		}
		return;
	}

	if (state.hasGithubCredentialEditor) {
		if (!state.isSubmitting && !state.isEnvironmentVaultBusy) {
			actions.closeGithubCredentialEditor();
		}
		return;
	}

	actions.closeContextMenu();
}
