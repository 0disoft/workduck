import type { EnvironmentVault } from '$lib/environment/environment-vault';
import {
	openEnvironmentVaultSession,
	type EnvironmentVaultSessionError
} from '$lib/environment/environment-vault-session';
import type { SecretVaultEnvelope } from '$lib/environment/secret-vault-crypto';
import type { WorkduckMessages } from '$lib/i18n/workduck-message-contract';
import type { ProjectFormError } from './project-board-errors';
import type { ProjectGithubCredentialEditorTarget } from './project-board-types';
import {
	setProjectNodeGithubCredential,
	setProjectRepositoryGithubCredential,
	type ProjectRegistry
} from './project-registry';

export interface ProjectEnvironmentVaultUnlockInput {
	readonly envelope: SecretVaultEnvelope | null;
	readonly password: string;
	readonly workspaceId: string;
	readonly isBusy: boolean;
}

export interface ProjectEnvironmentVaultUnlockContext {
	readonly setIsBusy: (isBusy: boolean) => void;
	readonly setVault: (vault: EnvironmentVault) => void;
	readonly setPassword: (password: string) => void;
	readonly setVaultError: (error: string | null) => void;
	readonly setFormError: (error: ProjectFormError | null) => void;
	readonly getEnvironmentMessages: () => WorkduckMessages['environment'];
}

export async function unlockProjectEnvironmentVault(
	input: ProjectEnvironmentVaultUnlockInput,
	context: ProjectEnvironmentVaultUnlockContext
) {
	if (input.envelope === null || input.isBusy || input.password.length === 0) {
		return;
	}

	context.setIsBusy(true);
	context.setVaultError(null);
	context.setFormError(null);

	try {
		const openResult = await openEnvironmentVaultSession(
			input.workspaceId,
			input.password,
			input.envelope
		);
		const environmentMessages = context.getEnvironmentMessages();

		if (!openResult.ok) {
			context.setVaultError(
				createEnvironmentVaultSessionErrorMessage(openResult.error, environmentMessages.errors)
			);
			return;
		}

		context.setVault(openResult.vault);
		context.setPassword('');
	} finally {
		context.setIsBusy(false);
	}
}

export interface ProjectGithubCredentialSaveInput {
	readonly editor: ProjectGithubCredentialEditorTarget | null;
	readonly registry: ProjectRegistry;
	readonly selectedSecretId: string;
	readonly isSubmitting: boolean;
	readonly environmentVault: EnvironmentVault | null;
}

export interface ProjectGithubCredentialSaveContext {
	readonly persistRegistry: (nextRegistry: ProjectRegistry) => Promise<boolean>;
	readonly setIsSubmitting: (isSubmitting: boolean) => void;
	readonly setFormError: (error: ProjectFormError | null) => void;
	readonly setStatus: (status: string | null) => void;
	readonly getSavedStatus: () => string;
	readonly closeEditor: () => void;
}

export async function saveProjectGithubCredential(
	input: ProjectGithubCredentialSaveInput,
	context: ProjectGithubCredentialSaveContext
) {
	if (input.editor === null || input.isSubmitting || input.environmentVault === null) {
		return;
	}

	context.setIsSubmitting(true);
	context.setFormError(null);
	context.setStatus(null);

	const result =
		input.editor.type === 'repository'
			? setProjectRepositoryGithubCredential(input.registry, {
					nodeId: input.editor.node.id,
					repositoryId: input.editor.repository.id,
					githubCredentialSecretId: input.selectedSecretId || null
				})
			: setProjectNodeGithubCredential(input.registry, {
					nodeId: input.editor.node.id,
					githubCredentialSecretId: input.selectedSecretId || null
				});

	if (!result.ok) {
		context.setFormError(result.error);
		context.setIsSubmitting(false);
		return;
	}

	if (await context.persistRegistry(result.registry)) {
		context.setStatus(context.getSavedStatus());
		context.closeEditor();
		return;
	}

	context.setIsSubmitting(false);
}

function createEnvironmentVaultSessionErrorMessage(
	error: EnvironmentVaultSessionError,
	messages: WorkduckMessages['environment']['errors']
) {
	switch (error) {
		case 'environment-vault-session-password-required':
			return messages.vaultPasswordRequired;
		case 'environment-vault-session-unavailable':
			return messages.vaultUnavailable;
		case 'environment-vault-session-decrypt-failed':
		case 'environment-vault-session-invalid':
			return messages.vaultPasswordMismatch;
		default:
			return messages.vaultOperationFailed;
	}
}
