/* llmnav/1 module
id=workduck.projects.task-run-mapping
role=Match native task records to registered repositories and format task state feedback.
owns=task run path identity|latest record mapping|task state labels
excludes=task history reads|poll scheduling|native process execution
search=Windows task path matching|latest repository task mapping|task run state labels
invariant=Windows path spellings share a comparison key while Unix names remain case-sensitive; record order selects the latest run.
stability=contract
*/
import type { WorkduckMessages } from '#lib/i18n/workduck-message-contract.ts';
import type { WorkduckLanguageId } from '#lib/i18n/workduck-language.ts';
import { normalizeWorkspacePathForStorage } from '#lib/workspaces/workspace-path-format.ts';
import type { ProjectRepositoryTask, ProjectRepositoryTaskRunRecord } from './project-repository-task';
import type { ProjectRepositoryLinkRecord } from './project-registry';

export type ProjectRepositoryTaskRunRecordByRepositoryId = Record<
	string,
	ProjectRepositoryTaskRunRecord
>;

export function createRepositoryTaskRunPathKey(path: string) {
	const normalized = normalizeWorkspacePathForStorage(path);
	if (/^(?:[a-z]:[\\/]|\\\\|\/\/)/iu.test(normalized)) {
		return normalized.replaceAll('\\', '/').replace(/\/+$/u, '').toLocaleLowerCase('en-US');
	}
	return normalized.replace(/\/+$/u, '') || (normalized.startsWith('/') ? '/' : '');
}

export function mapLatestTaskRunsByRepositoryId(
	repositories: readonly ProjectRepositoryLinkRecord[],
	records: readonly ProjectRepositoryTaskRunRecord[]
): ProjectRepositoryTaskRunRecordByRepositoryId {
	const repositoryIdByPath = new Map(
		repositories
			.filter((repository) => repository.path !== null)
			.map((repository) => [
				createRepositoryTaskRunPathKey(repository.path ?? ''),
				repository.id
			])
	);
	const nextRecords: ProjectRepositoryTaskRunRecordByRepositoryId = {};

	for (const record of records) {
		const repositoryId = repositoryIdByPath.get(
			createRepositoryTaskRunPathKey(record.repositoryPath)
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
		case 'preview':
			return messages.tasks.preview;
		case 'build':
			return messages.tasks.build;
	}
}
