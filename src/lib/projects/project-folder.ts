import { getTauriInvoke } from '$lib/tauri/tauri-invoke';
import { normalizeWorkspacePathForStorage } from '$lib/workspaces/workspace-path-format';

export type ProjectFolderError =
	| 'project-folder-workspace-required'
	| 'project-folder-workspace-not-absolute'
	| 'project-folder-workspace-not-found'
	| 'project-folder-workspace-not-directory'
	| 'project-folder-workspace-permission-denied'
	| 'project-folder-workspace-unreadable'
	| 'project-folder-root-invalid'
	| 'project-folder-parent-required'
	| 'project-folder-parent-invalid'
	| 'project-folder-parent-not-found'
	| 'project-folder-path-required'
	| 'project-folder-path-invalid'
	| 'project-folder-name-required'
	| 'project-folder-name-invalid'
	| 'project-folder-conflict'
	| 'project-folder-create-failed'
	| 'project-folder-ssealed-scaffold-failed'
	| 'project-folder-open-path-required'
	| 'project-folder-open-path-not-absolute'
	| 'project-folder-open-path-not-found'
	| 'project-folder-open-path-not-directory'
	| 'project-folder-open-path-permission-denied'
	| 'project-folder-repository-path-outside-workspace'
	| 'project-folder-open-failed'
	| 'project-folder-delete-path-required'
	| 'project-folder-delete-path-not-absolute'
	| 'project-folder-delete-path-not-found'
	| 'project-folder-delete-path-not-directory'
	| 'project-folder-delete-path-outside-workspace'
	| 'project-folder-delete-path-permission-denied'
	| 'project-folder-delete-failed'
	| 'project-folder-unavailable';

export type SsealedScaffoldScope = 'none' | 'design' | 'frontend' | 'backend' | 'fullstack';
export type SsealedScaffoldApplyScope = Exclude<SsealedScaffoldScope, 'none'>;
export type SsealedScaffoldFileStatus = 'missing' | 'added' | 'unchanged' | 'conflict';

export interface SsealedScaffoldFilePlan {
	readonly path: string;
	readonly kind: string;
	readonly checksum: string;
	readonly status: SsealedScaffoldFileStatus;
}

export interface SsealedScaffoldPlan {
	readonly toolVersion: string;
	readonly scope: SsealedScaffoldApplyScope;
	readonly runner: string;
	readonly files: readonly SsealedScaffoldFilePlan[];
	readonly missingCount: number;
	readonly addedCount: number;
	readonly unchangedCount: number;
	readonly conflictCount: number;
}

export type ProjectFolderCreateResult =
	| {
			readonly ok: true;
			readonly folderName: string;
			readonly relativePath: string;
	  }
	| {
			readonly ok: false;
			readonly error: ProjectFolderError;
	  };

export type ProjectFolderOpenResult =
	| {
			readonly ok: true;
	  }
	| {
			readonly ok: false;
			readonly error: ProjectFolderError;
	  };

export type ProjectFolderDeleteResult =
	| {
			readonly ok: true;
	  }
	| {
			readonly ok: false;
			readonly error: ProjectFolderError;
	  };

export type SsealedScaffoldPlanResult =
	| {
			readonly ok: true;
			readonly plan: SsealedScaffoldPlan;
	  }
	| {
			readonly ok: false;
			readonly error: ProjectFolderError;
	  };

interface ProjectFolderCreateResponse {
	readonly ok: boolean;
	readonly folderName?: string | null;
	readonly relativePath?: string | null;
	readonly error?: ProjectFolderError | null;
}

interface ProjectFolderOpenResponse {
	readonly ok: boolean;
	readonly error?: ProjectFolderError | null;
}

interface ProjectFolderDeleteResponse {
	readonly ok: boolean;
	readonly error?: ProjectFolderError | null;
}

interface SsealedScaffoldFilePlanResponse {
	readonly path?: string | null;
	readonly kind?: string | null;
	readonly checksum?: string | null;
	readonly status?: string | null;
}

interface SsealedScaffoldPlanResponse {
	readonly toolVersion?: string | null;
	readonly scope?: string | null;
	readonly runner?: string | null;
	readonly files?: readonly SsealedScaffoldFilePlanResponse[] | null;
	readonly missingCount?: number | null;
	readonly addedCount?: number | null;
	readonly unchangedCount?: number | null;
	readonly conflictCount?: number | null;
}

interface SsealedScaffoldPlanResultResponse {
	readonly ok: boolean;
	readonly plan?: SsealedScaffoldPlanResponse | null;
	readonly error?: ProjectFolderError | null;
}

export async function createProjectFolder(
	workspacePath: string,
	folderName: string
): Promise<ProjectFolderCreateResult> {
	return createProjectFolderFromCommand('create_project_folder', {
		workspacePath: normalizeWorkspacePathForStorage(workspacePath),
		folderName
	});
}

