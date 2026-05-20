import { parseEnvironmentVault, type EnvironmentVault } from '$lib/environment/environment-vault';
import {
	decryptSecretVaultPayload,
	type SecretVaultEnvelope
} from '$lib/environment/secret-vault-crypto';
import { createSecretVaultErrorMessage, type ProjectFormError } from './project-board-errors';
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
		const decryptResult = await decryptSecretVaultPayload(input.envelope, input.password);

		if (!decryptResult.ok) {
			context.setVaultError(createSecretVaultErrorMessage(decryptResult.error));
			return;
		}

		const parsedVault = parseEnvironmentVault(decryptResult.plaintext, input.workspaceId);

		if (parsedVault === null) {
			context.setVaultError('Environment vault could not be read.');
			return;
		}

		context.setVault(parsedVault);
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
		context.setStatus('GitHub credential saved.');
		context.closeEditor();
		return;
	}

	context.setIsSubmitting(false);
}
