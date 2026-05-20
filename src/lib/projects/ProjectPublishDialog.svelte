<script lang="ts">
	import type { ProjectFormError } from './project-board-errors';
	import {
		GITHUB_REPOSITORY_COMMIT_MESSAGE_MAX_LENGTH,
		GITHUB_REPOSITORY_NAME_MAX_LENGTH
	} from './project-board-publish-constants';
	import type { ProjectRepositoryGithubVisibility } from './project-repository';
	import type { ProjectRegistryStorageError } from './project-storage';

	interface Props {
		readonly repositoryName: string;
		githubRepositoryName: string;
		githubRepositoryCommitMessage: string;
		readonly githubRepositoryVisibility: ProjectRepositoryGithubVisibility;
		readonly formError: ProjectFormError | null;
		readonly storageError: ProjectRegistryStorageError | null;
		readonly isPublishingRepository: boolean;
		readonly canSubmitPublishRepository: boolean;
		readonly getVisibleFormErrorMessage: () => string;
		readonly onRepositoryNameInput: () => void;
		readonly onCommitMessageInput: () => void;
		readonly onSelectVisibility: (visibility: ProjectRepositoryGithubVisibility) => void;
		readonly onSubmit: (event: SubmitEvent) => Promise<void>;
		readonly onBackdropClick: (event: MouseEvent) => void;
		readonly onClose: () => void;
	}

	let {
		repositoryName,
		githubRepositoryName = $bindable(),
		githubRepositoryCommitMessage = $bindable(),
		githubRepositoryVisibility,
		formError,
		storageError,
		isPublishingRepository,
		canSubmitPublishRepository,
		getVisibleFormErrorMessage,
		onRepositoryNameInput,
		onCommitMessageInput,
		onSelectVisibility,
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
		aria-labelledby="project-publish-dialog-title"
	>
		<form class="workduck-project-dialog-form" onsubmit={onSubmit}>
			<h2 id="project-publish-dialog-title" class="workduck-dialog-title">
				Publish repository
			</h2>

			<span class="workduck-dialog-kicker">{repositoryName}</span>

			<label class="workduck-form-field" for="project-github-repository-name">
				<span>GitHub repository</span>
				<input
					id="project-github-repository-name"
					class="workduck-input"
					type="text"
					bind:value={githubRepositoryName}
					maxlength={GITHUB_REPOSITORY_NAME_MAX_LENGTH}
					autocomplete="off"
					spellcheck="false"
					disabled={isPublishingRepository}
					oninput={onRepositoryNameInput}
					aria-invalid={formError === 'project-repository-github-repo-name-required' ||
						formError === 'project-repository-github-repo-name-invalid'}
				/>
			</label>

			<label class="workduck-form-field" for="project-github-commit-message">
				<span>Commit message</span>
				<input
					id="project-github-commit-message"
					class="workduck-input"
					type="text"
					bind:value={githubRepositoryCommitMessage}
					maxlength={GITHUB_REPOSITORY_COMMIT_MESSAGE_MAX_LENGTH}
					autocomplete="off"
					spellcheck="false"
					disabled={isPublishingRepository}
					oninput={onCommitMessageInput}
					aria-invalid={formError === 'project-repository-github-commit-message-required' ||
						formError === 'project-repository-github-commit-message-invalid'}
				/>
			</label>

			<div class="workduck-repository-source-mode" role="group" aria-label="GitHub visibility">
				<button
					class="workduck-repository-source-mode-button"
					class:workduck-repository-source-mode-button-active={githubRepositoryVisibility === 'private'}
					type="button"
					aria-pressed={githubRepositoryVisibility === 'private'}
					disabled={isPublishingRepository}
					onclick={() => onSelectVisibility('private')}
				>
					Private
				</button>
				<button
					class="workduck-repository-source-mode-button"
					class:workduck-repository-source-mode-button-active={githubRepositoryVisibility === 'public'}
					type="button"
					aria-pressed={githubRepositoryVisibility === 'public'}
					disabled={isPublishingRepository}
					onclick={() => onSelectVisibility('public')}
				>
					Public
				</button>
			</div>

			{#if formError !== null || storageError !== null}
				<p class="workduck-inline-error" aria-live="polite">
					{getVisibleFormErrorMessage()}
				</p>
			{/if}

			<div class="workduck-dialog-actions">
				<button
					class="workduck-button workduck-button-secondary"
					type="button"
					disabled={isPublishingRepository}
					onclick={onClose}
				>
					Cancel
				</button>
				<button
					class="workduck-button workduck-button-primary"
					type="submit"
					disabled={!canSubmitPublishRepository}
				>
					{isPublishingRepository ? 'Publishing' : 'Publish'}
				</button>
			</div>
		</form>
	</div>
</div>
