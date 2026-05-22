<script lang="ts">
	import {
		WORKSPACE_NAME_MAX_LENGTH,
		WORKSPACE_PATH_MAX_LENGTH
	} from '$lib/workspaces/workspace-registry';
	import { formatWorkspacePathForDisplay } from '$lib/workspaces/workspace-path-format';
	import { workspaceRequiresUnlock } from '$lib/workspaces/workspace-unlock';
	import StatusToast from '$lib/ui/StatusToast.svelte';
	import WorkspacePathRepairForm from '$lib/workspaces/WorkspacePathRepairForm.svelte';
	import WorkspaceUnlockForm from '$lib/workspaces/WorkspaceUnlockForm.svelte';
	import {
		GITHUB_REPOSITORY_COMMIT_MESSAGE_MAX_LENGTH,
		GITHUB_REPOSITORY_NAME_MAX_LENGTH,
		type WorkspaceSettingsActions,
		type WorkspaceSettingsViewModel
	} from './workspace-settings-types';

	interface Props {
		readonly model: WorkspaceSettingsViewModel;
		readonly actions: WorkspaceSettingsActions;
	}

	let { model, actions }: Props = $props();

	let messages = $derived(model.messages);
	let registry = $derived(model.registry);
	let workspaceName = $derived(model.workspaceName);
	let workspacePathDisplay = $derived(model.workspacePathDisplay);
	let workspacePassword = $derived(model.workspacePassword);
	let workspaceRepositoryChoice = $derived(model.workspaceRepositoryChoice);
	let initializeWorkspaceGit = $derived(model.initializeWorkspaceGit);
	let installWorkspaceMustflow = $derived(model.installWorkspaceMustflow);
	let installWorkspaceGitignore = $derived(model.installWorkspaceGitignore);
	let useWorkspaceAsRepository = $derived(model.useWorkspaceAsRepository);
	let canSelectWorkspacePath = $derived(model.canSelectWorkspacePath);
	let isSelectingWorkspacePath = $derived(model.isSelectingWorkspacePath);
	let formError = $derived(model.formError);
	let canAddWorkspace = $derived(model.canAddWorkspace);
	let isAddingWorkspace = $derived(model.isAddingWorkspace);
	let repositorySetupError = $derived(model.repositorySetupError);
	let storageError = $derived(model.storageError);
	let repositorySetupStatus = $derived(model.repositorySetupStatus);
	let workspaceRepositoryGitStatus = $derived(model.workspaceRepositoryGitStatus);
	let hasLoaded = $derived(model.hasLoaded);
	let workspaceUnlockId = $derived(model.workspaceUnlockId);
	let workspaceUnlockIntent = $derived(model.workspaceUnlockIntent);
	let workspacePathRepairId = $derived(model.workspacePathRepairId);
	let workspaceRepositorySetupCandidate = $derived(model.workspaceRepositorySetupCandidate);
	let prepareWorkspaceGit = $derived(model.prepareWorkspaceGit);
	let prepareWorkspaceMustflow = $derived(model.prepareWorkspaceMustflow);
	let prepareWorkspaceGitignore = $derived(model.prepareWorkspaceGitignore);
	let isPreparingWorkspaceRepository = $derived(model.isPreparingWorkspaceRepository);
	let workspaceRepositoryPublishCandidate = $derived(model.workspaceRepositoryPublishCandidate);
	let workspaceRepositoryName = $derived(model.workspaceRepositoryName);
	let workspaceRepositoryCommitMessage = $derived(model.workspaceRepositoryCommitMessage);
	let workspaceRepositoryVisibility = $derived(model.workspaceRepositoryVisibility);
	let isPublishingWorkspaceRepository = $derived(model.isPublishingWorkspaceRepository);
	let canSubmitWorkspaceRepositoryPublish = $derived(model.canSubmitWorkspaceRepositoryPublish);
	let workspaceRemoveCandidate = $derived(model.workspaceRemoveCandidate);

	// svelte-ignore state_referenced_locally
	const {
		getWorkspaceErrorMessage,
		getWorkspaceRepositorySetupErrorMessage,
		isWorkspacePathError,
		handleWorkspaceNameInput,
		handleWorkspacePathInput,
		handleWorkspacePathSelect,
		handleWorkspacePasswordInput,
		handleWorkspaceSubmit,
		selectWorkspaceRepositoryChoice,
		setInitializeWorkspaceGit,
		setInstallWorkspaceMustflow,
		setInstallWorkspaceGitignore,
		getWorkspaceRepositoryGitStatus,
		workspaceIsActive,
		workspaceIsUnlocked,
		handleWorkspaceUnlocked,
		clearWorkspaceUnlockRequest,
		clearWorkspacePathRepair,
		requestWorkspaceUnlock,
		requestWorkspaceRepositorySetup,
		requestWorkspaceRepositoryPublish,
		workspaceRepositoryCanPrepare,
		workspaceRepositoryCanPublish,
		workspaceRepositoryHasRemote,
		workspaceRepositoryCanRunRemoteAction,
		getWorkspaceRepositoryGitActionLabel,
		runWorkspaceRepositoryGitAction,
		handleWorkspaceRepair,
		handleWorkspaceSwitch,
		handleWorkspaceLock,
		handleWorkspaceRemove,
		clearWorkspaceRepositorySetup,
		setPrepareWorkspaceGit,
		setPrepareWorkspaceMustflow,
		setPrepareWorkspaceGitignore,
		confirmWorkspaceRepositorySetup,
		handleWorkspaceRepositorySetupBackdropClick,
		clearWorkspaceRepositoryPublish,
		selectWorkspaceRepositoryVisibility,
		handleWorkspaceRepositoryNameInput,
		handleWorkspaceRepositoryCommitMessageInput,
		handleWorkspaceRepositoryPublishSubmit,
		handleWorkspaceRepositoryPublishBackdropClick,
		clearWorkspaceRemoveConfirmation,
		confirmWorkspaceRemove,
		handleWorkspaceRemoveConfirmationBackdropClick,
		handleWorkspaceRemoveConfirmationKeydown
	} = actions;
