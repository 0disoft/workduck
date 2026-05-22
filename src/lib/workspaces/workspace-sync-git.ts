import { getTauriInvoke } from '$lib/tauri/tauri-invoke';
import { normalizeWorkspacePathForStorage } from './workspace-path-format';
import type { ProjectRepositoryGitCredentialInput } from '$lib/projects/project-repository';

export type WorkspaceSyncGitError =
	| 'workspace-sync-git-folder-required'
	| 'workspace-sync-git-folder-not-absolute'
	| 'workspace-sync-git-folder-not-found'
	| 'workspace-sync-git-folder-not-directory'
	| 'workspace-sync-git-folder-permission-denied'
	| 'workspace-sync-git-read-failed'
	| 'workspace-sync-git-unavailable';

export type WorkspaceSyncGitRunAction = 'fetch' | 'pull' | 'push';

export type WorkspaceSyncGitRunOutcome = 'fetched' | 'pulled' | 'pushed' | 'committed-and-pushed';

export type WorkspaceSyncGitRunError =
	| WorkspaceSyncGitError
	| 'workspace-sync-git-action-invalid'
	| 'workspace-sync-file-name-required'
	| 'workspace-sync-file-name-invalid'
	| 'workspace-sync-file-not-found'
	| 'workspace-sync-file-target-invalid'
	| 'workspace-sync-git-not-repository'
	| 'workspace-sync-git-remote-missing'
	| 'workspace-sync-git-branch-missing'
	| 'workspace-sync-git-command-unavailable'
	| 'workspace-sync-git-command-timed-out'
	| 'workspace-sync-git-auth-required'
	| 'workspace-sync-git-identity-required'
	| 'workspace-sync-git-remote-has-changes'
	| 'workspace-sync-git-fast-forward-required'
	| 'workspace-sync-git-trust-required'
	| 'workspace-sync-git-command-failed';

export type WorkspaceSyncGitInspectionResult =
	| {
			readonly ok: true;
			readonly normalizedPath: string;
			readonly isRepository: boolean;
			readonly originUrl: string | null;
			readonly branchName: string | null;
			readonly aheadCount: number;
			readonly behindCount: number;
			readonly hasSyncFileChanges: boolean;
	  }
	| {
			readonly ok: false;
			readonly error: WorkspaceSyncGitError;
	  };

export type WorkspaceSyncGitRunResult =
	| {
			readonly ok: true;
			readonly outcome: WorkspaceSyncGitRunOutcome;
	  }
	| {
			readonly ok: false;
			readonly error: WorkspaceSyncGitRunError;
			readonly phase: string | null;
	  };

interface WorkspaceSyncGitInspectionResponse {
	readonly ok: boolean;
	readonly normalizedPath?: string | null;
	readonly isRepository?: boolean | null;
	readonly originUrl?: string | null;
	readonly branchName?: string | null;
	readonly aheadCount?: number | null;
	readonly behindCount?: number | null;
	readonly hasSyncFileChanges?: boolean | null;
	readonly error?: WorkspaceSyncGitError | null;
}

interface WorkspaceSyncGitRunResponse {
	readonly ok: boolean;
	readonly outcome?: WorkspaceSyncGitRunOutcome | null;
	readonly error?: WorkspaceSyncGitRunError | null;
	readonly phase?: string | null;
}

export async function inspectWorkspaceSyncGit(
	folderPath: string,
	fileName = ''
): Promise<WorkspaceSyncGitInspectionResult> {
	const invoke = getTauriInvoke();

	if (invoke === undefined) {
		return { ok: false, error: 'workspace-sync-git-unavailable' };
	}

	try {
		const response = await invoke<WorkspaceSyncGitInspectionResponse>('inspect_workspace_sync_git', {
			folderPath: normalizeWorkspacePathForStorage(folderPath),
			fileName
		});

		if (
			response.ok &&
			typeof response.normalizedPath === 'string' &&
			typeof response.isRepository === 'boolean'
		) {
			return {
				ok: true,
				normalizedPath: normalizeWorkspacePathForStorage(response.normalizedPath),
				isRepository: response.isRepository,
				originUrl: typeof response.originUrl === 'string' ? response.originUrl : null,
				branchName: typeof response.branchName === 'string' ? response.branchName : null,
				aheadCount: normalizeGitCount(response.aheadCount),
				behindCount: normalizeGitCount(response.behindCount),
				hasSyncFileChanges: response.hasSyncFileChanges === true
			};
		}

		return {
			ok: false,
			error: isWorkspaceSyncGitError(response.error)
				? response.error
				: 'workspace-sync-git-read-failed'
		};
	} catch {
		return { ok: false, error: 'workspace-sync-git-read-failed' };
	}
}

function normalizeGitCount(value: unknown) {
	return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : 0;
}

