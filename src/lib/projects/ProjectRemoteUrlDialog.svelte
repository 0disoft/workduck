<script lang="ts">
	import type { ProjectFormError } from './project-board-errors';
	import type { ProjectRepositoryRemoteUrlEditorTarget } from './project-board-types';
	import type { ProjectRegistryStorageError } from './project-storage';

	interface Props {
		readonly editor: ProjectRepositoryRemoteUrlEditorTarget;
		remoteUrlInput: string;
		readonly formError: ProjectFormError | null;
		readonly storageError: ProjectRegistryStorageError | null;
		readonly isSavingRemoteUrl: boolean;
		readonly canSaveRemoteUrl: boolean;
		readonly getVisibleFormErrorMessage: () => string;
		readonly onInput: () => void;
		readonly onSubmit: (event: SubmitEvent) => Promise<void>;
		readonly onBackdropClick: (event: MouseEvent) => void;
		readonly onClose: () => void;
	}

	let {
		editor,
		remoteUrlInput = $bindable(),
		formError,
		storageError,
		isSavingRemoteUrl,
		canSaveRemoteUrl,
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
		aria-labelledby="project-remote-url-dialog-title"
	>
		<form class="workduck-project-dialog-form" onsubmit={onSubmit}>
			<h2 id="project-remote-url-dialog-title" class="workduck-dialog-title">Remote URL</h2>

			<span class="workduck-dialog-kicker">{editor.repository.name}</span>

			<label class="workduck-form-field" for="project-remote-url-editor-input">
				<span>Repository URL</span>
				<input
					id="project-remote-url-editor-input"
					class="workduck-input"
					type="text"
					bind:value={remoteUrlInput}
					autocomplete="off"
					spellcheck="false"
					disabled={isSavingRemoteUrl}
					placeholder="https://github.com/owner/repo.git"
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
					disabled={isSavingRemoteUrl}
					onclick={onClose}
				>
					Cancel
				</button>
				<button
					class="workduck-button workduck-button-primary"
					type="submit"
					disabled={!canSaveRemoteUrl}
				>
					{isSavingRemoteUrl ? 'Saving' : 'Save'}
				</button>
			</div>
		</form>
	</div>
</div>
