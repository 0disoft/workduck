<script lang="ts">
	import { onMount } from 'svelte';

	import {
		readWorkspaceRegistryFromBrowser,
		writeWorkspaceRegistryToBrowser
	} from '$lib/workspaces/workspace-storage';
	import {
		readProjectRegistries,
		writeProjectRegistries,
		type ProjectRegistryStorageError
	} from '$lib/projects/project-storage';
	import {
		readWorkspaceSyncFile,
		writeWorkspaceSyncFile,
		isWorkspaceSyncFileNameUsable,
		WORKSPACE_SYNC_FILE_NAME_MAX_LENGTH,
		type WorkspaceSyncFileError
	} from '$lib/workspaces/workspace-sync-file';
	import {
		formatWorkspaceSyncRemoteForDisplay,
		inspectWorkspaceSyncGit,
		runWorkspaceSyncGit,
		type WorkspaceSyncGitInspectionResult,
		type WorkspaceSyncGitRunAction,
		type WorkspaceSyncGitRunError,
		type WorkspaceSyncGitRunOutcome
	} from '$lib/workspaces/workspace-sync-git';
	import {
		decryptWorkspaceDataFromSync,
		encryptWorkspaceDataForSync,
		parseWorkspaceSyncEnvelope,
		type WorkspaceSyncRegistryError
	} from '$lib/workspaces/workspace-sync';
	import { formatWorkspacePathForDisplay } from '$lib/workspaces/workspace-path-format';
	import { selectWorkspacePath } from '$lib/workspaces/workspace-path';
	import { startAppOperation } from '$lib/shell/app-operation';

	import {
		createDefaultSyncSettings,
		SYNC_PROFILE_NAME_MAX_LENGTH,
		type SyncSettings
	} from './sync-settings';
	import {
		readSyncSettingsFromBrowser,
		subscribeSyncSettings,
		writeSyncSettingsToBrowser,
		type SyncSettingsStorageError
	} from './sync-settings-storage';

	const syncTooltips = {
		folder: 'Choose the folder that stores the sync file.',
		fetch: 'Check the sync repository remote.',
		pull: 'Bring remote sync file changes into this folder.',
		push: 'Commit and upload this sync file.',
		export: 'Use before copying encrypted data manually.',
		import: 'Use after pasting encrypted data from another device.',
		save: 'Use before pushing the sync folder.',
		load: 'Use after pulling the sync folder.'
	} as const;

	type SyncPanelError =
		| WorkspaceSyncRegistryError
		| WorkspaceSyncFileError
		| ProjectRegistryStorageError
		| SyncSettingsStorageError
		| WorkspaceSyncGitRunError;

	let syncSettings = $state<SyncSettings>(createDefaultSyncSettings());
	let syncFolderPathDisplay = $state('');
	let syncPassword = $state('');
	let syncPayload = $state('');
	let syncGitInspection = $state<WorkspaceSyncGitInspectionResult | null>(null);
	let syncError = $state<SyncPanelError | null>(null);
	let syncStatus = $state<string | null>(null);
	let isBusy = $state(false);
	let isInspectingSyncGit = $state(false);
	let syncGitInspectionRequestId = 0;

	let canExport = $derived(syncPassword.length > 0 && !isBusy);
	let canImport = $derived(syncPassword.length > 0 && syncPayload.trim().length > 0 && !isBusy);
	let syncFileNameIsUsable = $derived(isWorkspaceSyncFileNameUsable(syncSettings.fileName));
	let canSave = $derived(
		syncPassword.length > 0 &&
			syncSettings.folderPath.length > 0 &&
			syncFileNameIsUsable &&
			!isBusy
	);
	let canLoad = $derived(
		syncPassword.length > 0 &&
			syncSettings.folderPath.length > 0 &&
			syncFileNameIsUsable &&
			!isBusy
	);
	let canFetchSync = $derived(isSyncGitRemoteReady(false) && !isBusy);
	let canPullSync = $derived(isSyncGitRemoteReady(true) && !isBusy);
	let canPushSync = $derived(isSyncGitRemoteReady(true) && syncFileNameIsUsable && !isBusy);

	function getSyncErrorMessage(error: SyncPanelError) {
		switch (error) {
			case 'workspace-sync-git-action-invalid':
				return 'Git action is invalid.';
			case 'workspace-sync-password-required':
				return 'Password is required.';
			case 'workspace-sync-folder-required':
				return 'Folder is required.';
			case 'workspace-sync-folder-not-absolute':
				return 'Folder path must be absolute.';
			case 'workspace-sync-folder-not-found':
				return 'Folder was not found.';
			case 'workspace-sync-folder-not-directory':
				return 'Path must be a folder.';
			case 'workspace-sync-folder-permission-denied':
				return 'Folder access was denied.';
			case 'workspace-sync-git-folder-required':
				return 'Folder is required.';
			case 'workspace-sync-git-folder-not-absolute':
				return 'Folder path must be absolute.';
			case 'workspace-sync-git-folder-not-found':
				return 'Folder was not found.';
			case 'workspace-sync-git-folder-not-directory':
				return 'Path must be a folder.';
			case 'workspace-sync-git-folder-permission-denied':
				return 'Folder access was denied.';
			case 'workspace-sync-file-name-required':
				return 'Sync file is required.';
			case 'workspace-sync-file-name-invalid':
				return 'Sync file name is invalid.';
			case 'workspace-sync-content-required':
				return 'Encrypted data is required.';
			case 'workspace-sync-file-not-found':
				return 'Sync file was not found.';
			case 'workspace-sync-file-too-large':
				return 'Sync file is too large.';
			case 'workspace-sync-file-target-invalid':
				return 'Sync file path is not usable.';
			case 'workspace-sync-file-read-failed':
				return 'Sync file could not be read.';
			case 'workspace-sync-file-write-failed':
				return 'Sync file could not be saved.';
			case 'workspace-sync-file-unavailable':
				return 'Sync files are available in the desktop app.';
			case 'workspace-sync-git-not-repository':
				return 'Folder is not a Git repository.';
			case 'workspace-sync-git-remote-missing':
				return 'Git remote is not set.';
			case 'workspace-sync-git-branch-missing':
				return 'Git branch was not found.';
			case 'workspace-sync-git-command-unavailable':
				return 'Git is not available.';
			case 'workspace-sync-git-command-timed-out':
				return 'Git command timed out.';
			case 'workspace-sync-git-auth-required':
				return 'Git authentication is required.';
			case 'workspace-sync-git-identity-required':
				return 'Git user name or email is not set.';
			case 'workspace-sync-git-remote-has-changes':
				return 'Remote has changes. Pull first.';
			case 'workspace-sync-git-fast-forward-required':
				return 'Pull needs a manual merge.';
			case 'workspace-sync-git-trust-required':
				return 'Git repository trust must be configured.';
			case 'workspace-sync-git-command-failed':
				return 'Git command failed.';
			case 'workspace-sync-git-read-failed':
				return 'Git repository could not be read.';
			case 'workspace-sync-git-unavailable':
				return 'Git sync is available in the desktop app.';
			case 'workspace-sync-envelope-invalid':
				return 'Encrypted data is invalid.';
			case 'workspace-sync-salt-invalid':
			case 'workspace-sync-nonce-invalid':
			case 'workspace-sync-ciphertext-invalid':
				return 'Encrypted data is damaged.';
			case 'workspace-sync-key-derivation-failed':
			case 'workspace-sync-encryption-failed':
				return 'Export failed.';
			case 'workspace-sync-decryption-failed':
				return 'Password did not match.';
			case 'workspace-sync-plaintext-required':
			case 'workspace-sync-plaintext-invalid':
			case 'workspace-sync-registry-invalid':
				return 'Workspace data is invalid.';
			case 'project-registry-read-failed':
				return 'Project metadata could not be loaded.';
			case 'project-registry-write-failed':
				return 'Project metadata could not be saved.';
			case 'workspace-sync-unavailable':
				return 'Sync encryption is available in the desktop app.';
			case 'sync-settings-storage-unavailable':
				return 'Sync settings could not be saved.';
		}
	}

	function getSyncReadinessError() {
		if (syncSettings.folderPath.length === 0) {
			return 'workspace-sync-folder-required';
		}

		if (syncSettings.fileName.length === 0) {
			return 'workspace-sync-file-name-required';
		}

		if (!syncFileNameIsUsable) {
			return 'workspace-sync-file-name-invalid';
		}

		return 'workspace-sync-password-required';
	}

	function getSyncGitActionReadinessError(action: WorkspaceSyncGitRunAction): SyncPanelError | null {
		if (syncSettings.folderPath.length === 0) {
			return 'workspace-sync-folder-required';
		}

		if (action === 'push' && syncSettings.fileName.length === 0) {
			return 'workspace-sync-file-name-required';
		}

		if (action === 'push' && !syncFileNameIsUsable) {
			return 'workspace-sync-file-name-invalid';
		}

		if (syncGitInspection === null) {
			return 'workspace-sync-git-not-repository';
		}

		if (!syncGitInspection.ok) {
			return syncGitInspection.error;
		}

		if (!syncGitInspection.isRepository) {
			return 'workspace-sync-git-not-repository';
		}

		if (syncGitInspection.originUrl === null) {
			return 'workspace-sync-git-remote-missing';
		}

		if (action !== 'fetch' && syncGitInspection.branchName === null) {
			return 'workspace-sync-git-branch-missing';
		}

		return null;
	}

	function isSyncGitRemoteReady(requireBranch: boolean) {
		if (isInspectingSyncGit || syncGitInspection === null || !syncGitInspection.ok) {
			return false;
		}

		return (
			syncSettings.folderPath.length > 0 &&
			syncGitInspection.isRepository &&
			syncGitInspection.originUrl !== null &&
			(!requireBranch || syncGitInspection.branchName !== null)
		);
	}

	function isSyncFolderError(error: SyncPanelError | null) {
		return (
			error?.startsWith('workspace-sync-folder-') === true ||
			error?.startsWith('workspace-sync-git-folder-') === true
		);
	}

	function isSyncPayloadError(error: SyncPanelError | null) {
		return (
			error !== null &&
			error !== 'workspace-sync-password-required' &&
			!error.startsWith('workspace-sync-git-')
		);
	}

	function getSyncRepositoryDisplay() {
		if (syncSettings.folderPath.length === 0) {
			return 'No folder';
		}

		if (isInspectingSyncGit) {
			return 'Checking';
		}

		if (syncGitInspection === null) {
			return 'No repository';
		}

		if (!syncGitInspection.ok) {
			return 'Unavailable';
		}

		if (!syncGitInspection.isRepository) {
			return 'No repository';
		}

		return formatWorkspaceSyncRemoteForDisplay(syncGitInspection.originUrl);
	}

	function getSyncBranchDisplay() {
		if (
			syncGitInspection === null ||
			!syncGitInspection.ok ||
			!syncGitInspection.isRepository ||
			syncGitInspection.branchName === null
		) {
			return 'No branch';
		}

		return syncGitInspection.branchName;
	}

	function readSyncSettings() {
		const result = readSyncSettingsFromBrowser();

		syncSettings = result.settings;
		syncFolderPathDisplay = formatWorkspacePathForDisplay(result.settings.folderPath);
		syncError = result.ok ? null : result.error;
		void inspectSyncGitRepository(result.settings.folderPath);
	}

	function persistSyncSettings(nextSettings: SyncSettings, displayPath: string | null = null) {
		const result = writeSyncSettingsToBrowser(nextSettings);

		syncSettings = result.settings;
		syncFolderPathDisplay = displayPath ?? formatWorkspacePathForDisplay(result.settings.folderPath);
		syncError = result.ok ? null : result.error;
	}

	async function inspectSyncGitRepository(folderPath: string) {
		const requestId = ++syncGitInspectionRequestId;

		if (folderPath.trim().length === 0) {
			syncGitInspection = null;
			isInspectingSyncGit = false;
			return;
		}

		isInspectingSyncGit = true;

		const result = await inspectWorkspaceSyncGit(folderPath);

		if (requestId !== syncGitInspectionRequestId) {
			return;
		}

		syncGitInspection = result;
		isInspectingSyncGit = false;
	}

	function handleSyncProfileNameInput(event: Event) {
		const target = event.currentTarget;

		if (!(target instanceof HTMLInputElement)) {
			return;
		}

		persistSyncSettings({ ...syncSettings, profileName: target.value });
	}

	function handleSyncFolderInput(event: Event) {
		const target = event.currentTarget;

		if (!(target instanceof HTMLInputElement)) {
			return;
		}

		persistSyncSettings({ ...syncSettings, folderPath: target.value }, target.value);
		void inspectSyncGitRepository(target.value);
	}

	function handleSyncFileNameInput(event: Event) {
		const target = event.currentTarget;

		if (!(target instanceof HTMLInputElement)) {
			return;
		}

		persistSyncSettings({ ...syncSettings, fileName: target.value });
	}

	async function handleSyncFolderSelect() {
		const result = await selectWorkspacePath(syncSettings.folderPath);

		if (!result.ok) {
			syncError = 'workspace-sync-file-unavailable';
			syncStatus = null;
			return;
		}

		if (result.path === null) {
			return;
		}

		persistSyncSettings(
			{ ...syncSettings, folderPath: result.path },
			formatWorkspacePathForDisplay(result.path)
		);
		void inspectSyncGitRepository(result.path);
	}

	async function createEncryptedRegistryPayload() {
		if (!canExport) {
			syncError = 'workspace-sync-password-required';
			syncStatus = null;
			return null;
		}

		isBusy = true;
		syncError = null;
		syncStatus = null;

		const registryResult = readWorkspaceRegistryFromBrowser();

		if (!registryResult.ok) {
			isBusy = false;
			syncError = 'workspace-sync-registry-invalid';
			return null;
		}

		const projectRegistriesResult = await readProjectRegistries(
			registryResult.registry.workspaces.map((workspace) => workspace.id)
		);

		if (!projectRegistriesResult.ok) {
			isBusy = false;
			syncError = projectRegistriesResult.error;
			return null;
		}

		const result = await encryptWorkspaceDataForSync(
			registryResult.registry,
			projectRegistriesResult.registries,
			syncPassword
		);

		isBusy = false;

		if (!result.ok) {
			syncError = result.error;
			return null;
		}

		return JSON.stringify(result.envelope, null, 2);
	}

	async function importEncryptedRegistryPayload(payload: string) {
		const envelope = parseWorkspaceSyncEnvelope(payload);

		if (envelope === null) {
			syncError = 'workspace-sync-envelope-invalid';
			syncStatus = null;
			return false;
		}

		isBusy = true;
		syncError = null;
		syncStatus = null;

		const result = await decryptWorkspaceDataFromSync(envelope, syncPassword);

		isBusy = false;

		if (!result.ok) {
			syncError = result.error;
			return false;
		}

		const writeResult = writeWorkspaceRegistryToBrowser(result.data.workspaceRegistry);

		if (!writeResult.ok) {
			syncError = 'workspace-sync-registry-invalid';
			return false;
		}

		const projectWriteResult = await writeProjectRegistries(result.data.projectRegistries);

		if (!projectWriteResult.ok) {
			syncError = projectWriteResult.error;
			return false;
		}

		return true;
	}

	async function handleExport() {
		const payload = await createEncryptedRegistryPayload();

		if (payload === null) {
			return;
		}

		syncPayload = payload;
		syncStatus = 'Exported.';
	}

	async function handleImport() {
		if (await importEncryptedRegistryPayload(syncPayload)) {
			syncStatus = 'Imported.';
		}
	}

	async function handleSaveFile() {
		if (!canSave) {
			syncError = getSyncReadinessError();
			syncStatus = null;
			return;
		}

		const payload = await createEncryptedRegistryPayload();

		if (payload === null) {
			return;
		}

		isBusy = true;
		const writeResult = await writeWorkspaceSyncFile(
			syncSettings.folderPath,
			syncSettings.fileName,
			payload
		);
		isBusy = false;

		if (!writeResult.ok) {
			syncError = writeResult.error;
			return;
		}

		syncPayload = payload;
		syncStatus = `Saved ${syncSettings.fileName}.`;
	}

	async function handleLoadFile() {
		if (!canLoad) {
			syncError = getSyncReadinessError();
			syncStatus = null;
			return;
		}

		isBusy = true;
		syncError = null;
		syncStatus = null;

		const readResult = await readWorkspaceSyncFile(syncSettings.folderPath, syncSettings.fileName);
		isBusy = false;

		if (!readResult.ok) {
			syncError = readResult.error;
			return;
		}

		if (await importEncryptedRegistryPayload(readResult.content)) {
			syncPayload = readResult.content;
			syncStatus = `Loaded ${syncSettings.fileName}.`;
		}
	}

	async function handleGitSyncAction(action: WorkspaceSyncGitRunAction) {
		const readinessError = getSyncGitActionReadinessError(action);

		if (readinessError !== null) {
			syncError = readinessError;
			syncStatus = null;
			return;
		}

		isBusy = true;
		syncError = null;
		syncStatus = null;
		const appOperation = startAppOperation({
			label: getSyncGitOperationLabel(action),
			detail: getSyncGitOperationDetail(action)
		});

		try {
			const result = await runWorkspaceSyncGit(syncSettings.folderPath, syncSettings.fileName, action);

			if (!result.ok) {
				syncError = result.error;
				return;
			}

			syncStatus = getSyncGitOutcomeMessage(result.outcome);
			void inspectSyncGitRepository(syncSettings.folderPath);
		} finally {
			appOperation.finish();
			isBusy = false;
		}
	}

	function getSyncGitOutcomeMessage(outcome: WorkspaceSyncGitRunOutcome) {
		switch (outcome) {
			case 'fetched':
				return 'Fetched.';
			case 'pulled':
				return 'Pulled. Use Load to apply.';
			case 'pushed':
				return 'Pushed.';
			case 'committed-and-pushed':
				return 'Committed and pushed.';
		}
	}

	function getSyncGitOperationLabel(action: WorkspaceSyncGitRunAction) {
		switch (action) {
			case 'fetch':
				return 'Fetching sync';
			case 'pull':
				return 'Pulling sync';
			case 'push':
				return 'Pushing sync';
		}
	}

	function getSyncGitOperationDetail(action: WorkspaceSyncGitRunAction) {
		switch (action) {
			case 'fetch':
				return 'Checking remote changes.';
			case 'pull':
				return 'Updating the sync folder.';
			case 'push':
				return 'Uploading the sync file.';
		}
	}

	onMount(() => {
		readSyncSettings();
		const unsubscribeSyncSettings = subscribeSyncSettings((nextSettings) => {
			const previousFolderPath = syncSettings.folderPath;

			syncSettings = nextSettings;
			syncFolderPathDisplay = formatWorkspacePathForDisplay(nextSettings.folderPath);

			if (nextSettings.folderPath !== previousFolderPath) {
				void inspectSyncGitRepository(nextSettings.folderPath);
			}
		});

		return unsubscribeSyncSettings;
	});
