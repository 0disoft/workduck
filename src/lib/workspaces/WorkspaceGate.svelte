<script lang="ts">
	import { onMount, type Snippet } from 'svelte';

	import {
		createEmptyWorkspaceRegistry,
		getActiveWorkspace,
		type WorkspaceRegistry
	} from './workspace-registry';
	import {
		readWorkspaceRegistryFromBrowser,
		subscribeWorkspaceRegistry
	} from './workspace-storage';
	import { isWorkspaceUnlocked, subscribeWorkspaceUnlocks } from './workspace-unlock';
	import WorkspaceUnlockForm from './WorkspaceUnlockForm.svelte';

	interface Props {
		readonly children: Snippet;
	}

	const { children }: Props = $props();

	let registry = $state<WorkspaceRegistry>(createEmptyWorkspaceRegistry());
	let hasLoaded = $state(false);
	let unlockRevision = $state(0);

	let activeWorkspace = $derived(getActiveWorkspace(registry));
	let canUseActiveWorkspace = $derived(
		activeWorkspace !== null && unlockRevision >= 0 && isWorkspaceUnlocked(activeWorkspace)
	);

	onMount(() => {
		registry = readWorkspaceRegistryFromBrowser().registry;
		const unsubscribeWorkspaceRegistry = subscribeWorkspaceRegistry((nextRegistry) => {
			registry = nextRegistry;
		});
		const unsubscribeWorkspaceUnlocks = subscribeWorkspaceUnlocks(() => {
			unlockRevision += 1;
		});

		hasLoaded = true;

		return () => {
			unsubscribeWorkspaceRegistry();
			unsubscribeWorkspaceUnlocks();
		};
	});
</script>

{#if hasLoaded && activeWorkspace === null}
	<p class="workduck-empty-state">Add a workspace in Settings.</p>
{:else if activeWorkspace !== null && !canUseActiveWorkspace}
	<section class="workduck-lock-panel" aria-label="Workspace locked">
		<h2 class="workduck-section-title">Workspace locked</h2>
		<WorkspaceUnlockForm workspace={activeWorkspace} />
	</section>
{:else}
	{@render children()}
{/if}
