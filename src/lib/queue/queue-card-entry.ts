import {
	readQueueArtifactSummary
} from './domain/queue-artifact-readers';
import { readQueueFile, type QueueFileEntry } from './queue-folder';
import type { QueueCardEntry } from './queue-panel-types';

const QUEUE_CARD_READ_CONCURRENCY = 4;

export async function createQueueCardEntries(
	workspacePath: string,
	readFilePaths: readonly string[],
	queueFiles: readonly QueueFileEntry[]
) {
	const readFilePathSet = new Set(readFilePaths);
	async function createEntry(file: QueueFileEntry): Promise<QueueCardEntry> {
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
		const artifactSummary = readResult.ok ? readQueueArtifactSummary(readResult.content) : null;
		const artifactTitle = artifactSummary?.title ?? '';
		return {
			...file,
			isRead: readFilePathSet.has(file.relativePath),
			artifactId: artifactSummary?.artifactId ?? '',
			agentName: artifactSummary?.agentName ?? '',
			createdAt: artifactSummary?.createdAt ?? '',
			title: artifactTitle.length > 0 ? artifactTitle : file.fileName,
			priority: artifactSummary !== null && file.kind === 'work-order' ? artifactSummary.priority : null,
			executionState: artifactSummary?.executionState ?? null,
			sourceReportId: artifactSummary?.sourceReportId ?? '',
			sourceWorkOrderId: artifactSummary?.sourceWorkOrderId ?? '',
			skillIds: artifactSummary?.skillIds ?? []
		};
	}
	const entries = new Array<QueueCardEntry>(queueFiles.length);
	let nextIndex = 0;
	async function readEntries() {
		while (nextIndex < queueFiles.length) {
			const index = nextIndex++;
			const file = queueFiles[index];
			if (file !== undefined) entries[index] = await createEntry(file);
		}
	}
	await Promise.all(Array.from(
		{ length: Math.min(QUEUE_CARD_READ_CONCURRENCY, queueFiles.length) },
		() => readEntries()
	));

	return entries;
}
