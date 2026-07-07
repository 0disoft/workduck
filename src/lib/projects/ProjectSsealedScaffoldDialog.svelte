<script lang="ts">
	import { modalDialog } from '$lib/ui/modal-dialog-action';
	import { getProjectFormErrorMessage, type ProjectFormError } from './project-board-errors';
	import {
		getSsealedScaffoldProfileDescription,
		getSsealedScaffoldProfileOptionText,
		getSsealedScaffoldScopeDescription,
		getSsealedScaffoldScopeOptionText,
		isSsealedScaffoldApplyScope,
		isSsealedScaffoldProfile,
		type SsealedScaffoldApplyScope,
		type SsealedScaffoldFilePlan,
		type SsealedScaffoldPlan,
		type SsealedScaffoldProfile
	} from './project-folder';
	import {
		SSEALED_SCAFFOLD_PROFILES,
		SSEALED_SCAFFOLD_SCOPES
	} from './ssealed-scaffold-generated';
	import type { ProjectRepositoryTarget } from './project-board-types';
	import type { ProjectRegistryStorageError } from './project-storage';
	import type { WorkduckMessages } from '$lib/i18n/workduck-message-contract';

	interface Props {
		readonly target: ProjectRepositoryTarget;
	readonly projectMessages: WorkduckMessages['projects'];
	readonly scope: SsealedScaffoldApplyScope;
	readonly profile: SsealedScaffoldProfile;
	readonly preview: SsealedScaffoldPlan | null;
		readonly formError: ProjectFormError | null;
		readonly storageError: ProjectRegistryStorageError | null;
		readonly isPreviewing: boolean;
		readonly isApplying: boolean;
	readonly canApply: boolean;
	readonly onScopeSelect: (scope: SsealedScaffoldApplyScope) => void;
	readonly onProfileSelect: (profile: SsealedScaffoldProfile) => void;
	readonly onRefresh: () => Promise<void>;
		readonly onApply: () => Promise<void>;
		readonly onBackdropClick: (event: MouseEvent) => void;
		readonly onClose: () => void;
	}

	let {
		target,
		projectMessages,
		scope,
		profile,
		preview,
		formError,
		storageError,
		isPreviewing,
		isApplying,
		canApply,
		onScopeSelect,
		onProfileSelect,
		onRefresh,
		onApply,
		onBackdropClick,
		onClose
	}: Props = $props();

	let visibleFiles = $derived((preview?.files ?? []).slice(0, 12));
	let hiddenFileCount = $derived(Math.max(0, (preview?.files.length ?? 0) - visibleFiles.length));

	function handleScopeChange(event: Event) {
		const target = event.currentTarget;

		if (!(target instanceof HTMLSelectElement) || !isSsealedScaffoldApplyScope(target.value)) {
			return;
		}

		onScopeSelect(target.value);
	}

	function handleProfileChange(event: Event) {
		const target = event.currentTarget;

		if (!(target instanceof HTMLSelectElement) || !isSsealedScaffoldProfile(target.value)) {
			return;
		}

		onProfileSelect(target.value);
	}

	function getSummaryText() {
		if (isPreviewing) {
			return projectMessages.ssealedScaffold.checkingFiles;
		}

		if (preview === null) {
			return projectMessages.ssealedScaffold.noPreview;
		}

		if (preview.missingCount === 0 && preview.conflictCount === 0) {
			return projectMessages.ssealedScaffold.allFilesMatch;
		}

		return projectMessages.ssealedScaffold.previewSummary
			.replace('{missing}', preview.missingCount.toString())
			.replace('{unchanged}', preview.unchangedCount.toString())
			.replace('{conflicts}', preview.conflictCount.toString());
	}

	function getFileStatusLabel(file: SsealedScaffoldFilePlan) {
		if (file.status === 'missing') {
			return projectMessages.ssealedScaffold.fileStatuses.missing;
		}

		if (file.status === 'added') {
			return projectMessages.ssealedScaffold.fileStatuses.added;
		}

		if (file.status === 'unchanged') {
			return projectMessages.ssealedScaffold.fileStatuses.unchanged;
		}

		return projectMessages.ssealedScaffold.fileStatuses.conflict;
	}

	function getHiddenFileCountText() {
		return projectMessages.ssealedScaffold.moreFiles.replace(
			'{count}',
			hiddenFileCount.toString()
		);
	}

	function getVisibleFormErrorMessage() {
		const error = formError ?? storageError;

		return error === null ? '' : getProjectFormErrorMessage(error, projectMessages.errors);
	}

