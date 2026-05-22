import { getTauriInvoke } from '$lib/tauri/tauri-invoke';
export type ProjectRepositoryOperationName = 'clone' | 'init' | 'fetch' | 'pull' | 'push' | 'publish';
export type ProjectRepositoryOperationFinalState = 'succeeded' | 'failed';
export type ProjectRepositoryOperationState = 'running' | ProjectRepositoryOperationFinalState;

export type ProjectRepositoryOperationStorageError =
	| 'project-repository-operation-read-failed'
	| 'project-repository-operation-write-failed';

export interface ProjectRepositoryOperationRecord {
	readonly id: string;
	readonly workspaceId: string;
	readonly nodeId: string;
	readonly repositoryId: string;
	readonly repositoryName: string;
	readonly name: ProjectRepositoryOperationName;
	readonly state: ProjectRepositoryOperationFinalState;
	readonly error: string | null;
	readonly startedAt: string;
	readonly finishedAt: string;
}

export type ProjectRepositoryOperationRecordsResult =
	| {
			readonly ok: true;
			readonly recordsByRepositoryId: Record<string, ProjectRepositoryOperationRecord>;
	  }
	| {
			readonly ok: false;
			readonly recordsByRepositoryId: Record<string, ProjectRepositoryOperationRecord>;
			readonly error: ProjectRepositoryOperationStorageError;
	  };

export type ProjectRepositoryOperationRecordWriteResult =
	| {
			readonly ok: true;
	  }
	| {
			readonly ok: false;
			readonly error: ProjectRepositoryOperationStorageError;
	  };

interface ProjectRepositoryOperationRecordResponse {
	readonly id?: string | null;
	readonly workspaceId?: string | null;
	readonly nodeId?: string | null;
	readonly repositoryId?: string | null;
	readonly repositoryName?: string | null;
	readonly operation?: string | null;
	readonly state?: string | null;
	readonly errorCode?: string | null;
	readonly startedAt?: string | null;
	readonly finishedAt?: string | null;
}

interface ProjectRepositoryOperationRecordsReadResponse {
	readonly ok: boolean;
	readonly records?: readonly ProjectRepositoryOperationRecordResponse[] | null;
	readonly error?: ProjectRepositoryOperationStorageError | null;
}

interface ProjectRepositoryOperationRecordWriteResponse {
	readonly ok: boolean;
	readonly error?: ProjectRepositoryOperationStorageError | null;
}

export async function readLatestProjectRepositoryOperationRecords(
	workspaceId: string
): Promise<ProjectRepositoryOperationRecordsResult> {
	const invoke = getTauriInvoke();

	if (invoke === undefined) {
		return { ok: true, recordsByRepositoryId: {} };
	}

	try {
		const response = await invoke<ProjectRepositoryOperationRecordsReadResponse>(
			'read_project_repository_operation_records',
			{ workspaceId }
		);

		if (response.ok && Array.isArray(response.records)) {
			return { ok: true, recordsByRepositoryId: mapOperationRecords(response.records) };
		}

		return {
			ok: false,
			recordsByRepositoryId: {},
			error: isProjectRepositoryOperationStorageError(response.error)
				? response.error
				: 'project-repository-operation-read-failed'
		};
	} catch {
		return {
			ok: false,
			recordsByRepositoryId: {},
			error: 'project-repository-operation-read-failed'
		};
	}
}

export async function writeProjectRepositoryOperationRecord(
	record: ProjectRepositoryOperationRecord
): Promise<ProjectRepositoryOperationRecordWriteResult> {
	const invoke = getTauriInvoke();

	if (invoke === undefined) {
		return { ok: true };
	}

	try {
		const response = await invoke<ProjectRepositoryOperationRecordWriteResponse>(
			'write_project_repository_operation_record',
			{
				record: {
					id: record.id,
					workspaceId: record.workspaceId,
					nodeId: record.nodeId,
					repositoryId: record.repositoryId,
					repositoryName: record.repositoryName,
					operation: record.name,
					state: record.state,
					errorCode: record.error,
					startedAt: record.startedAt,
					finishedAt: record.finishedAt
				}
			}
		);

		return response.ok
			? { ok: true }
			: {
					ok: false,
					error: isProjectRepositoryOperationStorageError(response.error)
						? response.error
						: 'project-repository-operation-write-failed'
				};
	} catch {
		return { ok: false, error: 'project-repository-operation-write-failed' };
	}
}

function mapOperationRecords(records: readonly ProjectRepositoryOperationRecordResponse[]) {
	const recordsByRepositoryId: Record<string, ProjectRepositoryOperationRecord> = {};

	for (const record of records) {
		const normalizedRecord = normalizeOperationRecord(record);

		if (normalizedRecord !== null) {
			recordsByRepositoryId[normalizedRecord.repositoryId] = normalizedRecord;
		}
	}

	return recordsByRepositoryId;
}

function normalizeOperationRecord(
	record: ProjectRepositoryOperationRecordResponse
): ProjectRepositoryOperationRecord | null {
	if (
		typeof record.id !== 'string' ||
		typeof record.workspaceId !== 'string' ||
		typeof record.nodeId !== 'string' ||
		typeof record.repositoryId !== 'string' ||
		typeof record.repositoryName !== 'string' ||
		typeof record.startedAt !== 'string' ||
		typeof record.finishedAt !== 'string' ||
		!isProjectRepositoryOperationName(record.operation) ||
		!isProjectRepositoryOperationFinalState(record.state)
	) {
		return null;
	}

	return {
		id: record.id,
		workspaceId: record.workspaceId,
		nodeId: record.nodeId,
		repositoryId: record.repositoryId,
		repositoryName: record.repositoryName,
		name: record.operation,
		state: record.state,
		error: typeof record.errorCode === 'string' && record.errorCode.length > 0 ? record.errorCode : null,
		startedAt: record.startedAt,
		finishedAt: record.finishedAt
	};
}

function isProjectRepositoryOperationName(
	value: unknown
): value is ProjectRepositoryOperationName {
	return (
		value === 'clone' ||
		value === 'init' ||
		value === 'fetch' ||
		value === 'pull' ||
		value === 'push' ||
		value === 'publish'
	);
}

function isProjectRepositoryOperationFinalState(
	value: unknown
): value is ProjectRepositoryOperationFinalState {
	return value === 'succeeded' || value === 'failed';
}

function isProjectRepositoryOperationStorageError(
	value: unknown
): value is ProjectRepositoryOperationStorageError {
	return (
		value === 'project-repository-operation-read-failed' ||
		value === 'project-repository-operation-write-failed'
	);
}
