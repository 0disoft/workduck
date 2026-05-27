import type { WorkduckMessages } from '$lib/i18n/workduck-message-contract';
import type { WorkduckLanguageId } from '$lib/i18n/workduck-language';
import { normalizeWorkspacePathForStorage } from '$lib/workspaces/workspace-path-format';
import type { ProjectRepositoryTask, ProjectRepositoryTaskRunRecord } from './project-repository-task';
import type { ProjectRepositoryLinkRecord } from './project-registry';

export type ProjectRepositoryTaskRunRecordByRepositoryId = Record<
	string,
	ProjectRepositoryTaskRunRecord
>;

export function mapLatestTaskRunsByRepositoryId(
	repositories: readonly ProjectRepositoryLinkRecord[],
	records: readonly ProjectRepositoryTaskRunRecord[]
): ProjectRepositoryTaskRunRecordByRepositoryId {
	const repositoryIdByPath = new Map(
		repositories
			.filter((repository) => repository.path !== null)
			.map((repository) => [
				normalizeWorkspacePathForStorage(repository.path ?? ''),
				repository.id
			])
	);
	const nextRecords: ProjectRepositoryTaskRunRecordByRepositoryId = {};

	for (const record of records) {
		const repositoryId = repositoryIdByPath.get(
			normalizeWorkspacePathForStorage(record.repositoryPath)
		);

		if (repositoryId === undefined || nextRecords[repositoryId] !== undefined) {
			continue;
		}

		nextRecords[repositoryId] = record;
	}

	return nextRecords;
}

export function getRepositoryTaskRunMessage(
	record: ProjectRepositoryTaskRunRecord,
	messages: WorkduckMessages['projects']['repositoryTasks']
) {
	const taskLabel = getRepositoryTaskLabel(record.task, messages);

	if (record.state === 'running') {
		return messages.taskRunning.replace('{task}', taskLabel);
	}

	if (record.state === 'succeeded') {
		return messages.taskSucceeded.replace('{task}', taskLabel);
	}

	if (record.state === 'stopped') {
		return messages.taskStopped.replace('{task}', taskLabel);
	}

	return record.exitCode === null
		? messages.taskFailed.replace('{task}', taskLabel)
		: messages.taskFailedWithExitCode
				.replace('{task}', taskLabel)
				.replace('{exitCode}', record.exitCode.toString());
}

export function getRepositoryTaskRunFinishedAtLabel(
	record: ProjectRepositoryTaskRunRecord,
	labelTemplate: string,
	languageId: WorkduckLanguageId
) {
	const timestamp = record.finishedAt ?? record.startedAt;
	const date = new Date(timestamp);

	if (!Number.isFinite(date.getTime())) {
		return null;
	}

	return labelTemplate.replace(
		'{timestamp}',
		new Intl.DateTimeFormat(languageId === 'ko' ? 'ko-KR' : 'en-US', {
			year: 'numeric',
			month: '2-digit',
			day: '2-digit',
			hour: '2-digit',
			minute: '2-digit',
			hour12: false
		}).format(date)
	);
}

function getRepositoryTaskLabel(
	task: ProjectRepositoryTask,
	messages: WorkduckMessages['projects']['repositoryTasks']
) {
	switch (task) {
		case 'open-terminal':
			return messages.tasks.openTerminal;
		case 'install-dependencies':
			return messages.tasks.installDependencies;
		case 'update-dependencies':
			return messages.tasks.updateDependencies;
		case 'start-dev-server':
			return messages.tasks.startDevServer;
		case 'build':
			return messages.tasks.build;
	}
}
