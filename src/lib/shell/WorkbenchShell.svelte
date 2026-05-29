<script lang="ts">
	import { page } from '$app/state';
	import { onMount, type Snippet } from 'svelte';
	import './workbench-shell.css';

	import { getWorkduckMessages } from '$lib/i18n/workduck-language';
	import {
		createAppearanceSettingsStyle,
		createDefaultAppearanceSettings,
		type AppearanceSettings
	} from '$lib/settings/appearance-settings';
	import {
		createDefaultSystemSettings,
		getWorkspaceIdleLockTimeoutMs,
		shouldShowWorkduckTrayIcon
	} from '$lib/settings/system-settings';
	import {
		applyAppearanceSettingsToBrowserDocument,
		readAppearanceSettingsFromBrowser,
		subscribeAppearanceSettings
	} from '$lib/settings/appearance-storage';
	import {
		readSystemSettingsFromBrowser,
		subscribeSystemSettings
	} from '$lib/settings/system-storage';
	import { clearEnvironmentVaultSession } from '$lib/environment/environment-vault-session';
	import { readQueueArtifactExecutionState } from '$lib/queue/queue-artifacts';
	import { listQueueFiles, readQueueFile } from '$lib/queue/queue-folder';
	import { subscribeQueueFilesChanged } from '$lib/queue/queue-read-state';
	import { syncWorkduckTrayIconEnabled } from '$lib/system/tray';
	import {
		checkForWorkduckUpdate,
		installPendingWorkduckUpdate,
		type WorkduckAvailableUpdate
	} from '$lib/system/app-updater';
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
		isWorkspaceUnlocked,
		lockIdleWorkspaceSessions,
		subscribeWorkspaceUnlocks,
		touchWorkspaceUnlockSessions,
		workspaceRequiresUnlock
	} from '$lib/workspaces/workspace-unlock';
	import WorkspaceUnlockForm from '$lib/workspaces/WorkspaceUnlockForm.svelte';

	import WorkduckMark from '$lib/brand/WorkduckMark.svelte';

	import {
		startAppOperation,
		subscribeAppOperation,
		type WorkduckAppOperation
	} from './app-operation';
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
		initializeTauriWindowState,
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
		{ href: '/', labelKey: 'projects', requiresWorkspace: true },
		{ href: '/queue', labelKey: 'queue', requiresWorkspace: true },
		{ href: '/references', labelKey: 'references', requiresWorkspace: true },
		{ href: '/agents', labelKey: 'agents', requiresWorkspace: true },
		{ href: '/personas', labelKey: 'personas', requiresWorkspace: true },
		{ href: '/environment', labelKey: 'environment', requiresWorkspace: true }
	] as const;
	type PrimaryNavigationItem = (typeof primaryNavigationItems)[number];
	const settingsNavigationItem = { href: '/settings', labelKey: 'settings' } as const;
	const QUEUE_PENDING_REFRESH_INTERVAL_MS = 5_000;
	const QUEUE_PENDING_REFRESH_DEFER_MS = 250;
	const WORKDUCK_UPDATE_REFRESH_INTERVAL_MS = 6 * 60 * 60 * 1000;
	const workspaceMenuId = 'workduck-workspace-menu';
	const primaryNavigationUnavailableDescriptionId =
		'workduck-primary-navigation-unavailable-description';
	const workduckVersionLabel = `v${__WORKDUCK_VERSION__}`;

	let sidebarWidthPx = $state(SIDEBAR_DEFAULT_WIDTH_PX);
	let isDesktop = $state(true);
	let isSidebarOpen = $state(false);
	let isDragging = $state(false);
	let workspaceRegistry = $state<WorkspaceRegistry>(createEmptyWorkspaceRegistry());
	let appearanceSettings = $state<AppearanceSettings>(createDefaultAppearanceSettings());
	let activeAppOperation = $state<WorkduckAppOperation | null>(null);
	let availableWorkduckUpdate = $state<WorkduckAvailableUpdate | null>(null);
	let updateInstallError = $state<string | null>(null);
	let dismissedWorkduckUpdateVersion = $state<string | null>(null);
	let isUpdateChecking = $state(false);
	let isUpdateInstalling = $state(false);
	let lastWorkduckUpdateCheckAt = 0;
	let isWorkspaceMenuOpen = $state(false);
	let workspaceUnlockId = $state<string | null>(null);
	let workspaceUnlockRevision = $state(0);
	let workspaceSwitchError = $state<string | null>(null);
	let queuePendingCount = $state(0);
	let queuePendingRefreshSequence = 0;
	let queuedPendingRefreshTimeoutId: number | undefined;
	let resizePointerId: number | undefined;
	let resizeStartX = 0;
	let resizeStartWidthPx = SIDEBAR_DEFAULT_WIDTH_PX;
	let workspaceSwitcherElement: HTMLElement | undefined;
	let titlebarDragElement: HTMLElement | undefined;
	let titlebarDragPointerId: number | undefined;
	let titlebarDragStartX = 0;
	let titlebarDragStartY = 0;

	let activeWorkspace = $derived(getActiveWorkspace(workspaceRegistry));
	let messages = $derived(getWorkduckMessages(appearanceSettings.languageId));
	let hasWorkspaceChoices = $derived(workspaceRegistry.workspaces.length > 0);
	let activeWorkspaceIsUsable = $derived(
		activeWorkspace !== null &&
			workspaceUnlockRevision >= 0 &&
			isWorkspaceUnlocked(activeWorkspace)
	);
	let activeWorkspaceName = $derived(activeWorkspace?.name ?? messages.navigation.noWorkspace);
	let appIsLocked = $derived(activeAppOperation !== null);
	let workspaceUnavailableMessage = $derived(
		hasWorkspaceChoices
			? messages.navigation.unlockActiveWorkspace
			: messages.navigation.addWorkspaceFirst
	);
	let navigationUnavailableMessage = $derived(
		appIsLocked ? messages.navigation.waitForOperation : workspaceUnavailableMessage
	);
	let appearanceSettingsStyle = $derived(createAppearanceSettingsStyle(appearanceSettings));

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
		if (appIsLocked || !isDesktop || event.button !== 0) {
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
		if (appIsLocked || !isDesktop) {
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
		if (appIsLocked) {
			return;
		}

		if (!isDesktop) {
			isSidebarOpen = false;
		}
	}

	function getAvailableUpdateLabel() {
		return messages.updater.available.replace(
			'{version}',
			availableWorkduckUpdate?.version ?? ''
		);
	}

	async function checkForAvailableWorkduckUpdate(isMounted: () => boolean) {
		if (isUpdateChecking || isUpdateInstalling || availableWorkduckUpdate !== null) {
			return;
		}

		const now = Date.now();
		if (
			lastWorkduckUpdateCheckAt > 0 &&
			now - lastWorkduckUpdateCheckAt < WORKDUCK_UPDATE_REFRESH_INTERVAL_MS
		) {
			return;
		}

		lastWorkduckUpdateCheckAt = now;
		isUpdateChecking = true;
		try {
			const update = await checkForWorkduckUpdate();

			if (!isMounted()) {
				return;
			}

			if (update === null) {
				availableWorkduckUpdate = null;
				dismissedWorkduckUpdateVersion = null;
				return;
			}

			if (update.version === dismissedWorkduckUpdateVersion) {
				return;
			}

			availableWorkduckUpdate = update;
			updateInstallError = null;
		} catch (error) {
			if (isMounted()) {
				console.warn('Workduck update check failed.', error);
			}
		} finally {
			if (isMounted()) {
				isUpdateChecking = false;
			}
		}
	}

	async function handleInstallWorkduckUpdate() {
		if (availableWorkduckUpdate === null || isUpdateInstalling) {
			return;
		}

		isUpdateInstalling = true;
		updateInstallError = null;
		const operation = startAppOperation({
			label: messages.updater.installing,
			detail: messages.updater.installingDetail
		});

		try {
			await installPendingWorkduckUpdate(() => undefined);
		} catch (error) {
			console.warn('Workduck update install failed.', error);
			operation.finish();
			isUpdateInstalling = false;
			updateInstallError = messages.updater.installFailed;
		}
	}

	function canUsePrimaryNavigationItem(item: PrimaryNavigationItem) {
		return !appIsLocked && (!item.requiresWorkspace || activeWorkspaceIsUsable);
	}

	function getPrimaryNavigationClass(item: PrimaryNavigationItem) {
		const canUseNavigationItem = canUsePrimaryNavigationItem(item);

		return [
			'workduck-nav-link',
			canUseNavigationItem && page.url.pathname === item.href
				? 'workduck-nav-link-active'
				: '',
			canUseNavigationItem ? '' : 'workduck-nav-link-disabled'
		]
			.filter(Boolean)
			.join(' ');
	}

	function handlePrimaryNavigationClick(event: MouseEvent, item: PrimaryNavigationItem) {
		if (!canUsePrimaryNavigationItem(item)) {
			event.preventDefault();
			return;
		}

		closeSidebarOnMobile();
	}

	async function refreshQueuePendingCount() {
		const workspace = activeWorkspace;
		const sequence = ++queuePendingRefreshSequence;

		if (workspace === null || !activeWorkspaceIsUsable) {
			queuePendingCount = 0;
			return;
		}

		const result = await listQueueFiles(workspace.path);

		if (sequence !== queuePendingRefreshSequence) {
			return;
		}

		if (!result.ok) {
			queuePendingCount = 0;
			return;
		}

		const pendingResults = await Promise.all(
			result.files.map(async (file) => {
				if (file.kind === 'unsupported') {
					return false;
				}

				const readResult = await readQueueFile(workspace.path, file.relativePath);

				return (
					readResult.ok &&
					readQueueArtifactExecutionState(readResult.content) === 'pending'
				);
			})
		);

		if (sequence !== queuePendingRefreshSequence) {
			return;
		}

		queuePendingCount = pendingResults.filter(Boolean).length;
	}

	function scheduleQueuePendingCountRefresh() {
		if (typeof window === 'undefined') {
			void refreshQueuePendingCount();
			return;
		}

		if (queuedPendingRefreshTimeoutId !== undefined) {
			window.clearTimeout(queuedPendingRefreshTimeoutId);
		}

		queuedPendingRefreshTimeoutId = window.setTimeout(() => {
			queuedPendingRefreshTimeoutId = undefined;
			void refreshQueuePendingCount();
		}, QUEUE_PENDING_REFRESH_DEFER_MS);
	}

	function getPrimaryNavigationAriaLabel(item: PrimaryNavigationItem) {
		const label = messages.navigation[item.labelKey];

		if (item.labelKey !== 'queue' || queuePendingCount === 0) {
			return label;
		}

		return `${label}, ${messages.queue.pendingCountLabel.replace(
			'{count}',
			queuePendingCount.toString()
		)}`;
	}

	function getQueuePendingBadgeLabel() {
		return queuePendingCount > 99 ? '99+' : queuePendingCount.toString();
	}

	function toggleWorkspaceMenu() {
		if (appIsLocked || !hasWorkspaceChoices) {
			return;
		}

		workspaceSwitchError = null;
		workspaceUnlockId = null;
		isWorkspaceMenuOpen = !isWorkspaceMenuOpen;
	}

	function handleWorkspaceSwitch(workspaceId: string) {
		if (appIsLocked) {
			return;
		}

		workspaceSwitchError = null;
		const workspace = workspaceRegistry.workspaces.find((candidate) => candidate.id === workspaceId);

		if (workspace === undefined) {
			workspaceSwitchError = 'Workspace was not found.';
			return;
		}

		if (workspaceRequiresUnlock(workspace) && !isWorkspaceUnlocked(workspace)) {
			workspaceUnlockId = workspace.id;
			return;
		}

		switchWorkspaceById(workspaceId);
	}

	function switchWorkspaceById(workspaceId: string) {
		if (appIsLocked) {
			return;
		}

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
		workspaceUnlockId = null;
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
		workspaceUnlockId = null;
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

	$effect(() => {
		const workspace = activeWorkspace;
		const canUseWorkspace = activeWorkspaceIsUsable;

		if (workspace === null || !canUseWorkspace) {
			queuePendingCount = 0;
			return;
		}

		scheduleQueuePendingCountRefresh();
	});

	onMount(() => {
		let storedSidebarWidth: string | null = null;
		let currentSystemSettings = createDefaultSystemSettings();

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
		appearanceSettings = readAppearanceSettingsFromBrowser().settings;
		applyAppearanceSettingsToBrowserDocument(appearanceSettings);
		currentSystemSettings = readSystemSettingsFromBrowser().settings;
		void syncWorkduckTrayIconEnabled(shouldShowWorkduckTrayIcon(currentSystemSettings));
		let disposeWindowState: (() => void) | undefined;
		let shellIsMounted = true;
		void checkForAvailableWorkduckUpdate(() => shellIsMounted);
		void initializeTauriWindowState().then((dispose) => {
			if (shellIsMounted) {
				disposeWindowState = dispose;
				return;
			}

			dispose();
		});
		const unsubscribeAppearanceSettings = subscribeAppearanceSettings((nextSettings) => {
			appearanceSettings = nextSettings;
			applyAppearanceSettingsToBrowserDocument(nextSettings);
		});
		const unsubscribeSystemSettings = subscribeSystemSettings((nextSettings) => {
			currentSystemSettings = nextSettings;
			void syncWorkduckTrayIconEnabled(shouldShowWorkduckTrayIcon(nextSettings));
		});
		const unsubscribeAppOperation = subscribeAppOperation((nextOperation) => {
			activeAppOperation = nextOperation;
		});
		workspaceRegistry = readWorkspaceRegistryFromBrowser().registry;
		const unsubscribeWorkspaceRegistry = subscribeWorkspaceRegistry((nextRegistry) => {
			workspaceRegistry = nextRegistry;
		});
		const unsubscribeWorkspaceUnlocks = subscribeWorkspaceUnlocks(() => {
			workspaceUnlockRevision += 1;
			for (const workspace of workspaceRegistry.workspaces) {
				if (workspaceRequiresUnlock(workspace) && !isWorkspaceUnlocked(workspace)) {
					clearEnvironmentVaultSession(workspace.id);
				}
			}
		});
		const unsubscribeQueueFiles = subscribeQueueFilesChanged((workspaceId) => {
			if (activeWorkspace?.id !== workspaceId) {
				return;
			}

			void refreshQueuePendingCount();
		});
		const recordUserActivity = () => {
			touchWorkspaceUnlockSessions();
		};
		const lockIdleSessions = () => {
			const idleTimeoutMs = getWorkspaceIdleLockTimeoutMs(currentSystemSettings);

			if (idleTimeoutMs === null) {
				return;
			}

			for (const lockedWorkspaceId of lockIdleWorkspaceSessions(idleTimeoutMs)) {
				clearEnvironmentVaultSession(lockedWorkspaceId);
			}
		};
		const idleLockIntervalId = window.setInterval(lockIdleSessions, 15_000);
		const queuePendingRefreshIntervalId = window.setInterval(
			() => void refreshQueuePendingCount(),
			QUEUE_PENDING_REFRESH_INTERVAL_MS
		);
		const refreshWorkduckUpdate = () => void checkForAvailableWorkduckUpdate(() => shellIsMounted);
		const updateRefreshIntervalId = window.setInterval(
			refreshWorkduckUpdate,
			WORKDUCK_UPDATE_REFRESH_INTERVAL_MS
		);
		const handleWindowFocus = () => {
			recordUserActivity();
			refreshWorkduckUpdate();
		};

		window.addEventListener('pointerdown', recordUserActivity, true);
		window.addEventListener('keydown', recordUserActivity, true);
		window.addEventListener('wheel', recordUserActivity, { passive: true, capture: true });
		window.addEventListener('focus', handleWindowFocus);

		return () => {
			shellIsMounted = false;
			disposeWindowState?.();
			unsubscribeAppearanceSettings();
			unsubscribeSystemSettings();
			unsubscribeAppOperation();
			unsubscribeWorkspaceRegistry();
			unsubscribeWorkspaceUnlocks();
			unsubscribeQueueFiles();
			window.clearInterval(idleLockIntervalId);
			window.clearInterval(queuePendingRefreshIntervalId);
			window.clearInterval(updateRefreshIntervalId);
			if (queuedPendingRefreshTimeoutId !== undefined) {
				window.clearTimeout(queuedPendingRefreshTimeoutId);
				queuedPendingRefreshTimeoutId = undefined;
			}
			window.removeEventListener('pointerdown', recordUserActivity, true);
			window.removeEventListener('keydown', recordUserActivity, true);
			window.removeEventListener('wheel', recordUserActivity, true);
			window.removeEventListener('focus', handleWindowFocus);
			cancelTitlebarDragTracking();
			cancelResize();
			mediaQuery.removeEventListener('change', handleMediaChange);
		};
	});

</script>

<div class="workduck-window-frame" style={appearanceSettingsStyle}>
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<header
		class="workduck-titlebar"
		onpointerdown={handleTitlebarPointerDown}
		ondblclick={handleTitlebarDoubleClick}
	>
		<div class="workduck-titlebar-brand">
			<span class="workduck-titlebar-mark" aria-hidden="true">
				<WorkduckMark />
			</span>
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

		<aside
			class={isSidebarOpen ? 'workduck-sidebar workduck-sidebar-open' : 'workduck-sidebar'}
			inert={appIsLocked}
		>
			<div class="workduck-sidebar-header">
				<a class="workduck-brand" href="/" onclick={closeSidebarOnMobile}>
					<span class="workduck-brand-mark" aria-hidden="true">
						<WorkduckMark />
					</span>
					<span class="workduck-brand-copy">
						<span class="workduck-brand-name">Workduck</span>
						<span class="workduck-brand-version" aria-label={`Workduck ${workduckVersionLabel}`}>
							{workduckVersionLabel}
						</span>
					</span>
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
					aria-disabled={!hasWorkspaceChoices || appIsLocked}
					onclick={toggleWorkspaceMenu}
				>
					<span class="workduck-workspace-trigger-text">{activeWorkspaceName}</span>
					<span class="workduck-workspace-trigger-caret" aria-hidden="true"></span>
				</button>

				{#if isWorkspaceMenuOpen}
					<div id={workspaceMenuId} class="workduck-workspace-menu" role="menu">
						{#each workspaceRegistry.workspaces as workspace (workspace.id)}
							<div class="workduck-workspace-menu-entry" role="none">
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
									{#if workspaceRequiresUnlock(workspace) && !isWorkspaceUnlocked(workspace)}
										<span class="workduck-workspace-menu-lock">Locked</span>
									{/if}
								</button>

								{#if workspaceUnlockId === workspace.id}
									<WorkspaceUnlockForm
										workspace={workspace}
										onUnlocked={() => switchWorkspaceById(workspace.id)}
										onCancel={() => (workspaceUnlockId = null)}
									/>
								{/if}
							</div>
						{/each}

						{#if workspaceSwitchError !== null}
							<p class="workduck-workspace-menu-error" aria-live="polite">{workspaceSwitchError}</p>
						{/if}
					</div>
				{/if}
			</div>

			<nav class="workduck-sidebar-nav" aria-label={messages.navigation.primary}>
					{#if appIsLocked || !activeWorkspaceIsUsable}
						<span id={primaryNavigationUnavailableDescriptionId} class="workduck-sr-only">
							{navigationUnavailableMessage}
						</span>
					{:else if !activeWorkspaceIsUsable}
						<span id={primaryNavigationUnavailableDescriptionId} class="workduck-sr-only">
							{navigationUnavailableMessage}
						</span>
					{/if}
				{#each primaryNavigationItems as item}
					<a
						class={getPrimaryNavigationClass(item)}
						href={item.href}
						aria-current={canUsePrimaryNavigationItem(item) && page.url.pathname === item.href
							? 'page'
							: undefined}
						aria-disabled={!canUsePrimaryNavigationItem(item)}
						aria-describedby={canUsePrimaryNavigationItem(item)
							? undefined
							: primaryNavigationUnavailableDescriptionId}
						aria-label={getPrimaryNavigationAriaLabel(item)}
						data-tooltip={canUsePrimaryNavigationItem(item)
							? messages.navigation[item.labelKey]
							: navigationUnavailableMessage}
						onclick={(event) => handlePrimaryNavigationClick(event, item)}
					>
						<span class="workduck-nav-dot"></span>
						<span class="workduck-nav-label">{messages.navigation[item.labelKey]}</span>
						{#if item.labelKey === 'queue' && queuePendingCount > 0}
							<span class="workduck-nav-badge" aria-hidden="true">
								{getQueuePendingBadgeLabel()}
							</span>
						{/if}
					</a>
				{/each}
			</nav>

			<nav class="workduck-sidebar-footer" aria-label={messages.navigation.settingsArea}>
				<a
					class={page.url.pathname === settingsNavigationItem.href && !appIsLocked
						? 'workduck-nav-link workduck-nav-link-active'
						: appIsLocked
							? 'workduck-nav-link workduck-nav-link-disabled'
							: 'workduck-nav-link'}
					href={settingsNavigationItem.href}
					aria-current={page.url.pathname === settingsNavigationItem.href && !appIsLocked
						? 'page'
						: undefined}
					aria-disabled={appIsLocked}
					aria-label={messages.navigation[settingsNavigationItem.labelKey]}
					data-tooltip={messages.navigation[settingsNavigationItem.labelKey]}
					onclick={(event) => {
						if (appIsLocked) {
							event.preventDefault();
							return;
						}

						closeSidebarOnMobile();
					}}
				>
					<span class="workduck-nav-dot"></span>
					<span class="workduck-nav-label">{messages.navigation[settingsNavigationItem.labelKey]}</span>
				</a>
			</nav>
		</aside>

		<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
		<div
			class="workduck-sidebar-resizer"
			inert={appIsLocked}
			role="separator"
			aria-label={messages.navigation.resizeSidebar}
			aria-orientation="vertical"
			aria-valuemin={SIDEBAR_MIN_WIDTH_PX}
			aria-valuemax={SIDEBAR_MAX_WIDTH_PX}
			aria-valuenow={sidebarWidthPx}
			tabindex={isDesktop && !appIsLocked ? 0 : -1}
			onpointerdown={handleResizePointerDown}
			onkeydown={handleResizeKeydown}
		>
			<span class="workduck-sidebar-resizer-line"></span>
		</div>

		<section class="workduck-main-pane" inert={appIsLocked}>
			<div class="workduck-mobile-bar">
				<button
					class="workduck-mobile-menu"
					type="button"
					aria-label="Open sidebar"
					disabled={appIsLocked}
					onclick={() => (isSidebarOpen = true)}
				>
					Menu
				</button>
				<span class="workduck-mobile-title">Workduck</span>
			</div>

			{@render children()}
		</section>

		{#if activeAppOperation !== null}
			<div
				class="workduck-operation-overlay"
				role="status"
				aria-live="polite"
				aria-atomic="true"
			>
				<div class="workduck-operation-panel">
					<span class="workduck-operation-title">{activeAppOperation.label}</span>
					{#if activeAppOperation.detail.length > 0}
						<span class="workduck-operation-detail">{activeAppOperation.detail}</span>
					{/if}
					<div
						class="workduck-operation-progress"
						role="progressbar"
						aria-label={activeAppOperation.label}
					>
						<span class="workduck-operation-progress-fill"></span>
					</div>
				</div>
			</div>
		{/if}

		{#if availableWorkduckUpdate !== null && activeAppOperation === null}
			<div class="workduck-update-notice" role="status" aria-live="polite">
				<div class="workduck-update-copy">
					<span class="workduck-update-title">{getAvailableUpdateLabel()}</span>
					{#if updateInstallError !== null}
						<span class="workduck-update-error">{updateInstallError}</span>
					{/if}
				</div>
				<div class="workduck-update-actions">
					<button
						class="workduck-update-action workduck-update-action-primary"
						type="button"
						disabled={isUpdateInstalling}
						onclick={() => void handleInstallWorkduckUpdate()}
					>
						{messages.updater.install}
					</button>
					<button
						class="workduck-update-action"
						type="button"
						disabled={isUpdateInstalling}
						onclick={() => {
							dismissedWorkduckUpdateVersion = availableWorkduckUpdate?.version ?? null;
							availableWorkduckUpdate = null;
							updateInstallError = null;
						}}
					>
						{messages.updater.dismiss}
					</button>
				</div>
			</div>
		{/if}
	</div>
</div>
