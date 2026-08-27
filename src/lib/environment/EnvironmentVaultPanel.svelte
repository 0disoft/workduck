<script lang="ts">
	import { onMount, untrack } from 'svelte';

	import { getWorkduckMessages } from '$lib/i18n/workduck-language';
	import {
		createDefaultAppearanceSettings,
		type AppearanceSettings
	} from '$lib/settings/appearance-settings';
	import {
		readAppearanceSettingsFromBrowser,
		subscribeAppearanceSettings
	} from '$lib/settings/appearance-storage';
	import PageTitleRow from '$lib/ui/PageTitleRow.svelte';
	import StatusToast from '$lib/ui/StatusToast.svelte';
	import type { WorkspaceRecord } from '$lib/workspaces/workspace-registry';
	import { readWorkspaceUnlockPasswordSession } from '$lib/workspaces/workspace-unlock';

	import {
		applyCliEnvironmentVariables,
		type CliEnvironmentApplyError
	} from './cli-environment';
	import { createCliEnvironmentVariablePlan } from './cli-environment-variables';
	import {
		createMaskedSecretValueForLength,
		environmentSecretKindOptions,
		environmentSecretTagOptions,
		type EnvironmentSecretKind,
		type EnvironmentSecretRecord,
		type EnvironmentSecretTag,
		type EnvironmentVault
	} from './environment-vault';
	import {
		readEnvironmentVaultEnvelopeForWorkspace,
		subscribeEnvironmentVaultEnvelopeForWorkspace,
		writeEnvironmentVaultEnvelopeForWorkspace
	} from './environment-vault-storage';
	import {
		closeEnvironmentVaultSession,
		createEnvironmentVaultSession,
		openEnvironmentVaultSession,
		readEnvironmentVaultSessionSecretValue,
		removeEnvironmentVaultSessionSecret,
		upsertEnvironmentVaultSessionSecret,
		type EnvironmentVaultSessionError,
		type EnvironmentVaultSessionMutationResult
	} from './environment-vault-session';
	import {
		clearEnvironmentVaultUnlockAttempts,
		getEnvironmentVaultUnlockLockout,
		recordEnvironmentVaultUnlockFailure
	} from './environment-vault-unlock';
	import type { SecretVaultEnvelope } from './secret-vault-crypto';

	interface Props {
		readonly workspace: WorkspaceRecord;
		readonly title: string;
	}

	let { workspace, title }: Props = $props();

	let appearanceSettings = $state<AppearanceSettings>(createDefaultAppearanceSettings());
	let vaultEnvelope = $state<SecretVaultEnvelope | null>(null);
	let vault = $state<EnvironmentVault | null>(null);
	let vaultPassword = $state('');
	let secretName = $state('');
	let secretKind = $state<EnvironmentSecretKind | ''>('');
	let secretTag = $state<EnvironmentSecretTag | ''>('');
	let secretKindFilter = $state<EnvironmentSecretKind | 'all'>('all');
	let secretTagFilter = $state<EnvironmentSecretTag | 'all'>('all');
	let secretValue = $state('');
	let editingSecretId = $state<string | null>(null);
	let visibleSecretValues = $state<ReadonlyMap<string, string>>(new Map());
	let isBusy = $state(false);
	let error = $state<string | null>(null);
	let status = $state<string | null>(null);
	let nowMs = $state(Date.now());
	let autoUnlockAttempted = $state(false);

	let messages = $derived(getWorkduckMessages(appearanceSettings.languageId));
	let environmentMessages = $derived(messages.environment);
	let vaultIsOpen = $derived(vault !== null);
	let secretCountLabel = $derived(
		vault === null
			? null
			: environmentMessages.registeredCount.replace('{count}', vault.secrets.length.toString())
	);
	let cliEnvironmentPlan = $derived(
		vault === null
			? { variables: [], skippedSecrets: [] }
			: createCliEnvironmentVariablePlan(vault.secrets)
	);
	let cliEnvironmentVariables = $derived(cliEnvironmentPlan.variables);
	let submitLabel = $derived(editingSecretId === null ? messages.common.add : messages.common.save);
	let unlockLabel = $derived(
		vaultEnvelope === null ? environmentMessages.createVault : environmentMessages.unlockVault
	);
	let vaultLockout = $derived(getEnvironmentVaultUnlockLockout(workspace.id, nowMs));
	let vaultUnlockIsLocked = $derived(vaultEnvelope !== null && vaultLockout.isLocked);
	let editingSecret = $derived(
		editingSecretId === null
			? null
			: vault?.secrets.find((secret) => secret.id === editingSecretId) ?? null
	);
	let filteredSecrets = $derived(
		(vault?.secrets ?? []).filter((secret) => {
			if (secretKindFilter !== 'all' && secret.kind !== secretKindFilter) {
				return false;
			}

			if (secretTagFilter !== 'all' && !secret.tags.includes(secretTagFilter)) {
				return false;
			}

			return true;
		})
	);

	function resetLocalVaultState(nextEnvelope: SecretVaultEnvelope | null) {
		vaultEnvelope = nextEnvelope;
		vault = null;
		vaultPassword = '';
		secretName = '';
		secretKind = '';
		secretTag = '';
		secretKindFilter = 'all';
		secretTagFilter = 'all';
		secretValue = '';
		editingSecretId = null;
		visibleSecretValues = new Map();
		error = null;
		status = null;
		autoUnlockAttempted = false;
	}

	async function tryOpenVaultWithWorkspaceSession(nextEnvelope: SecretVaultEnvelope | null) {
		if (vault !== null || isBusy || autoUnlockAttempted) {
			return;
		}

		const sessionPassword = readWorkspaceUnlockPasswordSession(workspace.id);

		if (sessionPassword === null) {
			return;
		}

		autoUnlockAttempted = true;

		if (nextEnvelope === null) {
			await createAndPersistVault(sessionPassword, null);
			return;
		}

		isBusy = true;
		error = null;
		status = null;

		try {
			const openResult = await openEnvironmentVaultSession(
				workspace.id,
				sessionPassword,
				nextEnvelope
			);

			if (!openResult.ok) {
				return;
			}

			vault = openResult.vault;
			clearEnvironmentVaultUnlockAttempts(workspace.id);
		} finally {
			isBusy = false;
		}
	}

	async function handleVaultSubmit(event: SubmitEvent) {
		event.preventDefault();

		if (isBusy) {
			return;
		}

		if (vaultPassword.length === 0) {
			error = environmentMessages.errors.vaultPasswordRequired;
			return;
		}

		if (vaultUnlockIsLocked) {
			error = environmentMessages.errors.vaultPasswordTryAgain.replace(
				'{seconds}',
				vaultLockout.secondsRemaining.toString()
			);
			return;
		}

		if (vaultEnvelope === null) {
			await createAndPersistVault(vaultPassword, environmentMessages.statuses.created);
			return;
		}

		isBusy = true;
		error = null;
		status = null;

		try {
			const openResult = await openEnvironmentVaultSession(
				workspace.id,
				vaultPassword,
				vaultEnvelope
			);

			if (!openResult.ok) {
				if (openResult.error === 'environment-vault-session-decrypt-failed') {
					const lockout = recordEnvironmentVaultUnlockFailure(workspace.id, Date.now());
					error = lockout.isLocked
						? environmentMessages.errors.vaultPasswordTryAgain.replace(
								'{seconds}',
								lockout.secondsRemaining.toString()
							)
						: environmentMessages.errors.vaultPasswordMismatchWithAttempts.replace(
								'{attemptsRemaining}',
								lockout.attemptsRemaining.toString()
							);
				} else {
					error = createEnvironmentVaultSessionErrorMessage(openResult.error);
				}
				return;
			}

			vault = openResult.vault;
			vaultPassword = '';
			clearEnvironmentVaultUnlockAttempts(workspace.id);
		} finally {
			isBusy = false;
		}
	}

	async function createAndPersistVault(password: string, successStatus: string | null) {
		isBusy = true;
		error = null;
		status = null;

		try {
			const createResult = await createEnvironmentVaultSession(workspace.id, password);

			if (!createResult.ok) {
				error = createEnvironmentVaultSessionErrorMessage(createResult.error);
				return;
			}

			if (!(await persistVaultMutation(createResult))) {
				return;
			}

			vaultPassword = '';
			clearEnvironmentVaultUnlockAttempts(workspace.id);
			status = successStatus;
		} finally {
			isBusy = false;
		}
	}

	async function handleSecretSubmit(event: SubmitEvent) {
		event.preventDefault();

		if (vault === null || isBusy) {
			return;
		}

		isBusy = true;
		error = null;
		status = null;

		try {
			const mutation = await upsertEnvironmentVaultSessionSecret(workspace.id, {
				id: editingSecretId,
				name: secretName,
				kind: secretKind,
				tags: secretTag === '' ? [] : [secretTag],
				value: secretValue
			});

			if (!mutation.ok) {
				error = createEnvironmentVaultSessionErrorMessage(mutation.error);
				return;
			}

			if (!(await persistVaultMutation(mutation))) {
				return;
			}

			clearSecretForm();
			status = environmentMessages.statuses.saved;
		} finally {
			isBusy = false;
		}
	}

	async function handleRemoveSecret(secret: EnvironmentSecretRecord) {
		if (vault === null || isBusy) {
			return;
		}

		isBusy = true;
		error = null;
		status = null;

		try {
			const mutation = await removeEnvironmentVaultSessionSecret(workspace.id, secret.id);

			if (!mutation.ok) {
				error = createEnvironmentVaultSessionErrorMessage(mutation.error);
				return;
			}

			if (!(await persistVaultMutation(mutation))) {
				return;
			}

			visibleSecretValues = createNextVisibleSecretValues(secret.id, null);
			status = environmentMessages.statuses.removed;
		} finally {
			isBusy = false;
		}
	}

	function handleEditSecret(secret: EnvironmentSecretRecord) {
		editingSecretId = secret.id;
		secretName = secret.name;
		secretKind = secret.kind;
		secretTag = secret.tags[0] ?? '';
		secretValue = '';
		error = null;
		status = null;
	}

	async function handleCopySecret(secret: EnvironmentSecretRecord) {
		if (typeof navigator === 'undefined' || navigator.clipboard === undefined) {
			error = environmentMessages.errors.clipboardUnavailable;
			return;
		}

		const valueResult = await readEnvironmentVaultSessionSecretValue(workspace.id, secret.id);
		if (!valueResult.ok) {
			error = createEnvironmentVaultSessionErrorMessage(valueResult.error);
			return;
		}

		try {
			await navigator.clipboard.writeText(valueResult.value);
			status = environmentMessages.statuses.copied;
			error = null;
		} catch {
			error = environmentMessages.errors.copyFailed;
		}
	}

	async function handleToggleSecretVisibility(secret: EnvironmentSecretRecord) {
		if (visibleSecretValues.has(secret.id)) {
			visibleSecretValues = createNextVisibleSecretValues(secret.id, null);
			return;
		}

		const valueResult = await readEnvironmentVaultSessionSecretValue(workspace.id, secret.id);
		if (!valueResult.ok) {
			error = createEnvironmentVaultSessionErrorMessage(valueResult.error);
			return;
		}

		visibleSecretValues = createNextVisibleSecretValues(secret.id, valueResult.value);
		error = null;
		status = null;
	}

	async function handleLockVault() {
		if (isBusy) {
			return;
		}

		isBusy = true;
		const closeResult = await closeEnvironmentVaultSession(workspace.id);
		isBusy = false;

		if (
			!closeResult.ok &&
			closeResult.error !== 'environment-vault-session-unavailable'
		) {
			error = createEnvironmentVaultSessionErrorMessage(closeResult.error);
			return;
		}

		resetLocalVaultState(vaultEnvelope);
	}

	async function handleApplyCliEnvironmentVariables() {
		if (vault === null || isBusy) {
			return;
		}

		const plan = createCliEnvironmentVariablePlan(vault.secrets);
		const variables = plan.variables;

		if (variables.length === 0) {
			error = environmentMessages.errors.cliEnvironmentNoVariables;
			status = null;
			return;
		}

		if (
			typeof window !== 'undefined' &&
			!window.confirm(environmentMessages.cliEnvironmentConfirm)
		) {
			return;
		}

		isBusy = true;
		error = null;
		status = null;

		try {
			const result = await applyCliEnvironmentVariables(variables);

			if (!result.ok) {
				error = createCliEnvironmentApplyErrorMessage(result.error);
				return;
			}

			status =
				plan.skippedSecrets.length > 0
					? environmentMessages.statuses.cliEnvironmentAppliedWithSkipped
							.replace('{applied}', result.appliedNames.length.toString())
							.replace('{skipped}', plan.skippedSecrets.length.toString())
					: environmentMessages.statuses.cliEnvironmentApplied.replace(
							'{count}',
							result.appliedNames.length.toString()
						);
		} finally {
			isBusy = false;
		}
	}

	function getSecretKindLabel(kind: EnvironmentSecretKind) {
		return environmentMessages.secretKinds[kind] ?? environmentMessages.secretKinds.other;
	}

	function getSecretTagLabel(tag: EnvironmentSecretTag) {
		return environmentMessages.secretTags[tag] ?? tag;
	}

	function getSecretDisplayValue(secret: EnvironmentSecretRecord) {
		return (
			visibleSecretValues.get(secret.id) ??
			createMaskedSecretValueForLength(secret.valueLength ?? 8)
		);
	}

	function clearSecretForm() {
		editingSecretId = null;
		secretName = '';
		secretKind = '';
		secretTag = '';
		secretValue = '';
		error = null;
	}

	async function persistVaultMutation(mutation: EnvironmentVaultSessionMutationResult) {
		if (!mutation.ok) {
			return false;
		}

		const previousEnvelope = vaultEnvelope;
		const writeResult = await writeEnvironmentVaultEnvelopeForWorkspace(
			workspace.id,
			mutation.envelope,
			workspace.path
		);

		if (!writeResult.ok) {
			await closeEnvironmentVaultSession(workspace.id);
			vault = null;
			vaultEnvelope = previousEnvelope;
			visibleSecretValues = new Map();
			error = environmentMessages.errors.vaultSaveFailed;
			return false;
		}

		vaultEnvelope = mutation.envelope;
		vault = mutation.vault;
		return true;
	}

	function createNextVisibleSecretValues(secretId: string, value: string | null) {
		const nextVisibleSecretValues = new Map(visibleSecretValues);

		if (value === null) {
			nextVisibleSecretValues.delete(secretId);
		} else {
			nextVisibleSecretValues.set(secretId, value);
		}

		return nextVisibleSecretValues;
	}

	function createEnvironmentVaultSessionErrorMessage(nextError: EnvironmentVaultSessionError) {
		switch (nextError) {
			case 'environment-secret-name-required':
				return environmentMessages.errors.nameRequired;
			case 'environment-secret-kind-required':
				return environmentMessages.errors.kindRequired;
			case 'environment-secret-tag-required':
				return environmentMessages.errors.tagRequired;
			case 'environment-secret-name-duplicate':
				return environmentMessages.errors.nameDuplicate;
			case 'environment-secret-value-required':
				return environmentMessages.errors.valueRequired;
			case 'environment-secret-not-found':
				return environmentMessages.errors.notFound;
			case 'environment-vault-session-invalid':
			case 'environment-vault-invalid':
				return environmentMessages.errors.vaultInvalid;
			case 'environment-vault-session-password-required':
				return environmentMessages.errors.vaultPasswordRequired;
			default:
				return environmentMessages.errors.vaultOperationFailed;
		}
	}

	function createCliEnvironmentApplyErrorMessage(nextError: CliEnvironmentApplyError) {
		switch (nextError) {
			case 'cli-environment-empty':
				return environmentMessages.errors.cliEnvironmentNoVariables;
			case 'cli-environment-unsupported':
				return environmentMessages.errors.cliEnvironmentUnsupported;
			case 'cli-environment-unavailable':
				return environmentMessages.errors.cliEnvironmentUnavailable;
			default:
				return environmentMessages.errors.cliEnvironmentApplyFailed;
		}
	}

	onMount(() => {
		appearanceSettings = readAppearanceSettingsFromBrowser().settings;
		const unsubscribeAppearanceSettings = subscribeAppearanceSettings((nextSettings) => {
			appearanceSettings = nextSettings;
		});

		return unsubscribeAppearanceSettings;
	});

	$effect(() => {
		const workspaceId = workspace.id;
		const workspacePath = workspace.path;

		return untrack(() => {
			let isCurrentWorkspace = true;

			resetLocalVaultState(null);

			async function initializeVault() {
				await closeEnvironmentVaultSession(workspaceId);
				if (!isCurrentWorkspace) {
					return;
				}

				const initialEnvelopeResult = await readEnvironmentVaultEnvelopeForWorkspace(
					workspaceId,
					workspacePath
				);
				if (!isCurrentWorkspace) {
					return;
				}

				if (!initialEnvelopeResult.ok) {
					resetLocalVaultState(null);
					error = environmentMessages.errors.vaultOperationFailed;
					return;
				}

				resetLocalVaultState(initialEnvelopeResult.envelope);
				await tryOpenVaultWithWorkspaceSession(initialEnvelopeResult.envelope);
			}

			async function reopenVault(nextEnvelope: SecretVaultEnvelope | null) {
				await closeEnvironmentVaultSession(workspaceId);
				if (!isCurrentWorkspace) {
					return;
				}

				resetLocalVaultState(nextEnvelope);
				await tryOpenVaultWithWorkspaceSession(nextEnvelope);
			}

			void initializeVault();

			const unsubscribeVault = subscribeEnvironmentVaultEnvelopeForWorkspace(
				workspaceId,
				workspacePath,
				(nextEnvelope) => {
					if (isBusy) {
						vaultEnvelope = nextEnvelope;
						return;
					}

					void reopenVault(nextEnvelope);
				}
			);

			return () => {
				isCurrentWorkspace = false;
				unsubscribeVault();
				void closeEnvironmentVaultSession(workspaceId);
			};
		});
	});

	$effect(() => {
		const intervalId = window.setInterval(() => {
			nowMs = Date.now();
		}, 1000);

		return () => window.clearInterval(intervalId);
	});
