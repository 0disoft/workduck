import type { ProjectRepositoryOperation } from './project-board-operations';
import type {
	InspectableProjectRepositoryLinkRecord,
	ProjectRepositoryGitStatus
} from './project-board-selectors';
import { ensureProjectFolderPath, type ProjectFolderError } from './project-folder';
import {
	inspectProjectRepositoriesGit,
	inspectProjectRepositoryGit,
	type ProjectRepositoryGitError,
	type ProjectRepositoryGitInspectionResult
} from './project-repository';
import { backfillProjectRepositoryRemoteUrls } from './project-registry';
import type {
	ProjectRegistry,
	ProjectNodeRecord,
	ProjectRepositoryLinkRecord,
	ProjectRepositoryRemoteUrlBackfillInput,
	ProjectTreeRow
} from './project-registry';

export function createFolderRepairSignature(
	workspaceId: string,
	rows: readonly ProjectTreeRow[]
) {
	return `${workspaceId}:${rows.map((row) => `${row.node.id}:${row.node.path}`).join('|')}`;
}

export function createRepositoryGitInspectionSignature(
	workspaceId: string,
	repositories: readonly ProjectRepositoryLinkRecord[]
) {
	return `${workspaceId}:${repositories.map((repository) => `${repository.id}:${repository.path}`).join('|')}`;
}

export function createRepositoryRemoteBackfillSignature(
	workspaceId: string,
	registry: ProjectRegistry,
	gitStatusById: Readonly<Record<string, ProjectRepositoryGitStatus>>
) {
	const repositories = getProjectRegistryRepositories(registry);

	return `${workspaceId}:${repositories
		.map((repository) => {
			const gitStatus = gitStatusById[repository.id];

			return [
				repository.id,
				repository.name,
				repository.path ?? '',
				repository.remoteUrl ?? '',
				repository.upstreamRemoteUrl ?? '',
				gitStatus?.error ?? '',
				gitStatus?.originUrl ?? '',
				gitStatus?.upstreamRemoteUrl ?? ''
			].join(':');
		})
		.join('|')}:${registry.nodes
		.map((node) => `${node.id}:${node.parentId ?? ''}:${node.kind}:${node.githubCredentialSecretId ?? ''}`)
		.join('|')}`;
}

function getProjectRegistryRepositories(registry: ProjectRegistry) {
	return registry.nodes.flatMap((node) => node.repositories);
}

export function createProjectRepositoryRemoteUrlBackfills(
	registry: ProjectRegistry,
	gitStatusById: Readonly<Record<string, ProjectRepositoryGitStatus>>
) {
	const backfills: ProjectRepositoryRemoteUrlBackfillInput[] = [];
	const githubOwnersByRootProjectId = createGithubOwnersByRootProjectId(registry.nodes);
	const repositoryLocations = createRepositoryLocations(registry.nodes);

	for (const { repository, rootProjectId } of repositoryLocations) {
		if (repository.remoteUrl !== null) {
			continue;
		}

		const gitStatus = gitStatusById[repository.id];

		if (
			gitStatus !== undefined &&
			gitStatus.error === null &&
			gitStatus.isGitRepository &&
			gitStatus.originUrl !== null
		) {
			backfills.push({
				repositoryId: repository.id,
				remoteUrl: gitStatus.originUrl,
				upstreamRemoteUrl: gitStatus.upstreamRemoteUrl
			});
			continue;
		}

		if (
			repository.path === null ||
			gitStatus?.error !== 'project-repository-git-path-not-found' ||
			rootProjectId === null ||
			!isLikelyGithubRepositoryName(repository.name)
		) {
			continue;
		}

		const githubOwner = getSingleGithubOwner(githubOwnersByRootProjectId.get(rootProjectId));

		if (githubOwner === null) {
			continue;
		}

		backfills.push({
			repositoryId: repository.id,
			remoteUrl: `https://github.com/${githubOwner}/${repository.name}`,
			upstreamRemoteUrl: null
		});
	}

	return backfills;
}

interface ProjectRepositoryLocation {
	readonly node: ProjectNodeRecord;
	readonly repository: ProjectRepositoryLinkRecord;
	readonly rootProjectId: string | null;
}

function createRepositoryLocations(nodes: readonly ProjectNodeRecord[]) {
	const nodeById = new Map(nodes.map((node) => [node.id, node]));
	const locations: ProjectRepositoryLocation[] = [];

	for (const node of nodes) {
		const rootProjectId = getRootProjectId(node, nodeById);

		for (const repository of node.repositories) {
			locations.push({ node, repository, rootProjectId });
		}
	}

	return locations;
}

