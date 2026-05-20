import type { EnvironmentVault } from './environment-vault';

export interface GithubTokenCredentialInput {
	readonly kind: 'github-token';
	readonly value: string;
}

export function resolveDefaultGithubTokenCredential(
	vault: EnvironmentVault | null
): GithubTokenCredentialInput | null {
	const secret =
		vault?.secrets.find((candidate) => {
			return candidate.kind === 'token' && candidate.tags.includes('github');
		}) ?? null;

	if (secret === null) {
		return null;
	}

	return {
		kind: 'github-token',
		value: secret.value
	};
}
