<script lang="ts">
	import { page } from '$app/state';
	import { onMount, type Snippet } from 'svelte';

	import {
		createEmptyWorkspaceRegistry,
		getActiveWorkspace,
		switchWorkspace,
		type WorkspaceRegistry
	} from '$lib/workspaces/workspace-registry';
	import {
		readWorkspaceRegistryFromBrowser,
		subscribeWorkspaceRegistry,
		writeWorkspaceRegistryToBrowser
	} from '$lib/workspaces/workspace-storage';

	import {
		clampSidebarWidthPx,
		parseStoredSidebarWidthPx,
		SHELL_MOBILE_BREAKPOINT_PX,
		SIDEBAR_DEFAULT_WIDTH_PX,
		SIDEBAR_KEYBOARD_LARGE_STEP_PX,
		SIDEBAR_KEYBOARD_STEP_PX,
		SIDEBAR_MAX_WIDTH_PX,
		SIDEBAR_MIN_WIDTH_PX,
		SIDEBAR_WIDTH_STORAGE_KEY
	} from './sidebar-layout';
	import {
		closeTauriWindow,
		minimizeTauriWindow,
		startTauriWindowDrag,
		toggleTauriWindowMaximize
	} from './tauri-window';
	import { hasExceededTitlebarDragThreshold } from './titlebar-interaction';

	interface Props {
		readonly children: Snippet;
	}

	const { children }: Props = $props();

	const primaryNavigationItems = [
		{ href: '/', label: 'Projects' },
		{ href: '/artifacts', label: 'Artifacts' }
	] as const;
	const settingsNavigationItem = { href: '/settings', label: 'Settings' } as const;
	const workspaceMenuId = 'workduck-workspace-menu';
	const primaryNavigationUnavailableDescriptionId =
		'workduck-primary-navigation-unavailable-description';
	const workspaceUnavailableMessage = 'Add a workspace in Settings first.';

	let sidebarWidthPx = $state(SIDEBAR_DEFAULT_WIDTH_PX);
	let isDesktop = $state(true);
	let isSidebarOpen = $state(false);
	let isDragging = $state(false);
	let workspaceRegistry = $state<WorkspaceRegistry>(createEmptyWorkspaceRegistry());
	let isWorkspaceMenuOpen = $state(false);
	let workspaceSwitchError = $state<string | null>(null);
	let resizePointerId: number | undefined;
	let resizeStartX = 0;
	let resizeStartWidthPx = SIDEBAR_DEFAULT_WIDTH_PX;
	let workspaceSwitcherElement: HTMLElement | undefined;
	let titlebarDragElement: HTMLElement | undefined;
	let titlebarDragPointerId: number | undefined;
	let titlebarDragStartX = 0;
	let titlebarDragStartY = 0;

	let activeWorkspace = $derived(getActiveWorkspace(workspaceRegistry));
	let hasWorkspaceChoices = $derived(workspaceRegistry.workspaces.length > 0);
	let activeWorkspaceName = $derived(activeWorkspace?.name ?? 'No workspace');

	function persistSidebarWidthPx(nextWidthPx = sidebarWidthPx) {
		if (typeof window === 'undefined') {
			return;
		}

		try {
			window.localStorage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, String(clampSidebarWidthPx(nextWidthPx)));
		} catch {
			return;
		}
	}

	function applySidebarWidthPx(nextWidthPx: number, shouldPersist = false) {
		sidebarWidthPx = clampSidebarWidthPx(nextWidthPx);

		if (shouldPersist) {
			persistSidebarWidthPx(sidebarWidthPx);
		}
	}

	function updateDesktopMode(matchesDesktop: boolean) {
		isDesktop = matchesDesktop;

		if (matchesDesktop) {
			isSidebarOpen = false;
		}
	}

	function handleResizePointerDown(event: PointerEvent) {
		if (!isDesktop || event.button !== 0) {
			return;
		}

		const target = event.currentTarget;

		if (!(target instanceof HTMLElement)) {
			return;
		}

		event.preventDefault();
		resizePointerId = event.pointerId;
		resizeStartX = event.clientX;
		resizeStartWidthPx = sidebarWidthPx;
		isDragging = true;
		target.setPointerCapture(event.pointerId);
		document.body.classList.add('workduck-sidebar-resizing');
		window.addEventListener('pointermove', handleResizePointerMove);
		window.addEventListener('pointerup', finishResize);
		window.addEventListener('pointercancel', cancelResize);
	}

	function handleResizePointerMove(event: PointerEvent) {
		if (!isDragging || resizePointerId !== event.pointerId) {
			return;
		}

		event.preventDefault();
		applySidebarWidthPx(resizeStartWidthPx + event.clientX - resizeStartX);
	}

	function finishResize() {
		if (!isDragging) {
			return;
		}

		isDragging = false;
		resizePointerId = undefined;
		persistSidebarWidthPx();
		document.body.classList.remove('workduck-sidebar-resizing');
		window.removeEventListener('pointermove', handleResizePointerMove);
		window.removeEventListener('pointerup', finishResize);
		window.removeEventListener('pointercancel', cancelResize);
	}

	function cancelResize() {
		if (!isDragging) {
			return;
		}

		isDragging = false;
		resizePointerId = undefined;
		document.body.classList.remove('workduck-sidebar-resizing');
		window.removeEventListener('pointermove', handleResizePointerMove);
		window.removeEventListener('pointerup', finishResize);
		window.removeEventListener('pointercancel', cancelResize);
	}

	function handleResizeKeydown(event: KeyboardEvent) {
		if (!isDesktop) {
			return;
		}

		if (event.key === 'Home') {
			event.preventDefault();
			applySidebarWidthPx(SIDEBAR_MIN_WIDTH_PX, true);
			return;
		}

		if (event.key === 'End') {
			event.preventDefault();
			applySidebarWidthPx(SIDEBAR_MAX_WIDTH_PX, true);
			return;
		}

		if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') {
			return;
		}

		event.preventDefault();
		const direction = event.key === 'ArrowLeft' ? -1 : 1;
		const stepPx = event.shiftKey ? SIDEBAR_KEYBOARD_LARGE_STEP_PX : SIDEBAR_KEYBOARD_STEP_PX;
		applySidebarWidthPx(sidebarWidthPx + direction * stepPx, true);
	}

	function closeSidebarOnMobile() {
		if (!isDesktop) {
			isSidebarOpen = false;
		}
	}

	function getPrimaryNavigationClass(href: string) {
		return [
			'workduck-nav-link',
			hasWorkspaceChoices && page.url.pathname === href ? 'workduck-nav-link-active' : '',
			hasWorkspaceChoices ? '' : 'workduck-nav-link-disabled'
		]
			.filter(Boolean)
			.join(' ');
	}

	function handlePrimaryNavigationClick(event: MouseEvent) {
		if (!hasWorkspaceChoices) {
			event.preventDefault();
			return;
		}

		closeSidebarOnMobile();
	}

	function toggleWorkspaceMenu() {
		if (!hasWorkspaceChoices) {
			return;
		}

		workspaceSwitchError = null;
		isWorkspaceMenuOpen = !isWorkspaceMenuOpen;
	}

	function handleWorkspaceSwitch(workspaceId: string) {
		workspaceSwitchError = null;
		const result = switchWorkspace(workspaceRegistry, workspaceId);

		if (!result.ok) {
			workspaceSwitchError = 'Workspace was not found.';
			return;
		}

		const writeResult = writeWorkspaceRegistryToBrowser(result.registry);
		workspaceRegistry = writeResult.registry;

		if (!writeResult.ok) {
			workspaceSwitchError = 'Workspace switch could not be saved.';
			isWorkspaceMenuOpen = true;
			return;
		}

		isWorkspaceMenuOpen = false;
		closeSidebarOnMobile();
	}

	function isWindowControlTarget(target: EventTarget | null) {
		return target instanceof Element && target.closest('[data-workduck-window-control]') !== null;
	}

	function handleTitlebarPointerDown(event: PointerEvent) {
		if (event.button !== 0 || isWindowControlTarget(event.target)) {
			cancelTitlebarDragTracking();
			return;
		}

		if (event.detail > 1) {
			cancelTitlebarDragTracking();
			return;
		}

		const target = event.currentTarget;

		if (!(target instanceof HTMLElement)) {
			return;
		}

		titlebarDragElement = target;
		titlebarDragPointerId = event.pointerId;
		titlebarDragStartX = event.clientX;
		titlebarDragStartY = event.clientY;
		target.setPointerCapture(event.pointerId);
		window.addEventListener('pointermove', handleTitlebarPointerMove);
		window.addEventListener('pointerup', cancelTitlebarDragTracking);
		window.addEventListener('pointercancel', cancelTitlebarDragTracking);
	}

	function handleTitlebarPointerMove(event: PointerEvent) {
		if (titlebarDragPointerId !== event.pointerId) {
			return;
		}

		if ((event.buttons & 1) !== 1) {
			cancelTitlebarDragTracking();
			return;
		}

		if (
			!hasExceededTitlebarDragThreshold(
				titlebarDragStartX,
				titlebarDragStartY,
				event.clientX,
				event.clientY
			)
		) {
			return;
		}

		event.preventDefault();
		cancelTitlebarDragTracking();
		void startTauriWindowDrag();
	}

	function handleTitlebarDoubleClick(event: MouseEvent) {
		if (isWindowControlTarget(event.target)) {
			return;
		}

		event.preventDefault();
		cancelTitlebarDragTracking();
		void toggleTauriWindowMaximize();
	}

	function cancelTitlebarDragTracking() {
		const pointerId = titlebarDragPointerId;

		if (
			titlebarDragElement !== undefined &&
			pointerId !== undefined &&
			titlebarDragElement.hasPointerCapture(pointerId)
		) {
			try {
				titlebarDragElement.releasePointerCapture(pointerId);
			} catch {
				// The browser may already have released capture after native window handling takes over.
			}
		}

		titlebarDragElement = undefined;
		titlebarDragPointerId = undefined;
		window.removeEventListener('pointermove', handleTitlebarPointerMove);
		window.removeEventListener('pointerup', cancelTitlebarDragTracking);
		window.removeEventListener('pointercancel', cancelTitlebarDragTracking);
	}

	$effect(() => {
		if (hasWorkspaceChoices) {
			return;
		}

		isWorkspaceMenuOpen = false;
		workspaceSwitchError = null;
	});

	$effect(() => {
		if (!isWorkspaceMenuOpen || typeof window === 'undefined') {
			return;
		}

		function handleGlobalPointerDown(event: PointerEvent) {
			if (
				workspaceSwitcherElement !== undefined &&
				event.target instanceof Node &&
				workspaceSwitcherElement.contains(event.target)
			) {
				return;
			}

			isWorkspaceMenuOpen = false;
		}

		function handleGlobalKeydown(event: KeyboardEvent) {
			if (event.key !== 'Escape') {
				return;
			}

			event.preventDefault();
			isWorkspaceMenuOpen = false;
		}

		window.addEventListener('pointerdown', handleGlobalPointerDown, true);
		window.addEventListener('keydown', handleGlobalKeydown);

		return () => {
			window.removeEventListener('pointerdown', handleGlobalPointerDown, true);
			window.removeEventListener('keydown', handleGlobalKeydown);
		};
	});

	onMount(() => {
		let storedSidebarWidth: string | null = null;

		try {
			storedSidebarWidth = window.localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY);
		} catch {
			storedSidebarWidth = null;
		}

		sidebarWidthPx = parseStoredSidebarWidthPx(storedSidebarWidth);

		const mediaQuery = window.matchMedia(`(min-width: ${SHELL_MOBILE_BREAKPOINT_PX}px)`);
		const handleMediaChange = (event: MediaQueryListEvent) => updateDesktopMode(event.matches);

		updateDesktopMode(mediaQuery.matches);
		mediaQuery.addEventListener('change', handleMediaChange);
		workspaceRegistry = readWorkspaceRegistryFromBrowser().registry;
		const unsubscribeWorkspaceRegistry = subscribeWorkspaceRegistry((nextRegistry) => {
			workspaceRegistry = nextRegistry;
		});

		return () => {
			unsubscribeWorkspaceRegistry();
			cancelTitlebarDragTracking();
			cancelResize();
			mediaQuery.removeEventListener('change', handleMediaChange);
		};
	});

