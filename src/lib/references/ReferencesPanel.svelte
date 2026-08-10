<script lang="ts">
	import { onMount, untrack } from 'svelte';

	import { getWorkduckMessages } from '$lib/i18n/workduck-language';
	import {
		createDefaultAppearanceSettings,
		type AppearanceSettings
	} from '$lib/settings/appearance-settings';
	import {
		readAppearanceSettingsFromBrowser,
		subscribeAppearanceSettings
	} from '$lib/settings/appearance-storage';
	import type { WorkspaceRecord } from '$lib/workspaces/workspace-registry';
	import { createWorkspaceScopedResourceStore } from '$lib/workspaces/workspace-scoped-resource';
	import { DetailCard, EntityCard, EntityWorkbench, StatusToast } from '$lib/ui';
	import {
		createEmptyProjectRegistry,
		type ProjectNodeRecord,
		type ProjectRegistry
	} from '$lib/projects/project-registry';
	import {
		createProjectRepositorySelectionOptions,
		filterProjectRepositorySelectionOptions
	} from '$lib/projects/project-repository-selection';
	import { readProjectRegistry, subscribeProjectRegistry } from '$lib/projects/project-storage';

	import {
		createEmptyReferenceRegistry,
		REFERENCE_CONTENT_MAX_LENGTH,
		REFERENCE_SOURCE_URL_MAX_LENGTH,
		REFERENCE_TAGS_MAX_COUNT,
		REFERENCE_TAG_MAX_LENGTH,
		REFERENCE_TITLE_MAX_LENGTH,
		removeReference,
		upsertReference,
		type ReferenceRecord,
		type ReferenceRegistry,
		type ReferenceRegistryError
	} from './reference-registry';
	import {
		readReferenceRegistry,
		subscribeReferenceRegistry,
		writeReferenceRegistry,
		type ReferenceRegistryStorageError
	} from './reference-registry-storage';

	interface Props {
		readonly workspace: WorkspaceRecord;
		readonly onReferenceCountChange?: (count: number) => void;
	}

	let { workspace, onReferenceCountChange }: Props = $props();
	const referenceRegistryResource = createWorkspaceScopedResourceStore();
	const projectRegistryResource = createWorkspaceScopedResourceStore();

	let appearanceSettings = $state<AppearanceSettings>(createDefaultAppearanceSettings());
	let registry = $state<ReferenceRegistry>(createEmptyReferenceRegistry(''));
	let selectedReferenceId = $state<string | null>(null);
	let editingReferenceId = $state<string | null>(null);
	let referenceTitle = $state('');
	let referenceSourceUrl = $state('');
	let referenceTags = $state('');
	let referenceProjectIds = $state<string[]>([]);
	let referenceRepositoryIds = $state<string[]>([]);
	let referenceRepositorySearchInput = $state('');
	let referenceRepositorySearchQuery = $state('');
	let referenceContent = $state('');
	let projectRegistry = $state<ProjectRegistry>(createEmptyProjectRegistry(''));
	let isReferenceFormOpen = $state(false);
	let isSavingReference = $state(false);
	let isRemovingReference = $state(false);
	let isCopyingReference = $state(false);
	let referenceError = $state<ReferenceRegistryError | ReferenceRegistryStorageError | null>(null);
	let referenceActionErrorMessage = $state<string | null>(null);
	let statusMessage = $state<string | null>(null);
	let messages = $derived(getWorkduckMessages(appearanceSettings.languageId));

	let selectedReference = $derived(
		selectedReferenceId === null
			? null
			: registry.references.find((reference) => reference.id === selectedReferenceId) ?? null
	);
	let selectedReferenceProjectLabels = $derived(
		selectedReference === null ? [] : getReferenceProjectLabels(selectedReference)
	);
	let selectedReferenceRepositoryLabels = $derived(
		selectedReference === null ? [] : getReferenceRepositoryLabels(selectedReference)
	);
	let referenceFormLabel = $derived(
		editingReferenceId === null ? messages.common.add : messages.common.save
	);
	let parsedTags = $derived(parseReferenceTagInput(referenceTags));
	let availableProjects = $derived(
		projectRegistry.nodes.filter((node) => node.kind === 'project')
	);
	let availableRepositories = $derived(createProjectRepositorySelectionOptions(projectRegistry.nodes));
	let filteredAvailableRepositories = $derived(
		filterProjectRepositorySelectionOptions(availableRepositories, referenceRepositorySearchQuery)
	);
	let referenceProjectSummary = $derived(
		createReferenceProjectSummary(referenceProjectIds)
	);
	let referenceRepositorySummary = $derived(
		createReferenceRepositorySummary(referenceRepositoryIds)
	);
	let referenceTagValidationError = $derived(createReferenceTagValidationError(referenceTags));
	let referenceContentIsTooLong = $derived(referenceContent.trim().length > REFERENCE_CONTENT_MAX_LENGTH);
	let canSaveReference = $derived(
		referenceTitle.trim().length > 0 &&
			(referenceSourceUrl.trim().length > 0 || referenceContent.trim().length > 0) &&
			referenceTagValidationError === null &&
			!referenceContentIsTooLong &&
			!isSavingReference
	);

	onMount(() => {
		appearanceSettings = readAppearanceSettingsFromBrowser().settings;
		const unsubscribeAppearanceSettings = subscribeAppearanceSettings((nextSettings) => {
			appearanceSettings = nextSettings;
		});

		return unsubscribeAppearanceSettings;
	});

	$effect(() => {
		const workspaceId = workspace.id;
		const workspacePath = workspace.path;

		return untrack(() => {
			const scope = { workspaceId, workspacePath };
			registry = createEmptyReferenceRegistry(workspaceId);
			projectRegistry = createEmptyProjectRegistry(workspaceId);
			selectedReferenceId = null;
			editingReferenceId = null;
			isCopyingReference = false;
			referenceActionErrorMessage = null;
			statusMessage = null;
			clearReferenceForm();
			const cancelReferenceRead = referenceRegistryResource.load({
				scope,
				load: () => readReferenceRegistry(workspaceId, workspacePath),
				apply: applyReferenceRegistryRead
			});
			const cancelProjectRead = projectRegistryResource.load({
				scope,
				load: () => readProjectRegistry(workspaceId),
				apply: (result) => {
					projectRegistry = result.registry;
				}
			});

			const unsubscribeRegistry = subscribeReferenceRegistry(workspaceId, (nextRegistry) => {
				referenceRegistryResource.invalidate(scope);
				registry = nextRegistry;
				selectedReferenceId = resolveSelectedReferenceId(selectedReferenceId, nextRegistry.references);
			});
			const unsubscribeProjectRegistry = subscribeProjectRegistry(workspaceId, (nextRegistry) => {
				projectRegistryResource.invalidate(scope);
				projectRegistry = nextRegistry;
			});

			return () => {
				cancelReferenceRead();
				cancelProjectRead();
				unsubscribeRegistry();
				unsubscribeProjectRegistry();
			};
		});
	});

	$effect(() => {
		onReferenceCountChange?.(registry.references.length);
	});

	$effect(() => {
		const nextQuery = referenceRepositorySearchInput;
		const timeoutId = setTimeout(() => {
			referenceRepositorySearchQuery = nextQuery;
		}, 500);

		return () => {
			clearTimeout(timeoutId);
		};
	});

	function applyReferenceRegistryRead(result: Awaited<ReturnType<typeof readReferenceRegistry>>) {
		registry = result.registry;
		referenceError = result.ok ? null : result.error;
		selectedReferenceId = resolveSelectedReferenceId(selectedReferenceId, result.registry.references);
	}

	function selectReference(reference: ReferenceRecord) {
		selectedReferenceId = selectedReferenceId === reference.id ? null : reference.id;
		statusMessage = null;
		referenceActionErrorMessage = null;
		referenceError = null;
	}

	function openNewReferenceForm() {
		clearReferenceForm();
		isReferenceFormOpen = true;
	}

	function editSelectedReference() {
		if (selectedReference === null) {
			return;
		}

		isReferenceFormOpen = true;
		editingReferenceId = selectedReference.id;
		referenceTitle = selectedReference.title;
		referenceSourceUrl = selectedReference.sourceUrl;
		referenceTags = selectedReference.tags.join(', ');
		referenceProjectIds = [...selectedReference.projectIds];
		referenceRepositoryIds = [...(selectedReference.repositoryIds ?? [])];
		referenceRepositorySearchInput = '';
		referenceRepositorySearchQuery = '';
		referenceContent = selectedReference.content;
		statusMessage = null;
		referenceActionErrorMessage = null;
		referenceError = null;
	}

	function clearReferenceForm() {
		isReferenceFormOpen = false;
		editingReferenceId = null;
		referenceTitle = '';
		referenceSourceUrl = '';
		referenceTags = '';
		referenceProjectIds = [];
		referenceRepositoryIds = [];
		referenceRepositorySearchInput = '';
		referenceRepositorySearchQuery = '';
		referenceContent = '';
		referenceError = null;
	}

	async function handleReferenceSubmit(event: SubmitEvent) {
		event.preventDefault();

		if (!canSaveReference) {
			return;
		}

		isSavingReference = true;
		referenceError = null;
		referenceActionErrorMessage = null;
		statusMessage = null;

		try {
			const mutation = upsertReference(registry, {
				id: editingReferenceId,
				title: referenceTitle,
				sourceUrl: referenceSourceUrl,
				tags: parsedTags,
				projectIds: referenceProjectIds,
				repositoryIds: referenceRepositoryIds,
				content: referenceContent
			});

			if (!mutation.ok) {
				referenceError = mutation.error;
				return;
			}

			const writeResult = await writeReferenceRegistry(mutation.registry, workspace.path);

			registry = writeResult.registry;
			referenceError = writeResult.ok ? null : writeResult.error;

			if (!writeResult.ok) {
				return;
			}

			selectedReferenceId = null;
			clearReferenceForm();
			statusMessage = messages.references.saved;
		} finally {
			isSavingReference = false;
		}
	}

	async function handleRemoveSelectedReference() {
		if (selectedReference === null || isRemovingReference) {
			return;
		}

		const targetReference = selectedReference;

		if (
			typeof window !== 'undefined' &&
			!window.confirm(messages.references.removeConfirm.replace('{title}', targetReference.title))
		) {
			return;
		}

		isRemovingReference = true;
		referenceError = null;
		referenceActionErrorMessage = null;
		statusMessage = null;

		try {
			const mutation = removeReference(registry, targetReference.id);

			if (!mutation.ok) {
				referenceError = mutation.error;
				return;
			}

			const writeResult = await writeReferenceRegistry(mutation.registry, workspace.path);

			registry = writeResult.registry;
			referenceError = writeResult.ok ? null : writeResult.error;

			if (!writeResult.ok) {
				return;
			}

			selectedReferenceId = null;
			clearReferenceForm();
			statusMessage = messages.references.removed;
		} finally {
			isRemovingReference = false;
		}
	}

	async function handleCopySelectedReference() {
		if (
			selectedReference === null ||
			selectedReference.content.length === 0 ||
			isCopyingReference
		) {
			return;
		}
		const content = selectedReference.content;

		statusMessage = null;
		referenceActionErrorMessage = null;

		if (typeof navigator === 'undefined' || navigator.clipboard === undefined) {
			referenceActionErrorMessage = messages.references.errors.clipboardUnavailable;
			return;
		}

		isCopyingReference = true;

		try {
			await navigator.clipboard.writeText(content);
			statusMessage = messages.references.copied;
		} catch {
			referenceActionErrorMessage = messages.references.errors.copyFailed;
		} finally {
			isCopyingReference = false;
		}
	}

	function getReferenceMeta(reference: ReferenceRecord) {
		if (reference.tags.length > 0) {
			return reference.tags.join(', ');
		}

		const projectLabels = getReferenceProjectLabels(reference);

		if (projectLabels.length > 0) {
			return projectLabels.join(', ');
		}

		return getReferenceSourceHost(reference.sourceUrl);
	}

	function getReferenceProjectLabels(reference: ReferenceRecord) {
		return reference.projectIds.map(getProjectLabelById).filter((label) => label.length > 0);
	}

	function getReferenceRepositoryLabels(reference: ReferenceRecord) {
		return reference.repositoryIds.map(getRepositoryLabelById).filter((label) => label.length > 0);
	}

	function getProjectLabelById(projectId: string) {
		const project = availableProjects.find((candidate) => candidate.id === projectId);

		return project === undefined ? '' : project.name;
	}

	function createReferenceProjectSummary(projectIds: readonly string[]) {
		const projectLabels = projectIds.map(getProjectLabelById).filter((label) => label.length > 0);

		if (projectLabels.length === 0) {
			return messages.references.noProject;
		}

		if (projectLabels.length === 1) {
			return projectLabels[0] ?? messages.references.noProject;
		}

		return messages.references.projectSelectionCount.replace('{count}', projectLabels.length.toString());
	}

	function toggleReferenceProject(projectId: string, isSelected: boolean) {
		referenceProjectIds = updateSelectedProjectIds(referenceProjectIds, projectId, isSelected);
	}

	function createReferenceRepositorySummary(repositoryIds: readonly string[]) {
		const repositoryLabels = repositoryIds.map(getRepositoryLabelById).filter((label) => label.length > 0);

		if (repositoryLabels.length === 0) {
			return messages.references.noRepository;
		}

		if (repositoryLabels.length === 1) {
			return repositoryLabels[0] ?? '';
		}

		return messages.references.repositorySelectionCount.replace(
			'{count}',
			repositoryLabels.length.toString()
		);
	}

	function getRepositoryLabelById(repositoryId: string) {
		const repository = availableRepositories.find((candidate) => candidate.id === repositoryId);

		return repository === undefined ? '' : repository.label;
	}

	function toggleReferenceRepository(repositoryId: string, isSelected: boolean) {
		referenceRepositoryIds = updateSelectedProjectIds(referenceRepositoryIds, repositoryId, isSelected);
	}

	function updateSelectedProjectIds(
		selectedProjectIds: readonly string[],
		projectId: string,
		isSelected: boolean
	) {
		const normalizedProjectId = projectId.trim();

		if (normalizedProjectId.length === 0) {
			return [...selectedProjectIds];
		}

		if (!isSelected) {
			return selectedProjectIds.filter((selectedProjectId) => selectedProjectId !== normalizedProjectId);
		}

		return selectedProjectIds.includes(normalizedProjectId)
			? [...selectedProjectIds]
			: [...selectedProjectIds, normalizedProjectId];
	}

	function getProjectOptionLabel(project: ProjectNodeRecord) {
		return project.name;
	}

	function getReferenceSourceHost(sourceUrl: string) {
		if (sourceUrl.length === 0) {
			return '';
		}

		try {
			return new URL(sourceUrl).host;
		} catch {
			return '';
		}
	}

	function resolveSelectedReferenceId(
		currentReferenceId: string | null,
		references: readonly ReferenceRecord[]
	) {
		if (
			currentReferenceId !== null &&
			references.some((reference) => reference.id === currentReferenceId)
		) {
			return currentReferenceId;
		}

		return null;
	}

	function parseReferenceTagInput(value: string) {
		const tags: string[] = [];
		const tagKeys = new Set<string>();

		for (const item of value.split(/[;,]/)) {
			const tag = item.trim().replace(/\s+/g, ' ');
			const tagKey = tag.toLocaleLowerCase('en-US');

			if (tag.length === 0 || tagKeys.has(tagKey)) {
				continue;
			}

			tags.push(tag);
			tagKeys.add(tagKey);
		}

		return tags;
	}

	function createReferenceTagValidationError(value: string) {
		const rawTags = value
			.split(/[;,]/)
			.map((tag) => tag.trim().replace(/\s+/g, ' '))
			.filter((tag) => tag.length > 0);
		const uniqueTagKeys = new Set<string>();
		let uniqueTagCount = 0;

		for (const tag of rawTags) {
			const tagKey = tag.toLocaleLowerCase('en-US');

			if (uniqueTagKeys.has(tagKey)) {
				continue;
			}

			if (tag.length > REFERENCE_TAG_MAX_LENGTH) {
				return messages.references.errors.tagTooLong
					.replace('{max}', REFERENCE_TAG_MAX_LENGTH.toString())
					.replace('{tag}', tag);
			}

			uniqueTagKeys.add(tagKey);
			uniqueTagCount += 1;
		}

		if (uniqueTagCount > REFERENCE_TAGS_MAX_COUNT) {
			return messages.references.errors.tagsTooMany
				.replace('{max}', REFERENCE_TAGS_MAX_COUNT.toString());
		}

		return null;
	}

	function formatCountLabel(current: number, max: number) {
		return messages.references.countLabel
			.replace('{current}', current.toString())
			.replace('{max}', max.toString());
	}

	function createReferenceErrorMessage(
		nextError: ReferenceRegistryError | ReferenceRegistryStorageError
	) {
		switch (nextError) {
			case 'reference-title-required':
				return messages.references.errors.titleRequired;
			case 'reference-body-or-source-required':
				return messages.references.errors.bodyOrSourceRequired;
			case 'reference-source-url-invalid':
				return messages.references.errors.sourceUrlInvalid;
			case 'reference-content-too-long':
				return messages.references.errors.contentTooLong.replace(
					'{max}',
					REFERENCE_CONTENT_MAX_LENGTH.toString()
				);
			case 'reference-tags-too-many':
				return messages.references.errors.tagsTooMany.replace(
					'{max}',
					REFERENCE_TAGS_MAX_COUNT.toString()
				);
			case 'reference-tag-too-long':
				return messages.references.errors.tagTooLong
					.replace('{max}', REFERENCE_TAG_MAX_LENGTH.toString())
					.replace('{tag}', '');
			case 'reference-title-duplicate':
				return messages.references.errors.titleDuplicate;
			case 'reference-not-found':
				return messages.references.errors.notFound;
			case 'reference-registry-invalid':
			case 'reference-registry-storage-read-failed':
				return messages.references.errors.readFailed;
			case 'reference-registry-storage-write-failed':
				return messages.references.errors.saveFailed;
			default:
				return nextError.includes('write') || nextError.includes('too-large')
					? messages.references.errors.saveFailed
					: messages.references.errors.readFailed;
		}
	}
