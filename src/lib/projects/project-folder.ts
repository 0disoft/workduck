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
	| 'project-folder-open-path-required'
	| 'project-folder-open-path-not-absolute'
	| 'project-folder-open-path-not-found'
	| 'project-folder-open-path-not-directory'
	| 'project-folder-open-path-permission-denied'
	| 'project-folder-open-failed'
	| 'project-folder-delete-path-required'
	| 'project-folder-delete-path-not-absolute'
	| 'project-folder-delete-path-not-found'
	| 'project-folder-delete-path-not-directory'
	| 'project-folder-delete-path-outside-workspace'
	| 'project-folder-delete-path-permission-denied'
	| 'project-folder-delete-failed'
	| 'project-folder-unavailable';

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
	folderName: string
): Promise<ProjectFolderCreateResult> {
	return createProjectFolderFromCommand('create_project_group_folder', {
		workspacePath: normalizeWorkspacePathForStorage(workspacePath),
		parentRelativePath,
		folderName
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
		value === 'project-folder-open-path-required' ||
		value === 'project-folder-open-path-not-absolute' ||
		value === 'project-folder-open-path-not-found' ||
		value === 'project-folder-open-path-not-directory' ||
		value === 'project-folder-open-path-permission-denied' ||
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
