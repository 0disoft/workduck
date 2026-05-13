<script lang="ts">
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
		submitLabel = 'Unlock',
		cancelLabel = 'Cancel',
		onUnlocked,
		onCancel
	}: Props = $props();

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

	function getUnlockMessage() {
		if (isLocked) {
			return `Try again in ${secondsRemaining}s.`;
		}

		switch (error) {
			case 'workspace-unlock-password-required':
				return 'Password is required.';
			case 'workspace-unlock-invalid-password':
				return attemptsRemaining === null
					? 'Password did not match.'
					: `Password did not match. ${attemptsRemaining} attempts left.`;
			case 'workspace-unlock-unavailable':
				return 'Unlock is available in the desktop app.';
			case 'workspace-unlock-invalid-hash':
				return 'Workspace lock data could not be read.';
			case 'workspace-unlock-rate-limited':
				return `Try again in ${secondsRemaining}s.`;
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
		<span>Password</span>
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
			{isUnlocking ? 'Checking' : submitLabel}
		</button>
		{#if onCancel !== undefined}
			<button
				class="workduck-button workduck-button-secondary"
				type="button"
				disabled={isUnlocking}
				onclick={handleCancel}
			>
				{cancelLabel}
			</button>
		{/if}
	</div>

	{#if getUnlockMessage() !== null}
		<p class="workduck-inline-error" aria-live="polite">{getUnlockMessage()}</p>
	{/if}
</form>
