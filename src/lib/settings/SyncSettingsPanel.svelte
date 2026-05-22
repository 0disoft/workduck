<script lang="ts">
	import { onMount } from 'svelte';

	import { getWorkduckMessages } from '$lib/i18n/workduck-language';
	import StatusToast from '$lib/ui/StatusToast.svelte';
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
	import { resolveDefaultGithubTokenCredential } from '$lib/environment/github-credential';
	import { openEnvironmentVaultSessionFromWorkspaceUnlock } from '$lib/environment/environment-vault-session-loader';
	import type { ProjectRepositoryGitCredentialInput } from '$lib/projects/project-repository';

	import {
		createDefaultSyncSettings,
		SYNC_PROFILE_NAME_MAX_LENGTH,
		type SyncSettings
	} from './sync-settings';
	import {
		createDefaultAppearanceSettings,
		type AppearanceSettings
	} from './appearance-settings';
	import {
		readAppearanceSettingsFromBrowser,
		subscribeAppearanceSettings
	} from './appearance-storage';
	import {
		readSyncSettingsFromBrowser,
		subscribeSyncSettings,
		writeSyncSettingsToBrowser,
		type SyncSettingsStorageError
	} from './sync-settings-storage';

	type SyncPanelError =
		| WorkspaceSyncRegistryError
		| WorkspaceSyncFileError
		| ProjectRegistryStorageError
		| SyncSettingsStorageError
		| WorkspaceSyncGitRunError;
	type SyncDangerAction =
		| 'exportData'
		| 'importData'
		| 'saveFile'
		| 'loadFile'
		| 'pullGit'
		| 'pushGit';
	type SyncDangerConfirmation = {
		readonly title: string;
		readonly body: string;
		readonly inputLabel: string;
		readonly confirmTextLabel: string;
		readonly confirmText: string;
		readonly actionLabel: string;
	};

	let appearanceSettings = $state<AppearanceSettings>(createDefaultAppearanceSettings());
	let syncSettings = $state<SyncSettings>(createDefaultSyncSettings());
	let syncFolderPathDisplay = $state('');
	let syncPassword = $state('');
	let syncPayload = $state('');
	let syncGitInspection = $state<WorkspaceSyncGitInspectionResult | null>(null);
	let syncError = $state<SyncPanelError | null>(null);
	let syncStatus = $state<string | null>(null);
	let isBusy = $state(false);
	let isInspectingSyncGit = $state(false);
	let pendingDangerAction = $state<SyncDangerAction | null>(null);
	let pendingDangerConfirmText = $state('');
	let syncGitInspectionRequestId = 0;
	let messages = $derived(getWorkduckMessages(appearanceSettings.languageId));
	let syncMessages = $derived(messages.settings.sync);

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
	let canPullSync = $derived(
		isSyncGitRemoteReady(true) &&
			syncGitInspection?.ok === true &&
			syncGitInspection.behindCount > 0 &&
			!isBusy
	);
	let canPushSync = $derived(
		isSyncGitRemoteReady(true) &&
			syncGitInspection?.ok === true &&
			syncFileNameIsUsable &&
			(syncGitInspection.aheadCount > 0 || syncGitInspection.hasSyncFileChanges) &&
			!isBusy
	);
	let canConfirmDangerAction = $derived(
		pendingDangerAction !== null &&
			pendingDangerConfirmText.trim() === getPendingDangerConfirmation()?.confirmText &&
			!isBusy
	);

	function formatSyncConfirmationText(template: string) {
		return template
			.replaceAll('{fileName}', syncSettings.fileName)
			.replaceAll('{folderPath}', formatWorkspacePathForDisplay(syncSettings.folderPath));
	}

	function getSyncErrorMessage(error: SyncPanelError) {
		switch (error) {
			case 'workspace-sync-git-action-invalid':
				return syncMessages.errors.gitActionInvalid;
			case 'workspace-sync-password-required':
				return syncMessages.errors.passwordRequired;
			case 'workspace-sync-folder-required':
				return syncMessages.errors.folderRequired;
			case 'workspace-sync-folder-not-absolute':
				return syncMessages.errors.folderNotAbsolute;
			case 'workspace-sync-folder-not-found':
				return syncMessages.errors.folderNotFound;
			case 'workspace-sync-folder-not-directory':
				return syncMessages.errors.folderNotDirectory;
			case 'workspace-sync-folder-permission-denied':
				return syncMessages.errors.folderPermissionDenied;
			case 'workspace-sync-git-folder-required':
				return syncMessages.errors.folderRequired;
			case 'workspace-sync-git-folder-not-absolute':
				return syncMessages.errors.folderNotAbsolute;
			case 'workspace-sync-git-folder-not-found':
				return syncMessages.errors.folderNotFound;
			case 'workspace-sync-git-folder-not-directory':
				return syncMessages.errors.folderNotDirectory;
			case 'workspace-sync-git-folder-permission-denied':
				return syncMessages.errors.folderPermissionDenied;
			case 'workspace-sync-file-name-required':
				return syncMessages.errors.fileNameRequired;
			case 'workspace-sync-file-name-invalid':
				return syncMessages.errors.fileNameInvalid;
			case 'workspace-sync-content-required':
				return syncMessages.errors.contentRequired;
			case 'workspace-sync-file-not-found':
				return syncMessages.errors.fileNotFound;
			case 'workspace-sync-file-too-large':
				return syncMessages.errors.fileTooLarge;
			case 'workspace-sync-file-target-invalid':
				return syncMessages.errors.fileTargetInvalid;
			case 'workspace-sync-file-read-failed':
				return syncMessages.errors.fileReadFailed;
			case 'workspace-sync-file-write-failed':
				return syncMessages.errors.fileWriteFailed;
			case 'workspace-sync-file-unavailable':
				return syncMessages.errors.fileUnavailable;
			case 'workspace-sync-git-not-repository':
				return syncMessages.errors.gitNotRepository;
			case 'workspace-sync-git-remote-missing':
				return syncMessages.errors.gitRemoteMissing;
			case 'workspace-sync-git-branch-missing':
				return syncMessages.errors.gitBranchMissing;
			case 'workspace-sync-git-command-unavailable':
				return syncMessages.errors.gitUnavailable;
			case 'workspace-sync-git-command-timed-out':
				return syncMessages.errors.gitTimedOut;
			case 'workspace-sync-git-auth-required':
				return syncMessages.errors.gitAuthRequired;
			case 'workspace-sync-git-identity-required':
				return syncMessages.errors.gitIdentityRequired;
			case 'workspace-sync-git-remote-has-changes':
				return syncMessages.errors.gitRemoteHasChanges;
			case 'workspace-sync-git-fast-forward-required':
				return syncMessages.errors.gitFastForwardRequired;
			case 'workspace-sync-git-trust-required':
				return syncMessages.errors.gitTrustRequired;
			case 'workspace-sync-git-command-failed':
				return syncMessages.errors.gitCommandFailed;
			case 'workspace-sync-git-read-failed':
				return syncMessages.errors.gitReadFailed;
			case 'workspace-sync-git-unavailable':
				return syncMessages.errors.gitSyncUnavailable;
			case 'workspace-sync-envelope-invalid':
				return syncMessages.errors.envelopeInvalid;
			case 'workspace-sync-salt-invalid':
			case 'workspace-sync-nonce-invalid':
			case 'workspace-sync-ciphertext-invalid':
				return syncMessages.errors.encryptedDataDamaged;
			case 'workspace-sync-key-derivation-failed':
			case 'workspace-sync-encryption-failed':
				return syncMessages.errors.exportFailed;
			case 'workspace-sync-decryption-failed':
				return syncMessages.errors.passwordMismatch;
			case 'workspace-sync-plaintext-required':
			case 'workspace-sync-plaintext-invalid':
			case 'workspace-sync-registry-invalid':
				return syncMessages.errors.workspaceDataInvalid;
			case 'project-registry-read-failed':
			case 'project-registry-version-unsupported':
				return syncMessages.errors.projectReadFailed;
			case 'project-registry-write-failed':
				return syncMessages.errors.projectWriteFailed;
			case 'workspace-sync-unavailable':
				return syncMessages.errors.encryptionUnavailable;
			case 'sync-settings-storage-unavailable':
				return syncMessages.errors.settingsSaveFailed;
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

	function getSyncImportReadinessError(): SyncPanelError {
		if (syncPassword.length === 0) {
			return 'workspace-sync-password-required';
		}

		return 'workspace-sync-content-required';
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
			return syncMessages.noFolder;
		}

		if (isInspectingSyncGit) {
			return syncMessages.checking;
		}

		if (syncGitInspection === null) {
			return syncMessages.noRepository;
		}

		if (!syncGitInspection.ok) {
			return syncMessages.unavailable;
		}

		if (!syncGitInspection.isRepository) {
			return syncMessages.noRepository;
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
			return syncMessages.noBranch;
		}

		return syncGitInspection.branchName;
	}

	function readSyncSettings() {
		const result = readSyncSettingsFromBrowser();

		syncSettings = result.settings;
		syncFolderPathDisplay = formatWorkspacePathForDisplay(result.settings.folderPath);
		syncError = result.ok ? null : result.error;
		void inspectSyncGitRepository(result.settings.folderPath, result.settings.fileName);
	}

	function persistSyncSettings(nextSettings: SyncSettings, displayPath: string | null = null) {
		const result = writeSyncSettingsToBrowser(nextSettings);

		syncSettings = result.settings;
		syncFolderPathDisplay = displayPath ?? formatWorkspacePathForDisplay(result.settings.folderPath);
		syncError = result.ok ? null : result.error;
	}

	async function inspectSyncGitRepository(folderPath: string, fileName = syncSettings.fileName) {
		const requestId = ++syncGitInspectionRequestId;

		if (folderPath.trim().length === 0) {
			syncGitInspection = null;
			isInspectingSyncGit = false;
			return;
		}

		isInspectingSyncGit = true;

		const result = await inspectWorkspaceSyncGit(folderPath, fileName);

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
		void inspectSyncGitRepository(syncSettings.folderPath, target.value);
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

	function handleExport() {
		if (!canExport) {
			syncError = 'workspace-sync-password-required';
			syncStatus = null;
			return;
		}

		if (syncPayload.trim().length > 0) {
			openDangerConfirmation('exportData');
			return;
		}

		void runExport();
	}

	async function runExport() {
		const payload = await createEncryptedRegistryPayload();

		if (payload === null) {
			return;
		}

		syncPayload = payload;
		syncStatus = syncMessages.statuses.exported;
	}

	function handleImport() {
		if (!canImport) {
			syncError = getSyncImportReadinessError();
			syncStatus = null;
			return;
		}

		openDangerConfirmation('importData');
	}

	async function runImport() {
		if (await importEncryptedRegistryPayload(syncPayload)) {
			syncStatus = syncMessages.statuses.imported;
		}
	}

	function handleSaveFile() {
		if (!canSave) {
			syncError = getSyncReadinessError();
			syncStatus = null;
			return;
		}

		openDangerConfirmation('saveFile');
	}

	async function runSaveFile() {
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
		syncStatus = syncMessages.statuses.saved.replace('{fileName}', syncSettings.fileName);
		void inspectSyncGitRepository(syncSettings.folderPath);
	}

	function handleLoadFile() {
		if (!canLoad) {
			syncError = getSyncReadinessError();
			syncStatus = null;
			return;
		}

		openDangerConfirmation('loadFile');
	}

	async function runLoadFile() {
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
			syncStatus = syncMessages.statuses.loaded.replace('{fileName}', syncSettings.fileName);
			void inspectSyncGitRepository(syncSettings.folderPath);
		}
	}

	async function handleGitSyncAction(action: WorkspaceSyncGitRunAction) {
		const readinessError = getSyncGitActionReadinessError(action);

		if (readinessError !== null) {
			syncError = readinessError;
			syncStatus = null;
			return;
		}

		if (action === 'pull') {
			openDangerConfirmation('pullGit');
			return;
		}

		if (action === 'push') {
			openDangerConfirmation('pushGit');
			return;
		}

		await runGitSyncAction(action);
	}

	async function runGitSyncAction(action: WorkspaceSyncGitRunAction) {
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
			const credential = await resolveActiveWorkspaceGithubCredential();
			const result = await runWorkspaceSyncGit(
				syncSettings.folderPath,
				syncSettings.fileName,
				action,
				credential
			);

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

	function openDangerConfirmation(action: SyncDangerAction) {
		pendingDangerAction = action;
		pendingDangerConfirmText = '';
		syncError = null;
		syncStatus = null;
	}

	function closeDangerConfirmation() {
		if (isBusy) {
			return;
		}

		pendingDangerAction = null;
		pendingDangerConfirmText = '';
	}

	function getPendingDangerConfirmation(): SyncDangerConfirmation | null {
		if (pendingDangerAction === null) {
			return null;
		}

		const confirmation = syncMessages.confirmations[pendingDangerAction];

		return {
			title: confirmation.title,
			body: formatSyncConfirmationText(confirmation.body),
			inputLabel: confirmation.inputLabel,
			confirmTextLabel: confirmation.confirmTextLabel,
			confirmText: confirmation.confirmText,
			actionLabel: confirmation.actionLabel
		};
	}

	async function confirmDangerAction() {
		if (!canConfirmDangerAction || pendingDangerAction === null) {
			return;
		}

		const action = pendingDangerAction;
		pendingDangerAction = null;
		pendingDangerConfirmText = '';

		switch (action) {
			case 'exportData':
				await runExport();
				return;
			case 'importData':
				await runImport();
				return;
			case 'saveFile':
				await runSaveFile();
				return;
			case 'loadFile':
				await runLoadFile();
				return;
			case 'pullGit':
				await runGitSyncAction('pull');
				return;
			case 'pushGit':
				await runGitSyncAction('push');
				return;
		}
	}

	async function resolveActiveWorkspaceGithubCredential(): Promise<ProjectRepositoryGitCredentialInput | null> {
		const registryResult = readWorkspaceRegistryFromBrowser();

		if (!registryResult.ok || registryResult.registry.activeWorkspaceId === null) {
			return null;
		}

		const workspace =
			registryResult.registry.workspaces.find(
				(candidate) => candidate.id === registryResult.registry.activeWorkspaceId
			) ?? null;

		if (workspace === null) {
			return null;
		}

		const vaultResult = await openEnvironmentVaultSessionFromWorkspaceUnlock(
			workspace.id,
			workspace.path
		);

		if (!vaultResult.ok) {
			return null;
		}

		return resolveDefaultGithubTokenCredential(vaultResult.vault);
	}

	function getSyncGitOutcomeMessage(outcome: WorkspaceSyncGitRunOutcome) {
		switch (outcome) {
			case 'fetched':
				return syncMessages.statuses.fetched;
			case 'pulled':
				return syncMessages.statuses.pulled;
			case 'pushed':
				return syncMessages.statuses.pushed;
			case 'committed-and-pushed':
				return syncMessages.statuses.committedAndPushed;
		}
	}

	function getSyncGitOperationLabel(action: WorkspaceSyncGitRunAction) {
		switch (action) {
			case 'fetch':
				return syncMessages.operations.fetchLabel;
			case 'pull':
				return syncMessages.operations.pullLabel;
			case 'push':
				return syncMessages.operations.pushLabel;
		}
	}

	function getSyncGitOperationDetail(action: WorkspaceSyncGitRunAction) {
		switch (action) {
			case 'fetch':
				return syncMessages.operations.fetchDetail;
			case 'pull':
				return syncMessages.operations.pullDetail;
			case 'push':
				return syncMessages.operations.pushDetail;
		}
	}

	onMount(() => {
		appearanceSettings = readAppearanceSettingsFromBrowser().settings;
		readSyncSettings();
		const unsubscribeAppearanceSettings = subscribeAppearanceSettings((nextSettings) => {
			appearanceSettings = nextSettings;
		});
		const unsubscribeSyncSettings = subscribeSyncSettings((nextSettings) => {
			const previousFolderPath = syncSettings.folderPath;
			const previousFileName = syncSettings.fileName;

			syncSettings = nextSettings;
			syncFolderPathDisplay = formatWorkspacePathForDisplay(nextSettings.folderPath);

			if (
				nextSettings.folderPath !== previousFolderPath ||
				nextSettings.fileName !== previousFileName
			) {
				void inspectSyncGitRepository(nextSettings.folderPath, nextSettings.fileName);
			}
		});

		return () => {
			unsubscribeAppearanceSettings();
			unsubscribeSyncSettings();
		};
	});
</script>

<section class="workduck-settings-section" id="settings-panel-sync" aria-label={syncMessages.section}>
	<div class="workduck-sync-profile-form">
		<label class="workduck-form-field" for="sync-profile-name">
			{messages.common.name}
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
			{messages.common.folder}
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
					data-tooltip={syncMessages.tooltips.folder}
				>
					<button
						class="workduck-icon-button"
						type="button"
						aria-label={syncMessages.tooltips.folder}
						aria-describedby="sync-folder-tooltip"
						onclick={handleSyncFolderSelect}
					>
						<span class="workduck-folder-icon" aria-hidden="true"></span>
					</button>
					<span class="workduck-sr-only" id="sync-folder-tooltip">{syncMessages.tooltips.folder}</span>
				</span>
			</span>
		</label>

		<label class="workduck-form-field" for="sync-file-name">
			{messages.common.file}
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

	<div class="workduck-sync-repository-status" aria-label={messages.common.repository}>
		<div class="workduck-readonly-field">
			<span>{messages.common.repository}</span>
			<span class="workduck-readonly-value">{getSyncRepositoryDisplay()}</span>
		</div>
		<div class="workduck-readonly-field">
			<span>{messages.common.branch}</span>
			<span class="workduck-readonly-value">{getSyncBranchDisplay()}</span>
		</div>
	</div>

	<div class="workduck-sync-remote-actions" aria-label={syncMessages.section}>
		<span class="workduck-tooltip-anchor" data-tooltip={syncMessages.tooltips.fetch}>
			<button
				class="workduck-button"
				type="button"
				disabled={!canFetchSync}
				aria-describedby="sync-fetch-tooltip"
				onclick={() => handleGitSyncAction('fetch')}
			>
				{messages.common.fetch}
			</button>
			<span class="workduck-sr-only" id="sync-fetch-tooltip">{syncMessages.tooltips.fetch}</span>
		</span>
		<span class="workduck-tooltip-anchor" data-tooltip={syncMessages.tooltips.pull}>
			<button
				class="workduck-button"
				type="button"
				disabled={!canPullSync}
				aria-describedby="sync-pull-tooltip"
				onclick={() => handleGitSyncAction('pull')}
			>
				{messages.common.pull}
			</button>
			<span class="workduck-sr-only" id="sync-pull-tooltip">{syncMessages.tooltips.pull}</span>
		</span>
		<span class="workduck-tooltip-anchor" data-tooltip={syncMessages.tooltips.push}>
			<button
				class="workduck-button workduck-button-primary"
				type="button"
				disabled={!canPushSync}
				aria-describedby="sync-push-tooltip"
				onclick={() => handleGitSyncAction('push')}
			>
				{messages.common.push}
			</button>
			<span class="workduck-sr-only" id="sync-push-tooltip">{syncMessages.tooltips.push}</span>
		</span>
	</div>

	<div class="workduck-sync-form">
		<label class="workduck-form-field" for="sync-password">
			{messages.common.password}
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
			<span class="workduck-tooltip-anchor" data-tooltip={syncMessages.tooltips.export}>
				<button
					class="workduck-button workduck-button-primary"
					type="button"
					disabled={!canExport}
					aria-describedby="sync-export-tooltip"
					onclick={handleExport}
				>
					{messages.common.export}
				</button>
				<span class="workduck-sr-only" id="sync-export-tooltip">{syncMessages.tooltips.export}</span>
			</span>
			<span class="workduck-tooltip-anchor" data-tooltip={syncMessages.tooltips.import}>
				<button
					class="workduck-button"
					type="button"
					disabled={!canImport}
					aria-describedby="sync-import-tooltip"
					onclick={handleImport}
				>
					{messages.common.import}
				</button>
				<span class="workduck-sr-only" id="sync-import-tooltip">{syncMessages.tooltips.import}</span>
			</span>
			<span class="workduck-tooltip-anchor" data-tooltip={syncMessages.tooltips.save}>
				<button
					class="workduck-button"
					type="button"
					disabled={!canSave}
					aria-describedby="sync-save-tooltip"
					onclick={handleSaveFile}
				>
					{messages.common.save}
				</button>
				<span class="workduck-sr-only" id="sync-save-tooltip">{syncMessages.tooltips.save}</span>
			</span>
			<span class="workduck-tooltip-anchor" data-tooltip={syncMessages.tooltips.load}>
				<button
					class="workduck-button"
					type="button"
					disabled={!canLoad}
					aria-describedby="sync-load-tooltip"
					onclick={handleLoadFile}
				>
					{messages.common.load}
				</button>
				<span class="workduck-sr-only" id="sync-load-tooltip">{syncMessages.tooltips.load}</span>
			</span>
		</div>
	</div>

	<label class="workduck-form-field" for="sync-payload">
		{syncMessages.encryptedData}
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
	{/if}

	<StatusToast message={syncError === null ? syncStatus : null} />

	{#if pendingDangerAction !== null}
		{@const confirmation = getPendingDangerConfirmation()}
		{#if confirmation !== null}
			<div class="workduck-dialog-backdrop" role="presentation" onclick={(event) => {
				if (event.target === event.currentTarget) {
					closeDangerConfirmation();
				}
			}}>
				<div
					class="workduck-dialog workduck-project-dialog"
					role="dialog"
					aria-modal="true"
					aria-labelledby="sync-danger-confirm-title"
					aria-describedby="sync-danger-confirm-description"
				>
					<h2 id="sync-danger-confirm-title" class="workduck-dialog-title">
						{confirmation.title}
					</h2>
					<p id="sync-danger-confirm-description" class="workduck-dialog-text">
						{confirmation.body}
					</p>
					<label class="workduck-form-field" for="sync-danger-confirm-input">
						<span>{confirmation.inputLabel}</span>
						<span class="workduck-dialog-kicker">
							{confirmation.confirmTextLabel}: {confirmation.confirmText}
						</span>
						<input
							id="sync-danger-confirm-input"
							class="workduck-input"
							type="text"
							bind:value={pendingDangerConfirmText}
							autocomplete="off"
							spellcheck="false"
							disabled={isBusy}
						/>
					</label>
					<div class="workduck-dialog-actions">
						<button
							class="workduck-button"
							type="button"
							disabled={isBusy}
							onclick={closeDangerConfirmation}
						>
							{messages.common.cancel}
						</button>
						<button
							class="workduck-button workduck-button-danger"
							type="button"
							disabled={!canConfirmDangerAction}
							onclick={() => void confirmDangerAction()}
						>
							{confirmation.actionLabel}
						</button>
					</div>
				</div>
			</div>
		{/if}
	{/if}
</section>
