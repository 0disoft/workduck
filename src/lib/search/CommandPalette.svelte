<script lang="ts">
	import { goto } from '$app/navigation';
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
	import { modalDialog } from '$lib/ui/modal-dialog-action';
	import {
		createEmptyWorkspaceRegistry,
		getActiveWorkspace,
		type WorkspaceRegistry
	} from '$lib/workspaces/workspace-registry';
	import {
		readWorkspaceRegistryFromBrowser,
		subscribeWorkspaceRegistry
	} from '$lib/workspaces/workspace-storage';
	import { isWorkspaceUnlocked, subscribeWorkspaceUnlocks } from '$lib/workspaces/workspace-unlock';

	import { searchCommandPaletteArtifacts } from './artifact-search';
	import { loadWorkspaceCommandPaletteItems } from './command-palette-data';
	import {
		filterCommandPaletteItems,
		type CommandPaletteItem,
		type CommandPaletteItemKind
	} from './command-palette-index';
	import './command-palette.css';

	const navigationCommands = [
		{ id: 'projects', href: '/', labelKey: 'projects' },
		{ id: 'queue', href: '/queue', labelKey: 'queue' },
		{ id: 'references', href: '/references', labelKey: 'references' },
		{ id: 'agents', href: '/agents', labelKey: 'agents' },
		{ id: 'personas', href: '/personas', labelKey: 'personas' },
		{ id: 'skills', href: '/skills', labelKey: 'skills' },
		{ id: 'environment', href: '/environment', labelKey: 'environment' },
		{ id: 'terminals', href: '/terminals', labelKey: 'terminals' },
		{ id: 'processes', href: '/processes', labelKey: 'processes' },
		{ id: 'settings', href: '/settings', labelKey: 'settings' }
	] as const;
	const COMMAND_PALETTE_RESULT_LIMIT = 20;
	const ARTIFACT_SEARCH_RESULT_LIMIT = 8;
	const ARTIFACT_SEARCH_DEBOUNCE_MS = 120;

	let appearanceSettings = $state<AppearanceSettings>(createDefaultAppearanceSettings());
	let workspaceRegistry = $state<WorkspaceRegistry>(createEmptyWorkspaceRegistry());
	let unlockRevision = $state(0);
	let isOpen = $state(false);
	let query = $state('');
	let selectedIndex = $state(0);
	let workspaceItems = $state<readonly CommandPaletteItem[]>([]);
	let artifactItems = $state<readonly CommandPaletteItem[]>([]);
	let loadedWorkspaceKey = $state('');
	let isLoadingWorkspace = $state(false);
	let isSearchingArtifacts = $state(false);
	let workspaceLoadDegraded = $state(false);
	let artifactSearchFailed = $state(false);
	let workspaceLoadGeneration = 0;
	let artifactSearchGeneration = 0;

	let activeWorkspace = $derived(getActiveWorkspace(workspaceRegistry));
	let activeWorkspaceUnlocked = $derived(
		activeWorkspace !== null && unlockRevision >= 0 && isWorkspaceUnlocked(activeWorkspace)
	);
	let workspaceSearchKey = $derived(
		activeWorkspace !== null && activeWorkspaceUnlocked
			? `${activeWorkspace.id}:${activeWorkspace.path}`
			: ''
	);
	let messages = $derived(getWorkduckMessages(appearanceSettings.languageId));
	let commandItems = $derived(createNavigationCommandItems());
	let visibleItems = $derived(
		filterCommandPaletteItems(
			[...commandItems, ...workspaceItems, ...artifactItems],
			query,
			COMMAND_PALETTE_RESULT_LIMIT
		)
	);
	let selectedItem = $derived(visibleItems[selectedIndex] ?? null);
	let statusMessage = $derived(getStatusMessage());

	onMount(() => {
		appearanceSettings = readAppearanceSettingsFromBrowser().settings;
		workspaceRegistry = readWorkspaceRegistryFromBrowser().registry;
		const unsubscribeAppearanceSettings = subscribeAppearanceSettings((settings) => {
			appearanceSettings = settings;
		});
		const unsubscribeWorkspaceRegistry = subscribeWorkspaceRegistry((registry) => {
			workspaceRegistry = registry;
		});
		const unsubscribeWorkspaceUnlocks = subscribeWorkspaceUnlocks(() => {
			unlockRevision += 1;
		});

		return () => {
			unsubscribeAppearanceSettings();
			unsubscribeWorkspaceRegistry();
			unsubscribeWorkspaceUnlocks();
		};
	});

	$effect(() => {
		workspaceSearchKey;
		workspaceItems = [];
		artifactItems = [];
		loadedWorkspaceKey = '';
		workspaceLoadDegraded = false;
		artifactSearchFailed = false;
	});

	$effect(() => {
		isOpen;
		workspaceSearchKey;

		if (isOpen && workspaceSearchKey.length > 0) {
			void ensureWorkspaceItemsLoaded();
		}
	});

	$effect(() => {
		query;
		workspaceItems;
		artifactItems;
		commandItems;
		selectedIndex = 0;
	});

	$effect(() => {
		const normalizedQuery = isOpen ? query.trim() : '';
		const workspace = activeWorkspaceUnlocked ? activeWorkspace : null;
		const generation = ++artifactSearchGeneration;

		artifactSearchFailed = false;

		if (normalizedQuery.length < 2 || workspace === null) {
			artifactItems = [];
			isSearchingArtifacts = false;
			return;
		}

		isSearchingArtifacts = true;
		const timeoutId = window.setTimeout(() => {
			void searchCommandPaletteArtifacts(
				workspace.id,
				normalizedQuery,
				ARTIFACT_SEARCH_RESULT_LIMIT
			).then((result) => {
				if (generation !== artifactSearchGeneration) {
					return;
				}

				artifactItems = result.items;
				artifactSearchFailed = !result.ok;
				isSearchingArtifacts = false;
			});
		}, ARTIFACT_SEARCH_DEBOUNCE_MS);

		return () => {
			window.clearTimeout(timeoutId);
		};
	});

	function createNavigationCommandItems(): readonly CommandPaletteItem[] {
		return navigationCommands.map((command) => {
			const title = messages.navigation[command.labelKey];
			return {
				id: `command:${command.id}`,
				kind: 'command',
				title,
				description: messages.navigation.commandPalette.openPage.replace('{page}', title),
				href: command.href,
				searchText: `${title} ${command.id} ${command.href}`
			};
		});
	}

	async function ensureWorkspaceItemsLoaded() {
		const workspace = activeWorkspace;
		const searchKey = workspaceSearchKey;

		if (workspace === null || searchKey.length === 0 || loadedWorkspaceKey === searchKey) {
			return;
		}

		const generation = ++workspaceLoadGeneration;
		isLoadingWorkspace = true;
		workspaceLoadDegraded = false;

		try {
			const result = await loadWorkspaceCommandPaletteItems(workspace);

			if (generation !== workspaceLoadGeneration || workspaceSearchKey !== searchKey) {
				return;
			}

			workspaceItems = result.items;
			workspaceLoadDegraded = result.degraded;
			loadedWorkspaceKey = searchKey;
		} catch {
			if (generation === workspaceLoadGeneration) {
				workspaceItems = [];
				workspaceLoadDegraded = true;
			}
		} finally {
			if (generation === workspaceLoadGeneration) {
				isLoadingWorkspace = false;
			}
		}
	}

	function handleGlobalKeydown(event: KeyboardEvent) {
		if (event.isComposing) {
			return;
		}

		if (
			(event.ctrlKey || event.metaKey) &&
			!event.altKey &&
			event.key.toLocaleLowerCase() === 'k'
		) {
			if (event.repeat) {
				return;
			}

			event.preventDefault();
			isOpen ? closePalette() : openPalette();
			return;
		}

		if (!isOpen) {
			return;
		}

		switch (event.key) {
			case 'ArrowDown':
				event.preventDefault();
				moveSelection(1);
				break;
			case 'ArrowUp':
				event.preventDefault();
				moveSelection(-1);
				break;
			case 'Enter':
				if (selectedItem !== null) {
					event.preventDefault();
					void executeItem(selectedItem);
				}
				break;
			case 'Escape':
				event.preventDefault();
				closePalette();
				break;
		}
	}

	function openPalette() {
		query = '';
		selectedIndex = 0;
		workspaceItems = [];
		artifactItems = [];
		loadedWorkspaceKey = '';
		workspaceLoadDegraded = false;
		artifactSearchFailed = false;
		isOpen = true;
	}

	function closePalette() {
		isOpen = false;
		query = '';
		artifactItems = [];
		isSearchingArtifacts = false;
	}

	function moveSelection(offset: number) {
		if (visibleItems.length === 0) {
			selectedIndex = 0;
			return;
		}

		selectedIndex = (selectedIndex + offset + visibleItems.length) % visibleItems.length;
	}

	async function executeItem(item: CommandPaletteItem) {
		closePalette();
		await goto(item.href);
	}

	function handleBackdropClick(event: MouseEvent) {
		if (event.target === event.currentTarget) {
			closePalette();
		}
	}

	function getStatusMessage() {
		if (activeWorkspace === null) {
			return messages.navigation.addWorkspaceFirst;
		}

		if (!activeWorkspaceUnlocked) {
			return messages.navigation.commandPalette.workspaceLocked;
		}

		if (isLoadingWorkspace) {
			return messages.navigation.commandPalette.loading;
		}

		if (isSearchingArtifacts) {
			return messages.navigation.commandPalette.searching;
		}

		if (workspaceLoadDegraded || artifactSearchFailed) {
			return messages.navigation.commandPalette.degraded;
		}

		return null;
	}

	function getKindLabel(kind: CommandPaletteItemKind) {
		const kindMessages = messages.navigation.commandPalette.kinds;

		switch (kind) {
			case 'command':
				return kindMessages.command;
			case 'project':
				return kindMessages.project;
			case 'group':
				return kindMessages.group;
			case 'repository':
				return kindMessages.repository;
			case 'queue-work-order':
				return kindMessages.queueWorkOrder;
			case 'queue-result-report':
				return kindMessages.queueResultReport;
			case 'queue-proposal':
				return kindMessages.queueProposal;
			case 'agent':
				return kindMessages.agent;
			case 'reference':
				return kindMessages.reference;
			case 'run':
				return kindMessages.run;
			case 'artifact':
				return kindMessages.artifact;
		}
	}

	function createOptionId(item: CommandPaletteItem) {
		return `workduck-command-palette-option-${item.id.replace(/[^a-zA-Z0-9_-]/gu, '-')}`;
	}
