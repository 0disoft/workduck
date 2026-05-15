<script lang="ts">
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
	import { getWorkspacePathErrorMessage } from './workspace-path-messages';
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
		submitLabel = 'Reconnect',
		onRepaired,
		onCancel
	}: Props = $props();

	let path = $state('');
	let pathDisplay = $state('');
	let error = $state<WorkspacePathRepairError | null>(null);
	let isSelectingPath = $state(false);
	let isSavingPath = $state(false);
	let lastWorkspaceKey = $state('');

	let canSelectPath = $derived(!isSelectingPath && !isSavingPath);
	let canSavePath = $derived(path.trim().length > 0 && !isSelectingPath && !isSavingPath);

	function getRepairErrorMessage(nextError: WorkspacePathRepairError) {
		if (nextError === 'workspace-path-duplicate') {
			return 'Workspace path is already registered.';
		}

		if (isWorkspacePathError(nextError)) {
			return getWorkspacePathErrorMessage(nextError as WorkspacePathError);
		}

		switch (nextError) {
			case 'workspace-not-found':
				return 'Workspace was not found.';
			case 'workspace-registry-read-failed':
				return 'Workspace settings could not be loaded.';
			case 'workspace-registry-write-failed':
				return 'Workspace settings could not be saved.';
			case 'workspace-name-required':
			case 'workspace-password-hash-invalid':
				return 'Workspace settings could not be saved.';
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
		<span>Path</span>
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
				aria-label="Choose workspace folder"
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
			{isSavingPath ? 'Checking' : submitLabel}
		</button>
		{#if onCancel !== undefined}
			<button
				class="workduck-button workduck-button-secondary"
				type="button"
				disabled={isSavingPath || isSelectingPath}
				onclick={onCancel}
			>
				Cancel
			</button>
		{/if}
	</div>

	{#if error !== null}
		<p class="workduck-inline-error" aria-live="polite">{getRepairErrorMessage(error)}</p>
	{/if}
</form>
