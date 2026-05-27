<script lang="ts">
	import { modalDialog } from '$lib/ui/modal-dialog-action';
	import {
		PROJECT_DESCRIPTION_MAX_LENGTH,
		type ProjectNodeRecord
	} from './project-registry';
	import type { ProjectRegistryStorageError } from './project-storage';
	import type { ProjectFormError } from './project-board-errors';

	interface Props {
		readonly editor: ProjectNodeRecord;
		descriptionInput: string;
		readonly formError: ProjectFormError | null;
		readonly storageError: ProjectRegistryStorageError | null;
		readonly isSavingDescription: boolean;
		readonly canSaveDescription: boolean;
		readonly getVisibleFormErrorMessage: () => string;
		readonly onInput: () => void;
		readonly onSubmit: (event: SubmitEvent) => Promise<void>;
		readonly onBackdropClick: (event: MouseEvent) => void;
		readonly onClose: () => void;
	}

	let {
		editor,
		descriptionInput = $bindable(),
		formError,
		storageError,
		isSavingDescription,
		canSaveDescription,
		getVisibleFormErrorMessage,
		onInput,
		onSubmit,
		onBackdropClick,
		onClose
	}: Props = $props();
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="workduck-dialog-backdrop" role="presentation" onclick={onBackdropClick}>
	<div
		class="workduck-dialog workduck-project-dialog"
		role="dialog"
		aria-modal="true"
		aria-labelledby="project-description-dialog-title"
		use:modalDialog={{ onClose: isSavingDescription ? undefined : onClose, initialFocusSelector: '#project-description-editor-input' }}
	>
		<form class="workduck-project-dialog-form" onsubmit={onSubmit}>
			<h2 id="project-description-dialog-title" class="workduck-dialog-title">
				Edit description
			</h2>

			<span class="workduck-dialog-kicker">{editor.name}</span>

			<label class="workduck-form-field" for="project-description-editor-input">
				<span>Description</span>
				<textarea
					id="project-description-editor-input"
					class="workduck-input workduck-project-description-input"
					bind:value={descriptionInput}
					maxlength={PROJECT_DESCRIPTION_MAX_LENGTH}
					autocomplete="off"
					spellcheck="true"
					disabled={isSavingDescription}
					oninput={onInput}
				></textarea>
			</label>

			{#if formError !== null || storageError !== null}
				<p class="workduck-inline-error" aria-live="polite">
					{getVisibleFormErrorMessage()}
				</p>
			{/if}

			<div class="workduck-dialog-actions">
				<button
					class="workduck-button workduck-button-secondary"
					type="button"
					disabled={isSavingDescription}
					onclick={onClose}
				>
					Cancel
				</button>
				<button
					class="workduck-button workduck-button-primary"
					type="submit"
					disabled={!canSaveDescription}
				>
					{isSavingDescription ? 'Saving' : 'Save'}
				</button>
			</div>
		</form>
	</div>
</div>
