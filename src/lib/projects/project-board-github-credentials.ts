import type {
	EnvironmentSecretKind,
	EnvironmentSecretRecord,
	EnvironmentVault
} from '$lib/environment/environment-vault';
import type { ProjectRepositoryGitCredentialInput } from './project-repository';
import type { ProjectNodeRecord, ProjectRepositoryLinkRecord } from './project-registry';
import type { ProjectCredentialError } from './project-board-errors';

export interface GithubCredentialOption {
	readonly id: string;
	readonly name: string;
	readonly kind: EnvironmentSecretKind;
	readonly value: string;
}

export function getGithubCredentialOptions(
	vault: EnvironmentVault | null
): readonly GithubCredentialOption[] {
	if (vault === null) {
		return [];
	}

	return vault.secrets
		.filter(isGithubTokenSecret)
		.map((secret) => ({
			id: secret.id,
			name: secret.name,
			kind: secret.kind,
			value: secret.value
		}));
}

export function getGithubCredentialName(
	vault: EnvironmentVault | null,
	options: readonly GithubCredentialOption[],
	secretId: string | null
) {
	if (secretId === null || secretId.length === 0) {
		return 'System Git';
	}

	if (vault === null) {
		return 'GitHub credential';
	}

	return options.find((option) => option.id === secretId)?.name ?? 'Missing credential';
}

export function getNodeGithubCredentialName(
	vault: EnvironmentVault | null,
	options: readonly GithubCredentialOption[],
	node: ProjectNodeRecord
) {
	return getGithubCredentialName(vault, options, node.githubCredentialSecretId);
}

export function getRepositoryGithubCredentialName(
	nodes: readonly ProjectNodeRecord[],
	vault: EnvironmentVault | null,
	options: readonly GithubCredentialOption[],
	node: ProjectNodeRecord,
	repository: ProjectRepositoryLinkRecord
) {
	const credentialSecretId = repository.githubCredentialSecretId;

	return getGithubCredentialName(vault, options, credentialSecretId);
}

export function resolveRepositoryGithubCredential(
	nodes: readonly ProjectNodeRecord[],
	vault: EnvironmentVault | null,
	options: readonly GithubCredentialOption[],
	node: ProjectNodeRecord,
	repository: ProjectRepositoryLinkRecord
): ProjectRepositoryGitCredentialInput | ProjectCredentialError | null {
	const credentialSecretId = resolveRepositoryGithubCredentialSecretId(nodes, node, repository);

	if (credentialSecretId === null) {
		return null;
	}

	if (vault === null) {
		return 'project-github-credential-vault-locked';
	}

	const credential = options.find((option) => option.id === credentialSecretId);

	if (credential === undefined) {
		return 'project-github-credential-missing';
	}

	if (credential.kind !== 'token') {
		return 'project-github-credential-invalid';
	}

	return {
		kind: 'github-token',
		value: credential.value
	};
}

function resolveRepositoryGithubCredentialSecretId(
	nodes: readonly ProjectNodeRecord[],
	node: ProjectNodeRecord,
	repository: ProjectRepositoryLinkRecord
) {
	const project =
		node.parentId === null
			? null
			: nodes.find((candidateNode) => candidateNode.id === node.parentId) ?? null;

	if (project?.githubCredentialSecretId !== null && project?.githubCredentialSecretId !== undefined) {
		return project.githubCredentialSecretId;
	}

	if (repository.githubCredentialSecretId !== null) {
		return repository.githubCredentialSecretId;
	}

	if (node.githubCredentialSecretId !== null) {
		return node.githubCredentialSecretId;
	}

	return project?.githubCredentialSecretId ?? null;
}

function isGithubTokenSecret(secret: EnvironmentSecretRecord) {
	return secret.kind === 'token' && secret.tags.includes('github');
}
