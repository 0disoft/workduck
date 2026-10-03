<script lang="ts">
	import { onMount } from 'svelte';
	import { beforeNavigate } from '$app/navigation';
	import { getWorkduckMessages, type WorkduckLanguageId } from '#lib/i18n/workduck-language.ts';
	import type { WorkspaceRecord } from '#lib/workspaces/workspace-registry.ts';
	import { readProjectRegistry } from '#lib/projects/project-storage.ts';
	import { EntityWorkbench, DetailCard } from '#lib/ui/index.ts';
	import { modalDialog } from '#lib/ui/modal-dialog-action.ts';
	import { briefMessages } from './brief-messages';
	import BriefRunsPanel from './BriefRunsPanel.svelte';
	import {
		BRIEF_TITLE_MAX_LENGTH, BRIEF_INSTRUCTIONS_MAX_LENGTH, createEmptyBriefRegistry,
		listBriefRepositoryChoices, saveBriefDraft, setBriefArchived, exportBriefForCodex,
		type BriefRecord, type BriefRepositoryChoice
	} from './brief-registry';
	import { readBriefRegistry, writeBriefRegistry } from './brief-storage';
	import './briefs.css';

	let { workspace, languageId }: { workspace: WorkspaceRecord; languageId: WorkduckLanguageId } = $props();
	let registry = $state(createEmptyBriefRegistry(''));
	let repositories = $state<readonly BriefRepositoryChoice[]>([]);
	let selectedId = $state<string | null>(null);
	let loading = $state(true);
	let ready = $state(false);
	let saving = $state(false);
	let error = $state('');
	let notice = $state('');
	let showArchived = $state(false);
	let editing = $state(false);
	let editId = $state('');
	let title = $state('');
	let repositoryId = $state('');
	let instructions = $state('');
	let baseline = $state('');
	let disposed = false;
	let messages = $derived(briefMessages[languageId]);
	let common = $derived(getWorkduckMessages(languageId).common);
	let selected = $derived(registry.briefs.find((brief) => brief.id === selectedId) ?? null);
	let visible = $derived(registry.briefs.filter((brief) => showArchived || !brief.archived));
	let preview = $derived(selected ? exportBriefForCodex(selected).content : '');
	let dirty = $derived(editing && JSON.stringify([title, repositoryId, instructions]) !== baseline);

	beforeNavigate((navigation) => {
		if (saving || (dirty && !window.confirm(messages.discard))) navigation.cancel();
	});

	onMount(() => {
		void refresh();
		return () => { disposed = true; };
	});

	async function refresh() {
		if (saving || (dirty && !window.confirm(messages.discard))) return;
		editing = false;
		loading = true;
		ready = false;
		error = '';
		const [briefResult, projectResult] = await Promise.all([
			readBriefRegistry(workspace.id, workspace.path), readProjectRegistry(workspace.id)
		]);
		if (disposed) return;
		loading = false;
		if (!briefResult.ok || !projectResult.ok) { error = messages.loadFailed; return; }
		registry = briefResult.registry;
		repositories = listBriefRepositoryChoices(projectResult.registry);
		selectedId = registry.briefs.some((brief) => brief.id === selectedId) ? selectedId : null;
		ready = true;
	}

	function edit(brief: BriefRecord | null) {
		editId = brief?.id ?? `brief_${crypto.randomUUID()}`;
		title = brief?.title ?? '';
		repositoryId = brief?.repository.id ?? '';
		instructions = brief?.instructions ?? '';
		baseline = JSON.stringify([title, repositoryId, instructions]);
		error = '';
		notice = '';
		editing = true;
	}

	function closeEditor() {
		if (saving || (dirty && !window.confirm(messages.discard))) return;
		editing = false;
	}

	async function save(event: SubmitEvent) {
		event.preventDefault();
		if (saving || !ready) return;
		const choice = repositories.find((item) => item.repository.id === repositoryId);
		const next = choice ? saveBriefDraft(registry, { ...choice, id: editId, title, instructions }) : null;
		if (!next) { error = messages.invalid; return; }
		saving = true;
		error = '';
		const result = await writeBriefRegistry(next, workspace.path);
		if (disposed) return;
		saving = false;
		if (!result.ok) {
			error = result.error === 'workspace-data-revision-conflict' ? messages.conflict : messages.saveFailed;
			return;
		}
		registry = result.registry;
		selectedId = editId;
		editing = false;
		notice = messages.saved;
	}

	async function archive(brief: BriefRecord) {
		if (saving || !ready) return;
		saving = true;
		error = '';
		const result = await writeBriefRegistry(setBriefArchived(registry, brief.id, !brief.archived), workspace.path);
		if (disposed) return;
		saving = false;
		if (!result.ok) { error = result.error === 'workspace-data-revision-conflict' ? messages.conflict : messages.saveFailed; return; }
		registry = result.registry;
		if (!brief.archived) selectedId = null;
		notice = messages.saved;
	}

	async function copy() {
		try { await navigator.clipboard.writeText(preview); notice = messages.copied; }
		catch { error = messages.copyFailed; }
	}
