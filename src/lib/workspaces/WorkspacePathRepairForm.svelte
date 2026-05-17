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

	import {
		updateWorkspacePath,
		WORKSPACE_PATH_MAX_LENGTH,
		type WorkspaceRecord,
		type WorkspaceRegistryError
	} from './workspace-registry';
	import {
		selectWorkspacePath,
		validateWorkspacePath,
		type WorkspacePathError
	} from './workspace-path';
	import { formatWorkspacePathForDisplay } from './workspace-path-format';
	import {
		readWorkspaceRegistryFromBrowser,
		writeWorkspaceRegistryToBrowser,
		type WorkspaceRegistryStorageError
	} from './workspace-storage';

	interface Props {
		readonly workspace: WorkspaceRecord;
		readonly submitLabel?: string;
		readonly onRepaired?: (path: string) => void;
		readonly onCancel?: () => void;
	}

	type WorkspacePathRepairError =
		| WorkspacePathError
		| WorkspaceRegistryError
		| WorkspaceRegistryStorageError;

	let {
		workspace,
		submitLabel,
		onRepaired,
		onCancel
	}: Props = $props();

	let appearanceSettings = $state<AppearanceSettings>(createDefaultAppearanceSettings());
	let path = $state('');
	let pathDisplay = $state('');
	let error = $state<WorkspacePathRepairError | null>(null);
	let isSelectingPath = $state(false);
	let isSavingPath = $state(false);
	let lastWorkspaceKey = $state('');

	let canSelectPath = $derived(!isSelectingPath && !isSavingPath);
	let canSavePath = $derived(path.trim().length > 0 && !isSelectingPath && !isSavingPath);
	let messages = $derived(getWorkduckMessages(appearanceSettings.languageId));
	let effectiveSubmitLabel = $derived(submitLabel ?? messages.workspace.reconnect);

	onMount(() => {
		appearanceSettings = readAppearanceSettingsFromBrowser().settings;
		const unsubscribeAppearanceSettings = subscribeAppearanceSettings((nextSettings) => {
			appearanceSettings = nextSettings;
		});

		return unsubscribeAppearanceSettings;
	});

	function getRepairErrorMessage(nextError: WorkspacePathRepairError) {
		if (nextError === 'workspace-path-duplicate') {
			return messages.workspace.pathErrors.pathDuplicate;
		}

		if (isWorkspacePathError(nextError)) {
			return getPathErrorMessage(nextError);
		}

		switch (nextError) {
			case 'workspace-not-found':
				return messages.workspace.pathErrors.workspaceNotFound;
			case 'workspace-registry-read-failed':
				return messages.workspace.pathErrors.registryReadFailed;
			case 'workspace-registry-write-failed':
				return messages.workspace.pathErrors.registryWriteFailed;
			case 'workspace-name-required':
			case 'workspace-password-hash-invalid':
				return messages.workspace.pathErrors.registryWriteFailed;
		}
	}

	function getPathErrorMessage(nextError: WorkspacePathError) {
		switch (nextError) {
			case 'workspace-path-required':
				return messages.workspace.pathErrors.pathRequired;
			case 'workspace-path-not-absolute':
				return messages.workspace.pathErrors.pathNotAbsolute;
			case 'workspace-path-not-found':
				return messages.workspace.pathErrors.pathNotFound;
			case 'workspace-path-not-directory':
				return messages.workspace.pathErrors.pathNotDirectory;
			case 'workspace-path-permission-denied':
				return messages.workspace.pathErrors.pathPermissionDenied;
			case 'workspace-path-unreadable':
				return messages.workspace.pathErrors.pathUnreadable;
			case 'workspace-path-validation-unavailable':
				return messages.workspace.pathErrors.pathValidationUnavailable;
			case 'workspace-path-selection-unavailable':
				return messages.workspace.pathErrors.pathSelectionUnavailable;
			case 'workspace-path-selection-failed':
				return messages.workspace.pathErrors.pathSelectionFailed;
		}
	}

	function isWorkspacePathError(nextError: WorkspacePathRepairError): nextError is WorkspacePathError {
		return (
			nextError === 'workspace-path-required' ||
			nextError === 'workspace-path-not-absolute' ||
			nextError === 'workspace-path-not-found' ||
			nextError === 'workspace-path-not-directory' ||
			nextError === 'workspace-path-permission-denied' ||
			nextError === 'workspace-path-unreadable' ||
			nextError === 'workspace-path-validation-unavailable' ||
			nextError === 'workspace-path-selection-unavailable' ||
			nextError === 'workspace-path-selection-failed'
		);
	}

	function handlePathInput(event: Event) {
		const target = event.currentTarget;

		if (!(target instanceof HTMLInputElement)) {
			return;
		}

		path = target.value;
		pathDisplay = target.value;
		error = null;
	}

	async function handlePathSelect() {
		if (isSelectingPath) {
			return;
		}

		error = null;
		isSelectingPath = true;

		try {
			const result = await selectWorkspacePath(path);

			if (!result.ok) {
				error = result.error;
				return;
			}

			if (result.path !== null) {
				path = result.path;
				pathDisplay = formatWorkspacePathForDisplay(result.path);
			}
		} finally {
			isSelectingPath = false;
		}
	}

	async function handleSubmit(event: SubmitEvent) {
		event.preventDefault();

		if (isSavingPath) {
			return;
		}

		error = null;
		isSavingPath = true;

		try {
			const pathValidation = await validateWorkspacePath(path);

			if (!pathValidation.ok) {
				error = pathValidation.error;
				return;
			}

			const registryResult = readWorkspaceRegistryFromBrowser();

			if (!registryResult.ok) {
				error = registryResult.error;
				return;
			}

			const updateResult = updateWorkspacePath(
				registryResult.registry,
				workspace.id,
				pathValidation.path
			);

			if (!updateResult.ok) {
				error = updateResult.error;
				return;
			}

			const writeResult = writeWorkspaceRegistryToBrowser(updateResult.registry);

			if (!writeResult.ok) {
				error = writeResult.error;
				return;
			}

			path = pathValidation.path;
			pathDisplay = formatWorkspacePathForDisplay(pathValidation.path);
			onRepaired?.(pathValidation.path);
		} finally {
			isSavingPath = false;
		}
	}

	$effect(() => {
		const nextWorkspaceKey = `${workspace.id}:${workspace.path}`;

		if (nextWorkspaceKey === lastWorkspaceKey) {
			return;
		}

		lastWorkspaceKey = nextWorkspaceKey;
		path = workspace.path;
		pathDisplay = formatWorkspacePathForDisplay(workspace.path);
		error = null;
	});
