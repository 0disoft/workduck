import { getTauriInvoke } from '$lib/tauri/tauri-invoke';

export type ProjectRepositoryImportAttemptSourceKind = 'fork';
export type ProjectRepositoryImportAttemptState = 'running' | 'succeeded' | 'failed';
export type ProjectRepositoryImportAttemptPhase =
	| 'preflight'
	| 'creating-fork'
	| 'cloning-fork'
	| 'persisting-registry'
	| 'completed';

export type ProjectRepositoryImportAttemptStorageError =
	| 'project-repository-import-attempt-read-failed'
	| 'project-repository-import-attempt-write-failed';

export interface ProjectRepositoryImportAttemptRecord {
	readonly id: string;
	readonly workspaceId: string;
	readonly nodeId: string;
	readonly repositoryName: string;
	readonly sourceKind: ProjectRepositoryImportAttemptSourceKind;
	readonly state: ProjectRepositoryImportAttemptState;
	readonly phase: ProjectRepositoryImportAttemptPhase;
	readonly upstreamRemoteUrl: string;
	readonly forkRemoteUrl: string | null;
	readonly targetPath: string | null;
	readonly errorCode: string | null;
	readonly startedAt: string;
	readonly updatedAt: string;
	readonly finishedAt: string | null;
}

export type ProjectRepositoryImportAttemptRecordsResult =
	| {
			readonly ok: true;
			readonly records: readonly ProjectRepositoryImportAttemptRecord[];
	  }
	| {
			readonly ok: false;
			readonly records: readonly ProjectRepositoryImportAttemptRecord[];
			readonly error: ProjectRepositoryImportAttemptStorageError;
	  };

export type ProjectRepositoryImportAttemptRecordWriteResult =
	| {
			readonly ok: true;
	  }
	| {
			readonly ok: false;
			readonly error: ProjectRepositoryImportAttemptStorageError;
	  };

interface ProjectRepositoryImportAttemptRecordResponse {
	readonly id?: string | null;
	readonly workspaceId?: string | null;
	readonly nodeId?: string | null;
	readonly repositoryName?: string | null;
	readonly sourceKind?: string | null;
	readonly state?: string | null;
	readonly phase?: string | null;
	readonly upstreamRemoteUrl?: string | null;
	readonly forkRemoteUrl?: string | null;
	readonly targetPath?: string | null;
	readonly errorCode?: string | null;
	readonly startedAt?: string | null;
	readonly updatedAt?: string | null;
	readonly finishedAt?: string | null;
}

interface ProjectRepositoryImportAttemptRecordsReadResponse {
	readonly ok: boolean;
	readonly records?: readonly ProjectRepositoryImportAttemptRecordResponse[] | null;
	readonly error?: ProjectRepositoryImportAttemptStorageError | null;
}

interface ProjectRepositoryImportAttemptRecordWriteResponse {
	readonly ok: boolean;
	readonly error?: ProjectRepositoryImportAttemptStorageError | null;
}

export async function readProjectRepositoryImportAttemptRecords(
	workspaceId: string
): Promise<ProjectRepositoryImportAttemptRecordsResult> {
	const invoke = getTauriInvoke();

	if (invoke === undefined) {
		return { ok: true, records: [] };
	}

	try {
		const response = await invoke<ProjectRepositoryImportAttemptRecordsReadResponse>(
			'read_project_repository_import_attempt_records',
			{ workspaceId }
		);

		if (response.ok && Array.isArray(response.records)) {
			return { ok: true, records: normalizeImportAttemptRecords(response.records) };
		}

		return {
			ok: false,
			records: [],
			error: isProjectRepositoryImportAttemptStorageError(response.error)
				? response.error
				: 'project-repository-import-attempt-read-failed'
		};
	} catch {
		return {
			ok: false,
			records: [],
			error: 'project-repository-import-attempt-read-failed'
		};
	}
}

export async function writeProjectRepositoryImportAttemptRecord(
	record: ProjectRepositoryImportAttemptRecord
): Promise<ProjectRepositoryImportAttemptRecordWriteResult> {
	const invoke = getTauriInvoke();

	if (invoke === undefined) {
		return { ok: true };
	}

	try {
		const response = await invoke<ProjectRepositoryImportAttemptRecordWriteResponse>(
			'write_project_repository_import_attempt_record',
			{ record }
		);

		return response.ok
			? { ok: true }
			: {
					ok: false,
					error: isProjectRepositoryImportAttemptStorageError(response.error)
						? response.error
						: 'project-repository-import-attempt-write-failed'
				};
	} catch {
		return { ok: false, error: 'project-repository-import-attempt-write-failed' };
	}
}

function normalizeImportAttemptRecords(
	records: readonly ProjectRepositoryImportAttemptRecordResponse[]
) {
	return records
		.map(normalizeImportAttemptRecord)
		.filter((record): record is ProjectRepositoryImportAttemptRecord => record !== null);
}

function normalizeImportAttemptRecord(
	record: ProjectRepositoryImportAttemptRecordResponse
): ProjectRepositoryImportAttemptRecord | null {
	if (
		typeof record.id !== 'string' ||
		typeof record.workspaceId !== 'string' ||
		typeof record.nodeId !== 'string' ||
		typeof record.repositoryName !== 'string' ||
		typeof record.upstreamRemoteUrl !== 'string' ||
		typeof record.startedAt !== 'string' ||
		typeof record.updatedAt !== 'string' ||
		!isProjectRepositoryImportAttemptSourceKind(record.sourceKind) ||
		!isProjectRepositoryImportAttemptState(record.state) ||
		!isProjectRepositoryImportAttemptPhase(record.phase)
	) {
		return null;
	}

	return {
		id: record.id,
		workspaceId: record.workspaceId,
		nodeId: record.nodeId,
		repositoryName: record.repositoryName,
		sourceKind: record.sourceKind,
		state: record.state,
		phase: record.phase,
		upstreamRemoteUrl: record.upstreamRemoteUrl,
		forkRemoteUrl: normalizeOptionalText(record.forkRemoteUrl),
		targetPath: normalizeOptionalText(record.targetPath),
		errorCode: normalizeOptionalText(record.errorCode),
		startedAt: record.startedAt,
		updatedAt: record.updatedAt,
		finishedAt: normalizeOptionalText(record.finishedAt)
	};
}

function normalizeOptionalText(value: string | null | undefined) {
	return typeof value === 'string' && value.length > 0 ? value : null;
}

function isProjectRepositoryImportAttemptSourceKind(
	value: unknown
): value is ProjectRepositoryImportAttemptSourceKind {
	return value === 'fork';
}

function isProjectRepositoryImportAttemptState(
	value: unknown
): value is ProjectRepositoryImportAttemptState {
	return value === 'running' || value === 'succeeded' || value === 'failed';
}

function isProjectRepositoryImportAttemptPhase(
	value: unknown
): value is ProjectRepositoryImportAttemptPhase {
	return (
		value === 'preflight' ||
		value === 'creating-fork' ||
		value === 'cloning-fork' ||
		value === 'persisting-registry' ||
		value === 'completed'
	);
}

function isProjectRepositoryImportAttemptStorageError(
	value: unknown
): value is ProjectRepositoryImportAttemptStorageError {
	return (
		value === 'project-repository-import-attempt-read-failed' ||
		value === 'project-repository-import-attempt-write-failed'
	);
}