</script>

<svelte:window onkeydown={handleWorkspaceRemoveConfirmationKeydown} />

<section
	id="settings-panel-workspaces"
	class="workduck-settings-section"
	aria-label={messages.settings.tabs.workspaces}
>
	<form class="workduck-workspace-form" onsubmit={handleWorkspaceSubmit}>
		<label class="workduck-form-field" for="workspace-name">
			<span>{messages.common.name}</span>
			<input
				id="workspace-name"
				class="workduck-input"
				type="text"
				value={workspaceName}
				maxlength={WORKSPACE_NAME_MAX_LENGTH}
				autocomplete="off"
				oninput={handleWorkspaceNameInput}
				aria-invalid={formError === 'workspace-name-required'}
			/>
		</label>

		<label class="workduck-form-field" for="workspace-path">
			<span>{messages.workspace.path}</span>
			<span class="workduck-path-control">
				<input
					id="workspace-path"
					class="workduck-input"
					type="text"
					value={workspacePathDisplay}
					maxlength={WORKSPACE_PATH_MAX_LENGTH}
					autocomplete="off"
					spellcheck="false"
					oninput={handleWorkspacePathInput}
					aria-invalid={isWorkspacePathError(formError)}
				/>
				<button
					class="workduck-icon-button"
					type="button"
					disabled={!canSelectWorkspacePath}
					aria-label={messages.workspace.chooseFolder}
					aria-busy={isSelectingWorkspacePath}
					onclick={handleWorkspacePathSelect}
				>
					<span class="workduck-folder-icon" aria-hidden="true"></span>
				</button>
			</span>
		</label>

		<label class="workduck-form-field" for="workspace-password">
			<span>{messages.common.password}</span>
			<input
				id="workspace-password"
				class="workduck-input"
				type="password"
				value={workspacePassword}
				autocomplete="new-password"
				oninput={handleWorkspaceNameInput}
				aria-invalid={formError?.startsWith('workspace-password-') ?? false}
			/>
		</label>

		<fieldset class="workduck-workspace-repository-options">
			<legend>{messages.settings.workspaces.repository.section}</legend>
			<div
				class="workduck-workspace-repository-choice"
				role="group"
				aria-label={messages.settings.workspaces.repository.useAsRepository}
			>
				<span class="workduck-workspace-repository-choice-label">
					{messages.settings.workspaces.repository.useAsRepository}
				</span>
				<button
					class="workduck-repository-source-mode-button"
					class:workduck-repository-source-mode-button-active={workspaceRepositoryChoice === 'no'}
					type="button"
					aria-pressed={workspaceRepositoryChoice === 'no'}
					onclick={() => selectWorkspaceRepositoryChoice('no')}
				>
					{messages.common.no}
				</button>
				<button
					class="workduck-repository-source-mode-button"
					class:workduck-repository-source-mode-button-active={workspaceRepositoryChoice === 'yes'}
					type="button"
					aria-pressed={workspaceRepositoryChoice === 'yes'}
					onclick={() => selectWorkspaceRepositoryChoice('yes')}
				>
					{messages.common.yes}
				</button>
			</div>

			{#if useWorkspaceAsRepository}
				<div class="workduck-workspace-repository-option-grid">
					<label class="workduck-toggle-field" for="workspace-initialize-git">
						<span class="workduck-toggle-label">
							{messages.settings.workspaces.repository.initializeGit}
						</span>
						<input
							id="workspace-initialize-git"
							class="workduck-checkbox"
							type="checkbox"
							checked={initializeWorkspaceGit}
							onchange={(event) => setInitializeWorkspaceGit(event.currentTarget.checked)}
						/>
					</label>
					<label class="workduck-toggle-field" for="workspace-install-mustflow">
						<span class="workduck-toggle-label">
							{messages.settings.workspaces.repository.installMustflow}
						</span>
						<input
							id="workspace-install-mustflow"
							class="workduck-checkbox"
							type="checkbox"
							checked={installWorkspaceMustflow}
							onchange={(event) => setInstallWorkspaceMustflow(event.currentTarget.checked)}
						/>
					</label>
					<label class="workduck-toggle-field" for="workspace-install-gitignore">
						<span class="workduck-toggle-label">
							{messages.settings.workspaces.repository.installGitignore}
						</span>
						<input
							id="workspace-install-gitignore"
							class="workduck-checkbox"
							type="checkbox"
							checked={installWorkspaceGitignore}
							onchange={(event) => setInstallWorkspaceGitignore(event.currentTarget.checked)}
						/>
					</label>
				</div>
			{/if}
		</fieldset>

		<div class="workduck-workspace-add-action">
			<button
				class="workduck-button workduck-button-primary"
				type="submit"
				disabled={!canAddWorkspace}
				aria-busy={isAddingWorkspace}
			>
				{isAddingWorkspace ? messages.common.checking : messages.common.add}
			</button>
		</div>
	</form>

	{#if formError !== null || repositorySetupError !== null || storageError !== null}
		<p class="workduck-inline-error" aria-live="polite">
			{formError !== null
				? getWorkspaceErrorMessage(formError)
				: repositorySetupError !== null
					? `${messages.settings.workspaces.repository.setupFailed} ${getWorkspaceRepositorySetupErrorMessage(repositorySetupError)}`
					: storageError}
		</p>
	{/if}

	<StatusToast message={repositorySetupStatus ?? workspaceRepositoryGitStatus} />

	{#if hasLoaded && registry.workspaces.length === 0}
		<p class="workduck-empty-state">{messages.settings.workspaces.noWorkspaces}</p>
	{:else if registry.workspaces.length > 0}
		<ul class="workduck-workspace-list">
			{#each registry.workspaces as workspace (workspace.id)}
				{@const workspaceGitStatus = getWorkspaceRepositoryGitStatus(workspace.id)}
				<li class="workduck-workspace-row">
					<div class="workduck-workspace-details">
						<strong class="workduck-workspace-name">{workspace.name}</strong>
						<span class="workduck-workspace-path">
							{formatWorkspacePathForDisplay(workspace.path)}
						</span>
						{#if workspaceIsActive(workspace) || (workspaceRequiresUnlock(workspace) && !workspaceIsUnlocked(workspace)) || workspaceGitStatus?.ok === true}
							<span
								class="workduck-workspace-statuses"
								aria-label={messages.settings.workspaces.status}
							>
								{#if workspaceIsActive(workspace)}
									<span class="workduck-status-pill workduck-status-pill-success">
										{messages.settings.workspaces.active}
									</span>
								{/if}
								{#if workspaceRequiresUnlock(workspace) && !workspaceIsUnlocked(workspace)}
									<span class="workduck-status-pill workduck-status-pill-locked">
										{messages.settings.workspaces.locked}
									</span>
								{/if}
								{#if workspaceGitStatus?.ok === true && workspaceGitStatus.isGitRepository}
									<span class="workduck-status-pill">
										{workspaceGitStatus.hasRemote
											? messages.settings.workspaces.repository.remoteReady
											: messages.settings.workspaces.repository.gitReady}
									</span>
									{#if workspaceGitStatus.branch !== null}
										<span class="workduck-status-pill">
											{messages.common.branch}: {workspaceGitStatus.branch}
										</span>
									{/if}
									{#if workspaceGitStatus.behindCount > 0}
										<span class="workduck-status-pill">
											{messages.settings.workspaces.repository.pullNeeded.replace(
												'{count}',
												String(workspaceGitStatus.behindCount)
											)}
										</span>
									{/if}
									{#if workspaceGitStatus.aheadCount > 0}
										<span class="workduck-status-pill">
											{messages.settings.workspaces.repository.pushNeeded.replace(
												'{count}',
												String(workspaceGitStatus.aheadCount)
											)}
										</span>
									{/if}
								{/if}
							</span>
						{/if}
						{#if workspaceUnlockId === workspace.id}
							<WorkspaceUnlockForm
								workspace={workspace}
								submitLabel={workspaceUnlockIntent === 'remove'
									? messages.common.remove
									: messages.workspace.unlock.submit}
								onUnlocked={() => handleWorkspaceUnlocked(workspace.id)}
								onCancel={clearWorkspaceUnlockRequest}
							/>
						{/if}
						{#if workspacePathRepairId === workspace.id}
							<WorkspacePathRepairForm
								workspace={workspace}
								onRepaired={clearWorkspacePathRepair}
								onCancel={clearWorkspacePathRepair}
							/>
						{/if}
					</div>

					<div class="workduck-workspace-actions">
						{#if workspaceRequiresUnlock(workspace) && !workspaceIsUnlocked(workspace)}
							<span
								class="workduck-tooltip-anchor"
								data-tooltip={messages.settings.workspaces.tooltips.unlock}
							>
								<button
									class="workduck-button workduck-button-secondary"
									type="button"
									onclick={() => requestWorkspaceUnlock(workspace.id, 'switch')}
								>
									{messages.workspace.unlock.submit}
								</button>
							</span>
						{:else}
							{#if workspaceRepositoryCanPrepare(workspace.id)}
								<span
									class="workduck-tooltip-anchor"
									data-tooltip={messages.settings.workspaces.tooltips.prepareRepository}
								>
									<button
										class="workduck-button workduck-button-secondary"
										type="button"
										onclick={() => requestWorkspaceRepositorySetup(workspace.id)}
									>
										{workspaceGitStatus?.ok === true && workspaceGitStatus.isLoading
											? messages.common.checking
											: messages.settings.workspaces.repository.prepare}
									</button>
								</span>
							{/if}
							{#if workspaceRepositoryCanPublish(workspace.id)}
								<span
									class="workduck-tooltip-anchor"
									data-tooltip={messages.settings.workspaces.tooltips.publishRepository}
								>
									<button
										class="workduck-button workduck-button-primary"
										type="button"
										onclick={() => requestWorkspaceRepositoryPublish(workspace.id)}
									>
										{messages.settings.workspaces.repository.publish}
									</button>
								</span>
							{/if}
							{#if workspaceRepositoryHasRemote(workspace.id)}
								<span
									class="workduck-tooltip-anchor"
									data-tooltip={messages.settings.workspaces.tooltips.fetchRepository}
								>
									<button
										class="workduck-button workduck-button-secondary"
										type="button"
										disabled={!workspaceRepositoryCanRunRemoteAction(workspace.id, 'fetch')}
										onclick={() => runWorkspaceRepositoryGitAction(workspace.id, 'fetch')}
									>
										{getWorkspaceRepositoryGitActionLabel(
											workspace.id,
											'fetch',
											messages.common.fetch
										)}
									</button>
								</span>
								<span
									class="workduck-tooltip-anchor"
									data-tooltip={messages.settings.workspaces.tooltips.pullRepository}
								>
									<button
										class="workduck-button workduck-button-secondary"
										type="button"
										disabled={!workspaceRepositoryCanRunRemoteAction(workspace.id, 'pull')}
										onclick={() => runWorkspaceRepositoryGitAction(workspace.id, 'pull')}
									>
										{getWorkspaceRepositoryGitActionLabel(
											workspace.id,
											'pull',
											messages.common.pull
										)}
									</button>
								</span>
								<span
									class="workduck-tooltip-anchor"
									data-tooltip={messages.settings.workspaces.tooltips.pushRepository}
								>
									<button
										class="workduck-button workduck-button-secondary"
										type="button"
										disabled={!workspaceRepositoryCanRunRemoteAction(workspace.id, 'push')}
										onclick={() => runWorkspaceRepositoryGitAction(workspace.id, 'push')}
									>
										{getWorkspaceRepositoryGitActionLabel(
											workspace.id,
											'push',
											messages.common.push
										)}
									</button>
								</span>
							{/if}
							<span
								class="workduck-tooltip-anchor"
								data-tooltip={messages.settings.workspaces.tooltips.reconnect}
							>
								<button
									class="workduck-button workduck-button-secondary"
									type="button"
									onclick={() => handleWorkspaceRepair(workspace.id)}
								>
									{messages.settings.workspaces.reconnect}
								</button>
							</span>
							{#if registry.activeWorkspaceId !== workspace.id}
								<span
									class="workduck-tooltip-anchor"
									data-tooltip={messages.settings.workspaces.tooltips.switch}
								>
									<button
										class="workduck-button workduck-button-secondary"
										type="button"
										onclick={() => handleWorkspaceSwitch(workspace.id)}
									>
										{messages.settings.workspaces.switch}
									</button>
								</span>
							{/if}
							{#if workspaceRequiresUnlock(workspace)}
								<span
									class="workduck-tooltip-anchor"
									data-tooltip={messages.settings.workspaces.tooltips.lock}
								>
									<button
										class="workduck-button workduck-button-secondary"
										type="button"
										onclick={() => handleWorkspaceLock(workspace.id)}
									>
										{messages.settings.workspaces.lock}
									</button>
								</span>
							{/if}
						{/if}
						{#if workspaceRequiresUnlock(workspace) && !workspaceIsUnlocked(workspace)}
							<span
								class="workduck-tooltip-anchor"
								data-tooltip={messages.settings.workspaces.tooltips.reconnect}
							>
								<button
									class="workduck-button workduck-button-secondary"
									type="button"
									onclick={() => handleWorkspaceRepair(workspace.id)}
								>
									{messages.settings.workspaces.reconnect}
								</button>
							</span>
						{/if}
						<span
							class="workduck-tooltip-anchor"
							data-tooltip={messages.settings.workspaces.tooltips.remove}
						>
							<button
								class="workduck-button workduck-button-danger"
								type="button"
								onclick={() => handleWorkspaceRemove(workspace.id)}
							>
								{messages.common.remove}
							</button>
						</span>
					</div>
				</li>
			{/each}
		</ul>
	{/if}

	{#if workspaceRepositorySetupCandidate !== null}
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			class="workduck-dialog-backdrop"
			role="presentation"
			onclick={handleWorkspaceRepositorySetupBackdropClick}
		>
			<div
				class="workduck-dialog"
				role="dialog"
				aria-modal="true"
				aria-labelledby="workspace-repository-setup-title"
			>
				<h2 id="workspace-repository-setup-title" class="workduck-dialog-title">
					{messages.settings.workspaces.repository.prepareTitle}
				</h2>
				<span class="workduck-dialog-kicker">{workspaceRepositorySetupCandidate.name}</span>
				<div class="workduck-workspace-repository-option-grid">
					<label class="workduck-toggle-field" for="prepare-workspace-git">
						<span class="workduck-toggle-label">
							{messages.settings.workspaces.repository.initializeGit}
						</span>
						<input
							id="prepare-workspace-git"
							class="workduck-checkbox"
							type="checkbox"
							checked={prepareWorkspaceGit}
							onchange={(event) => setPrepareWorkspaceGit(event.currentTarget.checked)}
							disabled={isPreparingWorkspaceRepository}
						/>
					</label>
					<label class="workduck-toggle-field" for="prepare-workspace-mustflow">
						<span class="workduck-toggle-label">
							{messages.settings.workspaces.repository.installMustflow}
						</span>
						<input
							id="prepare-workspace-mustflow"
							class="workduck-checkbox"
							type="checkbox"
							checked={prepareWorkspaceMustflow}
							onchange={(event) => setPrepareWorkspaceMustflow(event.currentTarget.checked)}
							disabled={isPreparingWorkspaceRepository}
						/>
					</label>
					<label class="workduck-toggle-field" for="prepare-workspace-gitignore">
						<span class="workduck-toggle-label">
							{messages.settings.workspaces.repository.installGitignore}
						</span>
						<input
							id="prepare-workspace-gitignore"
							class="workduck-checkbox"
							type="checkbox"
							checked={prepareWorkspaceGitignore}
							onchange={(event) => setPrepareWorkspaceGitignore(event.currentTarget.checked)}
							disabled={isPreparingWorkspaceRepository}
						/>
					</label>
				</div>
				{#if repositorySetupError !== null}
					<p class="workduck-inline-error" aria-live="polite">
						{`${messages.settings.workspaces.repository.setupFailed} ${getWorkspaceRepositorySetupErrorMessage(repositorySetupError)}`}
					</p>
				{/if}
				<div class="workduck-dialog-actions">
					<button
						class="workduck-button workduck-button-secondary"
						type="button"
						disabled={isPreparingWorkspaceRepository}
						onclick={clearWorkspaceRepositorySetup}
					>
						{messages.common.cancel}
					</button>
					<button
						class="workduck-button workduck-button-primary"
						type="button"
						disabled={isPreparingWorkspaceRepository}
						aria-busy={isPreparingWorkspaceRepository}
						onclick={confirmWorkspaceRepositorySetup}
					>
						{isPreparingWorkspaceRepository
							? messages.common.checking
							: messages.settings.workspaces.repository.prepare}
					</button>
				</div>
			</div>
		</div>
	{/if}

	{#if workspaceRepositoryPublishCandidate !== null}
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			class="workduck-dialog-backdrop"
			role="presentation"
			onclick={handleWorkspaceRepositoryPublishBackdropClick}
		>
			<div
				class="workduck-dialog"
				role="dialog"
				aria-modal="true"
				aria-labelledby="workspace-repository-publish-title"
			>
				<form class="workduck-project-dialog-form" onsubmit={handleWorkspaceRepositoryPublishSubmit}>
					<h2 id="workspace-repository-publish-title" class="workduck-dialog-title">
						{messages.settings.workspaces.repository.publishTitle}
					</h2>
					<span class="workduck-dialog-kicker">{workspaceRepositoryPublishCandidate.name}</span>

					<label class="workduck-form-field" for="workspace-github-repository-name">
						<span>{messages.settings.workspaces.repository.githubRepository}</span>
						<input
							id="workspace-github-repository-name"
							class="workduck-input"
							type="text"
							value={workspaceRepositoryName}
							maxlength={GITHUB_REPOSITORY_NAME_MAX_LENGTH}
							autocomplete="off"
							spellcheck="false"
							disabled={isPublishingWorkspaceRepository}
							oninput={handleWorkspaceRepositoryNameInput}
							aria-invalid={formError === 'project-repository-github-repo-name-required' ||
								formError === 'project-repository-github-repo-name-invalid'}
						/>
					</label>

					<label class="workduck-form-field" for="workspace-github-commit-message">
						<span>{messages.settings.workspaces.repository.commitMessage}</span>
						<input
							id="workspace-github-commit-message"
							class="workduck-input"
							type="text"
							value={workspaceRepositoryCommitMessage}
							maxlength={GITHUB_REPOSITORY_COMMIT_MESSAGE_MAX_LENGTH}
							autocomplete="off"
							spellcheck="false"
							disabled={isPublishingWorkspaceRepository}
							oninput={handleWorkspaceRepositoryCommitMessageInput}
							aria-invalid={formError === 'project-repository-github-commit-message-required' ||
								formError === 'project-repository-github-commit-message-invalid'}
						/>
					</label>

					<div
						class="workduck-repository-source-mode"
						role="group"
						aria-label={messages.settings.workspaces.repository.visibility}
					>
						<button
							class="workduck-repository-source-mode-button"
							class:workduck-repository-source-mode-button-active={workspaceRepositoryVisibility === 'private'}
							type="button"
							aria-pressed={workspaceRepositoryVisibility === 'private'}
							disabled={isPublishingWorkspaceRepository}
							onclick={() => selectWorkspaceRepositoryVisibility('private')}
						>
							{messages.settings.workspaces.repository.private}
						</button>
						<button
							class="workduck-repository-source-mode-button"
							class:workduck-repository-source-mode-button-active={workspaceRepositoryVisibility === 'public'}
							type="button"
							aria-pressed={workspaceRepositoryVisibility === 'public'}
							disabled={isPublishingWorkspaceRepository}
							onclick={() => selectWorkspaceRepositoryVisibility('public')}
						>
							{messages.settings.workspaces.repository.public}
						</button>
					</div>

					{#if formError !== null}
						<p class="workduck-inline-error" aria-live="polite">
							{getWorkspaceErrorMessage(formError)}
						</p>
					{/if}

					<div class="workduck-dialog-actions">
						<button
							class="workduck-button workduck-button-secondary"
							type="button"
							disabled={isPublishingWorkspaceRepository}
							onclick={clearWorkspaceRepositoryPublish}
						>
							{messages.common.cancel}
						</button>
						<button
							class="workduck-button workduck-button-primary"
							type="submit"
							disabled={!canSubmitWorkspaceRepositoryPublish}
							aria-busy={isPublishingWorkspaceRepository}
						>
							{isPublishingWorkspaceRepository
								? messages.common.checking
								: messages.settings.workspaces.repository.publish}
						</button>
					</div>
				</form>
			</div>
		</div>
	{/if}

	{#if workspaceRemoveCandidate !== null}
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			class="workduck-dialog-backdrop"
			role="presentation"
			onclick={handleWorkspaceRemoveConfirmationBackdropClick}
		>
			<div
				class="workduck-dialog"
				role="dialog"
				aria-modal="true"
				aria-labelledby="workspace-remove-confirm-title"
				aria-describedby="workspace-remove-confirm-description"
			>
				<h2 id="workspace-remove-confirm-title" class="workduck-dialog-title">
					{messages.settings.workspaces.removeTitle}
				</h2>
				<p id="workspace-remove-confirm-description" class="workduck-dialog-text">
					{messages.settings.workspaces.removeDescription.replace(
						'{name}',
						workspaceRemoveCandidate.name
					)}
				</p>
				<div class="workduck-dialog-actions">
					<button
						class="workduck-button workduck-button-secondary"
						type="button"
						onclick={clearWorkspaceRemoveConfirmation}
					>
						{messages.common.cancel}
					</button>
					<button
						class="workduck-button workduck-button-danger"
						type="button"
						onclick={confirmWorkspaceRemove}
					>
						{messages.common.remove}
					</button>
				</div>
			</div>
		</div>
	{/if}
</section>