</script>

<div class="workduck-window-frame">
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<header
		class="workduck-titlebar"
		onpointerdown={handleTitlebarPointerDown}
		ondblclick={handleTitlebarDoubleClick}
	>
		<div class="workduck-titlebar-brand">
			<span class="workduck-titlebar-mark">WD</span>
			<span class="workduck-titlebar-name">Workduck</span>
		</div>

		<div class="workduck-window-controls" data-workduck-window-control="true">
			<button
				class="workduck-window-control"
				type="button"
				aria-label="Minimize window"
				data-workduck-window-control="true"
				onclick={() => void minimizeTauriWindow()}
			>
				<span class="workduck-window-icon workduck-window-icon-minimize" aria-hidden="true"></span>
			</button>
			<button
				class="workduck-window-control"
				type="button"
				aria-label="Toggle maximize window"
				data-workduck-window-control="true"
				onclick={() => void toggleTauriWindowMaximize()}
			>
				<span class="workduck-window-icon workduck-window-icon-maximize" aria-hidden="true"></span>
			</button>
			<button
				class="workduck-window-control workduck-window-control-close"
				type="button"
				aria-label="Close window"
				data-workduck-window-control="true"
				onclick={() => void closeTauriWindow()}
			>
				<span class="workduck-window-icon workduck-window-icon-close" aria-hidden="true"></span>
			</button>
		</div>
	</header>

	<div
		class={isDragging ? 'workduck-shell workduck-shell-dragging' : 'workduck-shell'}
		style={`--workduck-sidebar-width: ${sidebarWidthPx}px;`}
	>
		{#if isSidebarOpen}
			<button
				class="workduck-sidebar-backdrop"
				type="button"
				aria-label="Close sidebar"
				onclick={() => (isSidebarOpen = false)}
			></button>
		{/if}

		<aside class={isSidebarOpen ? 'workduck-sidebar workduck-sidebar-open' : 'workduck-sidebar'}>
			<div class="workduck-sidebar-header">
				<a class="workduck-brand" href="/" onclick={closeSidebarOnMobile}>
					<span class="workduck-brand-mark">WD</span>
					<span class="workduck-brand-name">Workduck</span>
				</a>
				<button
					class="workduck-sidebar-close"
					type="button"
					aria-label="Close sidebar"
					onclick={() => (isSidebarOpen = false)}
				>
					Close
				</button>
			</div>

			<div
				class="workduck-sidebar-workspace"
				bind:this={workspaceSwitcherElement}
			>
				<button
					class="workduck-workspace-trigger"
					type="button"
					aria-haspopup={hasWorkspaceChoices ? 'menu' : undefined}
					aria-expanded={hasWorkspaceChoices ? isWorkspaceMenuOpen : undefined}
					aria-controls={isWorkspaceMenuOpen ? workspaceMenuId : undefined}
					aria-disabled={!hasWorkspaceChoices}
					onclick={toggleWorkspaceMenu}
				>
					<span class="workduck-workspace-trigger-text">{activeWorkspaceName}</span>
					<span class="workduck-workspace-trigger-caret" aria-hidden="true"></span>
				</button>

				{#if isWorkspaceMenuOpen}
					<div id={workspaceMenuId} class="workduck-workspace-menu" role="menu">
						{#each workspaceRegistry.workspaces as workspace (workspace.id)}
							<button
								class={workspace.id === workspaceRegistry.activeWorkspaceId
									? 'workduck-workspace-menu-item workduck-workspace-menu-item-active'
									: 'workduck-workspace-menu-item'}
								type="button"
								role="menuitemradio"
								aria-checked={workspace.id === workspaceRegistry.activeWorkspaceId}
								onclick={() => handleWorkspaceSwitch(workspace.id)}
							>
								<span class="workduck-workspace-menu-name">{workspace.name}</span>
								<span class="workduck-workspace-menu-path">{workspace.path}</span>
							</button>
						{/each}

						{#if workspaceSwitchError !== null}
							<p class="workduck-workspace-menu-error" aria-live="polite">{workspaceSwitchError}</p>
						{/if}
					</div>
				{/if}
			</div>

			<nav class="workduck-sidebar-nav" aria-label="Primary">
				{#if !hasWorkspaceChoices}
					<span id={primaryNavigationUnavailableDescriptionId} class="workduck-sr-only">
						{workspaceUnavailableMessage}
					</span>
				{/if}
				{#each primaryNavigationItems as item}
					<a
						class={getPrimaryNavigationClass(item.href)}
						href={item.href}
						aria-current={hasWorkspaceChoices && page.url.pathname === item.href ? 'page' : undefined}
						aria-disabled={!hasWorkspaceChoices}
						aria-describedby={hasWorkspaceChoices
							? undefined
							: primaryNavigationUnavailableDescriptionId}
						aria-label={item.label}
						data-tooltip={hasWorkspaceChoices ? item.label : workspaceUnavailableMessage}
						onclick={handlePrimaryNavigationClick}
					>
						<span class="workduck-nav-dot"></span>
						<span class="workduck-nav-label">{item.label}</span>
					</a>
				{/each}
			</nav>

			<nav class="workduck-sidebar-footer" aria-label="Settings">
				<a
					class={page.url.pathname === settingsNavigationItem.href
						? 'workduck-nav-link workduck-nav-link-active'
						: 'workduck-nav-link'}
					href={settingsNavigationItem.href}
					aria-current={page.url.pathname === settingsNavigationItem.href ? 'page' : undefined}
					aria-label={settingsNavigationItem.label}
					data-tooltip={settingsNavigationItem.label}
					onclick={closeSidebarOnMobile}
				>
					<span class="workduck-nav-dot"></span>
					<span class="workduck-nav-label">{settingsNavigationItem.label}</span>
				</a>
			</nav>
		</aside>

		<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
		<div
			class="workduck-sidebar-resizer"
			role="separator"
			aria-label="Resize sidebar"
			aria-orientation="vertical"
			aria-valuemin={SIDEBAR_MIN_WIDTH_PX}
			aria-valuemax={SIDEBAR_MAX_WIDTH_PX}
			aria-valuenow={sidebarWidthPx}
			tabindex={isDesktop ? 0 : -1}
			onpointerdown={handleResizePointerDown}
			onkeydown={handleResizeKeydown}
		>
			<span class="workduck-sidebar-resizer-line"></span>
		</div>

		<section class="workduck-main-pane">
			<div class="workduck-mobile-bar">
				<button
					class="workduck-mobile-menu"
					type="button"
					aria-label="Open sidebar"
					onclick={() => (isSidebarOpen = true)}
				>
					Menu
				</button>
				<span class="workduck-mobile-title">Workduck</span>
			</div>

			{@render children()}
		</section>
	</div>
</div>

<style>
	.workduck-window-frame {
		--workduck-titlebar-height: 34px;

		display: grid;
		grid-template-rows: var(--workduck-titlebar-height) minmax(0, 1fr);
		height: 100vh;
		overflow: hidden;
		background: var(--workduck-color-background);
		color: var(--workduck-color-text);
	}

	.workduck-sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		overflow: hidden;
		border: 0;
		clip: rect(0 0 0 0);
		white-space: nowrap;
	}

	.workduck-titlebar {
		display: flex;
		min-width: 0;
		align-items: center;
		border-bottom: 1px solid oklch(var(--workduck-oklch-border) / 0.88);
		background: var(--workduck-color-background);
		user-select: none;
	}

	.workduck-titlebar-brand {
		display: inline-flex;
		min-width: 0;
		align-items: center;
		gap: 8px;
		padding: 0 12px;
		color: var(--workduck-color-accent);
	}

	.workduck-titlebar-mark {
		display: grid;
		width: 18px;
		height: 18px;
		place-items: center;
		border: 1px solid oklch(var(--workduck-oklch-accent) / 0.72);
		border-radius: 4px;
		font-size: 10px;
		font-weight: 900;
		line-height: 1;
	}

	.workduck-titlebar-name {
		min-width: 0;
		overflow: hidden;
		font-size: 13px;
		font-weight: 800;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.workduck-window-controls {
		display: flex;
		align-self: stretch;
		margin-left: auto;
	}

	.workduck-window-control {
		display: grid;
		width: 42px;
		border: 0;
		background: transparent;
		color: var(--workduck-color-muted);
		place-items: center;
	}

	.workduck-window-icon {
		position: relative;
		display: block;
		width: 14px;
		height: 14px;
	}

	.workduck-window-icon::before,
	.workduck-window-icon::after {
		position: absolute;
		content: "";
	}

	.workduck-window-icon-minimize::before {
		left: 2px;
		bottom: 3px;
		width: 10px;
		height: 1.5px;
		border-radius: 999px;
		background: currentColor;
	}

	.workduck-window-icon-maximize::before {
		inset: 2px;
		border: 1.5px solid currentColor;
		border-radius: 1.5px;
	}

	.workduck-window-icon-close::before,
	.workduck-window-icon-close::after {
		top: 6px;
		left: 2px;
		width: 10px;
		height: 1.5px;
		border-radius: 999px;
		background: currentColor;
	}

	.workduck-window-icon-close::before {
		transform: rotate(45deg);
	}

	.workduck-window-icon-close::after {
		transform: rotate(-45deg);
	}

	.workduck-window-control:hover {
		background: oklch(var(--workduck-oklch-accent) / 0.1);
		color: var(--workduck-color-accent);
	}

	.workduck-window-control:focus-visible {
		outline: 2px solid var(--workduck-color-accent);
		outline-offset: -2px;
	}

	.workduck-window-control-close:hover {
		background: var(--workduck-color-danger);
		color: var(--workduck-color-text-inverted);
	}

	.workduck-shell {
		display: grid;
		grid-template-columns: var(--workduck-sidebar-width) 8px minmax(0, 1fr);
		min-height: 0;
		overflow: hidden;
		background: var(--workduck-color-background);
		color: var(--workduck-color-text);
	}

	.workduck-shell-dragging,
	:global(.workduck-sidebar-resizing) {
		cursor: col-resize;
		user-select: none;
	}

	.workduck-sidebar {
		position: relative;
		z-index: 10;
		display: grid;
		grid-template-rows: auto auto minmax(0, 1fr) auto;
		min-width: 0;
		height: 100%;
		overflow: visible;
		border-right: 1px solid oklch(var(--workduck-oklch-accent) / 0.24);
		background:
			linear-gradient(135deg, oklch(var(--workduck-oklch-accent) / 0.06), transparent 36%),
			var(--workduck-color-panel);
	}

	.workduck-sidebar-header {
		display: flex;
		min-width: 0;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		height: 64px;
		padding: 0 16px;
		border-bottom: 1px solid oklch(var(--workduck-oklch-border) / 0.88);
	}

	.workduck-brand {
		display: inline-flex;
		min-width: 0;
		align-items: center;
		gap: 10px;
		color: var(--workduck-color-text);
		text-decoration: none;
	}

	.workduck-brand-mark {
		display: grid;
		flex: 0 0 36px;
		width: 36px;
		height: 36px;
		place-items: center;
		border: 1px solid oklch(var(--workduck-oklch-accent) / 0.72);
		border-radius: 8px;
		background: oklch(var(--workduck-oklch-accent) / 0.08);
		color: var(--workduck-color-accent);
		font-size: 13px;
		font-weight: 800;
	}

	.workduck-brand-name,
	.workduck-nav-label {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.workduck-brand-name {
		color: var(--workduck-color-accent);
		font-size: 18px;
		font-weight: 800;
	}

	.workduck-sidebar-close {
		display: none;
	}

	.workduck-sidebar-workspace {
		position: relative;
		min-width: 0;
		padding: 10px 12px 0;
	}

	.workduck-workspace-trigger {
		display: flex;
		width: 100%;
		min-width: 0;
		height: 34px;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		border: 1px solid oklch(var(--workduck-oklch-border) / 0.78);
		border-radius: 8px;
		background: oklch(var(--workduck-oklch-surface) / 0.58);
		color: var(--workduck-color-muted);
		padding: 0 10px;
		font-size: 12px;
		font-weight: 800;
	}

	.workduck-workspace-trigger:hover:not([aria-disabled="true"]),
	.workduck-workspace-trigger[aria-expanded="true"] {
		border-color: oklch(var(--workduck-oklch-accent) / 0.72);
		background: oklch(var(--workduck-oklch-accent) / 0.08);
		color: var(--workduck-color-accent);
	}

	.workduck-workspace-trigger[aria-disabled="true"] {
		cursor: not-allowed;
		opacity: 0.72;
	}

	.workduck-workspace-trigger:focus-visible {
		outline: 2px solid var(--workduck-color-accent);
		outline-offset: 2px;
	}

	.workduck-workspace-trigger-text {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.workduck-workspace-trigger-caret {
		flex: 0 0 auto;
		width: 7px;
		height: 7px;
		border-right: 1.5px solid currentColor;
		border-bottom: 1.5px solid currentColor;
		transform: translateY(-2px) rotate(45deg);
	}

	.workduck-workspace-menu {
		position: absolute;
		top: calc(100% + 6px);
		right: 12px;
		left: 12px;
		z-index: 70;
		display: grid;
		gap: 4px;
		max-height: min(320px, calc(100vh - 180px));
		overflow: auto;
		padding: 6px;
		border: 1px solid oklch(var(--workduck-oklch-accent) / 0.42);
		border-radius: 8px;
		background: var(--workduck-color-panel);
		box-shadow:
			0 18px 38px oklch(var(--workduck-oklch-shadow) / 0.42),
			inset 0 0 0 1px oklch(var(--workduck-oklch-accent) / 0.06);
	}

	.workduck-workspace-menu-item {
		display: grid;
		width: 100%;
		min-width: 0;
		gap: 4px;
		padding: 9px 10px;
		border: 1px solid transparent;
		border-radius: 7px;
		background: transparent;
		color: var(--workduck-color-text);
		text-align: left;
	}

	.workduck-workspace-menu-item:hover,
	.workduck-workspace-menu-item:focus-visible {
		border-color: oklch(var(--workduck-oklch-border) / 0.86);
		background: oklch(var(--workduck-oklch-surface) / 0.72);
		outline: 0;
	}

	.workduck-workspace-menu-item-active {
		border-color: oklch(var(--workduck-oklch-accent) / 0.78);
		background: oklch(var(--workduck-oklch-accent) / 0.1);
		color: var(--workduck-color-accent);
	}

	.workduck-workspace-menu-name,
	.workduck-workspace-menu-path {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.workduck-workspace-menu-name {
		font-size: 12px;
		font-weight: 800;
	}

	.workduck-workspace-menu-path {
		color: var(--workduck-color-muted);
		font-size: 11px;
		font-weight: 700;
	}

	.workduck-workspace-menu-error {
		margin: 2px 4px 4px;
		color: var(--workduck-color-danger);
		font-size: 11px;
		font-weight: 800;
	}

	.workduck-sidebar-nav {
		display: grid;
		align-content: start;
		gap: 6px;
		min-height: 0;
		overflow: visible;
		padding: 14px 12px;
	}

	.workduck-sidebar-footer {
		display: grid;
		gap: 6px;
		min-width: 0;
		padding: 12px;
		border-top: 1px solid oklch(var(--workduck-oklch-border) / 0.7);
	}

	.workduck-nav-link {
		position: relative;
		display: flex;
		min-width: 0;
		align-items: center;
		gap: 10px;
		height: 40px;
		padding: 0 12px;
		border: 1px solid transparent;
		border-radius: 8px;
		color: var(--workduck-color-muted);
		font-size: 14px;
		font-weight: 700;
		text-decoration: none;
	}

	.workduck-nav-link::before,
	.workduck-nav-link::after {
		position: absolute;
		top: 50%;
		left: calc(100% + 10px);
		z-index: 50;
		opacity: 0;
		pointer-events: none;
		transition:
			opacity 120ms ease,
			transform 120ms ease;
	}

	.workduck-nav-link::before {
		width: 8px;
		height: 8px;
		background: var(--workduck-color-panel);
		border-left: 1px solid oklch(var(--workduck-oklch-accent) / 0.46);
		border-bottom: 1px solid oklch(var(--workduck-oklch-accent) / 0.46);
		content: "";
		transform: translate(5px, -50%) rotate(45deg);
	}

	.workduck-nav-link::after {
		width: max-content;
		max-width: 240px;
		padding: 7px 9px;
		border: 1px solid oklch(var(--workduck-oklch-accent) / 0.46);
		border-radius: 6px;
		background: var(--workduck-color-panel);
		box-shadow:
			0 12px 26px oklch(var(--workduck-oklch-shadow) / 0.36),
			inset 0 0 0 1px oklch(var(--workduck-oklch-accent) / 0.06);
		color: var(--workduck-color-text);
		content: attr(data-tooltip);
		font-size: 12px;
		font-weight: 800;
		line-height: 1;
		text-overflow: ellipsis;
		white-space: nowrap;
		overflow: hidden;
		transform: translate(9px, -50%);
	}

	.workduck-nav-link:hover::before,
	.workduck-nav-link:hover::after,
	.workduck-nav-link:focus-visible::before,
	.workduck-nav-link:focus-visible::after {
		opacity: 1;
		transition-delay: 520ms;
	}

	.workduck-nav-link:hover::before,
	.workduck-nav-link:focus-visible::before {
		transform: translate(1px, -50%) rotate(45deg);
	}

	.workduck-nav-link:hover::after,
	.workduck-nav-link:focus-visible::after {
		transform: translate(5px, -50%);
	}

	.workduck-nav-link:hover {
		border-color: oklch(var(--workduck-oklch-border) / 0.92);
		background: oklch(var(--workduck-oklch-surface) / 0.72);
		color: var(--workduck-color-text);
	}

	.workduck-nav-link-disabled,
	.workduck-nav-link-disabled:hover {
		border-color: transparent;
		background: transparent;
		color: var(--workduck-color-muted);
		cursor: not-allowed;
		opacity: 0.62;
	}

	.workduck-nav-link-active {
		border-color: oklch(var(--workduck-oklch-accent) / 0.92);
		background: oklch(var(--workduck-oklch-accent) / 0.1);
		color: var(--workduck-color-accent);
		box-shadow: 0 0 0 1px oklch(var(--workduck-oklch-accent) / 0.12);
	}

	.workduck-nav-dot {
		flex: 0 0 8px;
		width: 8px;
		height: 8px;
		border-radius: 999px;
		background: var(--workduck-color-control);
	}

	.workduck-nav-link-active .workduck-nav-dot {
		background: var(--workduck-color-accent);
	}

	.workduck-sidebar-resizer {
		position: relative;
		z-index: 5;
		display: grid;
		width: 8px;
		cursor: col-resize;
		place-items: stretch center;
		touch-action: none;
		background: var(--workduck-color-background);
	}

	.workduck-sidebar-resizer:focus-visible {
		outline: 2px solid var(--workduck-color-accent);
		outline-offset: -2px;
	}

	.workduck-sidebar-resizer-line {
		width: 1px;
		background: oklch(var(--workduck-oklch-accent) / 0.28);
		transition:
			background-color 120ms ease,
			box-shadow 120ms ease;
	}

	.workduck-sidebar-resizer:hover .workduck-sidebar-resizer-line,
	.workduck-shell-dragging .workduck-sidebar-resizer-line {
		background: var(--workduck-color-accent);
		box-shadow: 0 0 10px oklch(var(--workduck-oklch-accent) / 0.35);
	}

	.workduck-main-pane {
		min-width: 0;
		height: 100%;
		min-height: 0;
		overflow: auto;
		background: linear-gradient(
			180deg,
			var(--workduck-color-background-raised) 0%,
			var(--workduck-color-background) 100%
		);
	}

	.workduck-mobile-bar {
		display: none;
	}

	.workduck-sidebar-backdrop {
		display: none;
	}

	@media (max-width: 759px) {
		.workduck-shell {
			display: block;
			height: 100%;
			min-height: 0;
		}

		.workduck-sidebar {
			position: fixed;
			inset: var(--workduck-titlebar-height) auto 0 0;
			z-index: 30;
			width: min(320px, 86vw);
			overflow: hidden;
			transform: translateX(-100%);
			transition: transform 160ms ease;
			box-shadow: 16px 0 36px oklch(var(--workduck-oklch-shadow) / 0.44);
		}

		.workduck-sidebar-open {
			transform: translateX(0);
		}

		.workduck-sidebar-close {
			display: inline-flex;
			align-items: center;
			justify-content: center;
			height: 32px;
			padding: 0 10px;
			border: 1px solid oklch(var(--workduck-oklch-border) / 0.9);
			border-radius: 8px;
			background: var(--workduck-color-surface);
			color: var(--workduck-color-text);
			font: inherit;
			font-size: 12px;
			font-weight: 800;
		}

		.workduck-sidebar-resizer {
			display: none;
		}

		.workduck-nav-link::before,
		.workduck-nav-link::after {
			display: none;
		}

		.workduck-main-pane {
			height: 100%;
			min-height: 0;
		}

		.workduck-mobile-bar {
			position: sticky;
			top: 0;
			z-index: 15;
			display: flex;
			align-items: center;
			gap: 12px;
			height: 54px;
			padding: 0 14px;
			border-bottom: 1px solid oklch(var(--workduck-oklch-border) / 0.9);
			background: oklch(var(--workduck-oklch-background) / 0.92);
			backdrop-filter: blur(12px);
		}

		.workduck-mobile-menu {
			height: 34px;
			padding: 0 12px;
			border: 1px solid oklch(var(--workduck-oklch-accent) / 0.82);
			border-radius: 8px;
			background: oklch(var(--workduck-oklch-accent) / 0.1);
			color: var(--workduck-color-accent);
			font: inherit;
			font-size: 13px;
			font-weight: 800;
		}

		.workduck-mobile-title {
			min-width: 0;
			overflow: hidden;
			color: var(--workduck-color-accent);
			font-weight: 800;
			text-overflow: ellipsis;
			white-space: nowrap;
		}

		.workduck-sidebar-backdrop {
			position: fixed;
			inset: var(--workduck-titlebar-height) 0 0;
			z-index: 20;
			display: block;
			border: 0;
			background: oklch(var(--workduck-oklch-shadow) / 0.5);
		}
	}
</style>