</script>

<section class="workduck-settings-section" id="settings-panel-sync" aria-label="Sync">
	<div class="workduck-sync-profile-form">
		<label class="workduck-form-field" for="sync-profile-name">
			Name
			<input
				id="sync-profile-name"
				class="workduck-input"
				type="text"
				value={syncSettings.profileName}
				maxlength={SYNC_PROFILE_NAME_MAX_LENGTH}
				autocomplete="off"
				oninput={handleSyncProfileNameInput}
			/>
		</label>

		<label class="workduck-form-field" for="sync-folder">
			Folder
			<span class="workduck-path-control">
				<input
					id="sync-folder"
					class="workduck-input"
					type="text"
					value={syncFolderPathDisplay}
					oninput={handleSyncFolderInput}
					aria-invalid={isSyncFolderError(syncError)}
				/>
				<span
					class="workduck-tooltip-anchor"
					data-tooltip={syncTooltips.folder}
				>
					<button
						class="workduck-icon-button"
						type="button"
						aria-label="Choose sync folder"
						aria-describedby="sync-folder-tooltip"
						onclick={handleSyncFolderSelect}
					>
						<span class="workduck-folder-icon" aria-hidden="true"></span>
					</button>
					<span class="workduck-sr-only" id="sync-folder-tooltip">{syncTooltips.folder}</span>
				</span>
			</span>
		</label>

		<label class="workduck-form-field" for="sync-file-name">
			File
			<input
				id="sync-file-name"
				class="workduck-input"
				type="text"
				value={syncSettings.fileName}
				maxlength={WORKSPACE_SYNC_FILE_NAME_MAX_LENGTH}
				autocomplete="off"
				spellcheck="false"
				oninput={handleSyncFileNameInput}
				aria-invalid={syncError?.startsWith('workspace-sync-file-name-') ?? false}
			/>
		</label>
	</div>

	<div class="workduck-sync-repository-status" aria-label="Sync repository">
		<div class="workduck-readonly-field">
			<span>Repository</span>
			<span class="workduck-readonly-value">{getSyncRepositoryDisplay()}</span>
		</div>
		<div class="workduck-readonly-field">
			<span>Branch</span>
			<span class="workduck-readonly-value">{getSyncBranchDisplay()}</span>
		</div>
	</div>

	<div class="workduck-sync-remote-actions" aria-label="Sync remote actions">
		<span class="workduck-tooltip-anchor" data-tooltip={syncTooltips.fetch}>
			<button
				class="workduck-button"
				type="button"
				disabled={!canFetchSync}
				aria-describedby="sync-fetch-tooltip"
				onclick={() => handleGitSyncAction('fetch')}
			>
				Fetch
			</button>
			<span class="workduck-sr-only" id="sync-fetch-tooltip">{syncTooltips.fetch}</span>
		</span>
		<span class="workduck-tooltip-anchor" data-tooltip={syncTooltips.pull}>
			<button
				class="workduck-button"
				type="button"
				disabled={!canPullSync}
				aria-describedby="sync-pull-tooltip"
				onclick={() => handleGitSyncAction('pull')}
			>
				Pull
			</button>
			<span class="workduck-sr-only" id="sync-pull-tooltip">{syncTooltips.pull}</span>
		</span>
		<span class="workduck-tooltip-anchor" data-tooltip={syncTooltips.push}>
			<button
				class="workduck-button workduck-button-primary"
				type="button"
				disabled={!canPushSync}
				aria-describedby="sync-push-tooltip"
				onclick={() => handleGitSyncAction('push')}
			>
				Push
			</button>
			<span class="workduck-sr-only" id="sync-push-tooltip">{syncTooltips.push}</span>
		</span>
	</div>

	<div class="workduck-sync-form">
		<label class="workduck-form-field" for="sync-password">
			Password
			<input
				id="sync-password"
				class="workduck-input"
				type="password"
				bind:value={syncPassword}
				autocomplete="current-password"
				aria-invalid={syncError === 'workspace-sync-password-required'}
			/>
		</label>

		<div class="workduck-sync-actions">
			<span class="workduck-tooltip-anchor" data-tooltip={syncTooltips.export}>
				<button
					class="workduck-button workduck-button-primary"
					type="button"
					disabled={!canExport}
					aria-describedby="sync-export-tooltip"
					onclick={handleExport}
				>
					Export
				</button>
				<span class="workduck-sr-only" id="sync-export-tooltip">{syncTooltips.export}</span>
			</span>
			<span class="workduck-tooltip-anchor" data-tooltip={syncTooltips.import}>
				<button
					class="workduck-button"
					type="button"
					disabled={!canImport}
					aria-describedby="sync-import-tooltip"
					onclick={handleImport}
				>
					Import
				</button>
				<span class="workduck-sr-only" id="sync-import-tooltip">{syncTooltips.import}</span>
			</span>
			<span class="workduck-tooltip-anchor" data-tooltip={syncTooltips.save}>
				<button
					class="workduck-button"
					type="button"
					disabled={!canSave}
					aria-describedby="sync-save-tooltip"
					onclick={handleSaveFile}
				>
					Save
				</button>
				<span class="workduck-sr-only" id="sync-save-tooltip">{syncTooltips.save}</span>
			</span>
			<span class="workduck-tooltip-anchor" data-tooltip={syncTooltips.load}>
				<button
					class="workduck-button"
					type="button"
					disabled={!canLoad}
					aria-describedby="sync-load-tooltip"
					onclick={handleLoadFile}
				>
					Load
				</button>
				<span class="workduck-sr-only" id="sync-load-tooltip">{syncTooltips.load}</span>
			</span>
		</div>
	</div>

	<label class="workduck-form-field" for="sync-payload">
		Encrypted data
		<textarea
			id="sync-payload"
			class="workduck-input workduck-textarea"
			bind:value={syncPayload}
			spellcheck="false"
			aria-invalid={isSyncPayloadError(syncError)}
		></textarea>
	</label>

	{#if syncError !== null}
		<p class="workduck-inline-error" aria-live="polite">{getSyncErrorMessage(syncError)}</p>
	{:else if syncStatus !== null}
		<p class="workduck-inline-status" aria-live="polite">{syncStatus}</p>
	{/if}
</section>
