<script lang="ts">
	import { onMount } from 'svelte';

	import { getWorkduckMessages } from '$lib/i18n/workduck-language';
	import {
		createDefaultAppearanceSettings,
		type AppearanceSettings
	} from '$lib/settings/appearance-settings';
	import {
		readAppearanceSettingsFromBrowser,
		subscribeAppearanceSettings
	} from '$lib/settings/appearance-storage';

	import type { WorkspaceRecord } from './workspace-registry';
	import {
		getWorkspaceUnlockLockout,
		unlockWorkspace,
		type WorkspaceUnlockError
	} from './workspace-unlock';

	interface Props {
		readonly workspace: WorkspaceRecord;
		readonly submitLabel?: string;
		readonly cancelLabel?: string;
		readonly onUnlocked?: () => void;
		readonly onCancel?: () => void;
	}

	let {
		workspace,
		submitLabel,
		cancelLabel,
		onUnlocked,
		onCancel
	}: Props = $props();

	let appearanceSettings = $state<AppearanceSettings>(createDefaultAppearanceSettings());
	let password = $state('');
	let error = $state<WorkspaceUnlockError | null>(null);
	let attemptsRemaining = $state<number | null>(null);
	let lockedUntil = $state<number | null>(null);
	let isUnlocking = $state(false);
	let nowMs = $state(Date.now());

	let lockout = $derived(getWorkspaceUnlockLockout(workspace.id, nowMs));
	let isLocked = $derived(lockout.isLocked || (lockedUntil !== null && lockedUntil > nowMs));
	let secondsRemaining = $derived(
		isLocked && lockedUntil !== null
			? Math.max(1, Math.ceil((lockedUntil - nowMs) / 1000))
			: lockout.secondsRemaining
	);
	let canSubmit = $derived(password.length > 0 && !isUnlocking && !isLocked);
	let messages = $derived(getWorkduckMessages(appearanceSettings.languageId));
	let effectiveSubmitLabel = $derived(submitLabel ?? messages.workspace.unlock.submit);
	let effectiveCancelLabel = $derived(cancelLabel ?? messages.common.cancel);

	onMount(() => {
		appearanceSettings = readAppearanceSettingsFromBrowser().settings;
		const unsubscribeAppearanceSettings = subscribeAppearanceSettings((nextSettings) => {
			appearanceSettings = nextSettings;
		});

		return unsubscribeAppearanceSettings;
	});

	function getUnlockMessage() {
		if (isLocked) {
			return messages.workspace.unlock.tryAgainIn.replace(
				'{seconds}',
				String(secondsRemaining)
			);
		}

		switch (error) {
			case 'workspace-unlock-password-required':
				return messages.workspace.unlock.passwordRequired;
			case 'workspace-unlock-invalid-password':
				return attemptsRemaining === null
					? messages.workspace.unlock.passwordMismatch
					: messages.workspace.unlock.passwordMismatchWithAttempts.replace(
							'{attemptsRemaining}',
							String(attemptsRemaining)
						);
			case 'workspace-unlock-unavailable':
				return messages.workspace.unlock.unavailable;
			case 'workspace-unlock-invalid-hash':
				return messages.workspace.unlock.invalidHash;
			case 'workspace-unlock-rate-limited':
				return messages.workspace.unlock.tryAgainIn.replace(
					'{seconds}',
					String(secondsRemaining)
				);
			case null:
				return null;
		}
	}

	async function handleSubmit(event: SubmitEvent) {
		event.preventDefault();

		if (isUnlocking || isLocked) {
			return;
		}

		isUnlocking = true;
		error = null;
		attemptsRemaining = null;
		lockedUntil = null;

		try {
			const result = await unlockWorkspace(workspace, password, Date.now());

			if (!result.ok) {
				error = result.error;
				attemptsRemaining = result.attemptsRemaining;
				lockedUntil = result.lockedUntil;
				return;
			}

			password = '';
			onUnlocked?.();
		} finally {
			isUnlocking = false;
		}
	}

	function handleCancel() {
		password = '';
		error = null;
		attemptsRemaining = null;
		lockedUntil = null;
		onCancel?.();
	}

	$effect(() => {
		const intervalId = window.setInterval(() => {
			nowMs = Date.now();
		}, 1000);

		return () => window.clearInterval(intervalId);
	});
</script>

<form class="workduck-unlock-form" onsubmit={handleSubmit}>
	<label class="workduck-form-field" for={`workspace-unlock-password-${workspace.id}`}>
		<span>{messages.common.password}</span>
		<input
			id={`workspace-unlock-password-${workspace.id}`}
			class="workduck-input"
			type="password"
			bind:value={password}
			autocomplete="current-password"
			disabled={isUnlocking || isLocked}
			aria-invalid={error !== null || isLocked}
		/>
	</label>

	<div class="workduck-unlock-actions">
		<button class="workduck-button workduck-button-primary" type="submit" disabled={!canSubmit}>
			{isUnlocking ? messages.common.checking : effectiveSubmitLabel}
		</button>
		{#if onCancel !== undefined}
			<button
				class="workduck-button workduck-button-secondary"
				type="button"
				disabled={isUnlocking}
				onclick={handleCancel}
			>
				{effectiveCancelLabel}
			</button>
		{/if}
	</div>

	{#if getUnlockMessage() !== null}
		<p class="workduck-inline-error" aria-live="polite">{getUnlockMessage()}</p>
	{/if}
</form>
