<script lang="ts">
	import type { WorkspaceRecord } from '$lib/workspaces/workspace-registry';

	import {
		createEmptyEnvironmentVault,
		createMaskedSecretValue,
		environmentSecretKindOptions,
		parseEnvironmentVault,
		removeEnvironmentSecret,
		serializeEnvironmentVault,
		upsertEnvironmentSecret,
		type EnvironmentSecretKind,
		type EnvironmentSecretRecord,
		type EnvironmentVault,
		type EnvironmentVaultError
	} from './environment-vault';
	import {
		readEnvironmentVaultEnvelope,
		subscribeEnvironmentVaultEnvelope,
		writeEnvironmentVaultEnvelope
	} from './environment-vault-storage';
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
	}

	let { workspace }: Props = $props();

	let vaultEnvelope = $state<SecretVaultEnvelope | null>(null);
	let vault = $state<EnvironmentVault | null>(null);
	let vaultPassword = $state('');
	let secretName = $state('');
	let secretKind = $state<EnvironmentSecretKind>('api-key');
	let secretValue = $state('');
	let editingSecretId = $state<string | null>(null);
	let visibleSecretIds = $state<ReadonlySet<string>>(new Set());
	let isBusy = $state(false);
	let error = $state<string | null>(null);
	let status = $state<string | null>(null);
	let nowMs = $state(Date.now());

	let vaultIsOpen = $derived(vault !== null);
	let submitLabel = $derived(editingSecretId === null ? 'Add' : 'Save');
	let unlockLabel = $derived(vaultEnvelope === null ? 'Create vault' : 'Unlock');
	let vaultLockout = $derived(getEnvironmentVaultUnlockLockout(workspace.id, nowMs));
	let vaultUnlockIsLocked = $derived(vaultEnvelope !== null && vaultLockout.isLocked);

	function resetVaultSession(nextEnvelope: SecretVaultEnvelope | null) {
		vaultEnvelope = nextEnvelope;
		vault = null;
		vaultPassword = '';
		secretName = '';
		secretKind = 'api-key';
		secretValue = '';
		editingSecretId = null;
		visibleSecretIds = new Set();
		error = null;
		status = null;
	}

	async function handleVaultSubmit(event: SubmitEvent) {
		event.preventDefault();

		if (isBusy) {
			return;
		}

		if (vaultPassword.length === 0) {
			error = 'Vault password is required.';
			return;
		}

		if (vaultUnlockIsLocked) {
			error = `Try again in ${vaultLockout.secondsRemaining}s.`;
			return;
		}

		isBusy = true;
		error = null;
		status = null;

		try {
			if (vaultEnvelope === null) {
				await saveVault(createEmptyEnvironmentVault(workspace.id));
				status = 'Vault created.';
				return;
			}

			const decryptResult = await decryptSecretVaultPayload(vaultEnvelope, vaultPassword);

			if (!decryptResult.ok) {
				const lockout = recordEnvironmentVaultUnlockFailure(workspace.id, Date.now());
				error = lockout.isLocked
					? `Try again in ${lockout.secondsRemaining}s.`
					: `${createSecretVaultErrorMessage(decryptResult.error)} ${lockout.attemptsRemaining} attempts left.`;
				return;
			}

			const parsedVault = parseEnvironmentVault(decryptResult.plaintext, workspace.id);

			if (parsedVault === null) {
				error = 'Vault data could not be read.';
				return;
			}

			vault = parsedVault;
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
			value: secretValue
		});

		if (!mutation.ok) {
			error = createEnvironmentVaultErrorMessage(mutation.error);
			return;
		}

		await saveVault(mutation.vault);
		clearSecretForm();
		status = 'Saved.';
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
		status = 'Removed.';
	}

	function handleEditSecret(secret: EnvironmentSecretRecord) {
		editingSecretId = secret.id;
		secretName = secret.name;
		secretKind = secret.kind;
		secretValue = secret.value;
		error = null;
		status = null;
	}

	async function handleCopySecret(secret: EnvironmentSecretRecord) {
		if (typeof navigator === 'undefined' || navigator.clipboard === undefined) {
			error = 'Clipboard is not available.';
			return;
		}

		try {
			await navigator.clipboard.writeText(secret.value);
			status = 'Copied.';
			error = null;
		} catch {
			error = 'Copy failed.';
		}
	}

	function handleToggleSecretVisibility(secret: EnvironmentSecretRecord) {
		visibleSecretIds = createNextVisibleSecretIds(secret.id, !visibleSecretIds.has(secret.id));
	}

	function handleLockVault() {
		resetVaultSession(vaultEnvelope);
	}

	function getSecretKindLabel(kind: EnvironmentSecretKind) {
		return environmentSecretKindOptions.find((kindOption) => kindOption.id === kind)?.label ?? 'Other';
	}

	function clearSecretForm() {
		editingSecretId = null;
		secretName = '';
		secretKind = 'api-key';
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

			const writeResult = writeEnvironmentVaultEnvelope(workspace.id, encryptResult.envelope);

			if (!writeResult.ok) {
				error = 'Vault could not be saved.';
				return;
			}

			vaultEnvelope = encryptResult.envelope;
			vault = nextVault;
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
				return 'Name is required.';
			case 'environment-secret-name-duplicate':
				return 'Name already exists.';
			case 'environment-secret-value-required':
				return 'Value is required.';
			case 'environment-secret-not-found':
				return 'Entry was not found.';
			case 'environment-vault-invalid':
				return 'Vault data could not be read.';
		}
	}

	function createSecretVaultErrorMessage(nextError: SecretVaultCryptoError) {
		if (nextError === 'secret-vault-password-required') {
			return 'Vault password is required.';
		}

		if (nextError === 'secret-vault-unavailable') {
			return 'Vault is available in the desktop app.';
		}

		if (
			nextError === 'secret-vault-decryption-failed' ||
			nextError === 'secret-vault-envelope-invalid' ||
			nextError === 'secret-vault-ciphertext-invalid'
		) {
			return 'Vault password did not match.';
		}

		return 'Vault operation failed.';
	}

	$effect(() => {
		const workspaceId = workspace.id;

		resetVaultSession(readEnvironmentVaultEnvelope(workspaceId).envelope);
		const unsubscribeVault = subscribeEnvironmentVaultEnvelope(workspaceId, (nextEnvelope) => {
			if (vault === null) {
				resetVaultSession(nextEnvelope);
				return;
			}

			vaultEnvelope = nextEnvelope;
		});

		return unsubscribeVault;
	});

	$effect(() => {
		const intervalId = window.setInterval(() => {
			nowMs = Date.now();
		}, 1000);

		return () => window.clearInterval(intervalId);
	});
