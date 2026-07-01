import { isObjectRecord } from '$lib/shared/object-record';
import { getTauriInvoke } from '$lib/tauri/tauri-invoke';
import { normalizeWorkspacePathForStorage } from '$lib/workspaces/workspace-path-format';

const GITHUB_API_REQUEST_TIMEOUT_MS = 30_000;

export type ProjectRepositoryCloneError =
	| 'project-repository-clone-unavailable'
	| 'project-repository-workspace-required'
	| 'project-repository-workspace-not-absolute'
	| 'project-repository-workspace-not-found'
	| 'project-repository-workspace-not-directory'
	| 'project-repository-workspace-permission-denied'
	| 'project-repository-workspace-unreadable'
	| 'project-repository-group-path-required'
	| 'project-repository-group-path-invalid'
	| 'project-repository-group-path-not-found'
	| 'project-repository-group-path-not-directory'
	| 'project-repository-name-required'
	| 'project-repository-name-invalid'
	| 'project-repository-remote-url-required'
	| 'project-repository-remote-url-invalid'
	| 'project-repository-clone-target-exists'
	| 'project-repository-clone-command-unavailable'
	| 'project-repository-clone-command-timed-out'
	| 'project-repository-clone-path-too-long'
	| 'project-repository-clone-token-invalid'
	| 'project-repository-clone-permission-denied'
	| 'project-repository-clone-repository-not-found'
	| 'project-repository-clone-organization-restricted'
	| 'project-repository-clone-access-denied'
	| 'project-repository-clone-auth-required'
	| 'project-repository-clone-failed';

export type ProjectRepositoryGitError =
	| 'project-repository-git-path-required'
	| 'project-repository-git-path-not-absolute'
	| 'project-repository-git-path-not-found'
	| 'project-repository-git-path-not-directory'
	| 'project-repository-git-path-permission-denied'
	| 'project-repository-git-path-unreadable'
	| 'project-repository-git-command-unavailable'
	| 'project-repository-git-command-failed'
	| 'project-repository-git-command-timed-out'
	| 'project-repository-git-not-repository'
	| 'project-repository-git-init-failed'
	| 'project-repository-git-remote-missing'
	| 'project-repository-git-push-auth-required'
	| 'project-repository-git-push-empty'
	| 'project-repository-git-push-failed'
	| 'project-repository-git-fetch-auth-required'
	| 'project-repository-git-fetch-failed'
	| 'project-repository-git-pull-auth-required'
	| 'project-repository-git-pull-conflict'
	| 'project-repository-git-pull-failed'
	| 'project-repository-github-repo-name-required'
	| 'project-repository-github-repo-name-invalid'
	| 'project-repository-github-commit-message-required'
	| 'project-repository-github-commit-message-invalid'
	| 'project-repository-github-visibility-invalid'
	| 'project-repository-github-cli-unavailable'
	| 'project-repository-github-auth-required'
	| 'project-repository-github-remote-exists'
	| 'project-repository-github-empty'
	| 'project-repository-github-commit-identity-missing'
	| 'project-repository-github-commit-index-locked'
	| 'project-repository-github-commit-hook-failed'
	| 'project-repository-github-commit-failed'
	| 'project-repository-github-create-failed';

export type ProjectRepositoryGithubVisibility = 'private' | 'public';
export type ProjectRepositoryGitCredentialKind = 'github-token';

export interface ProjectRepositoryGitCredentialInput {
	readonly kind: ProjectRepositoryGitCredentialKind;
	readonly value: string;
}

export type ProjectRepositoryCloneResult =
	| {
			readonly ok: true;
			readonly path: string;
	  }
	| {
			readonly ok: false;
			readonly error: ProjectRepositoryCloneError;
	  };

export type ProjectRepositoryForkRemoteResult =
	| {
			readonly ok: true;
			readonly remoteUrl: string;
			readonly upstreamRemoteUrl: string;
	  }
	| {
			readonly ok: false;
			readonly error: ProjectRepositoryCloneError | ProjectRepositoryGitError;
	  };

export type ProjectRepositoryGitInspectionResult =
	| {
			readonly ok: true;
			readonly isGitRepository: boolean;
			readonly hasRemote: boolean;
			readonly originUrl: string | null;
			readonly upstreamRemoteUrl: string | null;
			readonly aheadCount: number;
			readonly behindCount: number;
			readonly hasUncommittedChanges: boolean;
			readonly branch: string | null;
	  }
	| {
			readonly ok: false;
			readonly error: ProjectRepositoryGitError;
	  };

