import {
	readLatestProjectRepositoryOperationRecords,
	type ProjectRepositoryOperationStorageError
} from './project-operation-storage';
import type { ProjectRepositoryOperation } from './project-board-operations';
import type { ProjectRegistry } from './project-registry';
import {
	readProjectRegistry,
	writeProjectRegistry,
	type ProjectRegistryStorageError
} from './project-storage';

export async function readProjectRegistryForBoard(
	workspaceId: string,
	currentRegistry: ProjectRegistry,
	update: (next: {
		readonly registry: ProjectRegistry;
		readonly storageError: ProjectRegistryStorageError | null;
	}) => void
) {
	const result = await readProjectRegistry(workspaceId);

	if (result.ok) {
		update({ registry: result.registry, storageError: null });
		return;
	}

	update({
		registry: currentRegistry.workspaceId !== workspaceId ? result.registry : currentRegistry,
		storageError: result.error
	});
}

export async function readProjectRepositoryOperationRecordsForBoard(
	workspaceId: string,
	update: (next: {
		readonly operationStorageError: ProjectRepositoryOperationStorageError | null;
		readonly repositoryOperationById?: Record<string, ProjectRepositoryOperation>;
	}) => void
) {
	const result = await readLatestProjectRepositoryOperationRecords(workspaceId);

	if (!result.ok) {
		update({ operationStorageError: result.error });
		return;
	}

	update({
		operationStorageError: null,
		repositoryOperationById: Object.fromEntries(
			Object.entries(result.recordsByRepositoryId).map(([repositoryId, record]) => [
				repositoryId,
				{
					id: record.id,
					name: record.name,
					state: record.state,
					error: record.error,
					startedAt: record.startedAt,
					finishedAt: record.finishedAt
				}
			])
		)
	});
}

export async function writeProjectRegistryForBoard(
	nextRegistry: ProjectRegistry,
	update: (next: {
		readonly registry: ProjectRegistry;
		readonly storageError: ProjectRegistryStorageError | null;
	}) => void
) {
	const result = await writeProjectRegistry(nextRegistry);

	update({
		registry: result.registry,
		storageError: result.ok ? null : result.error
	});
	return result.ok;
}
