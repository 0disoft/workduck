<script lang="ts">
	import type { AgentRecord } from '$lib/agents/agent-registry';
	import type { WorkduckMessages } from '$lib/i18n/workduck-message-contract';
	import type { ProjectNodeRecord } from '$lib/projects/project-registry';
	import type { ReferenceRecord } from '$lib/references/reference-registry';
	import type { WorkduckSkillRecord } from '$lib/skills/skill-registry';
	import { modalDialog } from '$lib/ui/modal-dialog-action';
	import {
		queueResponseFormats,
		queueResponseLanguages,
		queueWorkPriorities,
		type WorkduckQueueResponseFormat,
		type WorkduckQueueResponseLanguage,
		type WorkduckQueueWorkPriority
	} from './queue-artifacts';
	import type { WorkduckQueueTaskKind } from './queue-voting';
	import {
		manualRevisionOptionGroups,
		manualRevisionOptions,
		type ManualRevisionOptionId,
		type ManualVoteOptionInput
	} from './queue-panel-types';

	interface Props {
		readonly messages: WorkduckMessages;
		readonly isWriting: boolean;
		readonly canSubmit: boolean;
		readonly title: string;
		readonly submitLabel: string;
		manualWorkOrderTitle: string;
		manualWorkOrderBody: string;
		manualWorkOrderPriority: WorkduckQueueWorkPriority;
		manualWorkOrderResponseLanguage: WorkduckQueueResponseLanguage;
		manualWorkOrderResponseFormat: WorkduckQueueResponseFormat;
		manualWorkOrderKind: WorkduckQueueTaskKind;
		manualVoteCriteriaInput: string;
		readonly manualVoteOptions: readonly ManualVoteOptionInput[];
		readonly allSkills: readonly WorkduckSkillRecord[];
		readonly allAgents: readonly AgentRecord[];
		readonly allProjects: readonly ProjectNodeRecord[];
		readonly allReferences: readonly ReferenceRecord[];
		readonly selectedManualSkillIds: readonly string[];
		readonly selectedManualAgentIds: readonly string[];
		readonly selectedManualProjectIds: readonly string[];
		readonly selectedManualReferenceIds: readonly string[];
		readonly selectedManualRevisionOptionIds: readonly string[];
		readonly showRevisionOptions: boolean;
		readonly manualWorkOrderSkillSummary: string;
		readonly manualWorkOrderAgentSummary: string;
		readonly manualWorkOrderProjectSummary: string;
		readonly manualWorkOrderReferenceSummary: string;
		readonly onClose: () => void;
		readonly onSubmit: (event: SubmitEvent) => Promise<void>;
		readonly onSkillToggle: (skillId: string, isSelected: boolean) => void;
		readonly onAgentToggle: (agentId: string, isSelected: boolean) => void;
		readonly onProjectToggle: (projectId: string, isSelected: boolean) => void;
		readonly onReferenceToggle: (referenceId: string, isSelected: boolean) => void;
		readonly onRevisionOptionToggle: (
			optionId: ManualRevisionOptionId,
			isSelected: boolean
		) => void;
		readonly onVoteOptionAdd: () => void;
		readonly onVoteOptionRemove: (index: number) => void;
		readonly onVoteOptionChange: (
			index: number,
			field: 'label' | 'description',
			value: string
		) => void;
		readonly getQueuePriorityLabel: (priority: WorkduckQueueWorkPriority) => string;
		readonly getQueueResponseLanguageLabel: (language: WorkduckQueueResponseLanguage) => string;
		readonly getQueueResponseFormatLabel: (format: WorkduckQueueResponseFormat) => string;
		readonly getSkillDisplayName: (skill: WorkduckSkillRecord) => string;
		readonly getAgentDisplayName: (agent: AgentRecord) => string;
		readonly getProjectDisplayName: (project: ProjectNodeRecord) => string;
		readonly getReferenceDisplayName: (reference: ReferenceRecord) => string;
	}

	let {
		messages,
		isWriting,
		canSubmit,
		title,
		submitLabel,
		manualWorkOrderTitle = $bindable(),
		manualWorkOrderBody = $bindable(),
		manualWorkOrderPriority = $bindable(),
		manualWorkOrderResponseLanguage = $bindable(),
		manualWorkOrderResponseFormat = $bindable(),
		manualWorkOrderKind = $bindable(),
		manualVoteCriteriaInput = $bindable(),
		manualVoteOptions,
		allSkills,
		allAgents,
		allProjects,
		allReferences,
		selectedManualSkillIds,
		selectedManualAgentIds,
		selectedManualProjectIds,
		selectedManualReferenceIds,
		selectedManualRevisionOptionIds,
		showRevisionOptions,
		manualWorkOrderSkillSummary,
		manualWorkOrderAgentSummary,
		manualWorkOrderProjectSummary,
		manualWorkOrderReferenceSummary,
		onClose,
		onSubmit,
		onSkillToggle,
		onAgentToggle,
		onProjectToggle,
		onReferenceToggle,
		onRevisionOptionToggle,
		onVoteOptionAdd,
		onVoteOptionRemove,
		onVoteOptionChange,
		getQueuePriorityLabel,
		getQueueResponseLanguageLabel,
		getQueueResponseFormatLabel,
		getSkillDisplayName,
		getAgentDisplayName,
		getProjectDisplayName,
		getReferenceDisplayName
	}: Props = $props();
