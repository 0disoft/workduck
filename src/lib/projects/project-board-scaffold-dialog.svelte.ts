/* llmnav/1 module
id=workduck.projects.scaffold-dialog
role=Own reactive repository scaffold dialog state, profile selection, preview, and apply workflows.
owns=scaffold dialog lifecycle|preview selection ownership|scaffold busy state|apply feedback
excludes=board selection|native scaffold persistence|new repository scaffolding
search=repository scaffold preview|apply ssealed profile|scaffold dialog lifecycle
invariant=Preview and apply commands use the opening workspace; only the live dialog and its selected repository, scope, and profile receive results or busy-state cleanup.
stability=architecture
*/
import type { WorkduckMessages } from '#lib/i18n/workduck-message-contract.ts';
import {
	applySsealedScaffoldToRepository,
	getDefaultSsealedScaffoldApplyScope,
	getDefaultSsealedScaffoldProfile,
	previewSsealedScaffoldForRepository,
	type SsealedScaffoldApplyScope,
	type SsealedScaffoldPlan,
	type SsealedScaffoldProfile
} from './project-folder';
import type { ProjectFormError } from './project-board-errors';
import type { ProjectRepositoryLinkRecord } from './project-registry';
import type { ProjectRepositoryTarget } from './project-board-types';

interface ScaffoldDialogWorkspace {
	readonly workspacePath: string;
	readonly isCurrent: () => boolean;
}

interface ProjectBoardScaffoldDialogInput {
	readonly captureWorkspace: () => ScaffoldDialogWorkspace;
	readonly messages: () => WorkduckMessages['projects'];
	readonly canApplyToRepository: (repository: ProjectRepositoryLinkRecord) => boolean;
	readonly preloadOverlays: () => void;
	readonly onOpen: () => void;
	readonly setFormError: (error: ProjectFormError | null) => void;
	readonly setStatus: (status: string | null) => void;
}

