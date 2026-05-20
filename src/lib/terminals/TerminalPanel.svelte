<script lang="ts">
	import { onMount, tick, untrack } from 'svelte';

	import { getWorkduckMessages } from '$lib/i18n/workduck-language';
	import {
		createDefaultAppearanceSettings,
		type AppearanceSettings
	} from '$lib/settings/appearance-settings';
	import {
		readAppearanceSettingsFromBrowser,
		subscribeAppearanceSettings
	} from '$lib/settings/appearance-storage';
	import { DetailCard, EntityCard, EntityWorkbench } from '$lib/ui';
	import type { WorkspaceRecord } from '$lib/workspaces/workspace-registry';

	import {
		listTerminalCatalog,
		type TerminalCatalogEntry,
		type TerminalCatalogError
	} from './terminal-catalog';
	import {
		createEmptyTerminalRegistry,
		removeTerminalSession,
		upsertTerminalSession,
		type TerminalRegistry,
		type TerminalRegistryError,
		type TerminalSessionRecord
	} from './terminal-registry';
	import {
		readTerminalRegistry,
		subscribeTerminalRegistry,
		writeTerminalRegistry,
		type TerminalRegistryStorageError
	} from './terminal-registry-storage';
	import {
		readTerminalSession,
		startTerminalSession,
		stopTerminalSession,
		writeTerminalSessionInput,
		type TerminalSessionError,
		type TerminalSessionSnapshot
	} from './terminal-session';

	interface Props {
		readonly workspace: WorkspaceRecord;
		readonly onTerminalCountChange?: (count: number) => void;
	}

	let { workspace, onTerminalCountChange }: Props = $props();

	let appearanceSettings = $state<AppearanceSettings>(createDefaultAppearanceSettings());
	let registry = $state<TerminalRegistry>(createEmptyTerminalRegistry(''));
	let terminalCatalog = $state<readonly TerminalCatalogEntry[]>([]);
	let terminalName = $state('');
	let selectedTerminalId = $state('');
	let selectedSessionId = $state<string | null>(null);
	let editingSessionId = $state<string | null>(null);
	let isTerminalFormOpen = $state(false);
	let isSavingTerminal = $state(false);
	let isRemovingTerminal = $state(false);
	let catalogError = $state<TerminalCatalogError | null>(null);
	let terminalError = $state<TerminalRegistryError | TerminalRegistryStorageError | null>(null);
	let sessionError = $state<TerminalSessionError | null>(null);
	let status = $state<string | null>(null);
	let terminalOutput = $state('');
	let terminalInput = $state('');
	let isSessionConnected = $state(false);
	let isSessionStarting = $state(false);
	let isSessionStopping = $state(false);
	let isSessionSending = $state(false);
	let outputScreenElement = $state<HTMLPreElement | null>(null);
	let shouldFollowTerminalOutput = $state(true);
	let terminalPollingId: number | null = null;
	let messages = $derived(getWorkduckMessages(appearanceSettings.languageId));

	let availableTerminals = $derived(terminalCatalog.filter((terminal) => terminal.available));
	let selectedSession = $derived(
		selectedSessionId === null
			? null
			: registry.sessions.find((session) => session.id === selectedSessionId) ?? null
	);
	let selectedTerminalCatalogEntry = $derived(
		selectedSession === null ? null : getTerminalCatalogEntry(selectedSession.terminalId)
	);
	let selectedFormTerminalEntry = $derived(getTerminalCatalogEntry(selectedTerminalId));
	let terminalFormLabel = $derived(
		editingSessionId === null ? messages.common.add : messages.common.save
	);
	let canSaveTerminal = $derived(
		terminalName.trim().length > 0 && selectedTerminalId.length > 0 && !isSavingTerminal
	);
	let canSendTerminalInput = $derived(
		selectedSession !== null &&
			isSessionConnected &&
			terminalInput.trim().length > 0 &&
			!isSessionSending
	);

	onMount(() => {
		appearanceSettings = readAppearanceSettingsFromBrowser().settings;
		const unsubscribeAppearanceSettings = subscribeAppearanceSettings((nextSettings) => {
			appearanceSettings = nextSettings;
		});
		void refreshTerminalCatalog();

		return () => {
			unsubscribeAppearanceSettings();
			stopTerminalPolling();
		};
	});

	$effect(() => {
		const workspaceId = workspace.id;

		return untrack(() => {
			registry = createEmptyTerminalRegistry(workspaceId);
			selectedSessionId = null;
			editingSessionId = null;
			terminalName = '';
			selectedTerminalId = '';
			terminalError = null;
			sessionError = null;
			status = null;
			resetTerminalRuntimeView();

			readRegistryFromStorage(workspaceId);

			const unsubscribeRegistry = subscribeTerminalRegistry(workspaceId, (nextRegistry) => {
				registry = nextRegistry;
				selectedSessionId = resolveSelectedSessionId(selectedSessionId, nextRegistry.sessions);
			});

			return unsubscribeRegistry;
		});
	});

	$effect(() => {
		onTerminalCountChange?.(registry.sessions.length);
	});

	async function refreshTerminalCatalog() {
		const result = await listTerminalCatalog();

		terminalCatalog = result.terminals;
		catalogError = result.ok ? null : result.error;

		if (
			selectedTerminalId.length === 0 ||
			!availableTerminals.some((terminal) => terminal.id === selectedTerminalId)
		) {
			selectedTerminalId = availableTerminals[0]?.id ?? '';
		}
	}

	function readRegistryFromStorage(workspaceId: string) {
		const result = readTerminalRegistry(workspaceId);

		registry = result.registry;
		terminalError = result.ok ? null : result.error;
		selectedSessionId = resolveSelectedSessionId(selectedSessionId, result.registry.sessions);
	}

	function selectTerminalSession(session: TerminalSessionRecord) {
		const nextSessionId = selectedSession?.id === session.id ? null : session.id;

		selectedSessionId = nextSessionId;
		status = null;
		terminalError = null;
		sessionError = null;
		resetTerminalRuntimeView();

		if (nextSessionId !== null) {
			void refreshSelectedTerminalSession(nextSessionId);
			startTerminalPolling(nextSessionId);
		}
	}

	function editSelectedTerminalSession() {
		if (selectedSession === null) {
			return;
		}

		isTerminalFormOpen = true;
		editingSessionId = selectedSession.id;
		terminalName = selectedSession.name;
		selectedTerminalId = selectedSession.terminalId;
		status = null;
		terminalError = null;
	}

	function clearTerminalForm() {
		isTerminalFormOpen = false;
		editingSessionId = null;
		terminalName = '';
		selectedTerminalId = availableTerminals[0]?.id ?? '';
		terminalError = null;
	}

	function openNewTerminalForm() {
		clearTerminalForm();
		selectedTerminalId = availableTerminals[0]?.id ?? '';
		terminalName = createSuggestedTerminalName(selectedTerminalId);
		isTerminalFormOpen = true;
	}

	function handleTerminalKindChange() {
		if (editingSessionId !== null) {
			return;
		}

		terminalName = createSuggestedTerminalName(selectedTerminalId);
	}

	async function handleTerminalSubmit(event: SubmitEvent) {
		event.preventDefault();

		if (!canSaveTerminal) {
			return;
		}

		isSavingTerminal = true;
		terminalError = null;
		status = null;

		try {
			const mutation = upsertTerminalSession(registry, {
				id: editingSessionId,
				name: terminalName,
				terminalId: selectedTerminalId
			});

			if (!mutation.ok) {
				terminalError = mutation.error;
				return;
			}

			const writeResult = writeTerminalRegistry(mutation.registry);

			registry = writeResult.registry;
			terminalError = writeResult.ok ? null : writeResult.error;

			if (!writeResult.ok) {
				return;
			}

			selectedSessionId =
				mutation.registry.sessions.find((session) => session.name === terminalName.trim())?.id ?? null;
			resetTerminalRuntimeView();
			clearTerminalForm();
			status = messages.terminals.saved;
		} finally {
			isSavingTerminal = false;
		}
	}

	async function handleRemoveSelectedTerminalSession() {
		if (selectedSession === null || isRemovingTerminal) {
			return;
		}

		isRemovingTerminal = true;
		terminalError = null;
		sessionError = null;
		status = null;

		try {
			await stopTerminalSession(selectedSession.id);
			const mutation = removeTerminalSession(registry, selectedSession.id);

			if (!mutation.ok) {
				terminalError = mutation.error;
				return;
			}

			const writeResult = writeTerminalRegistry(mutation.registry);

			registry = writeResult.registry;
			terminalError = writeResult.ok ? null : writeResult.error;

			if (!writeResult.ok) {
				return;
			}

			selectedSessionId = null;
			resetTerminalRuntimeView();
			clearTerminalForm();
			status = messages.terminals.removed;
		} finally {
			isRemovingTerminal = false;
		}
	}

	async function handleConnectSelectedTerminalSession() {
		if (selectedSession === null || isSessionStarting) {
			return;
		}

		isSessionStarting = true;
		sessionError = null;
		status = null;

		try {
			const result = await startTerminalSession({
				sessionId: selectedSession.id,
				terminalId: selectedSession.terminalId,
				workspacePath: workspace.path
			});

			applyTerminalSessionResult(result.snapshot, { forceScroll: true });

			if (!result.ok) {
				sessionError = result.error;
				return;
			}

			startTerminalPolling(selectedSession.id);
		} finally {
			isSessionStarting = false;
		}
	}

	async function handleDisconnectSelectedTerminalSession() {
		if (selectedSession === null || isSessionStopping) {
			return;
		}

		isSessionStopping = true;
		sessionError = null;
		status = null;

		try {
			const result = await stopTerminalSession(selectedSession.id);

			applyTerminalSessionResult(result.snapshot, { forceScroll: true });
			stopTerminalPolling();

			if (!result.ok) {
				sessionError = result.error;
			}
		} finally {
			isSessionStopping = false;
		}
	}

	async function handleTerminalInputSubmit(event: SubmitEvent) {
		event.preventDefault();

		if (selectedSession === null || !canSendTerminalInput) {
			return;
		}

		const input = terminalInput;

		terminalInput = '';
		isSessionSending = true;
		sessionError = null;
		status = null;

		try {
			const result = await writeTerminalSessionInput({
				sessionId: selectedSession.id,
				input
			});

			applyTerminalSessionResult(result.snapshot, { forceScroll: true });

			if (!result.ok) {
				sessionError = result.error;
			}
		} finally {
			isSessionSending = false;
		}
	}

	async function refreshSelectedTerminalSession(sessionId: string) {
		const result = await readTerminalSession(sessionId);

		applyTerminalSessionResult(result.snapshot);

		if (!result.ok) {
			sessionError = result.error;
		}
	}

	function startTerminalPolling(sessionId: string) {
		stopTerminalPolling();
		terminalPollingId = window.setInterval(() => {
			void refreshSelectedTerminalSession(sessionId);
		}, 300);
	}

	function stopTerminalPolling() {
		if (terminalPollingId !== null) {
			window.clearInterval(terminalPollingId);
			terminalPollingId = null;
		}
	}

	function resetTerminalRuntimeView() {
		stopTerminalPolling();
		terminalOutput = '';
		terminalInput = '';
		isSessionConnected = false;
		shouldFollowTerminalOutput = true;
	}

	function applyTerminalSessionResult(
		snapshot: TerminalSessionSnapshot,
		options: { readonly forceScroll?: boolean } = {}
	) {
		const shouldScroll =
			options.forceScroll === true || shouldFollowTerminalOutput || isTerminalOutputNearBottom();

		terminalOutput = snapshot.output;
		isSessionConnected = snapshot.connected;

		if (shouldScroll) {
			shouldFollowTerminalOutput = true;
			void scrollTerminalOutputToBottom();
		}
	}

	async function scrollTerminalOutputToBottom() {
		await tick();

		if (outputScreenElement !== null) {
			outputScreenElement.scrollTop = outputScreenElement.scrollHeight;
		}
	}

	function handleTerminalOutputScroll() {
		shouldFollowTerminalOutput = isTerminalOutputNearBottom();
	}

	function isTerminalOutputNearBottom() {
		if (outputScreenElement === null) {
			return true;
		}

		const bottomDistance =
			outputScreenElement.scrollHeight -
			outputScreenElement.scrollTop -
			outputScreenElement.clientHeight;

		return bottomDistance <= 32;
	}

	function createSuggestedTerminalName(terminalId: string) {
		const terminal = getTerminalCatalogEntry(terminalId);
		const baseName = terminal?.name ?? messages.terminals.defaultSessionName;
		const existingNames = new Set(
			registry.sessions.map((session) => session.name.toLocaleLowerCase('en-US'))
		);

		if (!existingNames.has(baseName.toLocaleLowerCase('en-US'))) {
			return baseName;
		}

		for (let index = 2; index < 100; index += 1) {
			const candidate = `${baseName} ${index}`;

			if (!existingNames.has(candidate.toLocaleLowerCase('en-US'))) {
				return candidate;
			}
		}

		return `${baseName} ${registry.sessions.length + 1}`;
	}

	function getTerminalCatalogEntry(terminalId: string) {
		return terminalCatalog.find((terminal) => terminal.id === terminalId) ?? null;
	}

	function getTerminalName(terminalId: string) {
		return getTerminalCatalogEntry(terminalId)?.name ?? messages.terminals.missingTerminal;
	}

	function getTerminalCommand(terminalId: string) {
		return getTerminalCatalogEntry(terminalId)?.command ?? messages.common.none;
	}

	function resolveSelectedSessionId(
		currentSessionId: string | null,
		sessions: readonly TerminalSessionRecord[]
	) {
		if (currentSessionId !== null && sessions.some((session) => session.id === currentSessionId)) {
			return currentSessionId;
		}

		return null;
	}

	function createTerminalErrorMessage(
		nextError: TerminalRegistryError | TerminalRegistryStorageError
	) {
		switch (nextError) {
			case 'terminal-session-name-required':
				return messages.terminals.errors.nameRequired;
			case 'terminal-session-name-duplicate':
				return messages.terminals.errors.nameDuplicate;
			case 'terminal-kind-required':
				return messages.terminals.errors.kindRequired;
			case 'terminal-session-not-found':
				return messages.terminals.errors.notFound;
			case 'terminal-registry-invalid':
			case 'terminal-registry-storage-read-failed':
				return messages.terminals.errors.readFailed;
			case 'terminal-registry-storage-write-failed':
				return messages.terminals.errors.saveFailed;
		}
	}

	function createCatalogErrorMessage(nextError: TerminalCatalogError) {
		switch (nextError) {
			case 'terminal-catalog-unavailable':
				return messages.terminals.errors.catalogUnavailable;
			case 'terminal-catalog-read-failed':
				return messages.terminals.errors.catalogReadFailed;
		}
	}

	function createSessionErrorMessage(nextError: TerminalSessionError) {
		switch (nextError) {
			case 'terminal-session-unavailable':
				return messages.terminals.errors.sessionUnavailable;
			case 'terminal-session-start-failed':
				return messages.terminals.errors.sessionStartFailed;
			case 'terminal-session-read-failed':
				return messages.terminals.errors.sessionReadFailed;
			case 'terminal-session-write-failed':
				return messages.terminals.errors.sessionWriteFailed;
			case 'terminal-session-stop-failed':
				return messages.terminals.errors.sessionStopFailed;
		}
	}
