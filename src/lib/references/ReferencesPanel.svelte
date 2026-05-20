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
	import { DetailCard, EntityCard, EntityWorkbench } from '$lib/ui';

	import {
		createEmptyReferenceRegistry,
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
	}

	let { workspace }: Props = $props();

	let appearanceSettings = $state<AppearanceSettings>(createDefaultAppearanceSettings());
	let registry = $state<ReferenceRegistry>(createEmptyReferenceRegistry(''));
	let selectedReferenceId = $state<string | null>(null);
	let editingReferenceId = $state<string | null>(null);
	let referenceTitle = $state('');
	let referenceSourceUrl = $state('');
	let referenceTags = $state('');
	let referenceContent = $state('');
	let isReferenceFormOpen = $state(false);
	let isSavingReference = $state(false);
	let isRemovingReference = $state(false);
	let referenceError = $state<ReferenceRegistryError | ReferenceRegistryStorageError | null>(null);
	let status = $state<string | null>(null);
	let messages = $derived(getWorkduckMessages(appearanceSettings.languageId));

	let selectedReference = $derived(
		selectedReferenceId === null
			? null
			: registry.references.find((reference) => reference.id === selectedReferenceId) ?? null
	);
	let referenceFormLabel = $derived(
		editingReferenceId === null ? messages.common.add : messages.common.save
	);
	let parsedTags = $derived(parseReferenceTagInput(referenceTags));
	let canSaveReference = $derived(
		referenceTitle.trim().length > 0 &&
			(referenceSourceUrl.trim().length > 0 || referenceContent.trim().length > 0) &&
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

		return untrack(() => {
			registry = createEmptyReferenceRegistry(workspaceId);
			selectedReferenceId = null;
			editingReferenceId = null;
			clearReferenceForm();
			void readRegistryFromStorage(workspaceId, workspace.path);

			const unsubscribeRegistry = subscribeReferenceRegistry(workspaceId, (nextRegistry) => {
				registry = nextRegistry;
				selectedReferenceId = resolveSelectedReferenceId(selectedReferenceId, nextRegistry.references);
			});

			return unsubscribeRegistry;
		});
	});

	async function readRegistryFromStorage(workspaceId: string, workspacePath: string) {
		const result = await readReferenceRegistry(workspaceId, workspacePath);

		registry = result.registry;
		referenceError = result.ok ? null : result.error;
		selectedReferenceId = resolveSelectedReferenceId(selectedReferenceId, result.registry.references);
	}

	function selectReference(reference: ReferenceRecord) {
		selectedReferenceId = selectedReferenceId === reference.id ? null : reference.id;
		status = null;
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
		referenceContent = selectedReference.content;
		status = null;
		referenceError = null;
	}

	function clearReferenceForm() {
		isReferenceFormOpen = false;
		editingReferenceId = null;
		referenceTitle = '';
		referenceSourceUrl = '';
		referenceTags = '';
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
		status = null;

		try {
			const mutation = upsertReference(registry, {
				id: editingReferenceId,
				title: referenceTitle,
				sourceUrl: referenceSourceUrl,
				tags: parsedTags,
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
			status = messages.references.saved;
		} finally {
			isSavingReference = false;
		}
	}

	async function handleRemoveSelectedReference() {
		if (selectedReference === null || isRemovingReference) {
			return;
		}

		isRemovingReference = true;
		referenceError = null;
		status = null;

		try {
			const mutation = removeReference(registry, selectedReference.id);

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
			status = messages.references.removed;
		} finally {
			isRemovingReference = false;
		}
	}

	function getReferenceMeta(reference: ReferenceRecord) {
		if (reference.tags.length > 0) {
			return reference.tags.join(', ');
		}

		return getReferenceSourceHost(reference.sourceUrl);
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

		for (const item of value.split(',')) {
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
			<DetailCard title={selectedReference.title} kind={messages.common.reference}>
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

		{#if status !== null}
			<p class="workduck-inline-status" aria-live="polite">{status}</p>
		{/if}
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
						disabled={isSavingReference}
					/>
				</label>

				<label class="workduck-form-field" for="reference-source-url">
					<span>{messages.references.sourceUrl}</span>
					<input
						id="reference-source-url"
						class="workduck-input"
						type="url"
						bind:value={referenceSourceUrl}
						autocomplete="off"
						disabled={isSavingReference}
					/>
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
				</label>

				<label class="workduck-form-field" for="reference-content">
					<span>{messages.references.content}</span>
					<textarea
						id="reference-content"
						class="workduck-input workduck-project-description-input"
						bind:value={referenceContent}
						disabled={isSavingReference}
					></textarea>
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
