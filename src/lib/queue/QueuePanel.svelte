<script lang="ts">
	import type { WorkspaceRecord } from '$lib/workspaces/workspace-registry';
	import './queue-panel.css';
	import {
		createQueuePanelController,
		type QueuePanelController
	} from './queue-panel-controller.svelte';
	import QueuePanelView from './QueuePanelView.svelte';

	interface Props {
		readonly workspace: WorkspaceRecord;
		readonly title: string;
		readonly refreshSignal?: number;
	}

	let { workspace, title, refreshSignal = 0 }: Props = $props();
	const controller: QueuePanelController = createQueuePanelController({
		workspace: () => workspace,
		refreshSignal: () => refreshSignal
	});
</script>

<QueuePanelView {title} {controller} />