</script>

<form class="workduck-path-repair-form" onsubmit={handleSubmit}>
	<label class="workduck-form-field" for={`workspace-path-repair-${workspace.id}`}>
		<span>{messages.workspace.path}</span>
		<span class="workduck-path-control">
			<input
				id={`workspace-path-repair-${workspace.id}`}
				class="workduck-input"
				type="text"
				value={pathDisplay}
				maxlength={WORKSPACE_PATH_MAX_LENGTH}
				autocomplete="off"
				spellcheck="false"
				oninput={handlePathInput}
				aria-invalid={error?.startsWith('workspace-path-') ?? false}
			/>
			<button
				class="workduck-icon-button"
				type="button"
				disabled={!canSelectPath}
				aria-label={messages.workspace.chooseFolder}
				aria-busy={isSelectingPath}
				onclick={handlePathSelect}
			>
				<span class="workduck-folder-icon" aria-hidden="true"></span>
			</button>
		</span>
	</label>

	<div class="workduck-path-repair-actions">
		<button
			class="workduck-button workduck-button-primary"
			type="submit"
			disabled={!canSavePath}
			aria-busy={isSavingPath}
		>
			{isSavingPath ? messages.common.checking : effectiveSubmitLabel}
		</button>
		{#if onCancel !== undefined}
			<button
				class="workduck-button workduck-button-secondary"
				type="button"
				disabled={isSavingPath || isSelectingPath}
				onclick={onCancel}
			>
				{messages.common.cancel}
			</button>
		{/if}
	</div>

	{#if error !== null}
		<p class="workduck-inline-error" aria-live="polite">{getRepairErrorMessage(error)}</p>
	{/if}
</form>
