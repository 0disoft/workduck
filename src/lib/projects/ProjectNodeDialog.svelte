<script lang="ts">
	import { modalDialog } from '$lib/ui/modal-dialog-action';
	import type { ProjectFormError } from './project-board-errors';
	import type { GithubCredentialOption } from './project-board-github-credentials';
	import {
		PROJECT_DESCRIPTION_MAX_LENGTH,
		PROJECT_NAME_MAX_LENGTH,
		PROJECT_REPOSITORY_REMOTE_URL_MAX_LENGTH
	} from './project-registry';
	import type { ProjectDialogMode, ProjectRepositorySourceMode } from './project-board-types';
	import type { ProjectRegistryStorageError } from './project-storage';

	interface Props {
		readonly mode: ProjectDialogMode;
		readonly targetNodeName: string | null;
		formName: string;
		formDescription: string;
		formTags: string;
		repositoryRemoteUrl: string;
		repositoryGithubCredentialSecretId: string;
		repositorySsealedScaffold: boolean;
		readonly repositorySourceMode: ProjectRepositorySourceMode;
		readonly githubCredentialOptions: readonly GithubCredentialOption[];
		readonly formError: ProjectFormError | null;
		readonly storageError: ProjectRegistryStorageError | null;
		readonly isSubmitting: boolean;
		readonly canSubmitDialog: boolean;
		readonly getDialogTitle: () => string;
		readonly getDialogSubmitLabel: () => string;
		readonly getTagsInputMaxLength: () => number;
		readonly getVisibleFormErrorMessage: () => string;
		readonly isRepositoryRemoteUrlError: (error: ProjectFormError | null) => boolean;
		readonly onNameInput: () => void;
		readonly onDescriptionInput: () => void;
		readonly onTagsInput: () => void;
		readonly onRepositoryRemoteUrlInput: (event: Event) => void;
		readonly onRepositoryGithubCredentialSelect: (event: Event) => void;
		readonly onRepositorySsealedScaffoldToggle: () => void;
		readonly onSelectRepositorySourceMode: (sourceMode: ProjectRepositorySourceMode) => void;
		readonly onSubmit: (event: SubmitEvent) => Promise<void>;
		readonly onBackdropClick: (event: MouseEvent) => void;
		readonly onClose: () => void;
	}

	let {
		mode,
		targetNodeName,
		formName = $bindable(),
		formDescription = $bindable(),
		formTags = $bindable(),
		repositoryRemoteUrl = $bindable(),
		repositoryGithubCredentialSecretId = $bindable(),
		repositorySsealedScaffold = $bindable(),
		repositorySourceMode,
		githubCredentialOptions,
		formError,
		storageError,
		isSubmitting,
		canSubmitDialog,
		getDialogTitle,
		getDialogSubmitLabel,
		getTagsInputMaxLength,
		getVisibleFormErrorMessage,
		isRepositoryRemoteUrlError,
		onNameInput,
		onDescriptionInput,
		onTagsInput,
		onRepositoryRemoteUrlInput,
		onRepositoryGithubCredentialSelect,
		onRepositorySsealedScaffoldToggle,
		onSelectRepositorySourceMode,
		onSubmit,
		onBackdropClick,
		onClose
	}: Props = $props();

	function getRepositoryUrlLabel() {
		return repositorySourceMode === 'fork' ? 'Upstream repository' : 'Repository URL';
	}

	function getSubmitButtonLabel() {
		if (isSubmitting) {
			return repositorySourceMode === 'fork' ? 'Forking' : 'Saving';
		}

		return repositorySourceMode === 'fork' ? 'Fork & Clone' : getDialogSubmitLabel();
	}

	function isGithubCredentialError(error: ProjectFormError | null) {
		return (
			error === 'project-github-credential-required' ||
			error === 'project-github-credential-vault-locked' ||
			error === 'project-github-credential-missing' ||
			error === 'project-github-credential-invalid'
		);
	}

	function getInitialFocusSelector() {
		if (mode !== 'repository') {
			return '#project-dialog-name';
		}

		return repositorySourceMode === 'folder'
			? '#project-repository-folder-name'
			: '#project-repository-url';
	}
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="workduck-dialog-backdrop" role="presentation" onclick={onBackdropClick}>
	<div
		class="workduck-dialog workduck-project-dialog"
		role="dialog"
		aria-modal="true"
		aria-labelledby="project-dialog-title"
		use:modalDialog={{
			onClose: isSubmitting ? undefined : onClose,
			initialFocusSelector: getInitialFocusSelector()
		}}
	>
		<form class="workduck-project-dialog-form" onsubmit={onSubmit}>
			<h2 id="project-dialog-title" class="workduck-dialog-title">{getDialogTitle()}</h2>

			{#if targetNodeName !== null}
				<span class="workduck-dialog-kicker">{targetNodeName}</span>
			{/if}

			{#if mode !== 'repository'}
				<label class="workduck-form-field" for="project-dialog-name">
					<span>Name</span>
					<input
						id="project-dialog-name"
						class="workduck-input"
						type="text"
						bind:value={formName}
						maxlength={PROJECT_NAME_MAX_LENGTH}
						autocomplete="off"
						disabled={isSubmitting}
						oninput={onNameInput}
						aria-invalid={formError === 'project-name-required' ||
							formError === 'project-name-duplicate' ||
							formError === 'project-folder-name-required' ||
							formError === 'project-folder-name-invalid' ||
							formError === 'project-folder-conflict'}
					/>
				</label>
				<label class="workduck-form-field" for="project-dialog-description">
					<span>Description</span>
					<textarea
						id="project-dialog-description"
						class="workduck-input workduck-project-description-input"
						bind:value={formDescription}
						maxlength={PROJECT_DESCRIPTION_MAX_LENGTH}
						autocomplete="off"
						spellcheck="true"
						disabled={isSubmitting}
						oninput={onDescriptionInput}
					></textarea>
				</label>
			{:else}
				<div class="workduck-repository-source-mode" role="group" aria-label="Repository source">
					<button
						class="workduck-repository-source-mode-button"
						class:workduck-repository-source-mode-button-active={repositorySourceMode === 'folder'}
						type="button"
						aria-pressed={repositorySourceMode === 'folder'}
						disabled={isSubmitting}
						onclick={() => onSelectRepositorySourceMode('folder')}
					>
						Folder
					</button>
					<button
						class="workduck-repository-source-mode-button"
						class:workduck-repository-source-mode-button-active={repositorySourceMode === 'remote'}
						type="button"
						aria-pressed={repositorySourceMode === 'remote'}
						disabled={isSubmitting}
						onclick={() => onSelectRepositorySourceMode('remote')}
					>
						URL
					</button>
					<button
						class="workduck-repository-source-mode-button"
						class:workduck-repository-source-mode-button-active={repositorySourceMode === 'fork'}
						type="button"
						aria-pressed={repositorySourceMode === 'fork'}
						disabled={isSubmitting}
						onclick={() => onSelectRepositorySourceMode('fork')}
					>
						Fork
					</button>
				</div>

				{#if repositorySourceMode === 'folder'}
					<label class="workduck-form-field" for="project-repository-folder-name">
						<span>Folder name</span>
						<input
							id="project-repository-folder-name"
							class="workduck-input"
							type="text"
							bind:value={formName}
							maxlength={PROJECT_NAME_MAX_LENGTH}
							autocomplete="off"
							spellcheck="false"
							disabled={isSubmitting}
							oninput={onNameInput}
							aria-invalid={formError === 'project-repository-name-required' ||
								formError === 'project-folder-name-required' ||
								formError === 'project-folder-name-invalid' ||
								formError === 'project-folder-conflict'}
						/>
					</label>
					<label class="workduck-project-checkbox-field" for="project-repository-ssealed-scaffold">
						<input
							id="project-repository-ssealed-scaffold"
							class="workduck-checkbox"
							type="checkbox"
							bind:checked={repositorySsealedScaffold}
							disabled={isSubmitting}
							onchange={onRepositorySsealedScaffoldToggle}
						/>
						<span>ssealed fullstack scaffold</span>
					</label>
				{:else}
					<label class="workduck-form-field" for="project-repository-url">
						<span>{getRepositoryUrlLabel()}</span>
						<input
							id="project-repository-url"
							class="workduck-input"
							type="text"
							bind:value={repositoryRemoteUrl}
							maxlength={PROJECT_REPOSITORY_REMOTE_URL_MAX_LENGTH}
							autocomplete="off"
							spellcheck="false"
							disabled={isSubmitting}
							placeholder="https://github.com/owner/repo.git"
							oninput={onRepositoryRemoteUrlInput}
							aria-invalid={isRepositoryRemoteUrlError(formError)}
						/>
					</label>
					{#if repositorySourceMode === 'fork'}
						<label class="workduck-form-field" for="project-repository-github-credential">
							<span>GitHub credential</span>
							<select
								id="project-repository-github-credential"
								class="workduck-input"
								bind:value={repositoryGithubCredentialSecretId}
								disabled={isSubmitting}
								onchange={onRepositoryGithubCredentialSelect}
								aria-invalid={isGithubCredentialError(formError)}
							>
								<option value="">Select credential</option>
								{#each githubCredentialOptions as option (option.id)}
									<option value={option.id}>{option.name}</option>
								{/each}
							</select>
						</label>
					{/if}
				{/if}
			{/if}

			<label class="workduck-form-field" for="project-dialog-tags">
				<span>Tags</span>
				<input
					id="project-dialog-tags"
					class="workduck-input"
					type="text"
					bind:value={formTags}
					maxlength={getTagsInputMaxLength()}
					autocomplete="off"
					spellcheck="false"
					disabled={isSubmitting}
					placeholder="frontend, api"
					oninput={onTagsInput}
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
					disabled={isSubmitting}
					onclick={onClose}
				>
					Cancel
				</button>
				<button
					class="workduck-button workduck-button-primary"
					type="submit"
					disabled={!canSubmitDialog}
				>
					{getSubmitButtonLabel()}
				</button>
			</div>
		</form>
	</div>
</div>