export function createProjectBoardScaffoldDialog(input: ProjectBoardScaffoldDialogInput) {
	let dialogWorkspace: ScaffoldDialogWorkspace | null = null;
	let ssealedTarget = $state<ProjectRepositoryTarget | null>(null);
	let ssealedScaffoldApplyScope = $state<SsealedScaffoldApplyScope>(
		getDefaultSsealedScaffoldApplyScope()
	);
	let ssealedScaffoldApplyProfile = $state<SsealedScaffoldProfile>(
		getDefaultSsealedScaffoldProfile()
	);
	let ssealedPreview = $state<SsealedScaffoldPlan | null>(null);
	let previewGeneration = 0;
	let isPreviewingSsealed = $state(false);
	let isApplyingSsealed = $state(false);
	let canApplySsealedScaffold = $derived(
		ssealedTarget !== null &&
			ssealedPreview !== null &&
			ssealedPreview.missingCount > 0 &&
			!isPreviewingSsealed &&
			!isApplyingSsealed
	);

	function openApplySsealedRepositoryDialog(target: ProjectRepositoryTarget) {
		input.preloadOverlays();

		if (!input.canApplyToRepository(target.repository)) {
			input.setFormError(
				target.repository.path === null
					? 'project-repository-path-required'
					: 'project-repository-path-outside-workspace'
			);
			return;
		}

		dialogWorkspace = { ...input.captureWorkspace() };
		ssealedTarget = target;
		const defaultScope = getDefaultSsealedScaffoldApplyScope();
		const defaultProfile = getDefaultSsealedScaffoldProfile();
		ssealedScaffoldApplyScope = defaultScope;
		ssealedScaffoldApplyProfile = defaultProfile;
		ssealedPreview = null;
		isPreviewingSsealed = false;
		isApplyingSsealed = false;
		input.setFormError(null);
		input.setStatus(null);
		input.onOpen();
		void refreshSsealedScaffoldPreview(target, defaultScope, defaultProfile);
	}

	function closeSsealedScaffoldDialog() {
		dialogWorkspace = null;
		previewGeneration += 1;
		ssealedTarget = null;
		ssealedScaffoldApplyScope = getDefaultSsealedScaffoldApplyScope();
		ssealedScaffoldApplyProfile = getDefaultSsealedScaffoldProfile();
		ssealedPreview = null;
		isPreviewingSsealed = false;
		isApplyingSsealed = false;
		input.setFormError(null);
	}

	function closeSsealedScaffoldDialogFromBackdrop(event: MouseEvent) {
		if (event.target === event.currentTarget && !isApplyingSsealed) {
			closeSsealedScaffoldDialog();
		}
	}

	function selectSsealedScaffoldApplyScope(scope: SsealedScaffoldApplyScope) {
		ssealedScaffoldApplyScope = scope;
		ssealedPreview = null;
		input.setFormError(null);
		input.setStatus(null);
		void refreshSsealedScaffoldPreview(ssealedTarget, scope, ssealedScaffoldApplyProfile);
	}

	function selectSsealedScaffoldApplyProfile(profile: SsealedScaffoldProfile) {
		ssealedScaffoldApplyProfile = profile;
		ssealedPreview = null;
		input.setFormError(null);
		input.setStatus(null);
		void refreshSsealedScaffoldPreview(ssealedTarget, ssealedScaffoldApplyScope, profile);
	}

	async function refreshSsealedScaffoldPreview(
		target = ssealedTarget,
		scope = ssealedScaffoldApplyScope,
		profile = ssealedScaffoldApplyProfile
	) {
		const workspace = dialogWorkspace;
		if (workspace === null || !workspace.isCurrent()) return;
		if (target === null || target.repository.path === null) {
			input.setFormError('project-repository-not-found');
			return;
		}

		const repositoryId = target.repository.id;
		const generation = ++previewGeneration;

		isPreviewingSsealed = true;
		input.setFormError(null);
		input.setStatus(null);

		try {
			const result = await previewSsealedScaffoldForRepository(
				workspace.workspacePath,
				target.repository.path,
				scope,
				profile
			);

			if (
				dialogWorkspace !== workspace || !workspace.isCurrent() ||
				previewGeneration !== generation ||
				ssealedTarget?.repository.id !== repositoryId ||
				ssealedScaffoldApplyScope !== scope ||
				ssealedScaffoldApplyProfile !== profile
			) {
				return;
			}

			if (result.ok) {
				ssealedPreview = result.plan;
				return;
			}

			ssealedPreview = null;
			input.setFormError(result.error);
		} finally {
			if (
				dialogWorkspace === workspace &&
				previewGeneration === generation &&
				ssealedTarget?.repository.id === repositoryId &&
				ssealedScaffoldApplyScope === scope &&
				ssealedScaffoldApplyProfile === profile
			) {
				isPreviewingSsealed = false;
			}
		}
	}

	async function applySsealedScaffoldToTarget() {
		const target = ssealedTarget;
		const workspace = dialogWorkspace;
		if (workspace === null || !workspace.isCurrent()) return;

		if (target === null || target.repository.path === null || isApplyingSsealed) {
			return;
		}

		if (!input.canApplyToRepository(target.repository)) {
			input.setFormError('project-repository-path-outside-workspace');
			return;
		}

		const repositoryId = target.repository.id;
		const scope = ssealedScaffoldApplyScope;
		const profile = ssealedScaffoldApplyProfile;

		isApplyingSsealed = true;
		input.setFormError(null);
		input.setStatus(null);

		try {
			const result = await applySsealedScaffoldToRepository(
				workspace.workspacePath,
				target.repository.path,
				scope,
				profile
			);

			if (
				dialogWorkspace !== workspace || !workspace.isCurrent() ||
				ssealedTarget?.repository.id !== repositoryId ||
				ssealedScaffoldApplyScope !== scope ||
				ssealedScaffoldApplyProfile !== profile
			) {
				return;
			}

			if (!result.ok) {
				input.setFormError(result.error);
				return;
			}

			ssealedPreview = result.plan;
			input.setStatus(
				result.plan.conflictCount > 0
					? input.messages().ssealedScaffold.appliedWithSkippedConflictsSummary
							.replace('{added}', result.plan.addedCount.toString())
							.replace('{conflicts}', result.plan.conflictCount.toString())
					: input.messages().ssealedScaffold.appliedSummary.replace(
							'{added}',
							result.plan.addedCount.toString()
						)
			);
		} finally {
			if (dialogWorkspace === workspace) {
				isApplyingSsealed = false;
			}
		}
	}

	return {
		get ssealedTarget() { return ssealedTarget; },
		get ssealedScaffoldApplyScope() { return ssealedScaffoldApplyScope; },
		get ssealedScaffoldApplyProfile() { return ssealedScaffoldApplyProfile; },
		get ssealedPreview() { return ssealedPreview; },
		get isPreviewingSsealed() { return isPreviewingSsealed; },
		get isApplyingSsealed() { return isApplyingSsealed; },
		get canApplySsealedScaffold() { return canApplySsealedScaffold; },
		openApplySsealedRepositoryDialog,
		closeSsealedScaffoldDialog,
		closeSsealedScaffoldDialogFromBackdrop,
		selectSsealedScaffoldApplyScope,
		selectSsealedScaffoldApplyProfile,
		refreshSsealedScaffoldPreview,
		applySsealedScaffoldToTarget,
	};
}
