import type { EnvironmentSecretRecord } from './environment-vault';
import type { CliEnvironmentVariableInput } from './cli-environment';

export const CLI_ENVIRONMENT_VARIABLE_NAME_MAX_LENGTH = 128;

const RESERVED_CLI_ENVIRONMENT_VARIABLE_NAMES = new Set([
	'ALLUSERSPROFILE',
	'APPDATA',
	'COMSPEC',
	'HOME',
	'HOMEDRIVE',
	'HOMEPATH',
	'LOCALAPPDATA',
	'LOGONSERVER',
	'NUMBER_OF_PROCESSORS',
	'OS',
	'PATH',
	'PATHEXT',
	'PROCESSOR_ARCHITECTURE',
	'PROCESSOR_IDENTIFIER',
	'PROCESSOR_LEVEL',
	'PROCESSOR_REVISION',
	'PROGRAMDATA',
	'PROGRAMFILES',
	'PROGRAMFILES(X86)',
	'PROGRAMW6432',
	'PSMODULEPATH',
	'PUBLIC',
	'SYSTEMDRIVE',
	'SYSTEMROOT',
	'TEMP',
	'TMP',
	'USERDOMAIN',
	'USERDOMAIN_ROAMINGPROFILE',
	'USERNAME',
	'USERPROFILE',
	'WINDIR'
]);

export function createCliEnvironmentVariables(
	secrets: readonly EnvironmentSecretRecord[]
): CliEnvironmentVariableInput[] {
	const variables = new Map<string, string>();

	for (const secret of secrets) {
		const variableName = resolveCliEnvironmentVariableName(secret);

		if (variableName === null || variables.has(variableName)) {
			continue;
		}

		variables.set(variableName, secret.value);
	}

	return Array.from(variables, ([name, value]) => ({ name, value }));
}

export function resolveCliEnvironmentVariableName(secret: EnvironmentSecretRecord): string | null {
	const providerVariableName = resolveKnownProviderVariableName(secret);

	if (providerVariableName !== null) {
		return providerVariableName;
	}

	const toolVariableName = resolveKnownToolVariableName(secret);

	if (toolVariableName !== null) {
		return toolVariableName;
	}

	return normalizeCliEnvironmentVariableName(secret.name);
}

export function normalizeCliEnvironmentVariableName(name: string): string | null {
	const normalized = name
		.trim()
		.replaceAll(/([a-z0-9])([A-Z])/g, '$1_$2')
		.toLocaleUpperCase('en-US')
		.replaceAll(/[^A-Z0-9_]+/g, '_')
		.replaceAll(/_+/g, '_')
		.replaceAll(/^_+|_+$/g, '');

	if (normalized.length === 0 || normalized.length > CLI_ENVIRONMENT_VARIABLE_NAME_MAX_LENGTH) {
		return null;
	}

	const variableName = /^[A-Z_]/.test(normalized) ? normalized : `_${normalized}`;

	if (RESERVED_CLI_ENVIRONMENT_VARIABLE_NAMES.has(variableName)) {
		return null;
	}

	return variableName;
}

function resolveKnownProviderVariableName(secret: EnvironmentSecretRecord): string | null {
	if (secret.kind !== 'api-key') {
		return null;
	}

	const profileText = [secret.name, ...secret.tags]
		.join(' ')
		.toLocaleLowerCase('en-US')
		.replaceAll(/[^a-z0-9]+/g, '');

	if (profileText.includes('openrouter')) {
		return 'OPENROUTER_API_KEY';
	}

	if (profileText.includes('umans')) {
		return 'UMANS_API_KEY';
	}

	if (profileText.includes('openai')) {
		return 'OPENAI_API_KEY';
	}

	if (profileText.includes('deepseek')) {
		return 'DEEPSEEK_API_KEY';
	}

	return null;
}

function resolveKnownToolVariableName(secret: EnvironmentSecretRecord): string | null {
	const profileText = [secret.name, ...secret.tags]
		.join(' ')
		.toLocaleLowerCase('en-US')
		.replaceAll(/[^a-z0-9]+/g, '');

	if (profileText.includes('npm') && profileText.includes('publish')) {
		return 'NODE_AUTH_TOKEN';
	}

	return null;
}