</script>

<svelte:window onbeforeunload={(event) => { if (dirty || saving) { event.preventDefault(); event.returnValue = ''; } }} />

<EntityWorkbench label={messages.title} sidebarLabel={messages.title} detailLabel={messages.preview}>
	{#snippet sidebar()}
		<div class="brief-actions">
			<button class="workduck-button workduck-button-primary" disabled={!ready || saving || repositories.length === 0} onclick={() => edit(null)}>{messages.newBrief}</button>
			<button class="workduck-button workduck-button-secondary" disabled={loading || saving} onclick={() => void refresh()}>{common.refresh}</button>
		</div>
		<label class="brief-archived"><input type="checkbox" bind:checked={showArchived} /> {messages.showArchived}</label>
		{#if loading}<p>{messages.loading}</p>{:else if ready && visible.length === 0}<p>{messages.empty}</p>{/if}
		{#if ready && repositories.length === 0}<p>{messages.noRepositories}</p>{/if}
		<div class="brief-list">
			{#each visible as brief (brief.id)}
				<button class="brief-list-item" class:selected={selectedId === brief.id} disabled={saving} onclick={() => { selectedId = brief.id; notice = ''; }}>
					<strong>{brief.title}</strong><span>{brief.project.label} / {brief.repository.label}</span>
					{#if brief.archived}<small>{messages.archived}</small>{/if}
				</button>
			{/each}
		</div>
	{/snippet}
	{#snippet detail()}
		{#if selected}
			<DetailCard title={selected.title} kind={selected.repository.label}>
				{#snippet actions()}
					<button class="workduck-button workduck-button-primary" disabled={saving || selected.archived || !ready} onclick={() => edit(selected)}>{common.edit}</button>
					<button class="workduck-button workduck-button-secondary" onclick={() => void copy()}>{messages.export}</button>
					<button class="workduck-button workduck-button-secondary" disabled={saving || !ready} onclick={() => selected && void archive(selected)}>{selected.archived ? messages.restore : messages.archive}</button>
				{/snippet}
				<p>{selected.project.label} / {selected.repository.label}</p>
				{#if !repositories.some((item) => item.repository.id === selected?.repository.id)}<p>{messages.missingRepository}</p>{/if}
				<label class="workduck-form-field" for="brief-preview"><span>{messages.preview}</span><textarea id="brief-preview" class="workduck-input brief-preview" readonly value={preview} rows="16"></textarea></label>
				<p class="brief-storage-note">{messages.storage}</p>
				{#key `${selected.id}:${selected.updatedAt}`}<BriefRunsPanel {workspace} brief={selected} {languageId} />{/key}
			</DetailCard>
		{:else}<p>{messages.select}</p>{/if}
	{/snippet}
	{#snippet status()}
		{#if !editing && error}<p class="workduck-inline-error" role="alert">{error}</p>{/if}
		{#if notice}<p role="status">{notice}</p>{/if}
	{/snippet}
</EntityWorkbench>

{#if editing}
	<div class="workduck-dialog-backdrop">
		<div class="workduck-dialog brief-editor" role="dialog" aria-modal="true" aria-labelledby="brief-editor-title" use:modalDialog={{ onClose: saving ? undefined : closeEditor }}>
			<form class="brief-form" onsubmit={save}>
				<h2 id="brief-editor-title">{messages.title}</h2>
				<label class="workduck-form-field" for="brief-title"><span>{common.title}</span><input id="brief-title" class="workduck-input" bind:value={title} maxlength={BRIEF_TITLE_MAX_LENGTH} required disabled={saving} /></label>
				<label class="workduck-form-field" for="brief-repository"><span>{common.repository}</span>
					<select id="brief-repository" class="workduck-input" bind:value={repositoryId} required disabled={saving}>
						<option value="">{messages.chooseRepository}</option>
						{#each repositories as choice (choice.repository.id)}<option value={choice.repository.id}>{choice.project.label} / {choice.repository.label}</option>{/each}
					</select>
				</label>
				<label class="workduck-form-field" for="brief-instructions"><span>{common.instructions}</span><textarea id="brief-instructions" class="workduck-input" bind:value={instructions} maxlength={BRIEF_INSTRUCTIONS_MAX_LENGTH} rows="10" required disabled={saving}></textarea></label>
				<p class="brief-storage-note">{messages.storage}</p>
				{#if dirty}<span>{messages.unsaved}</span>{/if}
				{#if error}<p class="workduck-inline-error" role="alert">{error}</p>{/if}
				<div class="brief-actions"><button class="workduck-button workduck-button-secondary" type="button" disabled={saving} onclick={closeEditor}>{common.cancel}</button><button class="workduck-button workduck-button-primary" type="submit" disabled={saving || !ready}>{saving ? messages.saving : common.save}</button></div>
			</form>
		</div>
	</div>
{/if}