</script>

<div
	class="workduck-dialog-backdrop"
	role="presentation"
	onclick={(event) => {
		if (event.target === event.currentTarget) {
			onClose();
		}
	}}
>
	<div
		class="workduck-dialog workduck-project-dialog workduck-work-order-dialog"
		role="dialog"
		aria-modal="true"
		aria-labelledby="new-work-order-dialog-title"
		use:modalDialog={{ onClose: isWriting ? undefined : onClose, initialFocusSelector: '#new-work-order-title, #new-work-order-kind' }}
	>
		<form class="workduck-project-dialog-form" onsubmit={onSubmit}>
			<h2 id="new-work-order-dialog-title" class="workduck-dialog-title">
				{title}
			</h2>

			<div class="workduck-work-order-dialog-body">
				{#if manualWorkOrderKind !== 'direct-message'}
					<label class="workduck-form-field" for="new-work-order-title">
						<span>{messages.queue.workTitle}</span>
						<input
							id="new-work-order-title"
							class="workduck-input"
							type="text"
							bind:value={manualWorkOrderTitle}
							autocomplete="off"
							disabled={isWriting}
						/>
					</label>
				{/if}

				<div class="workduck-work-order-dialog-compact-grid">
					<label class="workduck-form-field" for="new-work-order-kind">
						<span>{messages.queue.workType}</span>
						<select
							id="new-work-order-kind"
							class="workduck-select"
							bind:value={manualWorkOrderKind}
							disabled={isWriting}
						>
							<option value="instruction">{messages.queue.workTypes.instruction}</option>
							<option value="direct-message">{messages.queue.workTypes.directMessage}</option>
							<option value="vote">{messages.queue.workTypes.vote}</option>
						</select>
					</label>

					{#if manualWorkOrderKind !== 'direct-message'}
						<label class="workduck-form-field" for="new-work-order-priority">
							<span>{messages.queue.workPriority}</span>
							<select
								id="new-work-order-priority"
								class="workduck-select"
								bind:value={manualWorkOrderPriority}
								disabled={isWriting}
							>
								{#each queueWorkPriorities as priority}
									<option value={priority}>{getQueuePriorityLabel(priority)}</option>
								{/each}
							</select>
						</label>
					{/if}

					{#if manualWorkOrderKind !== 'direct-message'}
						<label class="workduck-form-field" for="new-work-order-response-language">
							<span>{messages.queue.responseLanguage}</span>
							<select
								id="new-work-order-response-language"
								class="workduck-select"
								bind:value={manualWorkOrderResponseLanguage}
								disabled={isWriting}
							>
								{#each queueResponseLanguages as language}
									<option value={language}>{getQueueResponseLanguageLabel(language)}</option>
								{/each}
							</select>
						</label>
					{/if}

					{#if manualWorkOrderKind === 'instruction'}
						<label class="workduck-form-field" for="new-work-order-response-format">
							<span>{messages.queue.responseFormat}</span>
							<select
								id="new-work-order-response-format"
								class="workduck-select"
								bind:value={manualWorkOrderResponseFormat}
								disabled={isWriting}
							>
								{#each queueResponseFormats as format}
									<option value={format}>{getQueueResponseFormatLabel(format)}</option>
								{/each}
							</select>
						</label>
					{/if}
				</div>

				<label class="workduck-form-field" for="new-work-order-body">
					<span>
						{manualWorkOrderKind === 'vote'
							? messages.queue.vote.question
							: manualWorkOrderKind === 'direct-message'
								? messages.queue.directMessageBody
								: messages.queue.workBody}
					</span>
					<textarea
						id="new-work-order-body"
						class="workduck-input workduck-project-description-input"
						bind:value={manualWorkOrderBody}
						disabled={isWriting}
					></textarea>
				</label>

				{#if showRevisionOptions}
					<details class="workduck-work-order-section" open>
						<summary class="workduck-work-order-section-summary">
							<span>{messages.queue.revisionOptions.title}</span>
						</summary>
						<div class="workduck-work-order-section-body">
							<span class="workduck-revision-options-description">
								{messages.queue.revisionOptions.description}
							</span>
							<div class="workduck-revision-option-groups">
								{#each manualRevisionOptionGroups as group (group.id)}
									<div class="workduck-revision-option-group">
										<span class="workduck-revision-option-group-title">
											{messages.queue.revisionOptions.groups[group.id]}
										</span>
										<div class="workduck-revision-option-list">
											{#each manualRevisionOptions.filter((option) => option.groupId === group.id) as option (option.id)}
												<label class="workduck-multi-select-option workduck-revision-option">
													<input
														type="checkbox"
														checked={selectedManualRevisionOptionIds.includes(option.id)}
														disabled={isWriting}
														onchange={(event) =>
															onRevisionOptionToggle(option.id, event.currentTarget.checked)}
													/>
													<span>{messages.queue.revisionOptions.options[option.id]}</span>
												</label>
											{/each}
										</div>
									</div>
								{/each}
							</div>
						</div>
					</details>
				{/if}

				{#if manualWorkOrderKind === 'vote'}
					<details class="workduck-work-order-section" open>
						<summary class="workduck-work-order-section-summary">
							<span>{messages.queue.vote.options}</span>
						</summary>
						<div class="workduck-work-order-section-body">
							<div class="workduck-form-field">
								<div class="workduck-vote-option-header">
									<span>{messages.queue.vote.options}</span>
									<button
										class="workduck-button workduck-button-secondary workduck-vote-option-add-button"
										type="button"
										disabled={isWriting}
										onclick={onVoteOptionAdd}
									>
										{messages.queue.vote.addOption}
									</button>
								</div>
								<div class="workduck-vote-option-list">
									{#each manualVoteOptions as option, index (option.rowId)}
										<div class="workduck-vote-option-row">
											<span class="workduck-vote-option-index">{index + 1}</span>
											<input
												class="workduck-input"
												type="text"
												value={option.label}
												aria-label={`${messages.queue.vote.optionName} ${index + 1}`}
												placeholder={messages.queue.vote.optionName}
												autocomplete="off"
												disabled={isWriting}
												oninput={(event) =>
													onVoteOptionChange(index, 'label', event.currentTarget.value)}
											/>
											<input
												class="workduck-input"
												type="text"
												value={option.description}
												aria-label={`${messages.queue.vote.optionDescription} ${index + 1}`}
												placeholder={messages.queue.vote.optionDescription}
												autocomplete="off"
												disabled={isWriting}
												oninput={(event) =>
													onVoteOptionChange(index, 'description', event.currentTarget.value)}
											/>
											<button
												class="workduck-icon-button workduck-vote-option-remove-button"
												type="button"
												aria-label={`${messages.queue.vote.removeOption} ${index + 1}`}
												disabled={isWriting || manualVoteOptions.length <= 2}
												onclick={() => onVoteOptionRemove(index)}
											>
												×
											</button>
										</div>
									{/each}
								</div>
							</div>

							<label class="workduck-form-field" for="new-work-order-vote-criteria">
								<span>{messages.queue.vote.criteria}</span>
								<textarea
									id="new-work-order-vote-criteria"
									class="workduck-input workduck-project-description-input"
									bind:value={manualVoteCriteriaInput}
									disabled={isWriting}
								></textarea>
							</label>
						</div>
					</details>
				{/if}

				<details class="workduck-work-order-section" open>
					<summary class="workduck-work-order-section-summary">
						<span>{messages.queue.assignment}</span>
					</summary>
					<div class="workduck-work-order-section-body">
						<div class="workduck-form-field">
							<span>{messages.queue.workProjects}</span>
							<details class="workduck-multi-select">
								<summary class="workduck-multi-select-summary">
									<span>{manualWorkOrderProjectSummary}</span>
								</summary>
								<div class="workduck-multi-select-options">
									{#if allProjects.length === 0}
										<span class="workduck-multi-select-empty">{messages.queue.noProject}</span>
									{:else}
										{#each allProjects as project (project.id)}
											<label class="workduck-multi-select-option">
												<input
													type="checkbox"
													checked={selectedManualProjectIds.includes(project.id)}
													disabled={isWriting}
													onchange={(event) =>
														onProjectToggle(project.id, event.currentTarget.checked)}
												/>
												<span>{getProjectDisplayName(project)}</span>
											</label>
										{/each}
									{/if}
								</div>
							</details>
						</div>

						<div class="workduck-form-field">
							<span>{messages.queue.workAgents}</span>
							<details class="workduck-multi-select">
								<summary class="workduck-multi-select-summary">
									<span>{manualWorkOrderAgentSummary}</span>
								</summary>
								<div class="workduck-multi-select-options">
									{#if allAgents.length === 0}
										<span class="workduck-multi-select-empty">{messages.queue.noAgent}</span>
									{:else}
										{#each allAgents as agent (agent.id)}
											<label class="workduck-multi-select-option">
												<input
													type="checkbox"
													checked={selectedManualAgentIds.includes(agent.id)}
													disabled={isWriting}
													onchange={(event) => onAgentToggle(agent.id, event.currentTarget.checked)}
												/>
												<span>{getAgentDisplayName(agent)}</span>
											</label>
										{/each}
									{/if}
								</div>
							</details>
						</div>

						<div class="workduck-form-field">
							<span>{messages.queue.workReferences}</span>
							<details class="workduck-multi-select">
								<summary class="workduck-multi-select-summary">
									<span>{manualWorkOrderReferenceSummary}</span>
								</summary>
								<div class="workduck-multi-select-options">
									{#if allReferences.length === 0}
										<span class="workduck-multi-select-empty">{messages.queue.noReference}</span>
									{:else}
										{#each allReferences as reference (reference.id)}
											<label class="workduck-multi-select-option">
												<input
													type="checkbox"
													checked={selectedManualReferenceIds.includes(reference.id)}
													disabled={isWriting}
													onchange={(event) =>
														onReferenceToggle(reference.id, event.currentTarget.checked)}
												/>
												<span>{getReferenceDisplayName(reference)}</span>
											</label>
										{/each}
									{/if}
								</div>
							</details>
						</div>
					</div>
				</details>

				<details class="workduck-work-order-section">
					<summary class="workduck-work-order-section-summary">
						<span>{messages.queue.advancedExecution}</span>
					</summary>
					<div class="workduck-work-order-section-body">
						<div class="workduck-form-field">
							<span>{messages.queue.internalSkills}</span>
							<details class="workduck-multi-select">
								<summary class="workduck-multi-select-summary">
									<span>{manualWorkOrderSkillSummary}</span>
								</summary>
								<div class="workduck-multi-select-options">
									{#if allSkills.length === 0}
										<span class="workduck-multi-select-empty">{messages.queue.noSkill}</span>
									{:else}
										{#each allSkills as skill (skill.id)}
											<label class="workduck-multi-select-option">
												<input
													type="checkbox"
													checked={selectedManualSkillIds.includes(skill.id)}
													disabled={isWriting}
													onchange={(event) => onSkillToggle(skill.id, event.currentTarget.checked)}
												/>
												<span>{getSkillDisplayName(skill)}</span>
											</label>
										{/each}
									{/if}
								</div>
							</details>
						</div>
					</div>
				</details>
			</div>

			<div class="workduck-dialog-actions">
				<button class="workduck-button workduck-button-secondary" type="button" onclick={onClose}>
					{messages.common.cancel}
				</button>
				<button class="workduck-button workduck-button-primary" type="submit" disabled={!canSubmit}>
					{isWriting ? messages.queue.creating : submitLabel}
				</button>
			</div>
		</form>
	</div>
</div>