export interface ProjectRepositoryGitInspectionInput {
	readonly repositoryId: string;
	readonly path: string;
}

export interface ProjectRepositoryGitInspectionRecord {
	readonly repositoryId: string;
	readonly result: ProjectRepositoryGitInspectionResult;
}

export type ProjectRepositoryGitMutationResult =
	| {
			readonly ok: true;
	  }
	| {
			readonly ok: false;
			readonly error: ProjectRepositoryGitError;
	  };

interface ProjectRepositoryCloneInput {
	readonly workspacePath: string;
	readonly groupRelativePath: string;
	readonly repositoryName: string;
	readonly remoteUrl: string;
	readonly credential?: ProjectRepositoryGitCredentialInput | null;
}

interface ProjectRepositoryForkRemoteInput {
	readonly upstreamRemoteUrl: string;
	readonly credential: ProjectRepositoryGitCredentialInput;
}

interface ProjectRepositoryGithubPublishInput {
	readonly path: string;
	readonly repositoryName: string;
	readonly commitMessage: string;
	readonly visibility: ProjectRepositoryGithubVisibility;
	readonly credential?: ProjectRepositoryGitCredentialInput | null;
}

interface ProjectRepositoryCloneResponse {
	readonly ok: boolean;
	readonly path?: string | null;
	readonly error?: ProjectRepositoryCloneError | null;
}

interface ProjectRepositoryGitInspectionResponse {
	readonly ok: boolean;
	readonly isGitRepository?: boolean | null;
	readonly hasRemote?: boolean | null;
	readonly originUrl?: string | null;
	readonly upstreamRemoteUrl?: string | null;
	readonly aheadCount?: number | null;
	readonly behindCount?: number | null;
	readonly hasUncommittedChanges?: boolean | null;
	readonly branch?: string | null;
	readonly error?: ProjectRepositoryGitError | null;
}

interface ProjectRepositoryGitInspectionRecordResponse {
	readonly repositoryId?: string | null;
	readonly inspection?: ProjectRepositoryGitInspectionResponse | null;
}

interface ProjectRepositoryGitMutationResponse {
	readonly ok: boolean;
	readonly error?: ProjectRepositoryGitError | null;
}

export async function cloneProjectRepository(
	input: ProjectRepositoryCloneInput
): Promise<ProjectRepositoryCloneResult> {
	const invoke = getTauriInvoke();

	if (invoke === undefined) {
		return { ok: false, error: 'project-repository-clone-unavailable' };
	}

	try {
		const response = await invoke<ProjectRepositoryCloneResponse>('clone_project_repository', {
			workspacePath: normalizeWorkspacePathForStorage(input.workspacePath),
			groupRelativePath: input.groupRelativePath,
			repositoryName: input.repositoryName,
			remoteUrl: input.remoteUrl,
			...createCredentialCommandArgs(input.credential ?? null)
		});

		if (response.ok && typeof response.path === 'string') {
			const path = normalizeWorkspacePathForStorage(response.path);

			return path.length > 0
				? { ok: true, path }
				: { ok: false, error: 'project-repository-clone-failed' };
		}

		return {
			ok: false,
			error: isProjectRepositoryCloneError(response.error)
				? response.error
				: 'project-repository-clone-failed'
		};
	} catch {
		return { ok: false, error: 'project-repository-clone-failed' };
	}
}

export async function createGithubRepositoryFork(
	input: ProjectRepositoryForkRemoteInput
): Promise<ProjectRepositoryForkRemoteResult> {
	if (input.credential.kind !== 'github-token') {
		return { ok: false, error: 'project-repository-github-auth-required' };
	}

	const upstream = parseGithubRemoteUrl(input.upstreamRemoteUrl);

	if (upstream === null) {
		return { ok: false, error: 'project-repository-remote-url-invalid' };
	}

	const forkResult = await createGithubRepositoryForkWithToken({
		upstream,
		token: input.credential.value
	});

	return forkResult.ok
		? {
				ok: true,
				remoteUrl: forkResult.remoteUrl,
				upstreamRemoteUrl: upstream.remoteUrl
			}
		: forkResult;
}

