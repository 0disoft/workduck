<script lang="ts">
	import type { ComponentProps } from 'svelte';
	import ProjectBoardLanesBase from './ProjectBoardLanesBase.svelte';
	import ProjectRepositoryBatchActionCenter from './ProjectRepositoryBatchActionCenter.svelte';
	import './project-repository-batch.css';

	type Props = ComponentProps<typeof ProjectBoardLanesBase>;

	let props: Props = $props();
	let selectedRepositoryIds = $state<ReadonlySet<string>>(new Set());
	let selectionScopeId = $state<string | null>(null);
	let batchIsRunning = $state(false);

	let visibleRepositories = $derived(props.selectedRepositories);
	let selectedRepositories = $derived(
		visibleRepositories.filter((repository) => selectedRepositoryIds.has(repository.id))
	);

	$effect(() => {
		const groupId = props.selectedGroup?.id ?? null;

		if (batchIsRunning) {
			return;
		}

		if (selectionScopeId !== groupId) {
			selectionScopeId = groupId;
			selectedRepositoryIds = new Set();
			return;
		}

		const visibleIds = new Set(visibleRepositories.map((repository) => repository.id));
		const nextIds = new Set(
			[...selectedRepositoryIds].filter((repositoryId) => visibleIds.has(repositoryId))
		);

		if (nextIds.size !== selectedRepositoryIds.size) {
			selectedRepositoryIds = nextIds;
		}
	});

	function selectVisibleRepositories() {
		if (batchIsRunning) return;
		selectedRepositoryIds = new Set(visibleRepositories.map((repository) => repository.id));
	}

	function clearRepositorySelection() {
		if (batchIsRunning) return;
		selectedRepositoryIds = new Set();
	}

	function updateRepositorySelection(repositoryId: string, selected: boolean) {
		if (batchIsRunning) return;

		const nextIds = new Set(selectedRepositoryIds);

		if (selected) nextIds.add(repositoryId);
		else nextIds.delete(repositoryId);

		selectedRepositoryIds = nextIds;
	}
</script>

<div class="workduck-project-board-batch-layout">
	{#if props.selectedGroup !== null && visibleRepositories.length > 0}
		<ProjectRepositoryBatchActionCenter
			node={props.selectedGroup}
			{visibleRepositories}
			{selectedRepositories}
			projectMessages={props.projectMessages}
			languageId={props.languageId}
			getRepositoryOperation={props.getRepositoryOperation}
			isRepositoryBusy={props.isRepositoryBusy}
			canRunRemoteRepositoryGitAction={props.canRunRemoteRepositoryGitAction}
			onGitAction={props.onGitAction}
			onSelectVisible={selectVisibleRepositories}
			onClearSelection={clearRepositorySelection}
			onRepositorySelectionChange={updateRepositorySelection}
			onRunningChange={(running) => {
				batchIsRunning = running;
			}}
		/>
	{/if}

	<div
		class="workduck-project-board-batch-surface"
		inert={batchIsRunning}
		aria-busy={batchIsRunning}
	>
		<ProjectBoardLanesBase {...props} />
	</div>
</div>
