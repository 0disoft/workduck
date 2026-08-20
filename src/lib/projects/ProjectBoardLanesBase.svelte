<script lang="ts">
	import type { WorkduckMessages } from '$lib/i18n/workduck-message-contract';
	import type { WorkduckLanguageId } from '$lib/i18n/workduck-language';
	import PageTitleRow from '$lib/ui/PageTitleRow.svelte';
	import {
		formatCountLabel,
		getProjectGroupCount,
		getProjectRepositoryCount,
		type ProjectBoardSelectionIndex,
		type ProjectRepositoryGitStatus,
		type ProjectRepositorySyncFilter
	} from './project-board-selectors';
	import type { ProjectRepositoryGitAction, ProjectRepositoryOperation } from './project-board-operations';
	import type { ProjectRepositoryTaskRunRecord } from './project-repository-task';
	import type {
		ProjectNodeRecord,
		ProjectRepositoryLinkRecord
	} from './project-registry';
	import ProjectNodeCard from './ProjectNodeCard.svelte';
	import ProjectRepositoryCard from './ProjectRepositoryCard.svelte';

	interface RepositoryFilterStats {
		readonly favorites: number;
		readonly pullNeeded: number;
		readonly pushNeeded: number;
		readonly commitNeeded: number;
	}

	interface Props {
		readonly title: string;
		readonly projectMessages: WorkduckMessages['projects'];
		readonly languageId: WorkduckLanguageId;
		readonly tagFilterInput: string;
		readonly repositorySyncFilter: ProjectRepositorySyncFilter;
		readonly repositoryFilterStats: RepositoryFilterStats;
		readonly selectionIndex: ProjectBoardSelectionIndex;
		readonly projectNodes: readonly ProjectNodeRecord[];
		readonly selectedProject: ProjectNodeRecord | null;
		readonly selectedProjectGroups: readonly ProjectNodeRecord[];
		readonly selectedGroup: ProjectNodeRecord | null;
		readonly selectedRepositories: readonly ProjectRepositoryLinkRecord[];
		readonly repositoryGitStatusById: Readonly<Record<string, ProjectRepositoryGitStatus>>;
		readonly onBoardContextMenu: (event: MouseEvent) => void;
		readonly onRepositorySyncFilterSelect: (filter: ProjectRepositorySyncFilter) => void;
		readonly onTagFilterInput: (value: string) => void;
		readonly onOverlayIntent: () => void;
		readonly onOpenDialog: (mode: 'project' | 'group' | 'repository', targetNodeId?: string) => void;
		readonly onSelectProject: (node: ProjectNodeRecord) => void;
		readonly onSelectGroup: (node: ProjectNodeRecord) => void;
		readonly onProjectContextMenu: (event: MouseEvent, node: ProjectNodeRecord) => void;
		readonly onRepositoryContextMenu: (
			event: MouseEvent,
			node: ProjectNodeRecord,
			repository: ProjectRepositoryLinkRecord
		) => void;
		readonly getNodeGithubCredentialName: (node: ProjectNodeRecord) => string;
		readonly getRepositoryGithubCredentialName: (
			node: ProjectNodeRecord,
			repository: ProjectRepositoryLinkRecord
		) => string;
		readonly getRepositoryOperation: (repositoryId: string) => ProjectRepositoryOperation | null;
		readonly getRepositoryTaskRun: (repositoryId: string) => ProjectRepositoryTaskRunRecord | null;
		readonly isRepositoryBusy: (repositoryId: string) => boolean;
		readonly isRepositoryPathInsideWorkspace: (repositoryPath: string) => boolean;
		readonly getRepositoryCardKind: (
			nodeId: string,
			repository: ProjectRepositoryLinkRecord
		) => string;
		readonly canCloneRepository: (repository: ProjectRepositoryLinkRecord) => boolean;
		readonly canInitializeRepository: (repository: ProjectRepositoryLinkRecord) => boolean;
		readonly canPublishRepositoryToGithub: (repository: ProjectRepositoryLinkRecord) => boolean;
		readonly canQueueRepositoryCommitWorkOrder: (
			repository: ProjectRepositoryLinkRecord
		) => boolean;
		readonly canRunRemoteRepositoryGitAction: (
			repository: ProjectRepositoryLinkRecord,
			action: ProjectRepositoryGitAction
		) => boolean;
		readonly isRepositoryOperationRunning: (
			repositoryId: string,
			name: ProjectRepositoryOperation['name']
		) => boolean;
		readonly onCloneRepository: (
			node: ProjectNodeRecord,
			repository: ProjectRepositoryLinkRecord
		) => Promise<void>;
		readonly onInitializeRepository: (
			node: ProjectNodeRecord,
			repository: ProjectRepositoryLinkRecord
		) => Promise<void>;
		readonly onPublishRepository: (
			node: ProjectNodeRecord,
			repository: ProjectRepositoryLinkRecord
		) => void;
		readonly onQueueRepositoryCommitWorkOrder: (
			node: ProjectNodeRecord,
			repository: ProjectRepositoryLinkRecord
		) => Promise<void>;
		readonly onRepositoryFavoriteToggle: (
			node: ProjectNodeRecord,
			repository: ProjectRepositoryLinkRecord
		) => Promise<void>;
		readonly onGitAction: (
			node: ProjectNodeRecord,
			repository: ProjectRepositoryLinkRecord,
			action: ProjectRepositoryGitAction
		) => Promise<void>;
	}

	let {
		title, projectMessages, languageId, tagFilterInput, repositorySyncFilter, repositoryFilterStats,
		selectionIndex, projectNodes, selectedProject, selectedProjectGroups, selectedGroup,
		selectedRepositories, repositoryGitStatusById, onBoardContextMenu, onRepositorySyncFilterSelect,
		onTagFilterInput, onOverlayIntent, onOpenDialog, onSelectProject, onSelectGroup, onProjectContextMenu,
		onRepositoryContextMenu, getNodeGithubCredentialName, getRepositoryGithubCredentialName,
		getRepositoryOperation, getRepositoryTaskRun, isRepositoryBusy, isRepositoryPathInsideWorkspace,
		getRepositoryCardKind, canCloneRepository, canInitializeRepository,
		canPublishRepositoryToGithub, canQueueRepositoryCommitWorkOrder,
		canRunRemoteRepositoryGitAction, isRepositoryOperationRunning,
		onCloneRepository, onInitializeRepository, onPublishRepository,
		onQueueRepositoryCommitWorkOrder, onRepositoryFavoriteToggle, onGitAction
	}: Props = $props();

	let projectCountLabel = $derived(
		projectMessages.registeredCount.replace(
			'{count}',
			selectionIndex.projectNodes.length.toString()
		)
	);

	function handleTagFilterInput(event: Event) {
		onTagFilterInput((event.currentTarget as HTMLInputElement).value);
	}
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<section class="workduck-project-board" aria-label="Projects" oncontextmenu={onBoardContextMenu}>
	<header class="workduck-page-header">
		<PageTitleRow {title} meta={projectCountLabel} />
		<div class="workduck-page-actions workduck-project-header-actions">
			<div class="workduck-project-sync-filters" aria-label="Repository sync filters">
				<button class="workduck-project-sync-filter-button"
					class:workduck-project-sync-filter-button-active={repositorySyncFilter === 'favorite'}
					type="button" aria-pressed={repositorySyncFilter === 'favorite'}
					onclick={() => onRepositorySyncFilterSelect('favorite')}>
					{projectMessages.filters.favorites}
					<span>{repositoryFilterStats.favorites}</span>
				</button>
				<button class="workduck-project-sync-filter-button"
					class:workduck-project-sync-filter-button-active={repositorySyncFilter === 'pull'}
					type="button" aria-pressed={repositorySyncFilter === 'pull'}
					onclick={() => onRepositorySyncFilterSelect('pull')}>
					{projectMessages.filters.pullNeeded}
					<span>{repositoryFilterStats.pullNeeded}</span>
				</button>
				<button class="workduck-project-sync-filter-button"
					class:workduck-project-sync-filter-button-active={repositorySyncFilter === 'push'}
					type="button" aria-pressed={repositorySyncFilter === 'push'}
					onclick={() => onRepositorySyncFilterSelect('push')}>
					{projectMessages.filters.pushNeeded}
					<span>{repositoryFilterStats.pushNeeded}</span>
				</button>
				<button class="workduck-project-sync-filter-button"
					class:workduck-project-sync-filter-button-active={repositorySyncFilter === 'commit'}
					type="button" aria-pressed={repositorySyncFilter === 'commit'}
					onclick={() => onRepositorySyncFilterSelect('commit')}>
					{projectMessages.filters.commitNeeded}
					<span>{repositoryFilterStats.commitNeeded}</span>
				</button>
			</div>
			<label class="workduck-project-filter-field" for="project-tag-filter">
				<input id="project-tag-filter" class="workduck-input" type="text" value={tagFilterInput}
					autocomplete="off" spellcheck="false" aria-label={projectMessages.filters.searchLabel}
					placeholder={projectMessages.filters.searchPlaceholder}
					oninput={handleTagFilterInput} />
			</label>
		</div>
	</header>

	<div class="workduck-project-lanes workduck-project-workspace-layout">
		<section class="workduck-project-lane workduck-project-sidebar-lane" aria-label="Projects">
			<div class="workduck-project-lane-track">
				<button class="workduck-project-card workduck-project-card-button workduck-project-add-card"
					type="button" onpointerenter={onOverlayIntent} onfocus={onOverlayIntent}
					onclick={() => onOpenDialog('project')}>
					{projectMessages.newProject}
				</button>

				{#each projectNodes as node (node.id)}
					{@const projectStats = [
						formatCountLabel(
							getProjectGroupCount(selectionIndex, node.id),
							projectMessages.counts.group,
							projectMessages.counts.groups
						),
						formatCountLabel(
							getProjectRepositoryCount(selectionIndex, node.id),
							projectMessages.counts.repo,
							projectMessages.counts.repos
						),
						...(node.githubCredentialSecretId === null
							? []
							: [`GitHub: ${getNodeGithubCredentialName(node)}`])
					]}
					<ProjectNodeCard {node} selected={selectedProject?.id === node.id}
						kindLabel={projectMessages.kinds[node.kind]} stats={projectStats}
						{onOverlayIntent}
						onSelect={() => onSelectProject(node)}
						onContextMenu={(event) => onProjectContextMenu(event, node)} />
				{/each}
			</div>
		</section>

		<div class="workduck-project-detail-lanes">
			{#if selectedProject !== null}
				<section class="workduck-project-lane workduck-project-group-lane" aria-label="Groups">
					<div class="workduck-project-lane-track">
						<button class="workduck-project-card workduck-project-card-button workduck-project-add-card"
							type="button" onpointerenter={onOverlayIntent} onfocus={onOverlayIntent}
							onclick={() => onOpenDialog('group', selectedProject.id)}>
							{projectMessages.newGroup}
						</button>

						{#each selectedProjectGroups as node (node.id)}
							{@const groupStats = [
								formatCountLabel(
									node.repositories.length,
									projectMessages.counts.repo,
									projectMessages.counts.repos
								),
								...(selectedProject.githubCredentialSecretId !== null ||
								node.githubCredentialSecretId === null
									? []
									: [`GitHub: ${getNodeGithubCredentialName(node)}`])
							]}
							<div class="workduck-project-group-stack">
								<ProjectNodeCard {node} selected={selectedGroup?.id === node.id}
									kindLabel={projectMessages.kinds[node.kind]} stats={groupStats}
									{onOverlayIntent}
									onSelect={() => onSelectGroup(node)}
									onContextMenu={(event) => onProjectContextMenu(event, node)} />

								{#if selectedGroup?.id === node.id}
									<div class="workduck-project-lane-track workduck-project-repository-track">
										<button class="workduck-project-card workduck-project-card-button workduck-project-add-card workduck-repository-card"
											type="button" onpointerenter={onOverlayIntent} onfocus={onOverlayIntent}
											onclick={() => onOpenDialog('repository', node.id)}>
											{projectMessages.newRepository}
										</button>

										{#each selectedRepositories as repository (repository.id)}
											{@const repositoryOperation = getRepositoryOperation(repository.id)}
											{@const repositoryTaskRun = getRepositoryTaskRun(repository.id)}
											{@const repositoryGitStatus = repositoryGitStatusById[repository.id]}
											{@const repositoryBusy =
												isRepositoryBusy(repository.id) || repositoryTaskRun?.state === 'running'}
											{@const repositoryPathOutsideWorkspace =
												repository.path !== null && !isRepositoryPathInsideWorkspace(repository.path)}
											{@const repositoryGithubCredentialName = getRepositoryGithubCredentialName(node, repository)}
											<ProjectRepositoryCard node={node} {repository} {repositoryOperation}
												{repositoryTaskRun}
												{projectMessages} {languageId}
												{repositoryGitStatus} {repositoryBusy} {repositoryPathOutsideWorkspace}
												{repositoryGithubCredentialName}
												repositoryCardKind={getRepositoryCardKind(node.id, repository)}
												canCloneRepository={canCloneRepository(repository)}
												canInitializeRepository={canInitializeRepository(repository)}
												canPublishRepositoryToGithub={canPublishRepositoryToGithub(repository)}
												canQueueCommitWorkOrder={canQueueRepositoryCommitWorkOrder(repository)}
												canFetchRepository={canRunRemoteRepositoryGitAction(repository, 'fetch')}
												canPullRepository={canRunRemoteRepositoryGitAction(repository, 'pull')}
												canPushRepository={canRunRemoteRepositoryGitAction(repository, 'push')}
												isRepositoryOperationRunning={(name) => isRepositoryOperationRunning(repository.id, name)}
												{onOverlayIntent}
												onContextMenu={(event) => onRepositoryContextMenu(event, node, repository)}
												onClone={() => onCloneRepository(node, repository)}
												onInitialize={() => onInitializeRepository(node, repository)}
												onPublish={() => onPublishRepository(node, repository)}
												onQueueCommitWorkOrder={() => onQueueRepositoryCommitWorkOrder(node, repository)}
												onFavoriteToggle={() => onRepositoryFavoriteToggle(node, repository)}
												onGitAction={(action) => onGitAction(node, repository, action)} />
										{/each}
									</div>
								{/if}
							</div>
						{/each}
					</div>
				</section>
			{/if}
		</div>
	</div>
</section>