export async function cloneForkedProjectRepository(input: {
	readonly workspacePath: string;
	readonly groupRelativePath: string;
	readonly repositoryName: string;
	readonly remoteUrl: string;
	readonly upstreamRemoteUrl: string;
	readonly credential: ProjectRepositoryGitCredentialInput;
}): Promise<ProjectRepositoryCloneResult> {
	const invoke = getTauriInvoke();

	if (invoke === undefined) {
		return { ok: false, error: 'project-repository-clone-unavailable' };
	}

	try {
		const response = await invoke<ProjectRepositoryCloneResponse>('clone_project_repository_fork', {
			workspacePath: normalizeWorkspacePathForStorage(input.workspacePath),
			groupRelativePath: input.groupRelativePath,
			repositoryName: input.repositoryName,
			remoteUrl: input.remoteUrl,
			upstreamRemoteUrl: input.upstreamRemoteUrl,
			...createCredentialCommandArgs(input.credential)
		});

		if (response.ok && typeof response.path === 'string') {
			const path = normalizeWorkspacePathForStorage(response.path);

			return path.length > 0
				? { ok: true, path }
				: { ok: false, error: 'project-repository-clone-failed' };
		}

		return {
			ok: false,
			error: isProjectRepositoryCloneError(response.error)
				? response.error
				: 'project-repository-clone-failed'
		};
	} catch {
		return { ok: false, error: 'project-repository-clone-failed' };
	}
}

export async function inspectProjectRepositoryGit(
	path: string
): Promise<ProjectRepositoryGitInspectionResult> {
	const invoke = getTauriInvoke();

	if (invoke === undefined) {
		return { ok: false, error: 'project-repository-git-command-unavailable' };
	}

	try {
		const response = await invoke<ProjectRepositoryGitInspectionResponse>(
			'inspect_project_repository_git',
			{ path: normalizeWorkspacePathForStorage(path) }
		);

		return normalizeProjectRepositoryGitInspectionResponse(response);
	} catch {
		return { ok: false, error: 'project-repository-git-path-unreadable' };
	}
}

export async function inspectProjectRepositoriesGit(
	repositories: readonly ProjectRepositoryGitInspectionInput[]
): Promise<readonly ProjectRepositoryGitInspectionRecord[]> {
	const invoke = getTauriInvoke();

	if (invoke === undefined) {
		return repositories.map((repository) => ({
			repositoryId: repository.repositoryId,
			result: { ok: false, error: 'project-repository-git-command-unavailable' }
		}));
	}

	try {
		const response = await invoke<readonly ProjectRepositoryGitInspectionRecordResponse[]>(
			'inspect_project_repositories_git',
			{
				repositories: repositories.map((repository) => ({
					repositoryId: repository.repositoryId,
					path: normalizeWorkspacePathForStorage(repository.path)
				}))
			}
		);

		return response
			.map(normalizeProjectRepositoryGitInspectionRecord)
			.filter((record): record is ProjectRepositoryGitInspectionRecord => record !== null);
	} catch {
		return repositories.map((repository) => ({
			repositoryId: repository.repositoryId,
			result: { ok: false, error: 'project-repository-git-path-unreadable' }
		}));
	}
}

export async function initializeProjectRepositoryGit(
	path: string
): Promise<ProjectRepositoryGitMutationResult> {
	return runProjectRepositoryGitMutation('initialize_project_repository_git', path);
}

export async function fetchProjectRepositoryGit(
	path: string,
	credential: ProjectRepositoryGitCredentialInput | null = null
): Promise<ProjectRepositoryGitMutationResult> {
	return runProjectRepositoryGitMutation('fetch_project_repository_git', path, credential);
}

export async function pullProjectRepositoryGit(
	path: string,
	credential: ProjectRepositoryGitCredentialInput | null = null
): Promise<ProjectRepositoryGitMutationResult> {
	return runProjectRepositoryGitMutation('pull_project_repository_git', path, credential);
}

export async function pushProjectRepositoryGit(
	path: string,
	credential: ProjectRepositoryGitCredentialInput | null = null
): Promise<ProjectRepositoryGitMutationResult> {
	return runProjectRepositoryGitMutation('push_project_repository_git', path, credential);
}

