/* llmnav/1 module
id=workduck.projects.repository-controller
role=Own reactive project repository action state, capability decisions, publish dialogs, and scoped operation context assembly.
owns=repository action admission|repository busy state|publish dialog state|operation feedback ownership
excludes=Git execution|registry persistence|project or group dialogs|scaffold dialog lifetime
search=project board repository actions|repository publish dialog state|repository capability decisions
invariant=Repository operations and favorite-save feedback stay in the captured registry writer workspace; capability decisions use current state, and workspace reset clears action targets and publish busy state.
stability=architecture
*/
import type { WorkduckMessages } from '#lib/i18n/workduck-message-contract.ts';
import { type WorkduckLanguageId } from '#lib/i18n/workduck-language.ts';
import type { EnvironmentVault } from '#lib/environment/environment-vault.ts';
import type { QueueFolderError } from '#lib/queue/queue-folder.ts';
import { type ProjectRepositoryGithubVisibility } from './project-repository';
import { setProjectRepositoryFavorite, type ProjectNodeRecord, type ProjectRegistry, type ProjectRepositoryLinkRecord } from './project-registry';
import { type ProjectRepositoryOperationName, type ProjectRepositoryOperationStorageError } from './project-operation-storage';
import { type ProjectRepositoryGitStatus } from './project-board-selectors';
import { type ProjectFormError } from './project-board-errors';
import { type ProjectRepositoryGitAction, type ProjectRepositoryOperation } from './project-board-operations';
import { getProjectBoardNodeGithubCredentialName, getProjectBoardRepositoryGithubCredentialName, isProjectBoardRepositoryTarget, resolveProjectBoardRepositoryGithubCredential } from './project-board-surface-helpers';
import { runProjectRepositoryRemoteGitAction, type ProjectRepositoryActionContext } from './project-board-repository-actions';
import { createProjectBoardRepositoryActionContext, getProjectBoardRepositoryOperation, isProjectBoardRepositoryBusy, isProjectBoardRepositoryOperationRunning } from './project-board-repository-action-context';
import { closeProjectRepositoryPublishDialog, closeProjectRepositoryPublishDialogFromBackdrop, openProjectRepositoryPublishDialog, submitProjectRepositoryPublishDialog, type ProjectRepositoryPublishTarget } from './project-board-publish-actions';
import { type ProjectRepositoryTaskRunRecordByRepositoryId } from './project-repository-task-runs';
import { type ProjectRepositoryTaskRunRecord } from './project-repository-task';
import { isRepositoryPathInsideProjectsFolderBoundary, isRepositoryPathInsideWorkspaceBoundary } from './project-board-paths';
import { DEFAULT_GITHUB_REPOSITORY_COMMIT_MESSAGE } from './project-board-publish-constants';
import { canCloneProjectRepository, canInitializeProjectRepository, canPublishProjectRepositoryToGithub, canRunRemoteProjectRepositoryGitAction, getProjectRepositoryCardKind } from './project-board-repository-rules';
import { canQueueProjectRepositoryCommitWorkOrder, queueProjectRepositoryCommitWorkOrder } from './project-board-repository-commit-work-order';
import { createProjectBoardRegistryWriter } from './project-board-registry-writer.svelte';
import type { ProjectContextMenuTarget, ProjectRepositoryTarget } from './project-board-types';
import { createGithubCredentialNameById, getGithubCredentialOptions } from './project-board-github-credentials';
interface ProjectBoardRepositoryControllerInput {
	readonly registryWriter: ReturnType<typeof createProjectBoardRegistryWriter>;
	readonly registry: () => ProjectRegistry;
	readonly operations: () => Record<string, ProjectRepositoryOperation>;
	readonly setOperations: (operations: Record<string, ProjectRepositoryOperation>) => void;
	readonly taskRuns: () => ProjectRepositoryTaskRunRecordByRepositoryId;
	readonly setTaskRuns: (runs: ProjectRepositoryTaskRunRecordByRepositoryId) => void;
	readonly gitStatusById: () => Readonly<Record<string, ProjectRepositoryGitStatus>>;
	readonly pathBoundaryKey: () => string;
	readonly environmentVault: () => EnvironmentVault | null;
	readonly githubCredentialNameById: () => ReturnType<typeof createGithubCredentialNameById>;
	readonly githubCredentialOptions: () => ReturnType<typeof getGithubCredentialOptions>;
	readonly selectedProject: () => ProjectNodeRecord | null;
	readonly messages: () => WorkduckMessages['projects'];
	readonly languageId: () => WorkduckLanguageId;
	readonly scaffoldState: () => {
		readonly isApplying: boolean;
		readonly target: ProjectRepositoryTarget | null;
	};
	readonly preloadOverlays: () => void;
	readonly clearDeleteCandidate: () => void;
	readonly clearDialog: () => void;
	readonly closeContextMenu: () => void;
	readonly setFormError: (error: ProjectFormError | null) => void;
	readonly setStatus: (status: string | null) => void;
	readonly setQueueFolderError: (error: QueueFolderError | null) => void;
	readonly setOperationStorageError: (error: ProjectRepositoryOperationStorageError | null) => void;
	readonly setSelectedGroupId: (id: string) => void;
	readonly refreshRepositoryGitStatus: (id: string, path: string | null, isCurrent: () => boolean) => Promise<void>;
}
export function createProjectBoardRepositoryController(input: ProjectBoardRepositoryControllerInput) {
	let cloneTarget = $state<ProjectContextMenuTarget | null>(null);
	let gitActionTarget = $state<ProjectContextMenuTarget | null>(null);
	let commitWorkOrderTargetRepositoryId = $state<string | null>(null);
	let publishTarget = $state<ProjectRepositoryPublishTarget | null>(null);
	let githubRepositoryName = $state('');
	let githubRepositoryCommitMessage = $state(DEFAULT_GITHUB_REPOSITORY_COMMIT_MESSAGE);
	let githubRepositoryVisibility = $state<ProjectRepositoryGithubVisibility>('private');
	let isPublishingRepository = $state(false);
	let canSubmitPublishRepository = $derived(publishTarget !== null &&
		githubRepositoryName.trim().length > 0 &&
		githubRepositoryCommitMessage.trim().length > 0 &&
		!isPublishingRepository &&
		!isRepositoryBusy(publishTarget.repository.id));
	function openPublishRepositoryDialog(node: ProjectNodeRecord, repository: ProjectRepositoryLinkRecord) {
		input.preloadOverlays();
		openProjectRepositoryPublishDialog({ node, repository }, {
			isRepositoryPathInsideWorkspace,
			isRepositoryBusy,
			failRepositoryOperation: (node, repository, name, error) => createRepositoryActionContext().failOperation({ node, repository }, name, error),
			setPublishTarget: (target) => { publishTarget = target; },
			setRepositoryName: (name) => { githubRepositoryName = name; },
			setCommitMessage: (message) => { githubRepositoryCommitMessage = message; },
			setVisibility: (visibility) => { githubRepositoryVisibility = visibility; },
			setFormError: (error) => { input.setFormError(error); },
			setStatus: (nextStatus) => { input.setStatus(nextStatus); },
			clearDeleteCandidate: () => { input.clearDeleteCandidate(); },
			clearDialog: () => { input.clearDialog(); },
			closeContextMenu: input.closeContextMenu
		});
	}
	function closePublishRepositoryDialog() {
		closeProjectRepositoryPublishDialog({
			setPublishTarget: (target) => { publishTarget = target; },
			setRepositoryName: (name) => { githubRepositoryName = name; },
			setCommitMessage: (message) => { githubRepositoryCommitMessage = message; },
			setVisibility: (visibility) => { githubRepositoryVisibility = visibility; },
			setIsPublishing: (isPublishing) => { isPublishingRepository = isPublishing; }
		});
	}
	function handleGithubRepositoryNameInput() {
		input.setFormError(null);
		input.setStatus(null);
	}
	function handleGithubRepositoryCommitMessageInput() {
		input.setFormError(null);
		input.setStatus(null);
	}
	function selectGithubRepositoryVisibility(visibility: ProjectRepositoryGithubVisibility) {
		githubRepositoryVisibility = visibility;
		input.setFormError(null);
		input.setStatus(null);
	}
	function handlePublishRepositoryBackdropClick(event: MouseEvent) {
		closeProjectRepositoryPublishDialogFromBackdrop(event, {
			isPublishing: isPublishingRepository,
			closeDialog: closePublishRepositoryDialog
		});
	}
	async function handlePublishRepositorySubmit(event: SubmitEvent) {
		await submitProjectRepositoryPublishDialog(event, {
			target: publishTarget,
			isPublishing: isPublishingRepository,
			repositoryName: githubRepositoryName,
			commitMessage: githubRepositoryCommitMessage,
			visibility: githubRepositoryVisibility
		}, { createRepositoryActionContext });
	}
	async function runRepositoryGitAction(target: ProjectRepositoryTarget | null, action: ProjectRepositoryGitAction) {
		await runProjectRepositoryRemoteGitAction(target, action, createRepositoryActionContext());
	}
	async function queueRepositoryCommitWorkOrder(node: ProjectNodeRecord, repository: ProjectRepositoryLinkRecord) {
		const target = input.registryWriter.capture();
		await queueProjectRepositoryCommitWorkOrder({
			workspaceId: target.workspaceId,
			workspacePath: target.workspacePath,
			nodes: target.registry.nodes,
			node,
			repository,
			languageId: input.languageId(),
			queuedMessageTemplate: input.messages().repository.commitWorkOrderQueued
		}, {
			isCurrent: target.isCurrent,
			canQueueRepositoryCommitWorkOrder,
			setCommitWorkOrderTargetRepositoryId: (repositoryId) => {
				commitWorkOrderTargetRepositoryId = repositoryId;
			},
			setFormError: (error) => {
				input.setFormError(error);
			},
			setQueueFolderError: (error) => {
				input.setQueueFolderError(error);
			},
			setStatus: (nextStatus) => {
				input.setStatus(nextStatus);
			}
		});
	}
	function createRepositoryActionContext(): ProjectRepositoryActionContext {
		const target = input.registryWriter.capture();
		return createProjectBoardRepositoryActionContext({
			workspaceId: target.workspaceId,
			workspacePath: target.workspacePath,
			registry: target.registry,
			isCurrent: target.isCurrent,
			operations: () => input.operations(),
			setOperations: (operations) => { input.setOperations(operations); },
			setOperationStorageError: (error) => { input.setOperationStorageError(error); },
			isRepositoryBusy,
			isRepositoryPathInsideWorkspace,
			resolveCredential: ({ node, repository }) => resolveRepositoryGithubCredentialOrSetError(node, repository),
			persistRegistry: target.persistRegistry,
			refreshRepositoryGitStatus: (id, path) => input.refreshRepositoryGitStatus(id, path, target.isCurrent),
			setFormError: (error) => { input.setFormError(error); },
			setStatus: (nextStatus) => { input.setStatus(nextStatus); },
			setSelectedGroupId: (groupId) => { input.setSelectedGroupId(groupId); },
			setCloneTarget: (target) => { cloneTarget = target; },
			setGitActionTarget: (target) => { gitActionTarget = target; },
			setIsPublishingRepository: (isPublishing) => { isPublishingRepository = isPublishing; },
			closePublishRepositoryDialog,
			operationMessages: input.messages().operations
		});
	}
	function getRepositoryOperation(repositoryId: string) {
		return getProjectBoardRepositoryOperation(input.operations(), repositoryId);
	}
	function getRepositoryTaskRun(repositoryId: string) {
		return input.taskRuns()[repositoryId] ?? null;
	}
	function setRepositoryTaskRun(repositoryId: string, record: ProjectRepositoryTaskRunRecord) {
		input.setTaskRuns({
			...input.taskRuns(),
			[repositoryId]: record
		});
	}
	function isRepositoryBusy(repositoryId: string) {
		return (isProjectBoardRepositoryBusy(input.operations(), repositoryId) ||
			input.taskRuns()[repositoryId]?.state === 'running' ||
			commitWorkOrderTargetRepositoryId === repositoryId ||
			(input.scaffoldState().isApplying && input.scaffoldState().target?.repository.id === repositoryId));
	}
	function isRepositoryOperationRunning(repositoryId: string, name: ProjectRepositoryOperationName) {
		return isProjectBoardRepositoryOperationRunning(input.operations(), repositoryId, name);
	}
	async function setRepositoryFavorite(node: ProjectNodeRecord, repository: ProjectRepositoryLinkRecord, favorite: boolean) {
		const workspaceTarget = input.registryWriter.capture();
		const result = setProjectRepositoryFavorite(input.registry(), {
			nodeId: node.id,
			repositoryId: repository.id,
			favorite
		});
		if (!result.ok) {
			input.setFormError(result.error);
			return;
		}
		input.setFormError(null);
		if (!(await input.registryWriter(result.registry)) || !workspaceTarget.isCurrent()) {
			return;
		}
		input.setStatus(favorite
			? input.messages().repository.favoriteAdded
			: input.messages().repository.favoriteRemoved);
	}
	async function toggleRepositoryFavorite(node: ProjectNodeRecord, repository: ProjectRepositoryLinkRecord) {
		await setRepositoryFavorite(node, repository, !repository.favorite);
	}
	function getRepositoryCardKind(nodeId: string, repository: ProjectRepositoryLinkRecord) {
		return getProjectRepositoryCardKind(repository, getRepositoryOperation(repository.id), input.gitStatusById()[repository.id], isRepositoryCloneTarget(nodeId, repository.id), isRepositoryGitActionTarget(nodeId, repository.id));
	}
	function getNodeGithubCredentialName(node: ProjectNodeRecord) {
		return getProjectBoardNodeGithubCredentialName({
			environmentVault: input.environmentVault(),
			githubCredentialNameById: input.githubCredentialNameById(),
			node
		});
	}
	function getRepositoryGithubCredentialName(node: ProjectNodeRecord, repository: ProjectRepositoryLinkRecord) {
		return getProjectBoardRepositoryGithubCredentialName({
			nodes: input.registry().nodes,
			environmentVault: input.environmentVault(),
			githubCredentialNameById: input.githubCredentialNameById(),
			selectedProject: input.selectedProject(),
			node,
			repository
		});
	}
	function resolveRepositoryGithubCredentialOrSetError(node: ProjectNodeRecord, repository: ProjectRepositoryLinkRecord) {
		return resolveProjectBoardRepositoryGithubCredential({
			nodes: input.registry().nodes,
			environmentVault: input.environmentVault(),
			githubCredentialOptions: input.githubCredentialOptions(),
			node,
			repository,
			setFormError: (error) => { input.setFormError(error); },
			setStatus: (nextStatus) => { input.setStatus(nextStatus); }
		});
	}
	function isRepositoryCloneTarget(nodeId: string, repositoryId: string) {
		return isProjectBoardRepositoryTarget(cloneTarget, nodeId, repositoryId);
	}
	function isRepositoryGitActionTarget(nodeId: string, repositoryId: string) {
		return isProjectBoardRepositoryTarget(gitActionTarget, nodeId, repositoryId);
	}
	function canCloneRepository(repository: ProjectRepositoryLinkRecord) {
		return canCloneProjectRepository(repository, input.gitStatusById()[repository.id], repository.path !== null && isRepositoryPathInsideWorkspace(repository.path), isRepositoryBusy(repository.id));
	}
	function canInitializeRepository(repository: ProjectRepositoryLinkRecord) {
		return canInitializeProjectRepository(repository, input.gitStatusById()[repository.id], repository.path !== null && isRepositoryPathInsideWorkspace(repository.path), isRepositoryBusy(repository.id));
	}
	function canPublishRepositoryToGithub(repository: ProjectRepositoryLinkRecord) {
		return canPublishProjectRepositoryToGithub(repository, input.gitStatusById()[repository.id], repository.path !== null && isRepositoryPathInsideWorkspace(repository.path), publishTarget !== null, isRepositoryBusy(repository.id));
	}
	function canApplySsealedToRepository(repository: ProjectRepositoryLinkRecord) {
		const gitStatus = input.gitStatusById()[repository.id];
		return (repository.path !== null &&
			isRepositoryPathInsideWorkspace(repository.path) &&
			gitStatus !== undefined &&
			gitStatus.error === null &&
			!isRepositoryBusy(repository.id));
	}
	function canRunRemoteRepositoryGitAction(repository: ProjectRepositoryLinkRecord, action: ProjectRepositoryGitAction) {
		return canRunRemoteProjectRepositoryGitAction(repository, input.gitStatusById()[repository.id], repository.path !== null && isRepositoryPathInsideWorkspace(repository.path), isRepositoryBusy(repository.id), action);
	}
	function canQueueRepositoryCommitWorkOrder(repository: ProjectRepositoryLinkRecord) {
		return canQueueProjectRepositoryCommitWorkOrder({
			repository,
			gitStatus: input.gitStatusById()[repository.id],
			isRepositoryPathInsideWorkspace: repository.path !== null && isRepositoryPathInsideWorkspace(repository.path),
			isRepositoryBusy: isRepositoryBusy(repository.id)
		});
	}
	function isRepositoryPathInsideWorkspace(repositoryPath: string) {
		return isRepositoryPathInsideWorkspaceBoundary(input.pathBoundaryKey(), repositoryPath);
	}
	function isRepositoryPathInsideProjectsFolder(repositoryPath: string) {
		return isRepositoryPathInsideProjectsFolderBoundary(input.pathBoundaryKey(), repositoryPath);
	}
	function resetWorkspace() {
		cloneTarget = null;
		gitActionTarget = null;
		commitWorkOrderTargetRepositoryId = null;
		publishTarget = null;
		isPublishingRepository = false;
	}
	return {
		get publishTarget() { return publishTarget; },
		set publishTarget(value: ProjectRepositoryPublishTarget | null) { publishTarget = value; },
		get githubRepositoryName() { return githubRepositoryName; },
		set githubRepositoryName(value: string) { githubRepositoryName = value; },
		get githubRepositoryCommitMessage() { return githubRepositoryCommitMessage; },
		set githubRepositoryCommitMessage(value: string) { githubRepositoryCommitMessage = value; },
		get githubRepositoryVisibility() { return githubRepositoryVisibility; },
		get isPublishingRepository() { return isPublishingRepository; },
		get canSubmitPublishRepository() { return canSubmitPublishRepository; },
		resetWorkspace,
		openPublishRepositoryDialog,
		closePublishRepositoryDialog,
		handleGithubRepositoryNameInput,
		handleGithubRepositoryCommitMessageInput,
		selectGithubRepositoryVisibility,
		handlePublishRepositoryBackdropClick,
		handlePublishRepositorySubmit,
		runRepositoryGitAction,
		queueRepositoryCommitWorkOrder,
		createRepositoryActionContext,
		getRepositoryOperation,
		getRepositoryTaskRun,
		setRepositoryTaskRun,
		isRepositoryBusy,
		isRepositoryOperationRunning,
		setRepositoryFavorite,
		toggleRepositoryFavorite,
		getRepositoryCardKind,
		getNodeGithubCredentialName,
		getRepositoryGithubCredentialName,
		isRepositoryCloneTarget,
		isRepositoryGitActionTarget,
		canCloneRepository,
		canInitializeRepository,
		canPublishRepositoryToGithub,
		canApplySsealedToRepository,
		canRunRemoteRepositoryGitAction,
		canQueueRepositoryCommitWorkOrder,
		isRepositoryPathInsideWorkspace,
		isRepositoryPathInsideProjectsFolder
	};
}