function createGithubOwnersByRootProjectId(nodes: readonly ProjectNodeRecord[]) {
	const ownersByRootProjectId = new Map<string, Set<string>>();
	const nodeById = new Map(nodes.map((node) => [node.id, node]));

	for (const node of nodes) {
		const rootProjectId = getRootProjectId(node, nodeById);

		if (rootProjectId === null) {
			continue;
		}

		for (const repository of node.repositories) {
			if (repository.remoteUrl === null) {
				continue;
			}

			const owner = parseGithubRemoteOwner(repository.remoteUrl);

			if (owner === null) {
				continue;
			}

			const owners = ownersByRootProjectId.get(rootProjectId) ?? new Set<string>();
			owners.add(owner);
			ownersByRootProjectId.set(rootProjectId, owners);
		}
	}

	return ownersByRootProjectId;
}

function getRootProjectId(
	node: ProjectNodeRecord,
	nodeById: ReadonlyMap<string, ProjectNodeRecord>
) {
	let current: ProjectNodeRecord | undefined = node;
	const visitedNodeIds = new Set<string>();

	while (current !== undefined && !visitedNodeIds.has(current.id)) {
		visitedNodeIds.add(current.id);

		if (current.kind === 'project') {
			return current.id;
		}

		current = current.parentId === null ? undefined : nodeById.get(current.parentId);
	}

	return null;
}

function getSingleGithubOwner(owners: ReadonlySet<string> | undefined) {
	if (owners === undefined || owners.size !== 1) {
		return null;
	}

	return [...owners][0] ?? null;
}

function parseGithubRemoteOwner(remoteUrl: string) {
	const trimmedRemoteUrl = remoteUrl.trim();
	const scpLikeMatch = /^git@github\.com:([^/]+)\/[^/]+(?:\.git)?$/iu.exec(trimmedRemoteUrl);

	if (scpLikeMatch !== null) {
		return normalizeGithubOwner(scpLikeMatch[1] ?? '');
	}

	try {
		const url = new URL(trimmedRemoteUrl);

		if (url.hostname.toLowerCase() !== 'github.com') {
			return null;
		}

		const [owner, repositoryName] = url.pathname
			.split('/')
			.map((segment) => segment.trim())
			.filter((segment) => segment.length > 0);

		if (owner === undefined || repositoryName === undefined) {
			return null;
		}

		return normalizeGithubOwner(owner);
	} catch {
		return null;
	}
}

function normalizeGithubOwner(owner: string) {
	return /^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/iu.test(owner) ? owner : null;
}

function isLikelyGithubRepositoryName(repositoryName: string) {
	return /^[a-z\d._-]+$/iu.test(repositoryName);
}

export function pruneRepositoryGitStatusRecord(
	record: Readonly<Record<string, ProjectRepositoryGitStatus>>,
	repositoryIds: ReadonlySet<string>
) {
	return pruneRecordById(record, repositoryIds);
}

export function pruneRepositoryOperationRecord(
	record: Readonly<Record<string, ProjectRepositoryOperation>>,
	repositoryIds: ReadonlySet<string>
) {
	return pruneRecordById(record, repositoryIds);
}

export async function ensureProjectFoldersForBoard(
	input: {
		readonly expectedSignature: string;
		readonly workspacePath: string;
		readonly registrySnapshot: ProjectRegistry;
		readonly rows: readonly ProjectTreeRow[];
	},
	context: {
		readonly getFolderRepairSignature: () => string;
		readonly setFolderRepairError: (error: ProjectFolderError | null) => void;
		readonly persistRegistry: (nextRegistry: ProjectRegistry) => Promise<boolean>;
	}
) {
	for (const row of input.rows) {
		const result = await ensureProjectFolderPath(input.workspacePath, row.node.path);

		if (context.getFolderRepairSignature() !== input.expectedSignature) {
			return;
		}

		if (!result.ok) {
			context.setFolderRepairError(result.error);
			return;
		}
	}

	if (context.getFolderRepairSignature() !== input.expectedSignature) {
		return;
	}

	context.setFolderRepairError(null);
	await context.persistRegistry(input.registrySnapshot);
}

export async function backfillProjectRepositoryRemoteUrlsForBoard(
	input: {
		readonly expectedSignature: string;
		readonly registrySnapshot: ProjectRegistry;
		readonly repositories: readonly ProjectRepositoryLinkRecord[];
		readonly gitStatusById: Readonly<Record<string, ProjectRepositoryGitStatus>>;
	},
	context: {
		readonly getRepositoryRemoteBackfillSignature: () => string;
		readonly persistRegistry: (nextRegistry: ProjectRegistry) => Promise<boolean>;
	}
) {
	const backfills = createProjectRepositoryRemoteUrlBackfills(
		input.registrySnapshot,
		input.gitStatusById
	);

	if (backfills.length === 0) {
		return;
	}

	const result = backfillProjectRepositoryRemoteUrls(input.registrySnapshot, backfills);

	if (
		!result.changed ||
		input.expectedSignature !== context.getRepositoryRemoteBackfillSignature()
	) {
		return;
	}

	await context.persistRegistry(result.registry);
}