export async function publishProjectRepositoryToGithub(
	input: ProjectRepositoryGithubPublishInput
): Promise<ProjectRepositoryGitMutationResult> {
	const credential = input.credential ?? null;

	if (credential?.kind === 'github-token') {
		return publishProjectRepositoryToGithubWithToken({
			...input,
			credential
		});
	}

	const invoke = getTauriInvoke();

	if (invoke === undefined) {
		return { ok: false, error: 'project-repository-github-cli-unavailable' };
	}

	try {
		const response = await invoke<ProjectRepositoryGitMutationResponse>(
			'publish_project_repository_to_github',
			{
				path: normalizeWorkspacePathForStorage(input.path),
				repositoryName: input.repositoryName,
				commitMessage: input.commitMessage,
				visibility: input.visibility
			}
		);

		return response.ok
			? { ok: true }
			: {
					ok: false,
					error: isProjectRepositoryGitError(response.error)
						? response.error
						: 'project-repository-github-create-failed'
				};
	} catch {
		return { ok: false, error: 'project-repository-github-create-failed' };
	}
}

async function publishProjectRepositoryToGithubWithToken(
	input: ProjectRepositoryGithubPublishInput & {
		readonly credential: ProjectRepositoryGitCredentialInput;
	}
): Promise<ProjectRepositoryGitMutationResult> {
	const invoke = getTauriInvoke();

	if (invoke === undefined) {
		return { ok: false, error: 'project-repository-github-create-failed' };
	}

	const parsedRepositoryName = parseGithubRepositoryName(input.repositoryName);

	if (parsedRepositoryName === null) {
		return { ok: false, error: 'project-repository-github-repo-name-invalid' };
	}

	const prepareResult = await prepareProjectRepositoryForGithubPublish(
		input.path,
		input.commitMessage
	);

	if (!prepareResult.ok) {
		return prepareResult;
	}

	const createResult = await createGithubRepositoryWithToken({
		repository: parsedRepositoryName,
		visibility: input.visibility,
		token: input.credential.value
	});

	if (!createResult.ok) {
		return createResult;
	}

	try {
		const response = await invoke<ProjectRepositoryGitMutationResponse>(
			'push_project_repository_to_github',
			{
				path: normalizeWorkspacePathForStorage(input.path),
				remoteUrl: createResult.remoteUrl,
				...createCredentialCommandArgs(input.credential)
			}
		);

		return response.ok
			? { ok: true }
			: {
					ok: false,
					error: isProjectRepositoryGitError(response.error)
						? response.error
						: 'project-repository-git-push-failed'
				};
	} catch {
		return { ok: false, error: 'project-repository-git-push-failed' };
	}
}

async function prepareProjectRepositoryForGithubPublish(
	path: string,
	commitMessage: string
): Promise<ProjectRepositoryGitMutationResult> {
	const invoke = getTauriInvoke();

	if (invoke === undefined) {
		return { ok: false, error: 'project-repository-github-create-failed' };
	}

	try {
		const response = await invoke<ProjectRepositoryGitMutationResponse>(
			'prepare_project_repository_for_github_publish',
			{
				path: normalizeWorkspacePathForStorage(path),
				commitMessage
			}
		);

		return response.ok
			? { ok: true }
			: {
					ok: false,
					error: isProjectRepositoryGitError(response.error)
						? response.error
						: 'project-repository-github-create-failed'
				};
	} catch {
		return { ok: false, error: 'project-repository-github-create-failed' };
	}
}

export function formatRepositoryRemoteUrlForDisplay(remoteUrl: string | null) {
	if (remoteUrl === null || remoteUrl.trim().length === 0) {
		return '';
	}

	const normalizedRemoteUrl = remoteUrl.trim().replace(/\.git$/iu, '');

	if (normalizedRemoteUrl.includes('://')) {
		try {
			const url = new URL(normalizedRemoteUrl);

			if (url.protocol === 'https:' || url.protocol === 'http:') {
				url.username = '';
				url.password = '';
			}

			return formatRemoteParts(url.hostname, url.pathname);
		} catch {
			return normalizedRemoteUrl;
		}
	}

	const scpRemoteMatch = /^(?:[^@]+@)?([^:/]+)[:/](.+)$/u.exec(normalizedRemoteUrl);
	const sshHost = scpRemoteMatch?.[1];
	const sshPath = scpRemoteMatch?.[2];

	if (sshHost !== undefined && sshPath !== undefined) {
		return formatRemoteParts(sshHost, sshPath);
	}

	return normalizedRemoteUrl;
}