export async function createProjectGroupFolder(
	workspacePath: string,
	parentRelativePath: string,
	folderName: string,
	options: {
		readonly ssealedScaffoldScope?: SsealedScaffoldScope;
	} = {}
): Promise<ProjectFolderCreateResult> {
	return createProjectFolderFromCommand('create_project_group_folder', {
		workspacePath: normalizeWorkspacePathForStorage(workspacePath),
		parentRelativePath,
		folderName,
		ssealedScaffoldScope:
			options.ssealedScaffoldScope === undefined || options.ssealedScaffoldScope === 'none'
				? null
				: options.ssealedScaffoldScope
	});
}

export async function ensureProjectFolderPath(
	workspacePath: string,
	relativePath: string
): Promise<ProjectFolderCreateResult> {
	return createProjectFolderFromCommand('ensure_project_folder_path', {
		workspacePath: normalizeWorkspacePathForStorage(workspacePath),
		relativePath
	});
}

export async function openProjectFolderPath(path: string): Promise<ProjectFolderOpenResult> {
	return openProjectFolderFromCommand('open_project_folder_path', {
		path: normalizeWorkspacePathForStorage(path)
	});
}

export async function openProjectNodeFolder(
	workspacePath: string,
	relativePath: string
): Promise<ProjectFolderOpenResult> {
	return openProjectFolderFromCommand('open_project_node_folder', {
		workspacePath: normalizeWorkspacePathForStorage(workspacePath),
		relativePath
	});
}

export async function deleteProjectNodeFolder(
	workspacePath: string,
	relativePath: string
): Promise<ProjectFolderDeleteResult> {
	return deleteProjectFolderFromCommand('delete_project_node_folder', {
		workspacePath: normalizeWorkspacePathForStorage(workspacePath),
		relativePath
	});
}

export async function deleteProjectRepositoryFolder(
	workspacePath: string,
	path: string
): Promise<ProjectFolderDeleteResult> {
	return deleteProjectFolderFromCommand('delete_project_repository_folder', {
		workspacePath: normalizeWorkspacePathForStorage(workspacePath),
		path: normalizeWorkspacePathForStorage(path)
	});
}

export async function previewSsealedScaffoldForRepository(
	workspacePath: string,
	path: string,
	scope: SsealedScaffoldApplyScope
): Promise<SsealedScaffoldPlanResult> {
	return runSsealedScaffoldRepositoryCommand('preview_ssealed_scaffold_for_repository', {
		workspacePath: normalizeWorkspacePathForStorage(workspacePath),
		path: normalizeWorkspacePathForStorage(path),
		ssealedScaffoldScope: scope
	});
}

export async function applySsealedScaffoldToRepository(
	workspacePath: string,
	path: string,
	scope: SsealedScaffoldApplyScope
): Promise<SsealedScaffoldPlanResult> {
	return runSsealedScaffoldRepositoryCommand('apply_ssealed_scaffold_to_repository', {
		workspacePath: normalizeWorkspacePathForStorage(workspacePath),
		path: normalizeWorkspacePathForStorage(path),
		ssealedScaffoldScope: scope
	});
}

function normalizeProjectRelativePath(path: string) {
	return path.trim().replaceAll('\\', '/');
}

async function createProjectFolderFromCommand(
	command: 'create_project_folder' | 'create_project_group_folder' | 'ensure_project_folder_path',
	args: Record<string, unknown>
): Promise<ProjectFolderCreateResult> {
	const invoke = getTauriInvoke();

	if (invoke === undefined) {
		return { ok: false, error: 'project-folder-unavailable' };
	}

	try {
		const response = await invoke<ProjectFolderCreateResponse>(command, args);

		if (
			response.ok &&
			typeof response.folderName === 'string' &&
			typeof response.relativePath === 'string'
		) {
			return {
				ok: true,
				folderName: response.folderName,
				relativePath: normalizeProjectRelativePath(response.relativePath)
			};
		}

		return {
			ok: false,
			error: isProjectFolderError(response.error)
				? response.error
				: 'project-folder-create-failed'
		};
	} catch {
		return { ok: false, error: 'project-folder-create-failed' };
	}
}

async function openProjectFolderFromCommand(
	command: 'open_project_folder_path' | 'open_project_node_folder',
	args: Record<string, unknown>
): Promise<ProjectFolderOpenResult> {
	const invoke = getTauriInvoke();

	if (invoke === undefined) {
		return { ok: false, error: 'project-folder-unavailable' };
	}

	try {
		const response = await invoke<ProjectFolderOpenResponse>(command, args);

		if (response.ok) {
			return { ok: true };
		}

		return {
			ok: false,
			error: isProjectFolderError(response.error)
				? response.error
				: 'project-folder-open-failed'
		};
	} catch {
		return { ok: false, error: 'project-folder-open-failed' };
	}
}

async function deleteProjectFolderFromCommand(
	command: 'delete_project_node_folder' | 'delete_project_repository_folder',
	args: Record<string, unknown>
): Promise<ProjectFolderDeleteResult> {
	const invoke = getTauriInvoke();

	if (invoke === undefined) {
		return { ok: false, error: 'project-folder-unavailable' };
	}

	try {
		const response = await invoke<ProjectFolderDeleteResponse>(command, args);

		if (response.ok) {
			return { ok: true };
		}

		return {
			ok: false,
			error: isProjectFolderError(response.error)
				? response.error
				: 'project-folder-delete-failed'
		};
	} catch {
		return { ok: false, error: 'project-folder-delete-failed' };
	}
}