export async function refreshProjectRepositoryGitStatusForBoard(
	input: {
		readonly repositoryId: string;
		readonly path: string | null;
		readonly expectedSignature: string;
	},
	context: {
		readonly getRepositoryGitInspectionSignature: () => string;
		readonly updateRepositoryGitStatus: (
			repositoryId: string,
			gitStatus: ProjectRepositoryGitStatus
		) => void;
	}
) {
	if (input.path === null) {
		return;
	}

	const result = await inspectProjectRepositoryGit(input.path);

	if (input.expectedSignature !== context.getRepositoryGitInspectionSignature()) {
		return;
	}

	context.updateRepositoryGitStatus(
		input.repositoryId,
		createRepositoryGitStatusFromInspectionResult(result)
	);
}

export async function refreshProjectRepositoryGitStatusesForBoard(
	input: {
		readonly repositories: readonly InspectableProjectRepositoryLinkRecord[];
		readonly priorityRepositoryIds: ReadonlySet<string>;
		readonly expectedSignature: string;
	},
	context: {
		readonly getRepositoryGitInspectionSignature: () => string;
		readonly updateRepositoryGitStatuses: (
			gitStatuses: Record<string, ProjectRepositoryGitStatus>
		) => void;
	}
) {
	if (input.repositories.length === 0) {
		return;
	}

	const scanStartedAt = readHighResolutionTime();
	const scanDiagnostics = createEmptyGitInspectionDiagnostics();

	const priorityRepositories: InspectableProjectRepositoryLinkRecord[] = [];
	const backgroundRepositories: InspectableProjectRepositoryLinkRecord[] = [];

	for (const repository of input.repositories) {
		if (input.priorityRepositoryIds.has(repository.id)) {
			priorityRepositories.push(repository);
		} else {
			backgroundRepositories.push(repository);
		}
	}

	const priorityResult = await inspectRepositoryGitStatusBatch(
		priorityRepositories,
		'priority',
		1,
		input,
		context
	);
	mergeGitInspectionDiagnostics(scanDiagnostics, priorityResult.diagnostics);

	if (!priorityResult.isCurrent) {
		emitGitInspectionScanDiagnostics(scanDiagnostics, scanStartedAt, true);
		return;
	}

	for (let offset = 0; offset < backgroundRepositories.length; offset += 8) {
		await yieldToBrowser();
		const chunkIndex = scanDiagnostics.chunkCount + 1;
		const batchResult = await inspectRepositoryGitStatusBatch(
			backgroundRepositories.slice(offset, offset + 8),
			'background',
			chunkIndex,
			input,
			context
		);
		mergeGitInspectionDiagnostics(scanDiagnostics, batchResult.diagnostics);

		if (!batchResult.isCurrent) {
			emitGitInspectionScanDiagnostics(scanDiagnostics, scanStartedAt, true);
			return;
		}
	}

	emitGitInspectionScanDiagnostics(scanDiagnostics, scanStartedAt, false);
}

type GitInspectionBatchPhase = 'priority' | 'background';

interface GitInspectionDiagnostics {
	chunkCount: number;
	repositoryCount: number;
	gitCommandCount: number;
	remoteCacheHitCount: number;
	repositoryElapsedMsTotal: number;
	frontendElapsedMs: number;
	errorCount: number;
}

async function inspectRepositoryGitStatusBatch(
	repositories: readonly InspectableProjectRepositoryLinkRecord[],
	phase: GitInspectionBatchPhase,
	chunkIndex: number,
	input: { readonly expectedSignature: string },
	context: {
		readonly getRepositoryGitInspectionSignature: () => string;
		readonly updateRepositoryGitStatuses: (
			gitStatuses: Record<string, ProjectRepositoryGitStatus>
		) => void;
	}
) {
	if (repositories.length === 0) {
		return {
			isCurrent: input.expectedSignature === context.getRepositoryGitInspectionSignature(),
			diagnostics: createEmptyGitInspectionDiagnostics()
		};
	}

	const startedAt = readHighResolutionTime();
	const records = await inspectProjectRepositoriesGit(
		repositories.map((repository) => ({
			repositoryId: repository.id,
			path: repository.path
		}))
	);
	const diagnostics: GitInspectionDiagnostics = {
		chunkCount: 1,
		repositoryCount: records.length,
		gitCommandCount: records.reduce((total, record) => total + record.gitCommandCount, 0),
		remoteCacheHitCount: records.reduce(
			(total, record) => total + record.remoteCacheHitCount,
			0
		),
		repositoryElapsedMsTotal: records.reduce((total, record) => total + record.elapsedMs, 0),
		frontendElapsedMs: Math.max(0, readHighResolutionTime() - startedAt),
		errorCount: records.filter((record) => !record.result.ok).length
	};
	emitGitInspectionBatchDiagnostics(phase, chunkIndex, diagnostics);

	if (input.expectedSignature !== context.getRepositoryGitInspectionSignature()) {
		return { isCurrent: false, diagnostics };
	}

	context.updateRepositoryGitStatuses(
		Object.fromEntries(
			records.map((record) => [
				record.repositoryId,
				createRepositoryGitStatusFromInspectionResult(record.result)
			])
		)
	);

	return { isCurrent: true, diagnostics };
}

