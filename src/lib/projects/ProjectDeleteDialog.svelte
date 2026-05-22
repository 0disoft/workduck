<script lang="ts">
	import type { WorkduckMessages } from '$lib/i18n/workduck-message-contract';
	import { getProjectFormErrorMessage, type ProjectFormError } from './project-board-errors';

	interface Props {
		readonly projectMessages: WorkduckMessages['projects'];
		shouldDeleteLocalFolder: boolean;
		readonly formError: ProjectFormError | null;
		readonly isDeleting: boolean;
		readonly canConfirmDelete: boolean;
		readonly canDeleteLocalFolder: boolean;
		readonly getDeleteDialogTitle: () => string;
		readonly getDeleteDialogText: () => string;
		readonly getDeleteLocalFolderLabel: () => string;
		readonly getDeleteLocalFolderUnavailableText: () => string;
		readonly onBackdropClick: (event: MouseEvent) => void;
		readonly onClose: () => void;
		readonly onConfirm: () => Promise<void>;
	}

	let {
		projectMessages,
		shouldDeleteLocalFolder = $bindable(),
		formError,
		isDeleting,
		canConfirmDelete,
		canDeleteLocalFolder,
		getDeleteDialogTitle,
		getDeleteDialogText,
		getDeleteLocalFolderLabel,
		getDeleteLocalFolderUnavailableText,
		onBackdropClick,
		onClose,
		onConfirm
	}: Props = $props();
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="workduck-dialog-backdrop" role="presentation" onclick={onBackdropClick}>
	<div
		class="workduck-dialog"
		role="dialog"
		aria-modal="true"
		aria-labelledby="project-remove-confirm-title"
		aria-describedby="project-remove-confirm-description"
	>
		<h2 id="project-remove-confirm-title" class="workduck-dialog-title">
			{getDeleteDialogTitle()}
		</h2>
		<p id="project-remove-confirm-description" class="workduck-dialog-text">
			{getDeleteDialogText()}
		</p>
		<label
			class="workduck-danger-option"
			class:workduck-danger-option-disabled={!canDeleteLocalFolder}
		>
			<input
				class="workduck-checkbox"
				type="checkbox"
				bind:checked={shouldDeleteLocalFolder}
				disabled={!canDeleteLocalFolder || isDeleting}
			/>
			<span>{getDeleteLocalFolderLabel()}</span>
		</label>
		{#if !canDeleteLocalFolder}
			<p class="workduck-dialog-note">{getDeleteLocalFolderUnavailableText()}</p>
		{/if}
		{#if formError !== null}
			<p class="workduck-inline-error" aria-live="polite">{getProjectFormErrorMessage(formError, projectMessages.errors)}</p>
		{/if}
		<div class="workduck-dialog-actions">
			<button
				class="workduck-button workduck-button-secondary"
				type="button"
				disabled={isDeleting}
				onclick={onClose}
			>
				Cancel
			</button>
			<button
				class="workduck-button workduck-button-danger"
				type="button"
				disabled={!canConfirmDelete}
				onclick={onConfirm}
			>
				{isDeleting ? 'Removing' : 'Remove'}
			</button>
		</div>
	</div>
</div>