</script>

<EntityWorkbench label={messages.references.title} sidebarLabel={messages.references.list} detailLabel={messages.references.details}>
	{#snippet sidebar()}
		<button class="workduck-list-add-card" type="button" onclick={openNewReferenceForm}>
			{messages.references.newReference}
		</button>

		<div class="workduck-entity-list">
			{#each registry.references as reference (reference.id)}
				<EntityCard
					title={reference.title}
					kind={messages.common.reference}
					description={reference.content}
					meta={getReferenceMeta(reference)}
					selected={selectedReference?.id === reference.id}
					onSelect={() => selectReference(reference)}
				/>
			{/each}
		</div>
	{/snippet}

	{#snippet detail()}
		{#if selectedReference !== null}
			<DetailCard
				title={selectedReference.title}
				kind={messages.common.reference}
				actionsAtTop
			>
				<dl class="workduck-agent-details-list">
					{#if selectedReference.sourceUrl.length > 0}
						<div>
							<dt>{messages.references.sourceUrl}</dt>
							<dd>
								<a class="workduck-reference-link" href={selectedReference.sourceUrl} target="_blank" rel="noreferrer">
									{selectedReference.sourceUrl}
								</a>
							</dd>
						</div>
					{/if}
					{#if selectedReference.tags.length > 0}
						<div>
							<dt>{messages.references.tags}</dt>
							<dd>
								<span class="workduck-environment-tags">
									{#each selectedReference.tags as tag (tag)}
										<span class="workduck-project-tag">{tag}</span>
									{/each}
								</span>
							</dd>
						</div>
					{/if}
					{#if selectedReferenceProjectLabels.length > 0}
						<div>
							<dt>{messages.references.relatedProjects}</dt>
							<dd>
								<span class="workduck-environment-tags">
									{#each selectedReferenceProjectLabels as projectLabel (projectLabel)}
										<span class="workduck-project-tag">{projectLabel}</span>
									{/each}
								</span>
							</dd>
						</div>
					{/if}
					{#if selectedReferenceRepositoryLabels.length > 0}
						<div>
							<dt>{messages.references.relatedRepositories}</dt>
							<dd>
								<span class="workduck-environment-tags">
									{#each selectedReferenceRepositoryLabels as repoLabel (repoLabel)}
										<span class="workduck-project-tag">{repoLabel}</span>
									{/each}
								</span>
							</dd>
						</div>
					{/if}
					{#if selectedReference.content.length > 0}
						<div>
							<dt>{messages.references.content}</dt>
							<dd class="workduck-reference-content">{selectedReference.content}</dd>
						</div>
					{/if}
				</dl>

				{#snippet actions()}
					<button
						class="workduck-button workduck-button-secondary"
						type="button"
						disabled={isCopyingReference || selectedReference.content.length === 0}
						onclick={() => void handleCopySelectedReference()}
					>
						{messages.references.copy}
					</button>
					<button
						class="workduck-button workduck-button-secondary"
						type="button"
						onclick={editSelectedReference}
					>
						{messages.common.edit}
					</button>
					<button
						class="workduck-button workduck-button-danger"
						type="button"
						disabled={isRemovingReference}
						onclick={() => void handleRemoveSelectedReference()}
					>
						{messages.common.remove}
					</button>
				{/snippet}
			</DetailCard>
		{/if}
	{/snippet}

	{#snippet status()}
		{#if referenceError !== null}
			<p class="workduck-inline-error" aria-live="polite">{createReferenceErrorMessage(referenceError)}</p>
		{/if}
		{#if referenceActionErrorMessage !== null}
			<p class="workduck-inline-error" aria-live="polite">{referenceActionErrorMessage}</p>
		{/if}

		<StatusToast message={statusMessage} />
	{/snippet}
</EntityWorkbench>

{#if isReferenceFormOpen}
	<div class="workduck-dialog-backdrop" role="presentation" onclick={(event) => {
		if (event.target === event.currentTarget && !isSavingReference) {
			clearReferenceForm();
		}
	}}>
		<div
			class="workduck-dialog workduck-project-dialog"
			role="dialog"
			aria-modal="true"
			aria-labelledby="reference-dialog-title"
		>
			<form class="workduck-project-dialog-form" onsubmit={handleReferenceSubmit}>
				<h2 id="reference-dialog-title" class="workduck-dialog-title">
					{editingReferenceId === null ? messages.references.newReference : messages.references.editReference}
				</h2>

				<label class="workduck-form-field" for="reference-title">
					<span>{messages.common.title}</span>
					<input
						id="reference-title"
						class="workduck-input"
						type="text"
						bind:value={referenceTitle}
						autocomplete="off"
						maxlength={REFERENCE_TITLE_MAX_LENGTH}
						disabled={isSavingReference}
					/>
					<span class="workduck-form-field-meta">
						{formatCountLabel(referenceTitle.trim().length, REFERENCE_TITLE_MAX_LENGTH)}
					</span>
				</label>

				<label class="workduck-form-field" for="reference-source-url">
					<span>{messages.references.sourceUrl}</span>
					<input
						id="reference-source-url"
						class="workduck-input"
						type="text"
						inputmode="url"
						bind:value={referenceSourceUrl}
						autocomplete="off"
						maxlength={REFERENCE_SOURCE_URL_MAX_LENGTH}
						disabled={isSavingReference}
					/>
					<span class="workduck-form-field-meta">{messages.references.sourceUrlHint}</span>
				</label>

				<label class="workduck-form-field" for="reference-tags">
					<span>{messages.references.tags}</span>
					<input
						id="reference-tags"
						class="workduck-input"
						type="text"
						bind:value={referenceTags}
						autocomplete="off"
						disabled={isSavingReference}
					/>
					<span class="workduck-form-field-meta">
						{messages.references.tagsHint
							.replace('{count}', parsedTags.length.toString())
							.replace('{max}', REFERENCE_TAGS_MAX_COUNT.toString())
							.replace('{tagMax}', REFERENCE_TAG_MAX_LENGTH.toString())}
					</span>
					{#if referenceTagValidationError !== null}
						<span class="workduck-inline-error">{referenceTagValidationError}</span>
					{/if}
				</label>

				<div class="workduck-form-field">
					<span>{messages.references.relatedProjects}</span>
					<details class="workduck-multi-select">
						<summary class="workduck-multi-select-summary">
							<span>{referenceProjectSummary}</span>
						</summary>
						<div class="workduck-multi-select-options">
							{#if availableProjects.length === 0}
								<span class="workduck-multi-select-empty">{messages.references.noProject}</span>
							{:else}
								{#each availableProjects as project (project.id)}
									<label class="workduck-multi-select-option">
										<input
											type="checkbox"
											checked={referenceProjectIds.includes(project.id)}
											disabled={isSavingReference}
											onchange={(event) =>
												toggleReferenceProject(project.id, event.currentTarget.checked)}
										/>
										<span>{getProjectOptionLabel(project)}</span>
									</label>
								{/each}
							{/if}
						</div>
					</details>
				</div>

				<div class="workduck-form-field">
					<span>{messages.references.relatedRepositories}</span>
					<input
						class="workduck-input"
						type="text"
						bind:value={referenceRepositorySearchInput}
						autocomplete="off"
						spellcheck="false"
						placeholder={messages.references.repositorySearchPlaceholder}
						disabled={isSavingReference}
					/>
					<details class="workduck-multi-select">
						<summary class="workduck-multi-select-summary">
							<span>{referenceRepositorySummary}</span>
						</summary>
						<div class="workduck-multi-select-options">
							{#if availableRepositories.length === 0}
								<span class="workduck-multi-select-empty">{messages.references.noRepository}</span>
							{:else if filteredAvailableRepositories.length === 0}
								<span class="workduck-multi-select-empty">{messages.references.noRepository}</span>
							{:else}
								{#each filteredAvailableRepositories as repository (repository.id)}
									<label class="workduck-multi-select-option">
										<input
											type="checkbox"
											checked={referenceRepositoryIds.includes(repository.id)}
											disabled={isSavingReference}
											onchange={(event) =>
												toggleReferenceRepository(repository.id, event.currentTarget.checked)}
										/>
										<span>
											{repository.label}
											{#if repository.description.length > 0}
												<small class="workduck-multi-select-option-subtext">{repository.description}</small>
											{/if}
										</span>
									</label>
								{/each}
							{/if}
						</div>
					</details>
				</div>

				<label class="workduck-form-field" for="reference-content">
					<span>{messages.references.content}</span>
					<textarea
						id="reference-content"
						class="workduck-input workduck-project-description-input"
						bind:value={referenceContent}
						maxlength={REFERENCE_CONTENT_MAX_LENGTH}
						disabled={isSavingReference}
					></textarea>
					<span class="workduck-form-field-meta">
						{formatCountLabel(referenceContent.trim().length, REFERENCE_CONTENT_MAX_LENGTH)}
					</span>
					{#if referenceContentIsTooLong}
						<span class="workduck-inline-error">
							{messages.references.errors.contentTooLong.replace(
								'{max}',
								REFERENCE_CONTENT_MAX_LENGTH.toString()
							)}
						</span>
					{/if}
				</label>

				<div class="workduck-dialog-actions">
					<button class="workduck-button workduck-button-secondary" type="button" onclick={clearReferenceForm}>
						{messages.common.cancel}
					</button>
					<button class="workduck-button workduck-button-primary" type="submit" disabled={!canSaveReference}>
						{referenceFormLabel}
					</button>
				</div>
			</form>
		</div>
	</div>
{/if}
