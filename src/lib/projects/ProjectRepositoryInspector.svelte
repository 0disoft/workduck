<script lang="ts">
	import type { ComponentProps } from 'svelte';
	import ProjectRepositoryCard from './ProjectRepositoryCard.svelte';

	type Props = ComponentProps<typeof ProjectRepositoryCard>;

	let { repository, repositoryGitStatus, ...cardProps }: Props = $props();
</script>

<aside class="workduck-project-repository-inspector" aria-label="Repository details">
	{#if repository.path !== null || repositoryGitStatus?.branch != null}
		<div class="workduck-repository-inspector-meta">
			{#if repository.path !== null}
				<span class="workduck-repository-inspector-path" title={repository.path}>
					{repository.path}
				</span>
			{/if}
			{#if repositoryGitStatus?.branch != null}
				<span class="workduck-repository-inspector-branch">{repositoryGitStatus.branch}</span>
			{/if}
		</div>
	{/if}
	<ProjectRepositoryCard {...cardProps} {repository} {repositoryGitStatus} />
</aside>
