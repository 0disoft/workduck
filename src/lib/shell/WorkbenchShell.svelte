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

<style>
	.workduck-shell {
		--workduck-yellow: #fbff62;
		--workduck-panel-raised: #202020;
		--workduck-text: #f5f3e7;
		--workduck-muted: #a5b5c7;

		display: grid;
		grid-template-columns: var(--workduck-sidebar-width) 8px minmax(0, 1fr);
		min-height: 100vh;
		overflow: hidden;
		background: #10120f;
		color: var(--workduck-text);
	}

	.workduck-shell-dragging,
	:global(.workduck-sidebar-resizing) {
		cursor: col-resize;
		user-select: none;
	}

	.workduck-sidebar {
		min-width: 0;
		overflow: hidden;
		border-right: 1px solid rgba(251, 255, 98, 0.24);
		background:
			linear-gradient(135deg, rgba(251, 255, 98, 0.06), transparent 36%),
			var(--workduck-panel-raised);
	}

	.workduck-sidebar-header {
		display: flex;
		min-width: 0;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		height: 64px;
		padding: 0 16px;
		border-bottom: 1px solid rgba(47, 63, 85, 0.88);
	}

	.workduck-brand {
		display: inline-flex;
		min-width: 0;
		align-items: center;
		gap: 10px;
		color: var(--workduck-text);
		text-decoration: none;
	}

	.workduck-brand-mark {
		display: grid;
		flex: 0 0 36px;
		width: 36px;
		height: 36px;
		place-items: center;
		border: 1px solid rgba(251, 255, 98, 0.72);
		border-radius: 8px;
		background: rgba(251, 255, 98, 0.08);
		color: var(--workduck-yellow);
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
		color: var(--workduck-yellow);
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
		color: var(--workduck-muted);
		font-size: 14px;
		font-weight: 700;
		text-decoration: none;
	}

	.workduck-nav-link:hover {
		border-color: rgba(47, 63, 85, 0.92);
		background: rgba(23, 27, 31, 0.72);
		color: var(--workduck-text);
	}

	.workduck-nav-link-active {
		border-color: rgba(251, 255, 98, 0.92);
		background: rgba(251, 255, 98, 0.1);
		color: var(--workduck-yellow);
		box-shadow: 0 0 0 1px rgba(251, 255, 98, 0.12);
	}

	.workduck-nav-dot {
		flex: 0 0 8px;
		width: 8px;
		height: 8px;
		border-radius: 999px;
		background: #43536a;
	}

	.workduck-nav-link-active .workduck-nav-dot {
		background: var(--workduck-yellow);
	}

	.workduck-sidebar-resizer {
		position: relative;
		z-index: 5;
		display: grid;
		width: 8px;
		cursor: col-resize;
		place-items: stretch center;
		touch-action: none;
		background: #10120f;
	}

	.workduck-sidebar-resizer:focus-visible {
		outline: 2px solid var(--workduck-yellow);
		outline-offset: -2px;
	}

	.workduck-sidebar-resizer-line {
		width: 1px;
		background: rgba(251, 255, 98, 0.28);
		transition:
			background-color 120ms ease,
			box-shadow 120ms ease;
	}

	.workduck-sidebar-resizer:hover .workduck-sidebar-resizer-line,
	.workduck-shell-dragging .workduck-sidebar-resizer-line {
		background: var(--workduck-yellow);
		box-shadow: 0 0 10px rgba(251, 255, 98, 0.35);
	}

	.workduck-main-pane {
		min-width: 0;
		min-height: 100vh;
		overflow: auto;
		background: linear-gradient(180deg, #141613 0%, #10120f 100%);
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
			min-height: 100vh;
		}

		.workduck-sidebar {
			position: fixed;
			inset: 0 auto 0 0;
			z-index: 30;
			width: min(320px, 86vw);
			transform: translateX(-100%);
			transition: transform 160ms ease;
			box-shadow: 16px 0 36px rgba(0, 0, 0, 0.44);
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
			border: 1px solid rgba(47, 63, 85, 0.9);
			border-radius: 8px;
			background: #171b1f;
			color: var(--workduck-text);
			font: inherit;
			font-size: 12px;
			font-weight: 800;
		}

		.workduck-sidebar-resizer {
			display: none;
		}

		.workduck-main-pane {
			min-height: 100vh;
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
			border-bottom: 1px solid rgba(47, 63, 85, 0.9);
			background: rgba(16, 18, 15, 0.92);
			backdrop-filter: blur(12px);
		}

		.workduck-mobile-menu {
			height: 34px;
			padding: 0 12px;
			border: 1px solid rgba(251, 255, 98, 0.82);
			border-radius: 8px;
			background: rgba(251, 255, 98, 0.1);
			color: var(--workduck-yellow);
			font: inherit;
			font-size: 13px;
			font-weight: 800;
		}

		.workduck-mobile-title {
			min-width: 0;
			overflow: hidden;
			color: var(--workduck-yellow);
			font-weight: 800;
			text-overflow: ellipsis;
			white-space: nowrap;
		}

		.workduck-sidebar-backdrop {
			position: fixed;
			inset: 0;
			z-index: 20;
			display: block;
			border: 0;
			background: rgba(0, 0, 0, 0.5);
		}
	}
</style>
