import type { AgentExecutionError } from '$lib/agents/agent-execution';
import type { WorkduckMessages } from '$lib/i18n/workduck-language';
import type { QueueExecutionError } from './queue-execution';
import type { QueueFolderError } from './queue-folder';

export function getQueueFolderLocalizedError(messages: WorkduckMessages, error: QueueFolderError) {
	switch (error) {
		case 'queue-folder-workspace-required':
			return messages.queue.errors.workspaceRequired;
		case 'queue-folder-workspace-not-absolute':
			return messages.queue.errors.workspaceNotAbsolute;
		case 'queue-folder-workspace-not-found':
			return messages.queue.errors.workspaceNotFound;
		case 'queue-folder-workspace-not-directory':
			return messages.queue.errors.workspaceNotDirectory;
		case 'queue-folder-workspace-permission-denied':
			return messages.queue.errors.workspacePermissionDenied;
		case 'queue-folder-workspace-unreadable':
			return messages.queue.errors.workspaceUnreadable;
		case 'queue-folder-root-invalid':
			return messages.queue.errors.rootInvalid;
		case 'queue-folder-create-failed':
			return messages.queue.errors.createFailed;
		case 'queue-folder-open-failed':
			return messages.queue.errors.openFailed;
		case 'queue-folder-list-failed':
			return messages.queue.errors.listFailed;
		case 'queue-folder-file-invalid':
			return messages.queue.errors.fileInvalid;
		case 'queue-folder-file-not-found':
			return messages.queue.errors.fileNotFound;
		case 'queue-folder-file-read-failed':
			return messages.queue.errors.fileReadFailed;
		case 'queue-folder-file-write-failed':
			return messages.queue.errors.fileWriteFailed;
		case 'queue-folder-file-delete-failed':
			return messages.queue.errors.fileDeleteFailed;
		case 'queue-folder-file-already-exists':
			return messages.queue.errors.fileAlreadyExists;
		case 'queue-folder-evaluation-delegation-already-exists':
			return messages.queue.errors.evaluationDelegationAlreadyExists;
		case 'queue-folder-unavailable':
			return messages.queue.errors.unavailable;
	}
}

export function getQueueExecutionErrorMessage(
	messages: WorkduckMessages,
	executionError: QueueExecutionError
) {
	switch (executionError) {
		case 'queue-execution-no-task':
			return messages.queue.errors.executionNoTask;
		case 'queue-execution-no-agent':
			return messages.queue.errors.executionNoAgent;
		case 'queue-execution-vault-locked':
			return messages.queue.errors.executionVaultLocked;
		case 'queue-execution-unknown':
			return messages.queue.errors.executionUnknown;
		default:
			return getAgentExecutionErrorMessage(messages, executionError);
	}
}

export function getAgentExecutionErrorMessage(
	messages: WorkduckMessages,
	agentError: AgentExecutionError
) {
	switch (agentError) {
		case 'agent-execution-agent-not-found':
			return messages.queue.errors.executionAgentNotFound;
		case 'agent-execution-secret-not-found':
			return messages.queue.errors.executionSecretNotFound;
		case 'agent-execution-provider-unsupported':
			return messages.queue.errors.executionProviderUnsupported;
		case 'agent-execution-api-key-required':
			return messages.queue.errors.executionApiKeyRequired;
		case 'agent-execution-prompt-required':
			return messages.queue.errors.executionPromptRequired;
		case 'agent-execution-model-required':
			return messages.queue.errors.executionModelRequired;
		case 'agent-execution-request-invalid':
			return messages.queue.errors.executionRequestInvalid;
		case 'agent-execution-authentication-failed':
			return messages.queue.errors.executionAuthenticationFailed;
		case 'agent-execution-rate-limited':
			return messages.queue.errors.executionRateLimited;
		case 'agent-execution-provider-rejected':
			return messages.queue.errors.executionProviderRejected;
		case 'agent-execution-provider-timeout':
			return messages.queue.errors.executionProviderTimeout;
		case 'agent-execution-provider-unavailable':
			return messages.queue.errors.executionProviderUnavailable;
		case 'agent-execution-response-empty':
			return messages.queue.errors.executionResponseEmpty;
		case 'agent-execution-response-invalid':
			return messages.queue.errors.executionResponseInvalid;
		case 'agent-execution-unavailable':
			return messages.queue.errors.executionUnavailable;
	}
}