export async function runWorkspaceSyncGit(
	folderPath: string,
	fileName: string,
	action: WorkspaceSyncGitRunAction,
	credential: ProjectRepositoryGitCredentialInput | null = null
): Promise<WorkspaceSyncGitRunResult> {
	const invoke = getTauriInvoke();

	if (invoke === undefined) {
		return { ok: false, error: 'workspace-sync-git-unavailable', phase: null };
	}

	try {
		const response = await invoke<WorkspaceSyncGitRunResponse>('run_workspace_sync_git', {
			folderPath: normalizeWorkspacePathForStorage(folderPath),
			fileName,
			action,
			...createCredentialCommandArgs(credential)
		});

		if (response.ok && isWorkspaceSyncGitRunOutcome(response.outcome)) {
			return {
				ok: true,
				outcome: response.outcome
			};
		}

		return {
			ok: false,
			error: isWorkspaceSyncGitRunError(response.error)
				? response.error
				: 'workspace-sync-git-command-failed',
			phase: typeof response.phase === 'string' ? response.phase : null
		};
	} catch {
		return { ok: false, error: 'workspace-sync-git-command-failed', phase: null };
	}
}

function createCredentialCommandArgs(credential: ProjectRepositoryGitCredentialInput | null) {
	return credential === null
		? {
				credentialKind: null,
				credentialValue: null
			}
		: {
				credentialKind: credential.kind,
				credentialValue: credential.value
			};
}

export function formatWorkspaceSyncRemoteForDisplay(originUrl: string | null) {
	if (originUrl === null || originUrl.trim().length === 0) {
		return 'No remote';
	}

	const normalizedOriginUrl = originUrl.trim().replace(/\.git$/u, '');

	if (normalizedOriginUrl.includes('://')) {
		try {
			const url = new URL(normalizedOriginUrl);

			return formatRemoteParts(url.hostname, url.pathname);
		} catch {
			return normalizedOriginUrl;
		}
	}

	const sshRemoteMatch = /^(?:[^@]+@)?([^:/]+)[:/](.+)$/u.exec(normalizedOriginUrl);
	const sshHost = sshRemoteMatch?.[1];
	const sshPath = sshRemoteMatch?.[2];

	if (sshHost !== undefined && sshPath !== undefined) {
		return formatRemoteParts(sshHost, sshPath);
	}

	const fallbackParts = normalizedOriginUrl.split(/[\\/]/u).filter(Boolean);
	const fallbackRepoName = fallbackParts[fallbackParts.length - 1];

	return fallbackRepoName ?? normalizedOriginUrl;
}

function formatRemoteParts(host: string, path: string) {
	const pathParts = path.split(/[\\/]/u).filter(Boolean);
	const repoName = pathParts[pathParts.length - 1];

	if (repoName === undefined) {
		return host;
	}

	return `${host}/.../${repoName}`;
}

function isWorkspaceSyncGitRunOutcome(value: unknown): value is WorkspaceSyncGitRunOutcome {
	return (
		value === 'fetched' ||
		value === 'pulled' ||
		value === 'pushed' ||
		value === 'committed-and-pushed'
	);
}

function isWorkspaceSyncGitError(value: unknown): value is WorkspaceSyncGitError {
	return (
		value === 'workspace-sync-git-folder-required' ||
		value === 'workspace-sync-git-folder-not-absolute' ||
		value === 'workspace-sync-git-folder-not-found' ||
		value === 'workspace-sync-git-folder-not-directory' ||
		value === 'workspace-sync-git-folder-permission-denied' ||
		value === 'workspace-sync-git-read-failed' ||
		value === 'workspace-sync-git-unavailable'
	);
}

function isWorkspaceSyncGitRunError(value: unknown): value is WorkspaceSyncGitRunError {
	return (
		isWorkspaceSyncGitError(value) ||
		value === 'workspace-sync-git-action-invalid' ||
		value === 'workspace-sync-file-name-required' ||
		value === 'workspace-sync-file-name-invalid' ||
		value === 'workspace-sync-file-not-found' ||
		value === 'workspace-sync-file-target-invalid' ||
		value === 'workspace-sync-git-not-repository' ||
		value === 'workspace-sync-git-remote-missing' ||
		value === 'workspace-sync-git-branch-missing' ||
		value === 'workspace-sync-git-command-unavailable' ||
		value === 'workspace-sync-git-command-timed-out' ||
		value === 'workspace-sync-git-auth-required' ||
		value === 'workspace-sync-git-identity-required' ||
		value === 'workspace-sync-git-remote-has-changes' ||
		value === 'workspace-sync-git-fast-forward-required' ||
		value === 'workspace-sync-git-trust-required' ||
		value === 'workspace-sync-git-command-failed'
	);
}
