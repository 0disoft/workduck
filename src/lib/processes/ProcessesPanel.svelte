<script lang="ts">
	import { onMount } from 'svelte';

	import { getWorkduckMessages } from '$lib/i18n/workduck-language';
	import {
		createDefaultAppearanceSettings,
		type AppearanceSettings
	} from '$lib/settings/appearance-settings';
	import {
		readAppearanceSettingsFromBrowser,
		subscribeAppearanceSettings
	} from '$lib/settings/appearance-storage';
	import { DetailCard, EntityCard, EntityWorkbench, StatusToast } from '$lib/ui';

	import {
		killDeveloperProcess,
		listDeveloperProcesses,
		type DeveloperProcessEntry,
		type DeveloperProcessError
	} from './developer-processes';

	const PROCESS_REFRESH_INTERVAL_MS = 10_000;
	const PROCESS_KILL_REFRESH_DELAY_MS = 350;

	interface Props {
		readonly onProcessCountChange?: (count: number) => void;
	}

	let { onProcessCountChange }: Props = $props();

	let appearanceSettings = $state<AppearanceSettings>(createDefaultAppearanceSettings());
	let processes = $state<readonly DeveloperProcessEntry[]>([]);
	let selectedProcessId = $state<number | null>(null);
	let processError = $state<DeveloperProcessError | null>(null);
	let statusMessage = $state<string | null>(null);
	let isRefreshing = $state(false);
	let killingProcessId = $state<number | null>(null);
	let refreshIntervalId: number | null = null;
	let hasQueuedRefresh = false;
	let messages = $derived(getWorkduckMessages(appearanceSettings.languageId));
	let selectedProcess = $derived(
		selectedProcessId === null
			? null
			: processes.find((process) => process.pid === selectedProcessId) ?? null
	);

	onMount(() => {
		appearanceSettings = readAppearanceSettingsFromBrowser().settings;
		const unsubscribeAppearanceSettings = subscribeAppearanceSettings((nextSettings) => {
			appearanceSettings = nextSettings;
		});

		void refreshProcesses();
		refreshIntervalId = window.setInterval(() => void refreshProcesses(), PROCESS_REFRESH_INTERVAL_MS);

		return () => {
			unsubscribeAppearanceSettings();

			if (refreshIntervalId !== null) {
				window.clearInterval(refreshIntervalId);
			}
		};
	});

	$effect(() => {
		onProcessCountChange?.(processes.length);
	});

	async function refreshProcesses(
		options: { readonly silent?: boolean; readonly queueIfBusy?: boolean } = {}
	) {
		if (isRefreshing) {
			if (options.queueIfBusy) {
				hasQueuedRefresh = true;
			}

			return;
		}

		isRefreshing = true;

		try {
			const result = await listDeveloperProcesses();

			processes = result.processes;
			processError = result.ok ? null : result.error;
			statusMessage = result.ok && !options.silent ? messages.processes.refreshed : null;

			if (
				selectedProcessId !== null &&
				!result.processes.some((process) => process.pid === selectedProcessId)
			) {
				selectedProcessId = null;
			}
		} finally {
			isRefreshing = false;

			if (hasQueuedRefresh) {
				hasQueuedRefresh = false;
				await refreshProcesses({ silent: true });
			}
		}
	}

	function selectProcess(process: DeveloperProcessEntry) {
		selectedProcessId = selectedProcessId === process.pid ? null : process.pid;
	}

	function createProcessMeta(process: DeveloperProcessEntry) {
		const ports = process.ports.map((port) => `:${port}`).join(' ');
		const memory = formatMemoryUsage(process.memoryBytes);
		const base = ports.length === 0 ? `PID ${process.pid}` : `PID ${process.pid} ${ports}`;

		return `${base} · ${messages.processes.memory} ${memory}`;
	}

	function createPortsText(process: DeveloperProcessEntry) {
		if (process.ports.length === 0) {
			return messages.common.none;
		}

		return process.ports.map((port) => String(port)).join(', ');
	}

	function formatMemoryUsage(memoryBytes: number | null | undefined) {
		if (memoryBytes === null || memoryBytes === undefined || !Number.isFinite(memoryBytes)) {
			return messages.common.none;
		}

		const units = ['B', 'KiB', 'MiB', 'GiB'];
		let value = memoryBytes;
		let unitIndex = 0;

		while (value >= 1024 && unitIndex < units.length - 1) {
			value /= 1024;
			unitIndex += 1;
		}

		const precision = unitIndex === 0 || value >= 100 ? 0 : 1;

		return `${value.toFixed(precision)} ${units[unitIndex]}`;
	}

	async function forceKillSelectedProcess() {
		if (selectedProcess === null || killingProcessId !== null) {
			return;
		}

		const shouldKill = window.confirm(
			messages.processes.forceKillConfirm.replace('{name}', selectedProcess.name)
		);

		if (!shouldKill) {
			return;
		}

		const targetPid = selectedProcess.pid;
		killingProcessId = targetPid;
		processError = null;
		statusMessage = null;

		try {
			const error = await killDeveloperProcess(targetPid);

			if (error !== null) {
				processError = error;
				return;
			}

			processes = processes.filter((process) => process.pid !== targetPid);
			selectedProcessId = null;
			await delay(PROCESS_KILL_REFRESH_DELAY_MS);
			await refreshProcesses({ silent: true, queueIfBusy: true });
			statusMessage = messages.processes.killSucceeded;
		} finally {
			killingProcessId = null;
		}
	}

	function delay(milliseconds: number) {
		return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
	}

	function createProcessErrorMessage(error: DeveloperProcessError) {
		switch (error) {
			case 'developer-processes-unavailable':
				return messages.processes.errors.unavailable;
			case 'developer-processes-read-failed':
				return messages.processes.errors.readFailed;
			case 'developer-process-kill-denied':
				return messages.processes.errors.killDenied;
			case 'developer-process-kill-failed':
				return messages.processes.errors.killFailed;
		}
	}
