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
	import {
		validateWorkspacePath,
		type WorkspacePathValidationError
	} from './workspace-path';
	import { getWorkspacePathErrorMessage } from './workspace-path-messages';
	import { isWorkspaceUnlocked, subscribeWorkspaceUnlocks } from './workspace-unlock';
	import WorkspacePathRepairForm from './WorkspacePathRepairForm.svelte';
	import WorkspaceUnlockForm from './WorkspaceUnlockForm.svelte';

	interface Props {
		readonly children: Snippet;
	}

	const { children }: Props = $props();

	let registry = $state<WorkspaceRegistry>(createEmptyWorkspaceRegistry());
	let hasLoaded = $state(false);
	let unlockRevision = $state(0);
	let workspacePathError = $state<WorkspacePathValidationError | null>(null);
	let workspacePathCheckRevision = 0;

	let activeWorkspace = $derived(getActiveWorkspace(registry));
	let canUseActiveWorkspace = $derived(
		activeWorkspace !== null && unlockRevision >= 0 && isWorkspaceUnlocked(activeWorkspace)
	);
	let activeWorkspacePathCheckKey = $derived(
		activeWorkspace !== null && canUseActiveWorkspace
			? `${activeWorkspace.id}:${activeWorkspace.path}`
			: ''
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

	$effect(() => {
		const checkKey = activeWorkspacePathCheckKey;
		const workspace = activeWorkspace;
		const checkRevision = ++workspacePathCheckRevision;

		workspacePathError = null;

		if (checkKey.length === 0 || workspace === null || !canUseActiveWorkspace) {
			return;
		}

		void validateWorkspacePath(workspace.path).then((result) => {
			if (checkRevision !== workspacePathCheckRevision) {
				return;
			}

			if (result.ok || result.error === 'workspace-path-validation-unavailable') {
				workspacePathError = null;
				return;
			}

			workspacePathError = result.error;
		});
	});
</script>

{#if hasLoaded && activeWorkspace === null}
	<p class="workduck-empty-state">Add a workspace in Settings.</p>
{:else if activeWorkspace !== null && !canUseActiveWorkspace}
	<section class="workduck-lock-panel" aria-label="Workspace locked">
		<h2 class="workduck-section-title">Workspace locked</h2>
		<WorkspaceUnlockForm workspace={activeWorkspace} />
	</section>
{:else if activeWorkspace !== null && workspacePathError !== null}
	<section class="workduck-lock-panel" aria-label="Workspace folder unavailable">
		<h2 class="workduck-section-title">Workspace folder unavailable</h2>
		<p class="workduck-empty-state">{getWorkspacePathErrorMessage(workspacePathError)}</p>
		<WorkspacePathRepairForm
			workspace={activeWorkspace}
			onRepaired={() => (workspacePathError = null)}
		/>
	</section>
{:else}
	{@render children()}
{/if}
