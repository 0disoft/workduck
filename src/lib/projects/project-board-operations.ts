import type { WorkduckLanguageId } from '$lib/i18n/workduck-language';
import type {
	ProjectRepositoryOperationName,
	ProjectRepositoryOperationState
} from './project-operation-storage';
import {
	fetchProjectRepositoryGit,
	pullProjectRepositoryGit,
	pushProjectRepositoryGit,
	type ProjectRepositoryGitCredentialInput
} from './project-repository';
import {
	getProjectFormErrorMessage,
	type ProjectFormError
} from './project-board-errors';

export type ProjectRepositoryGitAction = 'fetch' | 'pull' | 'push';

export interface ProjectRepositoryOperation {
	readonly id: string;
	readonly name: ProjectRepositoryOperationName;
	readonly state: ProjectRepositoryOperationState;
	readonly error: string | null;
	readonly startedAt: string;
	readonly finishedAt: string | null;
}

export function createProjectRepositoryOperationRecordId() {
	if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
		return crypto.randomUUID();
	}

	return `operation-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function createRunningProjectRepositoryOperation(
	name: ProjectRepositoryOperationName
) {
	return {
		id: createProjectRepositoryOperationRecordId(),
		name,
		state: 'running',
		error: null,
		startedAt: new Date().toISOString(),
		finishedAt: null
	} satisfies ProjectRepositoryOperation;
}

export function createFinishedProjectRepositoryOperation(
	runningOperation: ProjectRepositoryOperation | undefined,
	name: ProjectRepositoryOperationName,
	state: Exclude<ProjectRepositoryOperationState, 'running'>,
	error: string | null
) {
	return {
		id: runningOperation?.id ?? createProjectRepositoryOperationRecordId(),
		name,
		state,
		error,
		startedAt: runningOperation?.startedAt ?? new Date().toISOString(),
		finishedAt: new Date().toISOString()
	} satisfies ProjectRepositoryOperation;
}

export function runProjectRepositoryGitMutation(
	action: ProjectRepositoryGitAction,
	path: string,
	credential: ProjectRepositoryGitCredentialInput | null
) {
	if (action === 'fetch') {
		return fetchProjectRepositoryGit(path, credential);
	}

	if (action === 'pull') {
		return pullProjectRepositoryGit(path, credential);
	}

	return pushProjectRepositoryGit(path, credential);
}

export function getRepositoryGitActionProgressLabel(action: ProjectRepositoryGitAction) {
	if (action === 'fetch') {
		return 'Fetching';
	}

	if (action === 'pull') {
		return 'Pulling';
	}

	return 'Pushing';
}

export function getRepositoryGitActionDoneLabel(action: ProjectRepositoryGitAction) {
	if (action === 'fetch') {
		return 'fetched';
	}

	if (action === 'pull') {
		return 'pulled';
	}

	return 'pushed';
}

export function getRepositoryOperationMessage(operation: ProjectRepositoryOperation) {
	if (operation.state === 'running') {
		return `${getRepositoryOperationProgressLabel(operation.name)}.`;
	}

	if (operation.state === 'succeeded') {
		return `Repository ${getRepositoryOperationDoneLabel(operation.name)}.`;
	}

	return operation.error === null
		? `${getRepositoryOperationLabel(operation.name)} failed.`
		: (getProjectFormErrorMessage(operation.error as ProjectFormError) ??
				'Repository operation failed.');
}

export function getRepositoryOperationFinishedAtLabel(
	operation: ProjectRepositoryOperation,
	labelTemplate: string,
	languageId: WorkduckLanguageId
) {
	if (operation.finishedAt === null) {
		return null;
	}

	const finishedAtLabel = formatRepositoryOperationFinishedAt(operation.finishedAt, languageId);

	return finishedAtLabel === null
		? null
		: labelTemplate.replace('{timestamp}', finishedAtLabel);
}

function formatRepositoryOperationFinishedAt(
	finishedAt: string,
	languageId: WorkduckLanguageId
) {
	const date = new Date(finishedAt);

	if (!Number.isFinite(date.getTime())) {
		return null;
	}

	return new Intl.DateTimeFormat(getRepositoryOperationDateLocale(languageId), {
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
		hour: '2-digit',
		minute: '2-digit',
		hour12: false
	}).format(date);
}

function getRepositoryOperationDateLocale(languageId: WorkduckLanguageId) {
	return languageId === 'ko' ? 'ko-KR' : 'en-US';
}

export function getRepositoryOperationProgressLabel(name: ProjectRepositoryOperationName) {
	switch (name) {
		case 'clone':
			return 'Cloning repository';
		case 'init':
			return 'Initializing Git repository';
		case 'fetch':
			return 'Fetching repository';
		case 'pull':
			return 'Pulling repository';
		case 'push':
			return 'Pushing repository';
		case 'publish':
			return 'Publishing repository';
	}
}

export function getRepositoryOperationDoneLabel(name: ProjectRepositoryOperationName) {
	switch (name) {
		case 'clone':
			return 'cloned';
		case 'init':
			return 'initialized';
		case 'fetch':
			return 'fetched';
		case 'pull':
			return 'pulled';
		case 'push':
			return 'pushed';
		case 'publish':
			return 'published';
	}
}

export function getRepositoryOperationLabel(name: ProjectRepositoryOperationName) {
	switch (name) {
		case 'clone':
			return 'Clone';
		case 'init':
			return 'Initializing';
		case 'fetch':
			return 'Fetch';
		case 'pull':
			return 'Pull';
		case 'push':
			return 'Push';
		case 'publish':
			return 'Publish';
	}
}

export function getRepositoryActionButtonLabel(
	operation: ProjectRepositoryOperation | null,
	name: ProjectRepositoryOperationName,
	idleLabel: string
) {
	return operation?.state === 'running' && operation.name === name
		? getRepositoryOperationProgressButtonLabel(name)
		: idleLabel;
}

function getRepositoryOperationProgressButtonLabel(name: ProjectRepositoryOperationName) {
	switch (name) {
		case 'clone':
			return 'Cloning';
		case 'init':
			return 'Init';
		case 'fetch':
			return 'Fetching';
		case 'pull':
			return 'Pulling';
		case 'push':
			return 'Pushing';
		case 'publish':
			return 'Publishing';
	}
}