async function runProjectRepositoryGitMutation(
	command: string,
	path: string,
	credential: ProjectRepositoryGitCredentialInput | null = null
): Promise<ProjectRepositoryGitMutationResult> {
	const invoke = getTauriInvoke();

	if (invoke === undefined) {
		return { ok: false, error: 'project-repository-git-command-unavailable' };
	}

	try {
		const response = await invoke<ProjectRepositoryGitMutationResponse>(command, {
			path: normalizeWorkspacePathForStorage(path),
			...createCredentialCommandArgs(credential)
		});

		return response.ok
			? { ok: true }
			: {
					ok: false,
					error: isProjectRepositoryGitError(response.error)
						? response.error
						: 'project-repository-git-command-failed'
				};
	} catch {
		return { ok: false, error: 'project-repository-git-command-failed' };
	}
}

interface GithubRepositoryNameParts {
	readonly owner: string | null;
	readonly name: string;
}

interface GithubRemoteParts {
	readonly owner: string;
	readonly name: string;
	readonly remoteUrl: string;
}

interface GithubRepositoryCreateInput {
	readonly repository: GithubRepositoryNameParts;
	readonly visibility: ProjectRepositoryGithubVisibility;
	readonly token: string;
}

type GithubRepositoryCreateResult =
	| {
			readonly ok: true;
			readonly remoteUrl: string;
	  }
	| {
			readonly ok: false;
			readonly error: ProjectRepositoryGitError;
	  };

interface GithubRepositoryForkInput {
	readonly upstream: GithubRemoteParts;
	readonly token: string;
}

async function createGithubRepositoryWithToken(
	input: GithubRepositoryCreateInput
): Promise<GithubRepositoryCreateResult> {
	try {
		const userResult = await readGithubUserLogin(input.token);

		if (!userResult.ok) {
			return userResult;
		}

		const endpoint =
			input.repository.owner === null || input.repository.owner === userResult.login
				? 'https://api.github.com/user/repos'
				: `https://api.github.com/orgs/${encodeURIComponent(input.repository.owner)}/repos`;
		const response = await fetchGithubApi(endpoint, {
			method: 'POST',
			headers: createGithubApiHeaders(input.token),
			body: JSON.stringify({
				name: input.repository.name,
				private: input.visibility === 'private'
			})
		});

		if (!response.ok) {
			return { ok: false, error: mapGithubApiFailure(response.status) };
		}

		const body: unknown = await response.json();

		if (!isObjectRecord(body) || typeof body.clone_url !== 'string') {
			return { ok: false, error: 'project-repository-github-create-failed' };
		}

		return { ok: true, remoteUrl: body.clone_url };
	} catch {
		return { ok: false, error: 'project-repository-github-create-failed' };
	}
}

async function createGithubRepositoryForkWithToken(
	input: GithubRepositoryForkInput
): Promise<GithubRepositoryCreateResult> {
	try {
		const userResult = await readGithubUserLogin(input.token);

		if (!userResult.ok) {
			return userResult;
		}

		const response = await fetchGithubApi(
			`https://api.github.com/repos/${encodeURIComponent(input.upstream.owner)}/${encodeURIComponent(input.upstream.name)}/forks`,
			{
				method: 'POST',
				headers: createGithubApiHeaders(input.token),
				body: JSON.stringify({})
			}
		);

		if (response.ok) {
			const body: unknown = await response.json();
			const remoteUrl = readGithubCloneUrl(body);

			if (remoteUrl !== null && githubRepositoryMatchesUpstreamFork(body, input.upstream)) {
				return { ok: true, remoteUrl };
			}

			return readExistingGithubForkWithRetry({
				owner: userResult.login,
				name: input.upstream.name,
				upstream: input.upstream,
				token: input.token
			});
		}

		if (!response.ok && response.status !== 403 && response.status !== 422) {
			return { ok: false, error: mapGithubApiFailure(response.status) };
		}

		return readExistingGithubFork({
			owner: userResult.login,
			name: input.upstream.name,
			upstream: input.upstream,
			token: input.token
		});
	} catch {
		return { ok: false, error: 'project-repository-github-create-failed' };
	}
}

