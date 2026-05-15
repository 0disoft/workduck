<script lang="ts">
	import { onMount } from 'svelte';

	import type { WorkspaceRecord } from '$lib/workspaces/workspace-registry';

	import {
		createDefaultReportReviews,
		createQueueWorkOrderFileName,
		createQueueWorkOrderFromReportReview,
		parseQueueResultReport,
		parseQueueWorkOrder,
		serializeQueueArtifact,
		type QueueReportTaskReview,
		type WorkduckQueueResultReport,
		type WorkduckQueueWorkOrder,
		type WorkduckQueueReviewDecision
	} from './queue-artifacts';
	import {
		ensureQueueFolder,
		getQueueFolderErrorMessage,
		listQueueFiles,
		readQueueFile,
		writeQueueWorkOrderFile,
		type QueueFileEntry,
		type QueueFolderError
	} from './queue-folder';

	interface Props {
		readonly workspace: WorkspaceRecord;
		readonly refreshSignal?: number;
	}

	const QUEUE_AUTO_REFRESH_INTERVAL_MS = 30_000;

	const reviewDecisionOptions = [
		{ value: 'approved', label: 'Approve' },
		{ value: 'needs-work', label: 'Needs work' },
		{ value: 'rollback', label: 'Rollback' }
	] as const satisfies readonly {
		readonly value: Exclude<WorkduckQueueReviewDecision, 'pending'>;
		readonly label: string;
	}[];

	let { workspace, refreshSignal = 0 }: Props = $props();

	let files = $state<readonly QueueFileEntry[]>([]);
	let error = $state<QueueFolderError | null>(null);
	let parseError = $state<string | null>(null);
	let status = $state<string | null>(null);
	let selectedReport = $state<WorkduckQueueResultReport | null>(null);
	let selectedReportPath = $state<string | null>(null);
	let selectedWorkOrder = $state<WorkduckQueueWorkOrder | null>(null);
	let selectedWorkOrderPath = $state<string | null>(null);
	let reviews = $state<readonly QueueReportTaskReview[]>([]);
	let isRefreshing = $state(false);
	let isReading = $state(false);
	let isWriting = $state(false);
	let ensureSignature = $state('');
	let refreshSignature = $state(0);
	let followUpTaskCount = $derived(
		reviews.filter((review) => review.decision === 'needs-work' || review.decision === 'rollback')
			.length
	);

	onMount(() => {
		const intervalId = window.setInterval(() => {
			void refreshQueueFiles({ silent: true });
		}, QUEUE_AUTO_REFRESH_INTERVAL_MS);

		return () => window.clearInterval(intervalId);
	});

	$effect(() => {
		const nextSignature = `${workspace.id}:${workspace.path}`;

		if (ensureSignature === nextSignature) {
			return;
		}

		ensureSignature = nextSignature;
		files = [];
		error = null;
		parseError = null;
		status = null;
		selectedReport = null;
		selectedReportPath = null;
		selectedWorkOrder = null;
		selectedWorkOrderPath = null;
		reviews = [];
		void ensureQueueFolderForWorkspace();
	});

	$effect(() => {
		if (refreshSignature === refreshSignal) {
			return;
		}

		refreshSignature = refreshSignal;
		void refreshQueueFiles();
	});

	async function ensureQueueFolderForWorkspace() {
		const result = await ensureQueueFolder(workspace.path);

		if (result.ok) {
			error = null;
			await refreshQueueFiles({ silent: true });
			return;
		}

		error = result.error;
		status = null;
	}

	async function refreshQueueFiles(options: { readonly silent?: boolean } = {}) {
		if (isRefreshing) {
			return;
		}

		isRefreshing = true;
		error = null;
		status = null;

		try {
			const result = await listQueueFiles(workspace.path);

			if (result.ok) {
				files = result.files;
				if (!options.silent) {
					status = null;
				}
				return;
			}

			error = result.error;
		} finally {
			isRefreshing = false;
		}
	}

	async function handleReviewReport(file: QueueFileEntry) {
		if (isReading) {
			return;
		}

		isReading = true;
		error = null;
		parseError = null;
		status = null;
		selectedReport = null;
		selectedReportPath = null;
		selectedWorkOrder = null;
		selectedWorkOrderPath = null;
		reviews = [];

		try {
			const result = await readQueueFile(workspace.path, file.relativePath);

			if (!result.ok) {
				error = result.error;
				return;
			}

			const parsed = parseQueueResultReport(result.content);

			if (!parsed.ok) {
				parseError = parsed.message;
				return;
			}

			selectedReport = parsed.report;
			selectedReportPath = result.relativePath;
			reviews = createDefaultReportReviews(parsed.report);
		} finally {
			isReading = false;
		}
	}

	async function handleViewWorkOrder(file: QueueFileEntry) {
		if (isReading) {
			return;
		}

		isReading = true;
		error = null;
		parseError = null;
		status = null;
		selectedReport = null;
		selectedReportPath = null;
		selectedWorkOrder = null;
		selectedWorkOrderPath = null;
		reviews = [];

		try {
			const result = await readQueueFile(workspace.path, file.relativePath);

			if (!result.ok) {
				error = result.error;
				return;
			}

			const parsed = parseQueueWorkOrder(result.content);

			if (!parsed.ok) {
				parseError = parsed.message;
				return;
			}

			selectedWorkOrder = parsed.workOrder;
			selectedWorkOrderPath = result.relativePath;
		} finally {
			isReading = false;
		}
	}

	function updateReviewDecision(taskId: string, decision: Exclude<WorkduckQueueReviewDecision, 'pending'>) {
		reviews = reviews.map((review) =>
			review.taskId === taskId
				? {
						...review,
						decision,
						comment: decision === 'approved' ? '' : review.comment
					}
				: review
		);
	}

	function updateReviewComment(taskId: string, comment: string) {
		reviews = reviews.map((review) =>
			review.taskId === taskId
				? {
						...review,
						comment
					}
				: review
		);
	}

	async function handleCreateWorkOrder() {
		if (selectedReport === null || isWriting) {
			return;
		}

		const workOrder = createQueueWorkOrderFromReportReview(selectedReport, reviews);

		if (workOrder.tasks.length === 0) {
			status = 'No follow-up selected.';
			return;
		}

		isWriting = true;
		error = null;
		status = null;

		try {
			const result = await writeQueueWorkOrderFile(
				workspace.path,
				createQueueWorkOrderFileName(selectedReport),
				serializeQueueArtifact(workOrder)
			);

			if (result.ok) {
				status = `Created ${result.relativePath}.`;
				await refreshQueueFiles({ silent: true });
				return;
			}

			error = result.error;
		} finally {
			isWriting = false;
		}
	}

	function getFileKindLabel(kind: QueueFileEntry['kind']) {
		switch (kind) {
			case 'result-report':
				return 'Report JSON';
			case 'work-order':
				return 'Work order';
		}
	}