function createEmptyGitInspectionDiagnostics(): GitInspectionDiagnostics {
	return {
		chunkCount: 0,
		repositoryCount: 0,
		gitCommandCount: 0,
		remoteCacheHitCount: 0,
		repositoryElapsedMsTotal: 0,
		frontendElapsedMs: 0,
		errorCount: 0
	};
}

function mergeGitInspectionDiagnostics(
	target: GitInspectionDiagnostics,
	source: GitInspectionDiagnostics
) {
	target.chunkCount += source.chunkCount;
	target.repositoryCount += source.repositoryCount;
	target.gitCommandCount += source.gitCommandCount;
	target.remoteCacheHitCount += source.remoteCacheHitCount;
	target.repositoryElapsedMsTotal += source.repositoryElapsedMsTotal;
	target.frontendElapsedMs += source.frontendElapsedMs;
	target.errorCount += source.errorCount;
}

function emitGitInspectionBatchDiagnostics(
	phase: GitInspectionBatchPhase,
	chunkIndex: number,
	diagnostics: GitInspectionDiagnostics
) {
	if (!import.meta.env.DEV) {
		return;
	}

	console.debug('[workduck:git-inspection:chunk]', {
		phase,
		chunkIndex,
		repositoryCount: diagnostics.repositoryCount,
		gitCommandCount: diagnostics.gitCommandCount,
		remoteCacheHitCount: diagnostics.remoteCacheHitCount,
		repositoryElapsedMsTotal: Math.round(diagnostics.repositoryElapsedMsTotal),
		frontendElapsedMs: Math.round(diagnostics.frontendElapsedMs),
		errorCount: diagnostics.errorCount
	});
}

function emitGitInspectionScanDiagnostics(
	diagnostics: GitInspectionDiagnostics,
	startedAt: number,
	cancelled: boolean
) {
	if (!import.meta.env.DEV) {
		return;
	}

	console.debug('[workduck:git-inspection:scan]', {
		chunkCount: diagnostics.chunkCount,
		repositoryCount: diagnostics.repositoryCount,
		gitCommandCount: diagnostics.gitCommandCount,
		remoteCacheHitCount: diagnostics.remoteCacheHitCount,
		repositoryElapsedMsTotal: Math.round(diagnostics.repositoryElapsedMsTotal),
		frontendBatchElapsedMsTotal: Math.round(diagnostics.frontendElapsedMs),
		frontendScanElapsedMs: Math.round(Math.max(0, readHighResolutionTime() - startedAt)),
		errorCount: diagnostics.errorCount,
		cancelled
	});
}

function readHighResolutionTime() {
	return typeof performance === 'undefined' ? Date.now() : performance.now();
}

function yieldToBrowser() {
	return new Promise<void>((resolve) => {
		setTimeout(resolve, 0);
	});
}

function createRepositoryGitStatusFromInspectionResult(
	result: ProjectRepositoryGitInspectionResult
): ProjectRepositoryGitStatus {
	return result.ok
		? {
				isGitRepository: result.isGitRepository,
				hasRemote: result.hasRemote,
				originUrl: result.originUrl,
				upstreamRemoteUrl: result.upstreamRemoteUrl,
				aheadCount: result.aheadCount,
				behindCount: result.behindCount,
				hasUncommittedChanges: result.hasUncommittedChanges,
				branch: result.branch,
				error: null
			}
		: {
				isGitRepository: false,
				hasRemote: false,
				originUrl: null,
				upstreamRemoteUrl: null,
				aheadCount: 0,
				behindCount: 0,
				hasUncommittedChanges: false,
				branch: null,
				error: result.error as ProjectRepositoryGitError
			};
}

function pruneRecordById<T>(record: Readonly<Record<string, T>>, ids: ReadonlySet<string>) {
	const nextRecord: Record<string, T> = {};
	let didPruneRecord = false;

	for (const [id, value] of Object.entries(record)) {
		if (ids.has(id)) {
			nextRecord[id] = value;
		} else {
			didPruneRecord = true;
		}
	}

	return didPruneRecord ? nextRecord : record;
}
