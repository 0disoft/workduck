<script lang="ts">
	import { onMount } from 'svelte';
	import type { WorkduckLanguageId } from '$lib/i18n/workduck-language-options';
	import { getWorkduckMessages } from '$lib/i18n/workduck-language';
	import type { WorkspaceRecord } from '$lib/workspaces/workspace-registry';
	import type { BriefRecord } from './brief-registry';
	import { addBriefRunLink, createEmptyBriefRunRegistry, removeBriefRunLink, type BriefRunLink, type BriefRunRegistry } from './brief-run-registry';
	import { findLinkedReports, findLinkedTask, findLinkedWorkOrder, listBriefRunCandidates, readBriefRunEvidence, type BriefRunEvidence } from './brief-run-evidence';
	import { readBriefRunRegistry, writeBriefRunRegistry } from './brief-run-storage';
	import { briefRunMessages } from './brief-run-messages';
	import { deriveBriefGate } from './brief-gate';
	import { briefGateMessages } from './brief-gate-messages';

	let { workspace, brief, languageId }: { workspace: WorkspaceRecord; brief: BriefRecord; languageId: WorkduckLanguageId } = $props();
	let registry = $state(createEmptyBriefRunRegistry(''));
	let evidence = $state<BriefRunEvidence>({ taskRuns: [], workOrders: [], reports: [], incomplete: false });
	let loading = $state(true);
	let ready = $state(false);
	let saving = $state(false);
	let candidateKey = $state('');
	let error = $state('');
	let notice = $state('');
	let disposed = false;
	let readController: AbortController | null = null;
	let messages = $derived(briefRunMessages[languageId]);
	let gateMessages = $derived(briefGateMessages[languageId]);
	let common = $derived(getWorkduckMessages(languageId).common);
	let links = $derived(registry.links.filter((link) => link.brief.id === brief.id));
	let candidates = $derived(listBriefRunCandidates(brief, workspace.path, evidence).filter((candidate) =>
		!links.some((link) => link.sourceKind === candidate.kind && link.sourceId === candidate.id)));
	onMount(() => { void refresh(); return () => { disposed = true; readController?.abort(); }; });

	async function refresh() {
		if (saving) return;
		readController?.abort();
		const controller = new AbortController();
		readController = controller;
		loading = true; ready = false; error = '';
		const stored = await readBriefRunRegistry(workspace.id, workspace.path);
		if (disposed || controller.signal.aborted) return;
		if (!stored.ok) { loading = false; error = messages.loadFailed; return; }
		const linkedTaskIds = stored.registry.links.filter((link) =>
			link.brief.id === brief.id && link.sourceKind === 'repository-task').map((link) => link.sourceId);
		const loaded = await readBriefRunEvidence(workspace.path, controller.signal, linkedTaskIds);
		if (disposed || controller.signal.aborted) return;
		loading = false;
		registry = stored.registry; evidence = loaded; ready = true; candidateKey = '';
	}

	async function persist(next: BriefRunRegistry) {
		if (saving || !ready) return;
		saving = true; error = ''; notice = '';
		const result = await writeBriefRunRegistry(next, workspace.path);
		if (disposed) return;
		saving = false;
		if (!result.ok) { error = result.error === 'workspace-data-revision-conflict' ? messages.conflict : messages.saveFailed; return; }
		registry = result.registry; candidateKey = '';
	}

	async function linkRun() {
		const candidate = candidates.find((item) => `${item.kind}:${item.id}` === candidateKey);
		if (!candidate || saving || brief.archived) return;
		const next = addBriefRunLink(registry, {
			id: `run-link_${crypto.randomUUID()}`, brief: $state.snapshot(brief),
			sourceKind: candidate.kind, sourceId: candidate.id, createdAt: new Date().toISOString()
		});
		if (!next) { error = messages.saveFailed; return; }
		await persist(next);
		if (!error) notice = messages.linked;
	}

	async function unlink(link: BriefRunLink) {
		if (saving || !window.confirm(messages.confirmUnlink)) return;
		await persist(removeBriefRunLink(registry, link.id));
	}

	function runState(link: BriefRunLink) {
		const task = findLinkedTask(link, workspace.path, evidence);
		if (task) return ({ running: messages.stateRunning, succeeded: messages.stateSucceeded, failed: messages.stateFailed, stopped: messages.stateStopped })[task.state];
		const order = findLinkedWorkOrder(link, evidence);
		if (order) return order.status === 'archived' ? messages.stateArchived : order.status === 'running' ? messages.stateRunning : order.status === 'failed' ? messages.stateFailed : messages.statePending;
		return messages.missing;
	}
</script>

<section class="brief-runs" aria-label={messages.title}>
	<h3>{messages.title}</h3>
	<div class="brief-actions">
		<button class="workduck-button workduck-button-secondary" disabled={loading || saving} onclick={() => void refresh()}>{common.refresh}</button>
		{#if !brief.archived}
			<select class="workduck-input" aria-label={messages.choose} bind:value={candidateKey} disabled={!ready || saving}>
				<option value="">{messages.choose}</option>
				{#each candidates as candidate (`${candidate.kind}:${candidate.id}`)}<option value={`${candidate.kind}:${candidate.id}`}>{candidate.label} · {candidate.id}</option>{/each}
			</select>
			<button class="workduck-button workduck-button-primary" disabled={!ready || saving || !candidateKey} onclick={() => void linkRun()}>{messages.link}</button>
		{/if}
	</div>
	<p class="brief-storage-note">{messages.noCandidates}</p>
	{#if evidence.incomplete}<p role="status">{messages.partial}</p>{/if}
	{#if error}<p class="workduck-inline-error" role="alert">{error}</p>{/if}
	{#if notice}<p role="status">{notice}</p>{/if}
	{#if !loading && ready && links.length === 0}<p>{messages.empty}</p>{/if}
	{#each links as link (link.id)}
		{@const task = findLinkedTask(link, workspace.path, evidence)}
		{@const reports = findLinkedReports(link, evidence)}
		{@const gate = deriveBriefGate(link, workspace.path, evidence)}
		<article class="brief-run-card">
			<strong>{runState(link)}</strong>
			<p class="brief-gate" data-state={gate.state}><strong>{gateMessages.title}: {gateMessages[gate.state]}</strong> — {gateMessages[gate.reason]}</p>
			<p class="brief-storage-note">{gateMessages.scope}</p>
			<p>{messages.sourceId}: <code>{link.sourceId}</code></p>
			{#if task}<p>{task.task} · {task.startedAt}{task.exitCode === null ? '' : ` · exit ${task.exitCode}`}</p>{/if}
			<details><summary>{messages.snapshot}</summary><pre>{link.brief.instructions}</pre></details>
			{#if reports.length > 0}
				<h4>{messages.reports}</h4>
				{#each reports as report (report.ref.id)}
					<details><summary>{report.ref.label} · {report.ref.id}</summary>
						{#each report.tasks as result}
							<p><strong>{result.title}</strong></p><pre>{result.summary}</pre>
							{#if result.filesChanged.length}<p>{common.files}: {result.filesChanged.join(', ')}</p>{/if}
							{#if result.verification.length}<p>{common.checks}: {result.verification.join('; ')}</p>{/if}
							{#if result.risks.length}<p>{common.risks}: {result.risks.join('; ')}</p>{/if}
						{/each}
					</details>
				{/each}
			{/if}
			<button class="workduck-button workduck-button-secondary" disabled={saving || !ready} onclick={() => void unlink(link)}>{messages.unlink}</button>
		</article>
	{/each}
</section>