</script>

<EntityWorkbench
	label={messages.terminals.title}
	sidebarLabel={messages.terminals.list}
	detailLabel={messages.terminals.details}
>
	{#snippet sidebar()}
		<button
			class="workduck-list-add-card"
			type="button"
			disabled={availableTerminals.length === 0}
			onclick={openNewTerminalForm}
		>
			{messages.terminals.newTerminal}
		</button>

		<div class="workduck-entity-list">
			{#each registry.sessions as session (session.id)}
				<EntityCard
					title={session.name}
					kind={messages.common.terminal}
					meta={getTerminalName(session.terminalId)}
					selected={selectedSession?.id === session.id}
					onSelect={() => selectTerminalSession(session)}
				/>
			{/each}
		</div>
	{/snippet}

	{#snippet detail()}
		{#if selectedSession !== null}
			<DetailCard title={selectedSession.name} kind={messages.common.terminal}>
				<dl class="workduck-terminal-details-list">
					<div>
						<dt>{messages.terminals.kind}</dt>
						<dd>{selectedTerminalCatalogEntry?.name ?? messages.terminals.missingTerminal}</dd>
					</div>
					<div>
						<dt>{messages.terminals.command}</dt>
						<dd>{getTerminalCommand(selectedSession.terminalId)}</dd>
					</div>
					<div>
						<dt>{messages.terminals.status}</dt>
						<dd>
							{isSessionConnected ? messages.terminals.connected : messages.terminals.notConnected}
						</dd>
					</div>
				</dl>

				<pre
					class="workduck-terminal-screen"
					aria-label={messages.terminals.screen}
					bind:this={outputScreenElement}
					onscroll={handleTerminalOutputScroll}
				>{terminalOutput.length === 0 ? `${selectedSession.name}\n${isSessionConnected ? messages.terminals.connected : messages.terminals.notConnected}` : terminalOutput}</pre>

				<form class="workduck-terminal-input-row" onsubmit={handleTerminalInputSubmit}>
					<input
						class="workduck-input"
						type="text"
						bind:value={terminalInput}
						disabled={!isSessionConnected || isSessionSending}
						placeholder={messages.terminals.inputPlaceholder}
						autocomplete="off"
					/>
					<button class="workduck-button workduck-button-secondary" type="submit" disabled={!canSendTerminalInput}>
						{messages.terminals.send}
					</button>
				</form>

				{#snippet actions()}
					{#if isSessionConnected}
						<button
							class="workduck-button workduck-button-secondary"
							type="button"
							disabled={isSessionStopping}
							onclick={() => void handleDisconnectSelectedTerminalSession()}
						>
							{messages.terminals.disconnect}
						</button>
					{:else}
						<button
							class="workduck-button workduck-button-primary"
							type="button"
							disabled={isSessionStarting}
							onclick={() => void handleConnectSelectedTerminalSession()}
						>
							{messages.terminals.connect}
						</button>
					{/if}
					<button
						class="workduck-button workduck-button-secondary"
						type="button"
						onclick={editSelectedTerminalSession}
					>
						{messages.common.edit}
					</button>
					<button
						class="workduck-button workduck-button-danger"
						type="button"
						disabled={isRemovingTerminal}
						onclick={() => void handleRemoveSelectedTerminalSession()}
					>
						{messages.common.remove}
					</button>
				{/snippet}
			</DetailCard>
		{/if}
	{/snippet}

	{#snippet status()}
		{#if catalogError !== null}
			<p class="workduck-inline-error" aria-live="polite">{createCatalogErrorMessage(catalogError)}</p>
		{/if}

		{#if terminalError !== null}
			<p class="workduck-inline-error" aria-live="polite">{createTerminalErrorMessage(terminalError)}</p>
		{/if}

		{#if sessionError !== null}
			<p class="workduck-inline-error" aria-live="polite">{createSessionErrorMessage(sessionError)}</p>
		{/if}

		{#if status !== null}
			<p class="workduck-inline-status" aria-live="polite">{status}</p>
		{/if}
	{/snippet}
</EntityWorkbench>

{#if isTerminalFormOpen}
	<div
		class="workduck-dialog-backdrop"
		role="presentation"
		onclick={(event) => {
			if (event.target === event.currentTarget && !isSavingTerminal) {
				clearTerminalForm();
			}
		}}
	>
		<div
			class="workduck-dialog workduck-project-dialog"
			role="dialog"
			aria-modal="true"
			aria-labelledby="terminal-dialog-title"
		>
			<form class="workduck-project-dialog-form" onsubmit={handleTerminalSubmit}>
				<h2 id="terminal-dialog-title" class="workduck-dialog-title">
					{editingSessionId === null
						? messages.terminals.newTerminal
						: messages.terminals.editTerminal}
				</h2>

				<label class="workduck-form-field" for="terminal-name">
					<span>{messages.common.name}</span>
					<input
						id="terminal-name"
						class="workduck-input"
						type="text"
						bind:value={terminalName}
						autocomplete="off"
						disabled={isSavingTerminal}
					/>
				</label>

				<label class="workduck-form-field" for="terminal-kind">
					<span>{messages.terminals.kind}</span>
					<select
						id="terminal-kind"
						class="workduck-select"
						bind:value={selectedTerminalId}
						disabled={isSavingTerminal}
						onchange={handleTerminalKindChange}
					>
						{#if availableTerminals.length === 0}
							<option value="">{messages.terminals.noAvailableTerminal}</option>
						{:else}
							{#if selectedFormTerminalEntry === null && selectedTerminalId.length > 0}
								<option value={selectedTerminalId}>{messages.terminals.missingTerminal}</option>
							{/if}
							{#each availableTerminals as terminal (terminal.id)}
								<option value={terminal.id}>{terminal.name}</option>
							{/each}
						{/if}
					</select>
				</label>

				<div class="workduck-dialog-actions">
					<button class="workduck-button workduck-button-secondary" type="button" onclick={clearTerminalForm}>
						{messages.common.cancel}
					</button>
					<button class="workduck-button workduck-button-primary" type="submit" disabled={!canSaveTerminal}>
						{terminalFormLabel}
					</button>
				</div>
			</form>
		</div>
	</div>
{/if}
