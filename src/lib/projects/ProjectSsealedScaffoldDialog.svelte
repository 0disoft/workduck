<script lang="ts">
	import { modalDialog } from '$lib/ui/modal-dialog-action';
	import { getProjectFormErrorMessage, type ProjectFormError } from './project-board-errors';
	import type {
		SsealedScaffoldApplyScope,
		SsealedScaffoldFilePlan,
		SsealedScaffoldPlan
	} from './project-folder';
	import type { ProjectRepositoryTarget } from './project-board-types';
	import type { ProjectRegistryStorageError } from './project-storage';
	import type { WorkduckMessages } from '$lib/i18n/workduck-message-contract';

	interface Props {
		readonly target: ProjectRepositoryTarget;
		readonly projectMessages: WorkduckMessages['projects'];
		readonly scope: SsealedScaffoldApplyScope;
		readonly preview: SsealedScaffoldPlan | null;
		readonly formError: ProjectFormError | null;
		readonly storageError: ProjectRegistryStorageError | null;
		readonly isPreviewing: boolean;
		readonly isApplying: boolean;
		readonly canApply: boolean;
		readonly onScopeSelect: (scope: SsealedScaffoldApplyScope) => void;
		readonly onRefresh: () => Promise<void>;
		readonly onApply: () => Promise<void>;
		readonly onBackdropClick: (event: MouseEvent) => void;
		readonly onClose: () => void;
	}

	let {
		target,
		projectMessages,
		scope,
		preview,
		formError,
		storageError,
		isPreviewing,
		isApplying,
		canApply,
		onScopeSelect,
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

	function getSummaryText() {
		if (isPreviewing) {
			return 'Checking files.';
		}

		if (preview === null) {
			return 'No preview yet.';
		}

		if (preview.missingCount === 0 && preview.conflictCount === 0) {
			return 'All files already match.';
		}

		return `${preview.missingCount} missing, ${preview.unchangedCount} unchanged, ${preview.conflictCount} conflicts.`;
	}

	function getFileStatusLabel(file: SsealedScaffoldFilePlan) {
		if (file.status === 'missing') {
			return 'Add';
		}

		if (file.status === 'added') {
			return 'Added';
		}

		if (file.status === 'unchanged') {
			return 'Keep';
		}

		return 'Conflict';
	}

	function getVisibleFormErrorMessage() {
		const error = formError ?? storageError;

		return error === null ? '' : getProjectFormErrorMessage(error, projectMessages.errors);
	}

	function isSsealedScaffoldApplyScope(value: string): value is SsealedScaffoldApplyScope {
		return (
			value === 'design' ||
			value === 'frontend' ||
			value === 'backend' ||
			value === 'fullstack'
		);
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
				Apply ssealed
			</h2>

			<span class="workduck-dialog-kicker">{target.repository.name}</span>

			<label class="workduck-form-field" for="project-ssealed-scope">
				<span>Scaffold</span>
				<select
					id="project-ssealed-scope"
					class="workduck-input"
					value={scope}
					disabled={isPreviewing || isApplying}
					onchange={handleScopeChange}
				>
					<option value="design">Design</option>
					<option value="frontend">Frontend</option>
					<option value="backend">Backend</option>
					<option value="fullstack">Fullstack</option>
				</select>
			</label>

			<p class="workduck-dialog-note" aria-live="polite">{getSummaryText()}</p>

			{#if preview !== null}
				<div class="workduck-ssealed-file-list" aria-label="ssealed file preview">
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
					<p class="workduck-dialog-note">{hiddenFileCount} more files.</p>
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
					Cancel
				</button>
				<button
					class="workduck-button workduck-button-secondary"
					type="button"
					disabled={isPreviewing || isApplying}
					onclick={() => void onRefresh()}
				>
					{isPreviewing ? 'Checking' : 'Refresh'}
				</button>
				<button
					class="workduck-button workduck-button-primary"
					type="button"
					disabled={!canApply}
					onclick={() => void onApply()}
				>
					{isApplying ? 'Applying' : 'Apply'}
				</button>
			</div>
		</div>
	</div>
</div>
