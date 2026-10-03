import type { WorkspaceRecord } from '#lib/workspaces/workspace-registry.ts';
import { createQueuePanelController, type QueuePanelController } from './queue-panel-controller.svelte';

// Headless tests run the real controller with reactive props and normal effect cleanup.
export function createQueuePanelControllerHarness(initialWorkspace: WorkspaceRecord) {
	let workspace = $state(initialWorkspace);
	let controller!: QueuePanelController;
	const dispose = $effect.root(() => {
		controller = createQueuePanelController({ workspace: () => workspace, refreshSignal: () => 0 });
	});
	return {
		controller,
		setWorkspace(next: WorkspaceRecord) { workspace = next; },
		dispose
	};
}