</script>

<svelte:window onkeydown={handleGlobalKeydown} />

{#if isOpen}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="workduck-command-palette-backdrop"
		role="presentation"
		onclick={handleBackdropClick}
	>
		<section
			class="workduck-command-palette"
			role="dialog"
			aria-modal="true"
			aria-labelledby="workduck-command-palette-title"
			aria-describedby="workduck-command-palette-keyboard-hint"
			use:modalDialog={{
				onClose: closePalette,
				initialFocusSelector: '.workduck-command-palette-input'
			}}
		>
			<header class="workduck-command-palette-header">
				<div class="workduck-command-palette-heading">
					<h2 id="workduck-command-palette-title">
						{messages.navigation.commandPalette.title}
					</h2>
					<kbd>Ctrl/⌘ K</kbd>
				</div>
				<input
					class="workduck-command-palette-input"
					type="search"
					bind:value={query}
					placeholder={messages.navigation.commandPalette.placeholder}
					aria-label={messages.navigation.commandPalette.title}
					aria-controls="workduck-command-palette-results"
					aria-activedescendant={selectedItem === null ? undefined : createOptionId(selectedItem)}
					autocomplete="off"
					spellcheck="false"
				/>
			</header>

			<div
				id="workduck-command-palette-results"
				class="workduck-command-palette-results"
				role="listbox"
				aria-label={messages.navigation.commandPalette.title}
			>
				{#if statusMessage !== null}
					<p class="workduck-command-palette-status" aria-live="polite">{statusMessage}</p>
				{/if}

				{#each visibleItems as item, index (item.id)}
					<button
						id={createOptionId(item)}
						class="workduck-command-palette-option"
						type="button"
						role="option"
						aria-selected={selectedIndex === index}
						data-selected={selectedIndex === index}
						onmouseenter={() => {
							selectedIndex = index;
						}}
						onclick={() => void executeItem(item)}
					>
						<span class="workduck-command-palette-option-copy">
							<strong>{item.title}</strong>
							{#if item.description.length > 0}
								<small>{item.description}</small>
							{/if}
						</span>
						<span class="workduck-command-palette-kind">{getKindLabel(item.kind)}</span>
					</button>
				{:else}
					<p class="workduck-command-palette-empty">
						{messages.navigation.commandPalette.noResults}
					</p>
				{/each}
			</div>

			<footer class="workduck-command-palette-footer">
				<span id="workduck-command-palette-keyboard-hint">
					{messages.navigation.commandPalette.keyboardHint}
				</span>
				<span>{visibleItems.length}</span>
			</footer>
		</section>
	</div>
{/if}
