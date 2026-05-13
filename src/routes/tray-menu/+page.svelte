<script lang="ts">
	import { onMount } from 'svelte';

	type TrayMenuCommand =
		| 'show_workduck_main_window'
		| 'hide_workduck_main_window'
		| 'hide_workduck_tray_menu'
		| 'exit_workduck';

	interface TauriCoreApi {
		readonly invoke?: <T>(command: string, args?: Record<string, unknown>) => Promise<T>;
	}

	interface TauriGlobalWindow {
		readonly __TAURI__?: {
			readonly core?: TauriCoreApi;
		};
	}

	let firstMenuItem: HTMLButtonElement | undefined;

	function getTauriInvoke() {
		if (typeof window === 'undefined') {
			return undefined;
		}

		return (window as unknown as TauriGlobalWindow).__TAURI__?.core?.invoke;
	}

	async function runTrayMenuCommand(command: TrayMenuCommand) {
		const invoke = getTauriInvoke();

		if (invoke === undefined) {
			return;
		}

		try {
			await invoke(command);
		} catch {
			return;
		}
	}

	onMount(() => {
		firstMenuItem?.focus();

		function handleKeydown(event: KeyboardEvent) {
			if (event.key !== 'Escape') {
				return;
			}

			event.preventDefault();
			void runTrayMenuCommand('hide_workduck_tray_menu');
		}

		function handleBlur() {
			window.setTimeout(() => {
				if (document.hasFocus()) {
					return;
				}

				void runTrayMenuCommand('hide_workduck_tray_menu');
			}, 80);
		}

		window.addEventListener('keydown', handleKeydown);
		window.addEventListener('blur', handleBlur);

		return () => {
			window.removeEventListener('keydown', handleKeydown);
			window.removeEventListener('blur', handleBlur);
		};
	});
</script>

<svelte:head>
	<title>Workduck</title>
</svelte:head>

<div class="workduck-tray-menu" role="menu" aria-label="Workduck tray menu">
	<button
		bind:this={firstMenuItem}
		class="workduck-tray-menu-item"
		type="button"
		role="menuitem"
		onclick={() => void runTrayMenuCommand('show_workduck_main_window')}
	>
		Show Workduck
	</button>
	<button
		class="workduck-tray-menu-item"
		type="button"
		role="menuitem"
		onclick={() => void runTrayMenuCommand('hide_workduck_main_window')}
	>
		Hide Workduck
	</button>
	<div class="workduck-tray-menu-separator" role="separator"></div>
	<button
		class="workduck-tray-menu-item workduck-tray-menu-item-danger"
		type="button"
		role="menuitem"
		onclick={() => void runTrayMenuCommand('exit_workduck')}
	>
		Exit Workduck
	</button>
</div>

<style>
	:global(html),
	:global(body) {
		width: 100%;
		height: 100%;
		overflow: hidden;
		background: transparent;
	}

	.workduck-tray-menu {
		display: grid;
		gap: 2px;
		width: 100vw;
		height: 100vh;
		padding: 10px;
		border: 1px solid oklch(var(--workduck-oklch-border) / 0.82);
		border-radius: 10px;
		background: oklch(var(--workduck-oklch-surface) / 0.98);
		box-shadow:
			0 18px 42px oklch(var(--workduck-oklch-shadow) / 0.58),
			inset 0 0 0 1px oklch(var(--workduck-oklch-accent) / 0.05);
	}

	.workduck-tray-menu-item {
		display: flex;
		width: 100%;
		min-width: 0;
		height: 38px;
		align-items: center;
		border: 1px solid transparent;
		border-radius: 8px;
		background: transparent;
		color: var(--workduck-color-text);
		padding: 0 16px;
		font-size: var(--workduck-font-size-sm);
		font-weight: 800;
		text-align: left;
		-webkit-user-select: none;
		user-select: none;
	}

	.workduck-tray-menu-item:hover,
	.workduck-tray-menu-item:focus-visible {
		border-color: oklch(var(--workduck-oklch-accent) / 0.45);
		background: oklch(var(--workduck-oklch-accent) / 0.1);
		color: var(--workduck-color-accent);
		outline: 0;
	}

	.workduck-tray-menu-item-danger:hover,
	.workduck-tray-menu-item-danger:focus-visible {
		border-color: oklch(var(--workduck-oklch-danger) / 0.68);
		background: oklch(var(--workduck-oklch-danger) / 0.14);
		color: var(--workduck-color-danger);
	}

	.workduck-tray-menu-separator {
		height: 1px;
		margin: 4px 6px;
		background: oklch(var(--workduck-oklch-border) / 0.72);
	}
</style>