async function readExistingGithubForkWithRetry(input: {
	readonly owner: string;
	readonly name: string;
	readonly upstream: GithubRemoteParts;
	readonly token: string;
}): Promise<GithubRepositoryCreateResult> {
	const retryDelays = [500, 1000, 2000, 3000];
	let result = await readExistingGithubFork(input);

	for (const retryDelay of retryDelays) {
		if (result.ok || result.error !== 'project-repository-github-create-failed') {
			return result;
		}

		await delay(retryDelay);
		result = await readExistingGithubFork(input);
	}

	return result;
}

async function readExistingGithubFork(input: {
	readonly owner: string;
	readonly name: string;
	readonly upstream: GithubRemoteParts;
	readonly token: string;
}): Promise<GithubRepositoryCreateResult> {
	const response = await fetchGithubApi(
		`https://api.github.com/repos/${encodeURIComponent(input.owner)}/${encodeURIComponent(input.name)}`,
		{
			headers: createGithubApiHeaders(input.token)
		}
	);

	if (!response.ok) {
		return { ok: false, error: mapGithubApiFailure(response.status) };
	}

	const body: unknown = await response.json();
	const remoteUrl = readGithubCloneUrl(body);

	if (remoteUrl === null || !githubRepositoryMatchesUpstreamFork(body, input.upstream)) {
		return { ok: false, error: 'project-repository-github-create-failed' };
	}

	return { ok: true, remoteUrl };
}

function delay(milliseconds: number) {
	return new Promise((resolve) => {
		globalThis.setTimeout(resolve, milliseconds);
	});
}

async function fetchGithubApi(input: RequestInfo | URL, init: RequestInit = {}) {
	const controller = new AbortController();
	const timeoutId = globalThis.setTimeout(() => controller.abort(), GITHUB_API_REQUEST_TIMEOUT_MS);

	try {
		return await fetch(input, {
			...init,
			signal: controller.signal
		});
	} finally {
		globalThis.clearTimeout(timeoutId);
	}
}

async function readGithubUserLogin(
	token: string
): Promise<
	| {
			readonly ok: true;
			readonly login: string;
	  }
	| {
			readonly ok: false;
			readonly error: ProjectRepositoryGitError;
	  }
> {
	const response = await fetchGithubApi('https://api.github.com/user', {
		headers: createGithubApiHeaders(token)
	});

	if (!response.ok) {
		return { ok: false, error: mapGithubApiFailure(response.status) };
	}

	const body: unknown = await response.json();

	if (!isObjectRecord(body) || typeof body.login !== 'string' || body.login.length === 0) {
		return { ok: false, error: 'project-repository-github-auth-required' };
	}

	return { ok: true, login: body.login };
}

function readGithubCloneUrl(value: unknown) {
	return isObjectRecord(value) && typeof value.clone_url === 'string' && value.clone_url.length > 0
		? value.clone_url
		: null;
}

function githubRepositoryMatchesUpstreamFork(value: unknown, upstream: GithubRemoteParts) {
	if (!isObjectRecord(value) || value.fork !== true) {
		return false;
	}

	const parent = isObjectRecord(value.parent) ? value.parent : null;
	const source = isObjectRecord(value.source) ? value.source : null;

	return (
		githubRepositoryFullNameMatches(parent, upstream) ||
		githubRepositoryFullNameMatches(source, upstream)
	);
}

function githubRepositoryFullNameMatches(value: Record<string, unknown> | null, upstream: GithubRemoteParts) {
	if (value === null || typeof value.full_name !== 'string') {
		return false;
	}

	return value.full_name.toLocaleLowerCase('en-US') ===
		`${upstream.owner}/${upstream.name}`.toLocaleLowerCase('en-US');
}

function createGithubApiHeaders(token: string) {
	return {
		Accept: 'application/vnd.github+json',
		Authorization: `Bearer ${token}`,
		'Content-Type': 'application/json',
		'X-GitHub-Api-Version': '2022-11-28'
	};
}

function mapGithubApiFailure(status: number): ProjectRepositoryGitError {
	if (status === 401 || status === 403) {
		return 'project-repository-github-auth-required';
	}

	if (status === 422) {
		return 'project-repository-github-create-failed';
	}

	return 'project-repository-github-create-failed';
}