</script>

<EntityWorkbench
	label={messages.processes.title}
	sidebarLabel={messages.processes.list}
	detailLabel={messages.processes.details}
>
	{#snippet sidebar()}
		<button
			class="workduck-button workduck-button-secondary workduck-process-refresh-button"
			type="button"
			disabled={isRefreshing}
			onclick={() => void refreshProcesses()}
		>
			{messages.common.refresh}
		</button>

		<div class="workduck-entity-list">
			{#each processes as process (process.pid)}
				<EntityCard
					title={process.name}
					kind={process.kind}
					meta={createProcessMeta(process)}
					selected={selectedProcess?.pid === process.pid}
					onSelect={() => selectProcess(process)}
				/>
			{/each}

			{#if processes.length === 0 && processError === null && !isRefreshing}
				<p class="workduck-inline-status">{messages.processes.empty}</p>
			{/if}
		</div>
	{/snippet}

	{#snippet detail()}
		{#if selectedProcess !== null}
			<DetailCard title={selectedProcess.name} kind={selectedProcess.kind}>
				<dl class="workduck-terminal-details-list">
					<div>
						<dt>{messages.processes.pid}</dt>
						<dd>{selectedProcess.pid}</dd>
					</div>
					<div>
						<dt>{messages.processes.kind}</dt>
						<dd>{selectedProcess.kind}</dd>
					</div>
					<div>
						<dt>{messages.processes.ports}</dt>
						<dd>{createPortsText(selectedProcess)}</dd>
					</div>
					<div>
						<dt>{messages.processes.memory}</dt>
						<dd>{formatMemoryUsage(selectedProcess.memoryBytes)}</dd>
					</div>
					<div>
						<dt>{messages.processes.command}</dt>
						<dd class="workduck-process-command">{selectedProcess.command}</dd>
					</div>
				</dl>
				{#snippet actions()}
					<button
						class="workduck-button workduck-button-danger"
						type="button"
						disabled={killingProcessId !== null}
						onclick={() => void forceKillSelectedProcess()}
					>
						{messages.processes.forceKill}
					</button>
				{/snippet}
			</DetailCard>
		{/if}
	{/snippet}

	{#snippet status()}
		{#if processError !== null}
			<p class="workduck-inline-error" aria-live="polite">
				{createProcessErrorMessage(processError)}
			</p>
		{/if}

		<StatusToast message={statusMessage} />
	{/snippet}
</EntityWorkbench>
