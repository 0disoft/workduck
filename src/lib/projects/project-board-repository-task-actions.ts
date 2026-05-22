import type { WorkduckMessages } from '$lib/i18n/workduck-message-contract';
import type { ProjectFormError } from './project-board-errors';
import type { ProjectRepositoryTarget } from './project-board-types';
import {
	runProjectRepositoryTask,
	type ProjectRepositoryTask,
	type ProjectRepositoryTaskRunRecord
} from './project-repository-task';

export async function runProjectRepositoryTaskForTarget(
	target: ProjectRepositoryTarget | null,
	task: ProjectRepositoryTask,
	context: {
		readonly workspacePath: string;
		readonly messages: WorkduckMessages['projects']['repositoryTasks'];
		readonly isRepositoryBusy: (repositoryId: string) => boolean;
		readonly setFormError: (error: ProjectFormError | null) => void;
		readonly setStatus: (status: string | null) => void;
		readonly setTaskRun: (
			repositoryId: string,
			record: ProjectRepositoryTaskRunRecord
		) => void;
	}
) {
	if (target === null || target.repository.path === null) {
		context.setFormError('project-repository-not-found');
		context.setStatus(null);
		return;
	}

	if (context.isRepositoryBusy(target.repository.id)) {
		return;
	}

	context.setFormError(null);
	context.setStatus(null);

	const result = await runProjectRepositoryTask({
		workspacePath: context.workspacePath,
		repositoryPath: target.repository.path,
		task
	});

	if (!result.ok) {
		context.setFormError(result.error);
		return;
	}

	if (result.runRecord !== null) {
		context.setTaskRun(target.repository.id, result.runRecord);
	}
	context.setStatus(getRepositoryTaskStatus(task, result.command, context.messages));
}

function getRepositoryTaskStatus(
	task: ProjectRepositoryTask,
	command: string | null,
	messages: WorkduckMessages['projects']['repositoryTasks']
) {
	if (command !== null) {
		return messages.commandTerminalOpened.replace('{command}', command);
	}

	switch (task) {
		case 'open-terminal':
			return messages.terminalOpened;
		case 'install-dependencies':
			return messages.installDependenciesTerminalOpened;
		case 'update-dependencies':
			return messages.updateDependenciesTerminalOpened;
		case 'start-dev-server':
			return messages.startDevServerTerminalOpened;
		case 'build':
			return messages.buildTerminalOpened;
	}
}