function parseGithubRepositoryName(repositoryName: string): GithubRepositoryNameParts | null {
	const trimmedName = repositoryName.trim().replace(/\.git$/iu, '');

	if (trimmedName.length === 0 || trimmedName.length > 100) {
		return null;
	}

	const parts = trimmedName.split('/');

	if (parts.length > 2 || parts.some((part) => !isValidGithubRepositoryNamePart(part))) {
		return null;
	}

	const name = parts.at(-1);

	if (name === undefined) {
		return null;
	}

	if (parts.length === 1) {
		return { owner: null, name };
	}

	const owner = parts.at(0);

	return owner === undefined ? null : { owner, name };
}

function parseGithubRemoteUrl(remoteUrl: string): GithubRemoteParts | null {
	const trimmedUrl = remoteUrl.trim().replace(/\/+$/u, '').replace(/\.git$/iu, '');

	if (trimmedUrl.length === 0) {
		return null;
	}

	if (trimmedUrl.includes('://')) {
		try {
			const url = new URL(trimmedUrl);
			const protocol = url.protocol.toLocaleLowerCase('en-US');

			if (
				url.hostname.toLocaleLowerCase('en-US') !== 'github.com' ||
				(protocol !== 'https:' && protocol !== 'http:' && protocol !== 'ssh:') ||
				url.search.length > 0 ||
				url.hash.length > 0
			) {
				return null;
			}

			return createGithubRemoteParts(url.pathname, createGithubUrlRemoteStyle(protocol));
		} catch {
			return null;
		}
	}

	const scpRemoteMatch = /^git@github\.com:(.+)$/iu.exec(trimmedUrl);

	if (scpRemoteMatch?.[1] === undefined) {
		return null;
	}

	return createGithubRemoteParts(scpRemoteMatch[1], 'scp');
}

function createGithubRemoteParts(path: string, remoteStyle: string): GithubRemoteParts | null {
	const parts = path
		.replace(/^\/+/u, '')
		.replace(/\/+$/u, '')
		.replace(/\.git$/iu, '')
		.split('/')
		.filter(Boolean);

	if (parts.length !== 2 || !parts.every(isValidGithubRepositoryNamePart)) {
		return null;
	}

	const [owner, name] = parts;

	if (owner === undefined || name === undefined) {
		return null;
	}

	return {
		owner,
		name,
		remoteUrl: formatGithubRemoteUrl(owner, name, remoteStyle)
	};
}

function createGithubUrlRemoteStyle(protocol: string) {
	return protocol === 'ssh:' ? 'ssh' : 'https';
}

function formatGithubRemoteUrl(owner: string, name: string, remoteStyle: string) {
	if (remoteStyle === 'scp') {
		return `git@github.com:${owner}/${name}.git`;
	}

	if (remoteStyle === 'ssh') {
		return `ssh://git@github.com/${owner}/${name}.git`;
	}

	return `${remoteStyle}://github.com/${owner}/${name}.git`;
}

function isValidGithubRepositoryNamePart(value: string) {
	return (
		value.length > 0 &&
		value !== '.' &&
		value !== '..' &&
		!value.startsWith('.') &&
		!value.endsWith('.') &&
		/^[A-Za-z0-9_.-]+$/u.test(value)
	);
}

function createCredentialCommandArgs(credential: ProjectRepositoryGitCredentialInput | null) {
	return credential === null
		? {}
		: {
				credentialKind: credential.kind,
				credentialValue: credential.value
			};
}

function formatRemoteParts(host: string, path: string) {
	const pathParts = path.split(/[\\/]/u).filter(Boolean);
	const repoName = pathParts.at(-1);

	return repoName === undefined ? host : `${host}/.../${repoName}`;
}

