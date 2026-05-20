<script lang="ts">
	import { tick } from 'svelte';
	import { resolveContextMenuPosition } from './project-board-context-menu-position';
	import type { ProjectContextMenuState } from './project-board-types';

	interface Props {
		contextMenu: ProjectContextMenuState | null;
		readonly contextMenuElement: HTMLElement | undefined;
		readonly onClose: () => void;
	}

	let { contextMenu = $bindable(), contextMenuElement, onClose }: Props = $props();

	async function alignContextMenuToViewport(
		menuSnapshot: ProjectContextMenuState,
		menuElement: HTMLElement
	) {
		await tick();

		if (typeof window === 'undefined') {
			return;
		}

		if (contextMenu !== menuSnapshot || contextMenuElement !== menuElement) {
			return;
		}

		const nextPosition = resolveContextMenuPosition(
			menuSnapshot,
			menuElement.getBoundingClientRect(),
			window.innerWidth,
			window.innerHeight
		);

		if (nextPosition.x === menuSnapshot.x && nextPosition.y === menuSnapshot.y) {
			return;
		}

		contextMenu = {
			...menuSnapshot,
			...nextPosition
		};
	}

	$effect(() => {
		if (contextMenu === null || contextMenuElement === undefined) {
			return;
		}

		void alignContextMenuToViewport(contextMenu, contextMenuElement);
	});

	$effect(() => {
		if (contextMenu === null || typeof window === 'undefined') {
			return;
		}

		function handleGlobalPointerDown(event: PointerEvent) {
			if (
				contextMenuElement !== undefined &&
				event.target instanceof Node &&
				contextMenuElement.contains(event.target)
			) {
				return;
			}

			onClose();
		}

		window.addEventListener('pointerdown', handleGlobalPointerDown);

		return () => {
			window.removeEventListener('pointerdown', handleGlobalPointerDown);
		};
	});
</script>
