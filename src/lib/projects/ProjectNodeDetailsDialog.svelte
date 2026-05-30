<script lang="ts">
	import type { WorkduckMessages } from '$lib/i18n/workduck-message-contract';
	import { modalDialog } from '$lib/ui/modal-dialog-action';
	import type { ProjectFormError } from './project-board-errors';
	import {
		PROJECT_NAME_MAX_LENGTH,
		PROJECT_NODE_PATH_MAX_LENGTH,
		type ProjectNodeRecord
	} from './project-registry';
	import type { ProjectRegistryStorageError } from './project-storage';

	interface Props {
		readonly editor: ProjectNodeRecord;
		readonly projectMessages: WorkduckMessages['projects'];
		nameInput: string;
		pathInput: string;
		readonly formError: ProjectFormError | null;
		readonly storageError: ProjectRegistryStorageError | null;
		readonly isSavingDetails: boolean;
		readonly canSaveDetails: boolean;
		readonly getVisibleFormErrorMessage: () => string;
		readonly onInput: () => void;
		readonly onSubmit: (event: SubmitEvent) => Promise<void>;
		readonly onBackdropClick: (event: MouseEvent) => void;
		readonly onClose: () => void;
	}

	let {
		editor,
		projectMessages,
		nameInput = $bindable(),
		pathInput = $bindable(),
		formError,
		storageError,
		isSavingDetails,
		canSaveDetails,
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
		aria-labelledby="project-details-dialog-title"
		use:modalDialog={{ onClose: isSavingDetails ? undefined : onClose, initialFocusSelector: '#project-details-name-input' }}
	>
		<form class="workduck-project-dialog-form" onsubmit={onSubmit}>
			<h2 id="project-details-dialog-title" class="workduck-dialog-title">
				{projectMessages.detailsDialog.title}
			</h2>

			<span class="workduck-dialog-kicker">{projectMessages.kinds[editor.kind]}</span>

			<label class="workduck-form-field" for="project-details-name-input">
				<span>{projectMessages.detailsDialog.name}</span>
				<input
					id="project-details-name-input"
					class="workduck-input"
					type="text"
					bind:value={nameInput}
					maxlength={PROJECT_NAME_MAX_LENGTH}
					autocomplete="off"
					disabled={isSavingDetails}
					oninput={onInput}
					aria-invalid={formError === 'project-name-required' ||
						formError === 'project-name-duplicate'}
				/>
			</label>

			<label class="workduck-form-field" for="project-details-path-input">
				<span>{projectMessages.detailsDialog.path}</span>
				<input
					id="project-details-path-input"
					class="workduck-input"
					type="text"
					bind:value={pathInput}
					maxlength={PROJECT_NODE_PATH_MAX_LENGTH}
					autocomplete="off"
					spellcheck="false"
					disabled={isSavingDetails}
					oninput={onInput}
					aria-invalid={formError === 'project-path-required' ||
						formError === 'project-path-duplicate'}
				/>
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
					disabled={isSavingDetails}
					onclick={onClose}
				>
					{projectMessages.detailsDialog.cancel}
				</button>
				<button
					class="workduck-button workduck-button-primary"
					type="submit"
					disabled={!canSaveDetails}
				>
					{isSavingDetails ? projectMessages.detailsDialog.saving : projectMessages.detailsDialog.save}
				</button>
			</div>
		</form>
	</div>
</div>
