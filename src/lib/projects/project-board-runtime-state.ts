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
import type {
	ProjectRegistry,
	ProjectRepositoryLinkRecord,
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

	const records = await inspectProjectRepositoriesGit(
		input.repositories.map((repository) => ({
			repositoryId: repository.id,
			path: repository.path
		}))
	);

	if (input.expectedSignature !== context.getRepositoryGitInspectionSignature()) {
		return;
	}

	context.updateRepositoryGitStatuses(
		Object.fromEntries(
			records.map((record) => [
				record.repositoryId,
				createRepositoryGitStatusFromInspectionResult(record.result)
			])
		)
	);
}

function createRepositoryGitStatusFromInspectionResult(
	result: ProjectRepositoryGitInspectionResult
): ProjectRepositoryGitStatus {
	return result.ok
		? {
				isGitRepository: result.isGitRepository,
				hasRemote: result.hasRemote,
				aheadCount: result.aheadCount,
				behindCount: result.behindCount,
				hasUncommittedChanges: result.hasUncommittedChanges,
				branch: result.branch,
				error: null
			}
		: {
				isGitRepository: false,
				hasRemote: false,
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
