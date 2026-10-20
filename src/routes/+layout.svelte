<script lang="ts">
	/* llmnav/1 module
	id=workduck.app-state.boot-gate
	role=Gate renderer startup on persistent settings recovery and load the desktop interface after successful initialization.
	owns=startup visibility|initialization retry UI|interface load recovery|boot attempt lifetime
	excludes=native settings storage|setting domain validation|workspace content rendering
	search=app boot settings failure|retry failed initialization|startup data protection
	invariant=Failed initialization keeps workspace content unmounted; one boot attempt runs at a time and disposed layouts cannot apply late results.
	stability=architecture
	*/
	import { page } from '$app/state';
	import { onMount } from 'svelte';

	import { initializePersistentAppState } from '#lib/app-state/persistent-app-state.ts';
	import { getAppBootMessages } from '#lib/app-state/app-boot-messages.ts';
	import {
		readWorkduckAppStateValue,
		WORKDUCK_APPEARANCE_APP_STATE_KEY
	} from '#lib/app-state/app-state-storage.ts';
	import {
		parseAppearanceSettings,
		WORKDUCK_APPEARANCE_SETTINGS_STORAGE_KEY
	} from '#lib/settings/appearance-settings.ts';
	import type { WorkduckLanguageId } from '#lib/i18n/workduck-language-options.ts';
	import '../app.css';

	type WorkbenchShellComponent = typeof import('#lib/shell/WorkbenchShell.svelte').default;
	type CommandPaletteComponent = typeof import('#lib/search/CommandPalette.svelte').default;

	let { children } = $props();

	let WorkbenchShell = $state<WorkbenchShellComponent | null>(null);
	let CommandPalette = $state<CommandPaletteComponent | null>(null);
	let isAppStateReady = $state(false);
	let isBooting = $state(false);
	let bootError = $state<'settings' | 'interface' | null>(null);
	let bootLanguage = $state<WorkduckLanguageId>('en');
	let bootMessages = $derived(getAppBootMessages(bootLanguage));
	let disposed = false;
	let isTrayMenuWindow = $derived(
		page.url.pathname === '/tray-menu' || page.url.pathname === '/tray-menu/'
	);

	async function boot() {
		if (isBooting || disposed) return;
		// Tray controls do not read settings and must remain available during recovery.
		if (isTrayMenuWindow) {
			isAppStateReady = true;
			return;
		}
		isBooting = true;
		let phase: 'settings' | 'interface' = 'settings';
		try {
			const result = await initializePersistentAppState();
			if (disposed) return;
			bootLanguage = parseAppearanceSettings(
				readWorkduckAppStateValue(
					WORKDUCK_APPEARANCE_APP_STATE_KEY,
					WORKDUCK_APPEARANCE_SETTINGS_STORAGE_KEY
				).valueJson
			).languageId;
			if (!result.ok) {
				bootError = 'settings';
				return;
			}
			phase = 'interface';
			const [shellModule, paletteModule] = await Promise.all([
				import('#lib/shell/WorkbenchShell.svelte'),
				import('#lib/search/CommandPalette.svelte')
			]);
			if (disposed) return;
			WorkbenchShell = shellModule.default;
			CommandPalette = paletteModule.default;
			bootError = null;
			isAppStateReady = true;
		} catch {
			if (!disposed) bootError = phase;
		} finally {
			if (!disposed) isBooting = false;
		}
	}

	function retryBoot() {
		if (isBooting) return;
		if (bootError === 'interface') {
			// Failed module imports can stay cached for the lifetime of this document.
			window.location.reload();
		} else {
			void boot();
		}
	}

	onMount(() => {
		void boot();
		return () => { disposed = true; };
	});
</script>

{#if bootError !== null}
	<main class="workduck-boot-screen boot-error">
		<section role="alert" aria-labelledby="boot-error-title" aria-busy={isBooting}>
			<h1 id="boot-error-title">{bootMessages.title}</h1>
			<p>{bootError === 'settings' ? bootMessages.settingsFailed : bootMessages.interfaceFailed}</p>
			<button type="button" onclick={retryBoot} disabled={isBooting}>
				{isBooting ? bootMessages.retrying : bootMessages.retry}
			</button>
		</section>
	</main>
{:else if !isAppStateReady}
	<div class="workduck-boot-screen" aria-hidden="true"></div>
{:else if isTrayMenuWindow}
	{@render children()}
{:else if WorkbenchShell === null}
	<div class="workduck-boot-screen" aria-hidden="true"></div>
{:else}
	<WorkbenchShell>
		{@render children()}
	</WorkbenchShell>
	{#if CommandPalette !== null}
		<CommandPalette />
	{/if}
{/if}

<style>
	.boot-error {
		display: grid;
		place-items: center;
		padding: 24px;
	}
	section {
		width: min(100%, 460px);
	}
	h1 {
		margin: 0 0 12px;
		font-size: 24px;
	}
	p {
		margin: 0 0 24px;
		color: var(--workduck-color-muted);
		line-height: 1.65;
	}
	button {
		padding: 10px 18px;
		border: 1px solid var(--workduck-color-border);
		border-radius: 8px;
		background: var(--workduck-color-surface);
		color: var(--workduck-color-text);
		cursor: pointer;
	}
	button:disabled {
		opacity: 0.65;
		cursor: wait;
	}
</style>