</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="workduck-dialog-backdrop" role="presentation" onclick={onBackdropClick}>
	<div
		class="workduck-dialog workduck-project-dialog"
		role="dialog"
		aria-modal="true"
		aria-labelledby="project-ssealed-dialog-title"
		use:modalDialog={{
			onClose: isApplying ? undefined : onClose,
			initialFocusSelector: '#project-ssealed-scope'
		}}
	>
		<div class="workduck-project-dialog-form">
			<h2 id="project-ssealed-dialog-title" class="workduck-dialog-title">
				{projectMessages.ssealedScaffold.title}
			</h2>

			<span class="workduck-dialog-kicker">{target.repository.name}</span>

			<label class="workduck-form-field" for="project-ssealed-scope">
				<span>{projectMessages.ssealedScaffold.scaffoldLabel}</span>
				<select
					id="project-ssealed-scope"
					class="workduck-input"
					value={scope}
					disabled={isPreviewing || isApplying}
					onchange={handleScopeChange}
				>
					{#each SSEALED_SCAFFOLD_SCOPES as availableScope (availableScope)}
						<option
							value={availableScope}
							title={getSsealedScaffoldScopeDescription(
								availableScope,
								projectMessages.ssealedScaffold
							)}
						>
							{getSsealedScaffoldScopeOptionText(
								availableScope,
								projectMessages.ssealedScaffold
							)}
						</option>
					{/each}
				</select>
				<span class="workduck-form-field-meta">
					{getSsealedScaffoldScopeDescription(scope, projectMessages.ssealedScaffold)}
				</span>
			</label>

			<label class="workduck-form-field" for="project-ssealed-profile">
				<span>{projectMessages.ssealedScaffold.profileLabel}</span>
				<select
					id="project-ssealed-profile"
					class="workduck-input"
					value={profile}
					disabled={isPreviewing || isApplying}
					onchange={handleProfileChange}
				>
					{#each SSEALED_SCAFFOLD_PROFILES as availableProfile (availableProfile)}
						<option
							value={availableProfile}
							title={getSsealedScaffoldProfileDescription(
								availableProfile,
								projectMessages.ssealedScaffold
							)}
						>
							{getSsealedScaffoldProfileOptionText(
								availableProfile,
								projectMessages.ssealedScaffold
							)}
						</option>
					{/each}
				</select>
				<span class="workduck-form-field-meta">
					{getSsealedScaffoldProfileDescription(profile, projectMessages.ssealedScaffold)}
				</span>
			</label>

			<p class="workduck-dialog-note" aria-live="polite">{getSummaryText()}</p>

			{#if preview !== null}
				<div
					class="workduck-ssealed-file-list"
					aria-label={projectMessages.ssealedScaffold.filePreviewLabel}
				>
					{#each visibleFiles as file (file.path)}
						<div
							class="workduck-ssealed-file-row"
							class:workduck-ssealed-file-row-conflict={file.status === 'conflict'}
						>
							<span class="workduck-ssealed-file-path">{file.path}</span>
							<span class="workduck-ssealed-file-status">{getFileStatusLabel(file)}</span>
						</div>
					{/each}
				</div>
				{#if hiddenFileCount > 0}
					<p class="workduck-dialog-note">{getHiddenFileCountText()}</p>
				{/if}
			{/if}

			{#if formError !== null || storageError !== null}
				<p class="workduck-inline-error" aria-live="polite">
					{getVisibleFormErrorMessage()}
				</p>
			{/if}

			<div class="workduck-dialog-actions">
				<button
					class="workduck-button workduck-button-secondary"
					type="button"
					disabled={isApplying}
					onclick={onClose}
				>
					{projectMessages.ssealedScaffold.cancel}
				</button>
				<button
					class="workduck-button workduck-button-secondary"
					type="button"
					disabled={isPreviewing || isApplying}
					onclick={() => void onRefresh()}
				>
					{isPreviewing
						? projectMessages.ssealedScaffold.checking
						: projectMessages.ssealedScaffold.refresh}
				</button>
				<button
					class="workduck-button workduck-button-primary"
					type="button"
					disabled={!canApply}
					onclick={() => void onApply()}
				>
					{isApplying
						? projectMessages.ssealedScaffold.applying
						: projectMessages.ssealedScaffold.apply}
				</button>
			</div>
		</div>
	</div>
</div>
