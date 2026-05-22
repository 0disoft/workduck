<script lang="ts">
	import type { WorkduckMessages } from '$lib/i18n/workduck-message-contract';
	import type { WorkduckQueueProposal } from './queue-artifacts';

	interface Props {
		readonly proposal: WorkduckQueueProposal;
		readonly proposalPath: string | null;
		readonly messages: WorkduckMessages;
	}

	let { proposal, proposalPath, messages }: Props = $props();
</script>

<section class="workduck-queue-review" aria-label={messages.queue.proposalView}>
	<div class="workduck-queue-review-header">
		<div class="workduck-queue-file-details">
			<strong>{proposal.ref.label}</strong>
			{#if proposalPath !== null}
				<span>{proposalPath}</span>
			{/if}
		</div>
	</div>

	<div class="workduck-queue-review-tasks">
		<article class="workduck-queue-review-task">
			<header class="workduck-queue-review-task-header">
				<strong>{messages.common.question}</strong>
			</header>
			<p>{proposal.question}</p>
			<div class="workduck-queue-review-list">
				<span>{messages.common.summary}</span>
				<ul>
					<li>{proposal.summary}</li>
				</ul>
			</div>
		</article>

		{#each proposal.options as option (option.id)}
			<article class="workduck-queue-review-task">
				<header class="workduck-queue-review-task-header">
					<strong>{option.name}</strong>
					{#if proposal.recommendation?.optionId === option.id}
						<span class="workduck-queue-task-pill">{messages.common.recommended}</span>
					{/if}
				</header>
				<p>{option.summary}</p>

				{#if option.strengths.length > 0}
					<div class="workduck-queue-review-list">
						<span>{messages.common.strengths}</span>
						<ul>
							{#each option.strengths as strength}
								<li>{strength}</li>
							{/each}
						</ul>
					</div>
				{/if}

				{#if option.risks.length > 0}
					<div class="workduck-queue-review-list">
						<span>{messages.common.risks}</span>
						<ul>
							{#each option.risks as risk}
								<li>{risk}</li>
							{/each}
						</ul>
					</div>
				{/if}
			</article>
		{/each}

		{#if proposal.recommendation !== null}
			<article class="workduck-queue-review-task">
				<header class="workduck-queue-review-task-header">
					<strong>{messages.common.recommendation}</strong>
				</header>
				<p>{proposal.recommendation.reason}</p>
			</article>
		{/if}

		{#if proposal.nextWorkOrders.length > 0}
			<article class="workduck-queue-review-task">
				<header class="workduck-queue-review-task-header">
					<strong>{messages.queue.nextWorkOrders}</strong>
				</header>
				<div class="workduck-queue-review-list">
					<ul>
						{#each proposal.nextWorkOrders as task (task.id)}
							<li>{task.title}</li>
						{/each}
					</ul>
				</div>
			</article>
		{/if}
	</div>
</section>
