import {
	writeProjectRepositoryOperationRecord,
	type ProjectRepositoryOperationName,
	type ProjectRepositoryOperationState,
	type ProjectRepositoryOperationStorageError
} from './project-operation-storage';
import {
	createFinishedProjectRepositoryOperation,
	createRunningProjectRepositoryOperation,
	type ProjectRepositoryOperation
} from './project-board-operations';
import type { ProjectNodeRecord, ProjectRepositoryLinkRecord } from './project-registry';

export type ProjectRepositoryOperationRecord = Record<string, ProjectRepositoryOperation>;

export function startProjectRepositoryOperation(
	operations: ProjectRepositoryOperationRecord,
	repositoryId: string,
	name: ProjectRepositoryOperationName
) {
	return {
		...operations,
		[repositoryId]: createRunningProjectRepositoryOperation(name)
	};
}

export async function finishProjectRepositoryOperationForBoard(
	input: {
		readonly workspaceId: string;
		readonly node: ProjectNodeRecord;
		readonly repository: ProjectRepositoryLinkRecord;
		readonly name: ProjectRepositoryOperationName;
		readonly state: Exclude<ProjectRepositoryOperationState, 'running'>;
		readonly error: string | null;
		readonly operations: ProjectRepositoryOperationRecord;
	},
	context: {
		readonly setOperations: (operations: ProjectRepositoryOperationRecord) => void;
		readonly setOperationStorageError: (
			error: ProjectRepositoryOperationStorageError | null
		) => void;
	}
) {
	const runningOperation = input.operations[input.repository.id];
	const operation = createFinishedProjectRepositoryOperation(
		runningOperation,
		input.name,
		input.state,
		input.error
	);

	context.setOperations({
		...input.operations,
		[input.repository.id]: operation
	});

	const writeResult = await writeProjectRepositoryOperationRecord({
		id: operation.id,
		workspaceId: input.workspaceId,
		nodeId: input.node.id,
		repositoryId: input.repository.id,
		repositoryName: input.repository.name,
		name: input.name,
		state: input.state,
		error: input.error,
		startedAt: operation.startedAt,
		finishedAt: operation.finishedAt
	});

	context.setOperationStorageError(writeResult.ok ? null : writeResult.error);
}

export function getProjectRepositoryOperation(
	operations: ProjectRepositoryOperationRecord,
	repositoryId: string
) {
	return operations[repositoryId] ?? null;
}

export function isProjectRepositoryBusy(
	operations: ProjectRepositoryOperationRecord,
	repositoryId: string
) {
	return operations[repositoryId]?.state === 'running';
}

export function isProjectRepositoryOperationRunning(
	operations: ProjectRepositoryOperationRecord,
	repositoryId: string,
	name: ProjectRepositoryOperationName
) {
	const operation = operations[repositoryId];

	return operation?.state === 'running' && operation.name === name;
}
