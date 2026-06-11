<script lang="ts">
	import type { WorkduckMessages } from '$lib/i18n/workduck-message-contract';
	import { styleProperties } from '$lib/ui/style-properties-action';
	import type { QueueContextMenuState } from './queue-panel-types';

	interface Props {
		readonly contextMenu: QueueContextMenuState;
		readonly messages: WorkduckMessages;
		readonly isWriting: boolean;
		contextMenuElement: HTMLElement | undefined;
		readonly onDelete: () => Promise<void>;
	}

	let {
		contextMenu,
		messages,
		isWriting,
		contextMenuElement = $bindable(),
		onDelete
	}: Props = $props();
</script>

<div
	class="workduck-context-menu"
	role="menu"
	aria-label={messages.queue.contextMenu}
	use:styleProperties={{ left: `${contextMenu.x}px`, top: `${contextMenu.y}px` }}
	bind:this={contextMenuElement}
>
	<button
		class="workduck-context-menu-item workduck-context-menu-item-danger"
		type="button"
		role="menuitem"
		disabled={isWriting}
		onclick={() => void onDelete()}
	>
		{messages.common.remove}
	</button>
</div>
