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
		type CliEnvironmentApplyError,
		type CliEnvironmentVariableInput
	} from './cli-environment';
	import {
		createEmptyEnvironmentVault,
		createMaskedSecretValue,
		environmentSecretKindOptions,
		environmentSecretTagOptions,
		parseEnvironmentVault,
		removeEnvironmentSecret,
		serializeEnvironmentVault,
		upsertEnvironmentSecret,
		type EnvironmentSecretKind,
		type EnvironmentSecretRecord,
		type EnvironmentSecretTag,
		type EnvironmentVault,
		type EnvironmentVaultError
	} from './environment-vault';
	import {
		readEnvironmentVaultEnvelopeForWorkspace,
		subscribeEnvironmentVaultEnvelopeForWorkspace,
		writeEnvironmentVaultEnvelopeForWorkspace
	} from './environment-vault-storage';
	import {
		clearEnvironmentVaultSession,
		setEnvironmentVaultSession
	} from './environment-vault-session';
	import {
		clearEnvironmentVaultUnlockAttempts,
		getEnvironmentVaultUnlockLockout,
		recordEnvironmentVaultUnlockFailure
	} from './environment-vault-unlock';
	import {
		decryptSecretVaultPayload,
		encryptSecretVaultPayload,
		type SecretVaultCryptoError,
		type SecretVaultEnvelope
	} from './secret-vault-crypto';

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
	let visibleSecretIds = $state<ReadonlySet<string>>(new Set());
	let isBusy = $state(false);
	let error = $state<string | null>(null);
	let status = $state<string | null>(null);
	let nowMs = $state(Date.now());
	let autoUnlockPasswordTried = $state<string | null>(null);

	let messages = $derived(getWorkduckMessages(appearanceSettings.languageId));
	let environmentMessages = $derived(messages.environment);
	let vaultIsOpen = $derived(vault !== null);
	let secretCountLabel = $derived(
		vault === null
			? null
			: environmentMessages.registeredCount.replace('{count}', vault.secrets.length.toString())
	);
	let cliEnvironmentVariables = $derived(
		vault === null ? [] : createCliEnvironmentVariables(vault.secrets)
	);
	let submitLabel = $derived(editingSecretId === null ? messages.common.add : messages.common.save);
	let unlockLabel = $derived(
		vaultEnvelope === null ? environmentMessages.createVault : environmentMessages.unlockVault
	);
	let vaultLockout = $derived(getEnvironmentVaultUnlockLockout(workspace.id, nowMs));
	let vaultUnlockIsLocked = $derived(vaultEnvelope !== null && vaultLockout.isLocked);
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

	function resetVaultSession(nextEnvelope: SecretVaultEnvelope | null) {
		vaultEnvelope = nextEnvelope;
		vault = null;
		clearEnvironmentVaultSession(workspace.id);
		vaultPassword = '';
		secretName = '';
		secretKind = '';
		secretTag = '';
		secretKindFilter = 'all';
		secretTagFilter = 'all';
		secretValue = '';
		editingSecretId = null;
		visibleSecretIds = new Set();
		error = null;
		status = null;
		autoUnlockPasswordTried = null;
	}

	async function tryOpenVaultWithWorkspaceSession(nextEnvelope: SecretVaultEnvelope | null) {
		if (vault !== null || isBusy) {
			return;
		}

		const sessionPassword = readWorkspaceUnlockPasswordSession(workspace.id);

		if (sessionPassword === null || autoUnlockPasswordTried === sessionPassword) {
			return;
		}

		autoUnlockPasswordTried = sessionPassword;
		vaultPassword = sessionPassword;

		if (nextEnvelope === null) {
			await saveVault(createEmptyEnvironmentVault(workspace.id));
			status = null;
			return;
		}

		isBusy = true;
		error = null;
		status = null;

		try {
			const decryptResult = await decryptSecretVaultPayload(nextEnvelope, sessionPassword);

			if (!decryptResult.ok) {
				vaultPassword = '';
				return;
			}

			const parsedVault = parseEnvironmentVault(decryptResult.plaintext, workspace.id);

			if (parsedVault === null) {
				vaultPassword = '';
				return;
			}

			vault = parsedVault;
			setEnvironmentVaultSession(parsedVault);
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

		isBusy = true;
		error = null;
		status = null;

		try {
			if (vaultEnvelope === null) {
				await saveVault(createEmptyEnvironmentVault(workspace.id));
				status = environmentMessages.statuses.created;
				return;
			}

			const decryptResult = await decryptSecretVaultPayload(vaultEnvelope, vaultPassword);

			if (!decryptResult.ok) {
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
				return;
			}

			const parsedVault = parseEnvironmentVault(decryptResult.plaintext, workspace.id);

			if (parsedVault === null) {
				error = environmentMessages.errors.vaultInvalid;
				return;
			}

			vault = parsedVault;
			setEnvironmentVaultSession(parsedVault);
			clearEnvironmentVaultUnlockAttempts(workspace.id);
			status = null;
		} finally {
			isBusy = false;
		}
	}

	async function handleSecretSubmit(event: SubmitEvent) {
		event.preventDefault();

		if (vault === null || isBusy) {
			return;
		}

		const mutation = upsertEnvironmentSecret(vault, {
			id: editingSecretId,
			name: secretName,
			kind: secretKind,
			tags: secretTag === '' ? [] : [secretTag],
			value: secretValue
		});

		if (!mutation.ok) {
			error = createEnvironmentVaultErrorMessage(mutation.error);
			return;
		}

		await saveVault(mutation.vault);
		clearSecretForm();
		status = environmentMessages.statuses.saved;
	}

	async function handleRemoveSecret(secret: EnvironmentSecretRecord) {
		if (vault === null || isBusy) {
			return;
		}

		const mutation = removeEnvironmentSecret(vault, secret.id);

		if (!mutation.ok) {
			error = createEnvironmentVaultErrorMessage(mutation.error);
			return;
		}

		await saveVault(mutation.vault);
		visibleSecretIds = createNextVisibleSecretIds(secret.id, false);
		status = environmentMessages.statuses.removed;
	}

	function handleEditSecret(secret: EnvironmentSecretRecord) {
		editingSecretId = secret.id;
		secretName = secret.name;
		secretKind = secret.kind;
		secretTag = secret.tags[0] ?? '';
		secretValue = secret.value;
		error = null;
		status = null;
	}

	async function handleCopySecret(secret: EnvironmentSecretRecord) {
		if (typeof navigator === 'undefined' || navigator.clipboard === undefined) {
			error = environmentMessages.errors.clipboardUnavailable;
			return;
		}

		try {
			await navigator.clipboard.writeText(secret.value);
			status = environmentMessages.statuses.copied;
			error = null;
		} catch {
			error = environmentMessages.errors.copyFailed;
		}
	}

	function handleToggleSecretVisibility(secret: EnvironmentSecretRecord) {
		visibleSecretIds = createNextVisibleSecretIds(secret.id, !visibleSecretIds.has(secret.id));
	}

	function handleLockVault() {
		resetVaultSession(vaultEnvelope);
	}

	async function handleApplyCliEnvironmentVariables() {
		if (vault === null || isBusy) {
			return;
		}

		const variables = createCliEnvironmentVariables(vault.secrets);

		if (variables.length === 0) {
			error = environmentMessages.errors.cliEnvironmentNoVariables;
			status = null;
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

			status = environmentMessages.statuses.cliEnvironmentApplied.replace(
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

	function createCliEnvironmentVariables(
		secrets: readonly EnvironmentSecretRecord[]
	): CliEnvironmentVariableInput[] {
		const variables = new Map<string, string>();

		for (const secret of secrets) {
			const variableName = resolveCliEnvironmentVariableName(secret);

			if (variableName === null || variables.has(variableName)) {
				continue;
			}

			variables.set(variableName, secret.value);
		}

		return Array.from(variables, ([name, value]) => ({ name, value }));
	}

	function resolveCliEnvironmentVariableName(secret: EnvironmentSecretRecord) {
		if (secret.kind !== 'api-key') {
			return null;
		}

		const profileText = [secret.name, ...secret.tags]
			.join(' ')
			.toLocaleLowerCase('en-US')
			.replaceAll(/[^a-z0-9]+/g, '');

		if (profileText.includes('openrouter')) {
			return 'OPENROUTER_API_KEY';
		}

		if (profileText.includes('openai')) {
			return 'OPENAI_API_KEY';
		}

		if (profileText.includes('deepseek')) {
			return 'DEEPSEEK_API_KEY';
		}

		return null;
	}

	function clearSecretForm() {
		editingSecretId = null;
		secretName = '';
		secretKind = '';
		secretTag = '';
		secretValue = '';
		error = null;
	}

	async function saveVault(nextVault: EnvironmentVault) {
		isBusy = true;
		error = null;

		try {
			const encryptResult = await encryptSecretVaultPayload(
				serializeEnvironmentVault(nextVault),
				vaultPassword
			);

			if (!encryptResult.ok) {
				error = createSecretVaultErrorMessage(encryptResult.error);
				return;
			}

			const writeResult = await writeEnvironmentVaultEnvelopeForWorkspace(
				workspace.id,
				encryptResult.envelope,
				workspace.path
			);

			if (!writeResult.ok) {
				error = environmentMessages.errors.vaultSaveFailed;
				return;
			}

			vaultEnvelope = encryptResult.envelope;
			vault = nextVault;
			setEnvironmentVaultSession(nextVault);
		} finally {
			isBusy = false;
		}
	}

	function createNextVisibleSecretIds(secretId: string, shouldShow: boolean) {
		const nextVisibleSecretIds = new Set(visibleSecretIds);

		if (shouldShow) {
			nextVisibleSecretIds.add(secretId);
		} else {
			nextVisibleSecretIds.delete(secretId);
		}

		return nextVisibleSecretIds;
	}

	function createEnvironmentVaultErrorMessage(nextError: EnvironmentVaultError) {
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
			case 'environment-vault-invalid':
				return environmentMessages.errors.vaultInvalid;
		}
	}

	function createSecretVaultErrorMessage(nextError: SecretVaultCryptoError) {
		if (nextError === 'secret-vault-password-required') {
			return environmentMessages.errors.vaultPasswordRequired;
		}

		if (nextError === 'secret-vault-unavailable') {
			return environmentMessages.errors.vaultUnavailable;
		}

		if (
			nextError === 'secret-vault-decryption-failed' ||
			nextError === 'secret-vault-envelope-invalid' ||
			nextError === 'secret-vault-ciphertext-invalid'
		) {
			return environmentMessages.errors.vaultPasswordMismatch;
		}

		return environmentMessages.errors.vaultOperationFailed;
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

			resetVaultSession(null);
			void readEnvironmentVaultEnvelopeForWorkspace(workspaceId, workspacePath).then(
				(initialEnvelopeResult) => {
					if (!isCurrentWorkspace) {
						return;
					}

					if (!initialEnvelopeResult.ok) {
						resetVaultSession(null);
						error = environmentMessages.errors.vaultOperationFailed;
						return;
					}

					resetVaultSession(initialEnvelopeResult.envelope);
					void tryOpenVaultWithWorkspaceSession(initialEnvelopeResult.envelope);
				}
			);

			const unsubscribeVault = subscribeEnvironmentVaultEnvelopeForWorkspace(
				workspaceId,
				workspacePath,
				(nextEnvelope) => {
					if (isBusy) {
						vaultEnvelope = nextEnvelope;
						return;
					}

					if (vault === null) {
						resetVaultSession(nextEnvelope);
						void tryOpenVaultWithWorkspaceSession(nextEnvelope);
						return;
					}

					vaultEnvelope = nextEnvelope;
				}
			);

			return () => {
				isCurrentWorkspace = false;
				unsubscribeVault();
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
					autocomplete="off"
					disabled={isBusy}
				/>
			</label>

			<div class="workduck-environment-form-actions">
				<button
					class="workduck-button workduck-button-primary"
					type="submit"
					disabled={isBusy || secretName.length === 0 || secretKind === '' || secretTag === '' || secretValue.length === 0}
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
								<code class="workduck-environment-value">
									{visibleSecretIds.has(secret.id)
										? secret.value
										: createMaskedSecretValue(secret.value)}
								</code>
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
									{visibleSecretIds.has(secret.id)
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