</script>

<section class="workduck-environment-vault" aria-label="Environment variables">
	{#if !vaultIsOpen}
		<form class="workduck-environment-unlock-form" onsubmit={handleVaultSubmit}>
			<label class="workduck-form-field" for="environment-vault-password">
				<span>Vault password</span>
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
				{isBusy ? 'Working' : unlockLabel}
			</button>
		</form>
	{:else}
		<div class="workduck-environment-toolbar">
			<button class="workduck-button workduck-button-secondary" type="button" onclick={handleLockVault}>
				Lock
			</button>
		</div>

		<form class="workduck-environment-form" onsubmit={handleSecretSubmit}>
			<label class="workduck-form-field" for="environment-secret-name">
				<span>Name</span>
				<input
					id="environment-secret-name"
					class="workduck-input"
					type="text"
					bind:value={secretName}
					autocomplete="off"
					disabled={isBusy}
				/>
			</label>

			<label class="workduck-form-field" for="environment-secret-kind">
				<span>Type</span>
				<select
					id="environment-secret-kind"
					class="workduck-select"
					bind:value={secretKind}
					disabled={isBusy}
				>
					{#each environmentSecretKindOptions as kindOption}
						<option value={kindOption.id}>{kindOption.label}</option>
					{/each}
				</select>
			</label>

			<label class="workduck-form-field" for="environment-secret-value">
				<span>Value</span>
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
					disabled={isBusy || secretName.length === 0 || secretValue.length === 0}
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
						Cancel
					</button>
				{/if}
			</div>
		</form>

		{#if vault?.secrets.length === 0}
			<p class="workduck-empty-state">No environment variables yet.</p>
		{:else}
			<ul class="workduck-environment-list" aria-label="Environment variable entries">
				{#each vault?.secrets ?? [] as secret (secret.id)}
					<li class="workduck-environment-row">
						<div class="workduck-environment-details">
							<span class="workduck-environment-name">{secret.name}</span>
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
								Copy
							</button>
							<button
								class="workduck-button workduck-button-secondary"
								type="button"
								disabled={isBusy}
								onclick={() => handleToggleSecretVisibility(secret)}
							>
								{visibleSecretIds.has(secret.id) ? 'Hide' : 'Show'}
							</button>
							<button
								class="workduck-button workduck-button-secondary"
								type="button"
								disabled={isBusy}
								onclick={() => handleEditSecret(secret)}
							>
								Edit
							</button>
							<button
								class="workduck-button workduck-button-danger"
								type="button"
								disabled={isBusy}
								onclick={() => handleRemoveSecret(secret)}
							>
								Remove
							</button>
						</div>
					</li>
				{/each}
			</ul>
		{/if}
	{/if}

	{#if error !== null}
		<p class="workduck-inline-error" aria-live="polite">{error}</p>
	{/if}

	{#if status !== null}
		<p class="workduck-inline-status" aria-live="polite">{status}</p>
	{/if}
</section>
