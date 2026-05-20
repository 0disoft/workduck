<script lang="ts">
	import type { EnvironmentVault } from '$lib/environment/environment-vault';
	import type { SecretVaultEnvelope } from '$lib/environment/secret-vault-crypto';
	import type { ProjectFormError } from './project-board-errors';
	import type { GithubCredentialOption } from './project-board-github-credentials';
	import type { ProjectGithubCredentialEditorTarget } from './project-board-types';
	import type { ProjectRegistryStorageError } from './project-storage';

	interface Props {
		readonly editor: ProjectGithubCredentialEditorTarget;
		environmentVaultPassword: string;
		selectedGithubCredentialSecretId: string;
		readonly environmentVaultEnvelope: SecretVaultEnvelope | null;
		readonly environmentVault: EnvironmentVault | null;
		readonly environmentVaultError: string | null;
		readonly githubCredentialOptions: readonly GithubCredentialOption[];
		readonly formError: ProjectFormError | null;
		readonly storageError: ProjectRegistryStorageError | null;
		readonly isEnvironmentVaultBusy: boolean;
		readonly isSubmitting: boolean;
		readonly canSaveGithubCredential: boolean;
		readonly getVisibleFormErrorMessage: () => string;
		readonly onUnlock: (event: SubmitEvent) => Promise<void>;
		readonly onSubmit: (event: SubmitEvent) => Promise<void>;
		readonly onBackdropClick: (event: MouseEvent) => void;
		readonly onClose: () => void;
	}

	let {
		editor,
		environmentVaultPassword = $bindable(),
		selectedGithubCredentialSecretId = $bindable(),
		environmentVaultEnvelope,
		environmentVault,
		environmentVaultError,
		githubCredentialOptions,
		formError,
		storageError,
		isEnvironmentVaultBusy,
		isSubmitting,
		canSaveGithubCredential,
		getVisibleFormErrorMessage,
		onUnlock,
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
		aria-labelledby="project-github-credential-dialog-title"
	>
		<h2 id="project-github-credential-dialog-title" class="workduck-dialog-title">
			GitHub credential
		</h2>

		<span class="workduck-dialog-kicker">
			{editor.type === 'repository' ? editor.repository.name : editor.node.name}
		</span>

		{#if environmentVaultEnvelope === null}
			<p class="workduck-dialog-text">Create an Environment vault and add a GitHub token.</p>
			<div class="workduck-dialog-actions">
				<button class="workduck-button workduck-button-secondary" type="button" onclick={onClose}>
					Close
				</button>
			</div>
		{:else if environmentVault === null}
			<form class="workduck-project-dialog-form" onsubmit={onUnlock}>
				<label class="workduck-form-field" for="project-environment-vault-password">
					<span>Password</span>
					<input
						id="project-environment-vault-password"
						class="workduck-input"
						type="password"
						bind:value={environmentVaultPassword}
						autocomplete="current-password"
						disabled={isEnvironmentVaultBusy}
					/>
				</label>

				{#if environmentVaultError !== null}
					<p class="workduck-inline-error" aria-live="polite">{environmentVaultError}</p>
				{/if}

				<div class="workduck-dialog-actions">
					<button
						class="workduck-button workduck-button-secondary"
						type="button"
						disabled={isEnvironmentVaultBusy}
						onclick={onClose}
					>
						Cancel
					</button>
					<button
						class="workduck-button workduck-button-primary"
						type="submit"
						disabled={environmentVaultPassword.length === 0 || isEnvironmentVaultBusy}
					>
						{isEnvironmentVaultBusy ? 'Unlocking' : 'Unlock'}
					</button>
				</div>
			</form>
		{:else}
			<form class="workduck-project-dialog-form" onsubmit={onSubmit}>
				<label class="workduck-form-field" for="project-github-credential-select">
					<span>Credential</span>
					<select
						id="project-github-credential-select"
						class="workduck-input"
						bind:value={selectedGithubCredentialSecretId}
						disabled={isSubmitting}
					>
						<option value="">System Git</option>
						{#each githubCredentialOptions as option (option.id)}
							<option value={option.id}>{option.name}</option>
						{/each}
					</select>
				</label>

				{#if githubCredentialOptions.length === 0}
					<p class="workduck-dialog-note">Add a token with the GitHub tag in Environment.</p>
				{/if}

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
						disabled={!canSaveGithubCredential}
					>
						{isSubmitting ? 'Saving' : 'Save'}
					</button>
				</div>
			</form>
		{/if}
	</div>
</div>