function normalizeGitCount(value: unknown) {
	return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

function normalizeProjectRepositoryGitInspectionRecord(
	value: ProjectRepositoryGitInspectionRecordResponse
): ProjectRepositoryGitInspectionRecord | null {
	if (typeof value.repositoryId !== 'string' || value.repositoryId.length === 0) {
		return null;
	}

	return {
		repositoryId: value.repositoryId,
		result: normalizeProjectRepositoryGitInspectionResponse(value.inspection)
	};
}

function normalizeProjectRepositoryGitInspectionResponse(
	response: ProjectRepositoryGitInspectionResponse | null | undefined
): ProjectRepositoryGitInspectionResult {
	if (response?.ok) {
		return {
			ok: true,
			isGitRepository: response.isGitRepository === true,
			hasRemote: response.hasRemote === true,
			originUrl: normalizeOptionalGitRemoteUrl(response.originUrl),
			upstreamRemoteUrl: normalizeOptionalGitRemoteUrl(response.upstreamRemoteUrl),
			aheadCount: normalizeGitCount(response.aheadCount),
			behindCount: normalizeGitCount(response.behindCount),
			hasUncommittedChanges: response.hasUncommittedChanges === true,
			branch: typeof response.branch === 'string' && response.branch.length > 0
				? response.branch
				: null
		};
	}

	return {
		ok: false,
		error: isProjectRepositoryGitError(response?.error)
			? response.error
			: 'project-repository-git-path-unreadable'
	};
}

function normalizeOptionalGitRemoteUrl(value: unknown) {
	return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function isProjectRepositoryGitError(value: unknown): value is ProjectRepositoryGitError {
	return (
		value === 'project-repository-git-path-required' ||
		value === 'project-repository-git-path-not-absolute' ||
		value === 'project-repository-git-path-not-found' ||
		value === 'project-repository-git-path-not-directory' ||
		value === 'project-repository-git-path-permission-denied' ||
		value === 'project-repository-git-path-unreadable' ||
		value === 'project-repository-git-command-unavailable' ||
		value === 'project-repository-git-command-failed' ||
		value === 'project-repository-git-command-timed-out' ||
		value === 'project-repository-git-not-repository' ||
		value === 'project-repository-git-init-failed' ||
		value === 'project-repository-git-remote-missing' ||
		value === 'project-repository-git-push-auth-required' ||
		value === 'project-repository-git-push-empty' ||
		value === 'project-repository-git-push-failed' ||
		value === 'project-repository-git-fetch-auth-required' ||
		value === 'project-repository-git-fetch-failed' ||
		value === 'project-repository-git-pull-auth-required' ||
		value === 'project-repository-git-pull-conflict' ||
		value === 'project-repository-git-pull-failed' ||
		value === 'project-repository-github-repo-name-required' ||
		value === 'project-repository-github-repo-name-invalid' ||
		value === 'project-repository-github-commit-message-required' ||
		value === 'project-repository-github-commit-message-invalid' ||
		value === 'project-repository-github-visibility-invalid' ||
		value === 'project-repository-github-cli-unavailable' ||
		value === 'project-repository-github-auth-required' ||
		value === 'project-repository-github-remote-exists' ||
		value === 'project-repository-github-empty' ||
		value === 'project-repository-github-commit-identity-missing' ||
		value === 'project-repository-github-commit-index-locked' ||
		value === 'project-repository-github-commit-hook-failed' ||
		value === 'project-repository-github-commit-failed' ||
		value === 'project-repository-github-create-failed'
	);
}

function isProjectRepositoryCloneError(value: unknown): value is ProjectRepositoryCloneError {
	return (
		value === 'project-repository-clone-unavailable' ||
		value === 'project-repository-workspace-required' ||
		value === 'project-repository-workspace-not-absolute' ||
		value === 'project-repository-workspace-not-found' ||
		value === 'project-repository-workspace-not-directory' ||
		value === 'project-repository-workspace-permission-denied' ||
		value === 'project-repository-workspace-unreadable' ||
		value === 'project-repository-group-path-required' ||
		value === 'project-repository-group-path-invalid' ||
		value === 'project-repository-group-path-not-found' ||
		value === 'project-repository-group-path-not-directory' ||
		value === 'project-repository-name-required' ||
		value === 'project-repository-name-invalid' ||
		value === 'project-repository-remote-url-required' ||
		value === 'project-repository-remote-url-invalid' ||
		value === 'project-repository-clone-target-exists' ||
		value === 'project-repository-clone-command-unavailable' ||
		value === 'project-repository-clone-command-timed-out' ||
		value === 'project-repository-clone-path-too-long' ||
		value === 'project-repository-clone-token-invalid' ||
		value === 'project-repository-clone-permission-denied' ||
		value === 'project-repository-clone-repository-not-found' ||
		value === 'project-repository-clone-organization-restricted' ||
		value === 'project-repository-clone-access-denied' ||
		value === 'project-repository-clone-auth-required' ||
		value === 'project-repository-clone-failed'
	);
}
