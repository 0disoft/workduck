import {
	readQueueArtifactAgentName,
	readQueueArtifactCreatedAt,
	readQueueArtifactExecutionState,
	readQueueArtifactId,
	readQueueArtifactSkillIds,
	readQueueArtifactSourceReportId,
	readQueueArtifactTitle,
	readQueueWorkPriorityLabel
} from './domain/queue-artifact-readers';
import { readQueueFile, type QueueFileEntry } from './queue-folder';
import type { QueueCardEntry } from './queue-panel-types';

export async function createQueueCardEntries(
	workspacePath: string,
	readFilePaths: readonly string[],
	queueFiles: readonly QueueFileEntry[]
) {
	const readFilePathSet = new Set(readFilePaths);
	const entries = await Promise.all(
		queueFiles.map(async (file): Promise<QueueCardEntry> => {
			if (file.kind === 'unsupported') {
				return {
					...file,
					isRead: readFilePathSet.has(file.relativePath),
					artifactId: '',
					agentName: '',
					createdAt: '',
					title: file.fileName,
					priority: null,
					executionState: null,
					sourceReportId: '',
					skillIds: []
				};
			}

			const readResult = await readQueueFile(workspacePath, file.relativePath);
			const artifactTitle = readResult.ok ? readQueueArtifactTitle(readResult.content) : '';
			const artifactSkillIds = readResult.ok ? readQueueArtifactSkillIds(readResult.content) : [];

			return {
				...file,
				isRead: readFilePathSet.has(file.relativePath),
				artifactId: readResult.ok ? readQueueArtifactId(readResult.content) : '',
				agentName: readResult.ok ? readQueueArtifactAgentName(readResult.content) : '',
				createdAt: readResult.ok ? readQueueArtifactCreatedAt(readResult.content) : '',
				title: artifactTitle.length > 0 ? artifactTitle : file.fileName,
				priority:
					readResult.ok && file.kind === 'work-order'
						? readQueueWorkPriorityLabel(readResult.content)
						: null,
				executionState: readResult.ok ? readQueueArtifactExecutionState(readResult.content) : null,
				sourceReportId: readResult.ok ? readQueueArtifactSourceReportId(readResult.content) : '',
				skillIds: artifactSkillIds
			};
		})
	);

	return entries;
}
