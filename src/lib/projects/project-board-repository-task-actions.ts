import type { WorkduckMessages } from '$lib/i18n/workduck-message-contract';
import type { ProjectFormError } from './project-board-errors';
import type { ProjectRepositoryTarget } from './project-board-types';
import {
	runProjectRepositoryTask,
	type ProjectRepositoryTask
} from './project-repository-task';

export async function runProjectRepositoryTaskForTarget(
	target: ProjectRepositoryTarget | null,
	task: ProjectRepositoryTask,
	context: {
		readonly workspacePath: string;
		readonly messages: WorkduckMessages['projects']['repositoryTasks'];
		readonly setFormError: (error: ProjectFormError | null) => void;
		readonly setStatus: (status: string | null) => void;
	}
) {
	if (target === null || target.repository.path === null) {
		context.setFormError('project-repository-not-found');
		context.setStatus(null);
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

	context.setStatus(getRepositoryTaskStatus(task, context.messages));
}

function getRepositoryTaskStatus(
	task: ProjectRepositoryTask,
	messages: WorkduckMessages['projects']['repositoryTasks']
) {
	switch (task) {
		case 'open-terminal':
			return messages.openTerminalStarted;
		case 'install-dependencies':
			return messages.installDependenciesStarted;
		case 'start-dev-server':
			return messages.startDevServerStarted;
		case 'build':
			return messages.buildStarted;
	}
}