</script>

<section class="workduck-queue-panel" aria-label="Queue">
	{#if error !== null}
		<p class="workduck-inline-error" aria-live="polite">{getQueueFolderErrorMessage(error)}</p>
	{:else if parseError !== null}
		<p class="workduck-inline-error" aria-live="polite">{parseError}</p>
	{:else if status !== null}
		<p class="workduck-inline-status" aria-live="polite">{status}</p>
	{/if}

	<div class="workduck-queue-layout">
		<section class="workduck-queue-list" aria-label="Queue files">
			{#if files.length === 0}
				<p class="workduck-empty-state">Add report or work-order files.</p>
			{:else}
				{#each files as file (file.relativePath)}
					<article class="workduck-queue-file">
						<div class="workduck-queue-file-details">
							<strong>{file.fileName}</strong>
							<span>{getFileKindLabel(file.kind)}</span>
						</div>
						<div class="workduck-queue-file-actions">
							{#if file.kind === 'result-report'}
								<button
									class="workduck-repository-action-button"
									type="button"
									disabled={isReading}
									onclick={() => handleReviewReport(file)}
								>
									Review
								</button>
							{:else}
								<button
									class="workduck-repository-action-button"
									type="button"
									disabled={isReading}
									onclick={() => handleViewWorkOrder(file)}
								>
									View
								</button>
							{/if}
						</div>
					</article>
				{/each}
			{/if}
		</section>

		{#if selectedReport !== null}
			<section class="workduck-queue-review" aria-label="Result report review">
				<div class="workduck-queue-review-header">
					<div class="workduck-queue-file-details">
						<strong>{selectedReport.ref.label}</strong>
						{#if selectedReportPath !== null}
							<span>{selectedReportPath}</span>
						{/if}
					</div>
					<button
						class="workduck-button workduck-button-primary"
						type="button"
						disabled={isWriting || followUpTaskCount === 0}
						onclick={handleCreateWorkOrder}
					>
						{isWriting ? 'Creating' : 'Create work order'}
					</button>
				</div>

				<div class="workduck-queue-review-tasks">
					{#each selectedReport.tasks as task (task.id)}
						{@const review = reviews.find((item) => item.taskId === task.id)}
						<article class="workduck-queue-review-task">
							<header class="workduck-queue-review-task-header">
								<strong>{task.title}</strong>
							</header>
							<p>{task.summary}</p>

							{#if task.filesChanged.length > 0}
								<div class="workduck-queue-review-list">
									<span>Files</span>
									<ul>
										{#each task.filesChanged as file}
											<li>{file}</li>
										{/each}
									</ul>
								</div>
							{/if}

							{#if task.verification.length > 0}
								<div class="workduck-queue-review-list">
									<span>Checks</span>
									<ul>
										{#each task.verification as check}
											<li>{check}</li>
										{/each}
									</ul>
								</div>
							{/if}

							{#if task.risks.length > 0}
								<div class="workduck-queue-review-list">
									<span>Risks</span>
									<ul>
										{#each task.risks as risk}
											<li>{risk}</li>
										{/each}
									</ul>
								</div>
							{/if}

							<div class="workduck-queue-review-decisions">
								{#each reviewDecisionOptions as option}
									<label>
										<input
											type="radio"
											name={`review-${task.id}`}
											checked={review?.decision === option.value}
											onchange={() => updateReviewDecision(task.id, option.value)}
										/>
										<span>{option.label}</span>
									</label>
								{/each}
							</div>

							{#if review?.decision === 'needs-work' || review?.decision === 'rollback'}
								<label class="workduck-form-field">
									Comment
									<textarea
										class="workduck-input workduck-project-description-input"
										value={review.comment}
										oninput={(event) =>
											updateReviewComment(task.id, event.currentTarget.value)}
									></textarea>
								</label>
							{/if}
						</article>
					{/each}
				</div>
			</section>
		{:else if selectedWorkOrder !== null}
			<section class="workduck-queue-review" aria-label="Work order view">
				<div class="workduck-queue-review-header">
					<div class="workduck-queue-file-details">
						<strong>{selectedWorkOrder.ref.label}</strong>
						{#if selectedWorkOrderPath !== null}
							<span>{selectedWorkOrderPath}</span>
						{/if}
					</div>
				</div>

				<div class="workduck-queue-review-tasks">
					{#each selectedWorkOrder.tasks as task (task.id)}
						<article class="workduck-queue-review-task">
							<header class="workduck-queue-review-task-header">
								<strong>{task.title}</strong>
								{#if task.decision !== undefined}
									<span class="workduck-queue-task-pill">{task.decision}</span>
								{/if}
							</header>
							<p>{task.body}</p>

							{#if task.sourceReportTaskId !== undefined}
								<div class="workduck-queue-review-list">
									<span>Source</span>
									<ul>
										<li>{task.sourceReportTaskId}</li>
									</ul>
								</div>
							{/if}
						</article>
					{/each}
				</div>
			</section>
		{/if}
	</div>
</section>