</script>

<section class="workduck-environment-vault" aria-label={environmentMessages.ariaLabel}>
	<header class="workduck-page-header">
		<PageTitleRow {title} meta={secretCountLabel} />
		{#if vaultIsOpen}
			<div class="workduck-page-actions workduck-environment-header-actions">
				{#if vault !== null && vault.secrets.length !== 0}
					<div class="workduck-environment-filters" aria-label={environmentMessages.filters}>
						<label class="workduck-environment-filter-field" for="environment-kind-filter">
							<select
								id="environment-kind-filter"
								class="workduck-select workduck-environment-filter-select"
								bind:value={secretKindFilter}
								aria-label={environmentMessages.kindFilter}
							>
								<option value="all">{environmentMessages.allKinds}</option>
								{#each environmentSecretKindOptions as kindOption}
									<option value={kindOption.id}>{getSecretKindLabel(kindOption.id)}</option>
								{/each}
							</select>
						</label>
						<label class="workduck-environment-filter-field" for="environment-tag-filter">
							<select
								id="environment-tag-filter"
								class="workduck-select workduck-environment-filter-select"
								bind:value={secretTagFilter}
								aria-label={environmentMessages.tagFilter}
							>
								<option value="all">{environmentMessages.allTags}</option>
								{#each environmentSecretTagOptions as tagOption}
									<option value={tagOption.id}>{getSecretTagLabel(tagOption.id)}</option>
								{/each}
							</select>
						</label>
					</div>
				{/if}
				<button
					class="workduck-button workduck-button-secondary"
					type="button"
					disabled={isBusy || cliEnvironmentVariables.length === 0}
					title={environmentMessages.applyCliEnvironmentTooltip}
					onclick={handleApplyCliEnvironmentVariables}
				>
					{environmentMessages.applyCliEnvironment}
				</button>
				<button class="workduck-button workduck-button-secondary" type="button" onclick={handleLockVault}>
					{environmentMessages.lockVault}
				</button>
			</div>
		{/if}
	</header>

	{#if !vaultIsOpen}
		<form class="workduck-environment-unlock-form" onsubmit={handleVaultSubmit}>
			<label class="workduck-form-field" for="environment-vault-password">
				<span>{environmentMessages.vaultPassword}</span>
				<input
					id="environment-vault-password"
					class="workduck-input"
					type="password"
					bind:value={vaultPassword}
					autocomplete="current-password"
					disabled={isBusy}
					aria-invalid={error !== null || vaultUnlockIsLocked}
				/>
			</label>

			<button
				class="workduck-button workduck-button-primary"
				type="submit"
				disabled={isBusy || vaultPassword.length === 0 || vaultUnlockIsLocked}
			>
				{isBusy ? messages.common.checking : unlockLabel}
			</button>
		</form>
	{:else}
		<form class="workduck-environment-form" onsubmit={handleSecretSubmit}>
			<label class="workduck-form-field workduck-environment-form-name" for="environment-secret-name">
				<span>{messages.common.name}</span>
				<input
					id="environment-secret-name"
					class="workduck-input"
					type="text"
					bind:value={secretName}
					autocomplete="off"
					disabled={isBusy}
				/>
			</label>

			<label class="workduck-form-field workduck-environment-form-kind" for="environment-secret-kind">
				<span>{environmentMessages.kind}</span>
				<select
					id="environment-secret-kind"
					class="workduck-select"
					bind:value={secretKind}
					disabled={isBusy}
				>
					<option value="">{environmentMessages.select}</option>
					{#each environmentSecretKindOptions as kindOption}
						<option value={kindOption.id}>{getSecretKindLabel(kindOption.id)}</option>
					{/each}
				</select>
			</label>

			<label class="workduck-form-field workduck-environment-form-tags" for="environment-secret-tags">
				<span>{environmentMessages.tags}</span>
				<select
					id="environment-secret-tags"
					class="workduck-select"
					bind:value={secretTag}
					disabled={isBusy}
				>
					<option value="">{environmentMessages.select}</option>
					{#each environmentSecretTagOptions as tagOption}
						<option value={tagOption.id}>{getSecretTagLabel(tagOption.id)}</option>
					{/each}
				</select>
			</label>

			<label class="workduck-form-field workduck-environment-form-value" for="environment-secret-value">
				<span>{environmentMessages.value}</span>
				<input
					id="environment-secret-value"
					class="workduck-input"
					type="password"
					bind:value={secretValue}
					placeholder={editingSecret === null
						? ''
						: createMaskedSecretValueForLength(editingSecret.valueLength ?? 8)}
					autocomplete="off"
					disabled={isBusy}
				/>
			</label>

			<div class="workduck-environment-form-actions">
				<button
					class="workduck-button workduck-button-primary"
					type="submit"
					disabled={isBusy || secretName.length === 0 || secretKind === '' || secretTag === '' || (editingSecretId === null && secretValue.length === 0)}
				>
					{submitLabel}
				</button>
				{#if editingSecretId !== null}
					<button
						class="workduck-button workduck-button-secondary"
						type="button"
						disabled={isBusy}
						onclick={clearSecretForm}
					>
						{messages.common.cancel}
					</button>
				{/if}
			</div>
		</form>

		{#if vault?.secrets.length === 0}
			<p class="workduck-empty-state">{environmentMessages.empty}</p>
		{:else}
			{#if filteredSecrets.length === 0}
				<p class="workduck-empty-state">{environmentMessages.noMatches}</p>
			{:else}
				<ul class="workduck-environment-list" aria-label={environmentMessages.entries}>
					{#each filteredSecrets as secret (secret.id)}
						<li class="workduck-environment-row">
							<div class="workduck-environment-details">
								<div class="workduck-environment-heading">
									<span class="workduck-environment-name">{secret.name}</span>
									{#if secret.tags.length > 0}
										<span class="workduck-environment-tags">
											{#each secret.tags as tag (tag)}
												<span class="workduck-project-tag">{getSecretTagLabel(tag)}</span>
											{/each}
										</span>
									{/if}
								</div>
								<span class="workduck-environment-kind">{getSecretKindLabel(secret.kind)}</span>
								<code class="workduck-environment-value">{getSecretDisplayValue(secret)}</code>
							</div>

							<div class="workduck-environment-actions">
								<button
									class="workduck-button workduck-button-secondary"
									type="button"
									disabled={isBusy}
									onclick={() => handleCopySecret(secret)}
								>
									{environmentMessages.copy}
								</button>
								<button
									class="workduck-button workduck-button-secondary"
									type="button"
									disabled={isBusy}
									onclick={() => handleToggleSecretVisibility(secret)}
								>
									{visibleSecretValues.has(secret.id)
										? environmentMessages.hide
										: environmentMessages.show}
								</button>
								<button
									class="workduck-button workduck-button-secondary"
									type="button"
									disabled={isBusy}
									onclick={() => handleEditSecret(secret)}
								>
									{messages.common.edit}
								</button>
								<button
									class="workduck-button workduck-button-danger"
									type="button"
									disabled={isBusy}
									onclick={() => handleRemoveSecret(secret)}
								>
									{messages.common.remove}
								</button>
							</div>
						</li>
					{/each}
				</ul>
			{/if}
		{/if}
	{/if}

	{#if error !== null}
		<p class="workduck-inline-error" aria-live="polite">{error}</p>
	{/if}

	<StatusToast message={status} />
</section>
