<script lang="ts">
	import type { ProjectFormError } from './project-board-errors';
	import type { ProjectTagEditorTarget } from './project-board-types';
	import type { ProjectRegistryStorageError } from './project-storage';

	interface Props {
		readonly editor: ProjectTagEditorTarget;
		tagInput: string;
		readonly formError: ProjectFormError | null;
		readonly storageError: ProjectRegistryStorageError | null;
		readonly isSavingTags: boolean;
		readonly canSaveTags: boolean;
		readonly getTagsInputMaxLength: () => number;
		readonly getVisibleFormErrorMessage: () => string;
		readonly onInput: () => void;
		readonly onSubmit: (event: SubmitEvent) => Promise<void>;
		readonly onBackdropClick: (event: MouseEvent) => void;
		readonly onClose: () => void;
	}

	let {
		editor,
		tagInput = $bindable(),
		formError,
		storageError,
		isSavingTags,
		canSaveTags,
		getTagsInputMaxLength,
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
		aria-labelledby="project-tag-dialog-title"
	>
		<form class="workduck-project-dialog-form" onsubmit={onSubmit}>
			<h2 id="project-tag-dialog-title" class="workduck-dialog-title">Edit tags</h2>

			<span class="workduck-dialog-kicker">
				{editor.type === 'repository' ? editor.repository.name : editor.node.name}
			</span>

			<label class="workduck-form-field" for="project-tag-editor-input">
				<span>Tags</span>
				<input
					id="project-tag-editor-input"
					class="workduck-input"
					type="text"
					bind:value={tagInput}
					maxlength={getTagsInputMaxLength()}
					autocomplete="off"
					spellcheck="false"
					disabled={isSavingTags}
					placeholder="frontend, api"
					oninput={onInput}
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
					disabled={isSavingTags}
					onclick={onClose}
				>
					Cancel
				</button>
				<button
					class="workduck-button workduck-button-primary"
					type="submit"
					disabled={!canSaveTags}
				>
					{isSavingTags ? 'Saving' : 'Save'}
				</button>
			</div>
		</form>
	</div>
</div>