async function runSsealedScaffoldRepositoryCommand(
	command: 'preview_ssealed_scaffold_for_repository' | 'apply_ssealed_scaffold_to_repository',
	args: Record<string, unknown>
): Promise<SsealedScaffoldPlanResult> {
	const invoke = getTauriInvoke();

	if (invoke === undefined) {
		return { ok: false, error: 'project-folder-unavailable' };
	}

	try {
		const response = await invoke<SsealedScaffoldPlanResultResponse>(command, args);
		const plan = normalizeSsealedScaffoldPlan(response.plan);

		if (response.ok && plan !== null) {
			return { ok: true, plan };
		}

		return {
			ok: false,
			error: isProjectFolderError(response.error)
				? response.error
				: 'project-folder-ssealed-scaffold-failed'
		};
	} catch {
		return { ok: false, error: 'project-folder-ssealed-scaffold-failed' };
	}
}

function normalizeSsealedScaffoldPlan(
	plan: SsealedScaffoldPlanResponse | null | undefined
): SsealedScaffoldPlan | null {
	if (
		plan === null ||
		plan === undefined ||
		typeof plan.toolVersion !== 'string' ||
		!isSsealedScaffoldApplyScope(plan.scope) ||
		typeof plan.runner !== 'string' ||
		!Array.isArray(plan.files) ||
		typeof plan.missingCount !== 'number' ||
		typeof plan.addedCount !== 'number' ||
		typeof plan.unchangedCount !== 'number' ||
		typeof plan.conflictCount !== 'number'
	) {
		return null;
	}

	const files = plan.files
		.map(normalizeSsealedScaffoldFilePlan)
		.filter((file): file is SsealedScaffoldFilePlan => file !== null);

	if (files.length !== plan.files.length) {
		return null;
	}

	return {
		toolVersion: plan.toolVersion,
		scope: plan.scope,
		runner: plan.runner,
		files,
		missingCount: plan.missingCount,
		addedCount: plan.addedCount,
		unchangedCount: plan.unchangedCount,
		conflictCount: plan.conflictCount
	};
}

function normalizeSsealedScaffoldFilePlan(
	file: SsealedScaffoldFilePlanResponse
): SsealedScaffoldFilePlan | null {
	if (
		typeof file.path !== 'string' ||
		typeof file.kind !== 'string' ||
		typeof file.checksum !== 'string' ||
		!isSsealedScaffoldFileStatus(file.status)
	) {
		return null;
	}

	return {
		path: file.path,
		kind: file.kind,
		checksum: file.checksum,
		status: file.status
	};
}

function isSsealedScaffoldApplyScope(value: unknown): value is SsealedScaffoldApplyScope {
	return (
		value === 'design' ||
		value === 'frontend' ||
		value === 'backend' ||
		value === 'fullstack'
	);
}

function isSsealedScaffoldFileStatus(value: unknown): value is SsealedScaffoldFileStatus {
	return (
		value === 'missing' ||
		value === 'added' ||
		value === 'unchanged' ||
		value === 'conflict'
	);
}

function isProjectFolderError(value: unknown): value is ProjectFolderError {
	return (
		value === 'project-folder-workspace-required' ||
		value === 'project-folder-workspace-not-absolute' ||
		value === 'project-folder-workspace-not-found' ||
		value === 'project-folder-workspace-not-directory' ||
		value === 'project-folder-workspace-permission-denied' ||
		value === 'project-folder-workspace-unreadable' ||
		value === 'project-folder-root-invalid' ||
		value === 'project-folder-parent-required' ||
		value === 'project-folder-parent-invalid' ||
		value === 'project-folder-parent-not-found' ||
		value === 'project-folder-path-required' ||
		value === 'project-folder-path-invalid' ||
		value === 'project-folder-name-required' ||
		value === 'project-folder-name-invalid' ||
		value === 'project-folder-conflict' ||
		value === 'project-folder-create-failed' ||
		value === 'project-folder-ssealed-scaffold-failed' ||
		value === 'project-folder-open-path-required' ||
		value === 'project-folder-open-path-not-absolute' ||
		value === 'project-folder-open-path-not-found' ||
		value === 'project-folder-open-path-not-directory' ||
		value === 'project-folder-open-path-permission-denied' ||
		value === 'project-folder-repository-path-outside-workspace' ||
		value === 'project-folder-open-failed' ||
		value === 'project-folder-delete-path-required' ||
		value === 'project-folder-delete-path-not-absolute' ||
		value === 'project-folder-delete-path-not-found' ||
		value === 'project-folder-delete-path-not-directory' ||
		value === 'project-folder-delete-path-outside-workspace' ||
		value === 'project-folder-delete-path-permission-denied' ||
		value === 'project-folder-delete-failed' ||
		value === 'project-folder-unavailable'
	);
}
