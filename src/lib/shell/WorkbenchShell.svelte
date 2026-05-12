<script lang="ts">
	import { page } from '$app/state';
	import { onMount, type Snippet } from 'svelte';

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

	interface Props {
		readonly children: Snippet;
	}

	const { children }: Props = $props();

	const navigationItems = [
		{ href: '/', label: 'Projects' },
		{ href: '/artifacts', label: 'Artifacts' }
	] as const;

	let sidebarWidthPx = $state(SIDEBAR_DEFAULT_WIDTH_PX);
	let isDesktop = $state(true);
	let isSidebarOpen = $state(false);
	let isDragging = $state(false);
	let resizePointerId: number | undefined;
	let resizeStartX = 0;
	let resizeStartWidthPx = SIDEBAR_DEFAULT_WIDTH_PX;

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

	function isWindowControlTarget(target: EventTarget | null) {
		return target instanceof Element && target.closest('[data-workduck-window-control]') !== null;
	}

	function handleTitlebarPointerDown(event: PointerEvent) {
		if (event.button !== 0 || isWindowControlTarget(event.target)) {
			return;
		}

		if (event.detail === 2) {
			event.preventDefault();
			void toggleTauriWindowMaximize();
			return;
		}

		void startTauriWindowDrag();
	}

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

		return () => {
			cancelResize();
			mediaQuery.removeEventListener('change', handleMediaChange);
		};
	});

</script>

<div class="workduck-window-frame">
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<header class="workduck-titlebar" onpointerdown={handleTitlebarPointerDown}>
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
				<span aria-hidden="true">-</span>
			</button>
			<button
				class="workduck-window-control"
				type="button"
				aria-label="Toggle maximize window"
				data-workduck-window-control="true"
				onclick={() => void toggleTauriWindowMaximize()}
			>
				<span aria-hidden="true">[]</span>
			</button>
			<button
				class="workduck-window-control workduck-window-control-close"
				type="button"
				aria-label="Close window"
				data-workduck-window-control="true"
				onclick={() => void closeTauriWindow()}
			>
				<span aria-hidden="true">x</span>
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

			<nav class="workduck-sidebar-nav" aria-label="Primary">
				{#each navigationItems as item}
					<a
						class={page.url.pathname === item.href
							? 'workduck-nav-link workduck-nav-link-active'
							: 'workduck-nav-link'}
						href={item.href}
						aria-current={page.url.pathname === item.href ? 'page' : undefined}
						title={item.label}
						onclick={closeSidebarOnMobile}
					>
						<span class="workduck-nav-dot"></span>
						<span class="workduck-nav-label">{item.label}</span>
					</a>
				{/each}
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
		width: 46px;
		border: 0;
		background: transparent;
		color: var(--workduck-color-muted);
		font: inherit;
		font-size: 12px;
		font-weight: 900;
		place-items: center;
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
		min-width: 0;
		height: 100%;
		overflow: hidden;
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

	.workduck-sidebar-nav {
		display: grid;
		gap: 6px;
		padding: 14px 12px;
	}

	.workduck-nav-link {
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

	.workduck-nav-link:hover {
		border-color: oklch(var(--workduck-oklch-border) / 0.92);
		background: oklch(var(--workduck-oklch-surface) / 0.72);
		color: var(--workduck-color-text);
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
