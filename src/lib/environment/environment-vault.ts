export const ENVIRONMENT_VAULT_VERSION = 1;
export const ENVIRONMENT_SECRET_NAME_MAX_LENGTH = 120;
export const ENVIRONMENT_SECRET_VALUE_MAX_LENGTH = 16_384;

export const environmentSecretKindOptions = [
	{ id: 'api-key', label: 'API key' },
	{ id: 'token', label: 'Token' },
	{ id: 'account', label: 'Account' },
	{ id: 'password', label: 'Password' },
	{ id: 'other', label: 'Other' }
] as const;

export type EnvironmentSecretKind = (typeof environmentSecretKindOptions)[number]['id'];

export type EnvironmentVaultError =
	| 'environment-secret-name-required'
	| 'environment-secret-name-duplicate'
	| 'environment-secret-value-required'
	| 'environment-secret-not-found'
	| 'environment-vault-invalid';

export interface EnvironmentSecretRecord {
	readonly id: string;
	readonly name: string;
	readonly kind: EnvironmentSecretKind;
	readonly value: string;
	readonly createdAt: string;
	readonly updatedAt: string;
}

export interface EnvironmentVault {
	readonly version: typeof ENVIRONMENT_VAULT_VERSION;
	readonly workspaceId: string;
	readonly secrets: readonly EnvironmentSecretRecord[];
	readonly updatedAt: string;
}

export interface EnvironmentSecretInput {
	readonly id?: string | null;
	readonly name: string;
	readonly kind: EnvironmentSecretKind;
	readonly value: string;
}

export type EnvironmentVaultMutationResult =
	| {
			readonly ok: true;
			readonly vault: EnvironmentVault;
	  }
	| {
			readonly ok: false;
			readonly vault: EnvironmentVault;
			readonly error: EnvironmentVaultError;
	  };

export function createEmptyEnvironmentVault(
	workspaceId: string,
	now = new Date()
): EnvironmentVault {
	return {
		version: ENVIRONMENT_VAULT_VERSION,
		workspaceId,
		secrets: [],
		updatedAt: now.toISOString()
	};
}

export function parseEnvironmentVault(
	serializedVault: string,
	workspaceId: string
): EnvironmentVault | null {
	try {
		return normalizeEnvironmentVault(JSON.parse(serializedVault), workspaceId);
	} catch {
		return null;
	}
}

export function serializeEnvironmentVault(vault: EnvironmentVault): string {
	return JSON.stringify(normalizeEnvironmentVault(vault, vault.workspaceId) ?? vault);
}

export function upsertEnvironmentSecret(
	vault: EnvironmentVault,
	input: EnvironmentSecretInput,
	now = new Date()
): EnvironmentVaultMutationResult {
	const normalizedVault = normalizeEnvironmentVault(vault, vault.workspaceId) ?? vault;
	const name = normalizeSecretName(input.name);
	const value = normalizeSecretValue(input.value);
	const kind = normalizeSecretKind(input.kind);
	const secretId = normalizeRecordId(input.id ?? null);

	if (name.length === 0) {
		return { ok: false, vault: normalizedVault, error: 'environment-secret-name-required' };
	}

	if (value.length === 0) {
		return { ok: false, vault: normalizedVault, error: 'environment-secret-value-required' };
	}

	const matchingSecret = normalizedVault.secrets.find((secret) => secret.id === secretId);
	const nameKey = createSecretNameKey(name);
	const nameAlreadyExists = normalizedVault.secrets.some(
		(secret) => secret.id !== secretId && createSecretNameKey(secret.name) === nameKey
	);

	if (nameAlreadyExists) {
		return { ok: false, vault: normalizedVault, error: 'environment-secret-name-duplicate' };
	}

	if (secretId !== null && matchingSecret === undefined) {
		return { ok: false, vault: normalizedVault, error: 'environment-secret-not-found' };
	}

	const timestamp = now.toISOString();
	const nextSecret = {
		id: secretId ?? createSecretId(),
		name,
		kind,
		value,
		createdAt: matchingSecret?.createdAt ?? timestamp,
		updatedAt: timestamp
	} satisfies EnvironmentSecretRecord;
	const secrets =
		matchingSecret === undefined
			? [...normalizedVault.secrets, nextSecret]
			: normalizedVault.secrets.map((secret) =>
					secret.id === nextSecret.id ? nextSecret : secret
				);

	return {
		ok: true,
		vault: {
			...normalizedVault,
			secrets: sortEnvironmentSecrets(secrets),
			updatedAt: timestamp
		}
	};
}

export function removeEnvironmentSecret(
	vault: EnvironmentVault,
	secretId: string,
	now = new Date()
): EnvironmentVaultMutationResult {
	const normalizedVault = normalizeEnvironmentVault(vault, vault.workspaceId) ?? vault;

	if (!normalizedVault.secrets.some((secret) => secret.id === secretId)) {
		return { ok: false, vault: normalizedVault, error: 'environment-secret-not-found' };
	}

	return {
		ok: true,
		vault: {
			...normalizedVault,
			secrets: normalizedVault.secrets.filter((secret) => secret.id !== secretId),
			updatedAt: now.toISOString()
		}
	};
}

export function createMaskedSecretValue(value: string) {
	return value.length === 0 ? '' : '•'.repeat(Math.min(12, Math.max(6, value.length)));
}

function normalizeEnvironmentVault(value: unknown, workspaceId: string): EnvironmentVault | null {
	if (!isObjectRecord(value) || value.version !== ENVIRONMENT_VAULT_VERSION) {
		return null;
	}

	if (typeof value.workspaceId !== 'string' || value.workspaceId !== workspaceId) {
		return null;
	}

	const rawSecrets = Array.isArray(value.secrets) ? value.secrets : [];
	const seenSecretIds = new Set<string>();
	const seenSecretNames = new Set<string>();
	const secrets: EnvironmentSecretRecord[] = [];

	for (const rawSecret of rawSecrets) {
		const secret = parseSecretRecord(rawSecret);

		if (secret === null) {
			continue;
		}

		const secretNameKey = createSecretNameKey(secret.name);

		if (seenSecretIds.has(secret.id) || seenSecretNames.has(secretNameKey)) {
			continue;
		}

		seenSecretIds.add(secret.id);
		seenSecretNames.add(secretNameKey);
		secrets.push(secret);
	}

	return {
		version: ENVIRONMENT_VAULT_VERSION,
		workspaceId,
		secrets: sortEnvironmentSecrets(secrets),
		updatedAt: readTrimmedString(value.updatedAt)
	};
}

function parseSecretRecord(value: unknown): EnvironmentSecretRecord | null {
	if (!isObjectRecord(value)) {
		return null;
	}

	const id = normalizeRecordId(value.id);
	const name = normalizeSecretName(readTrimmedString(value.name));
	const kind = normalizeSecretKind(value.kind);
	const secretValue = normalizeSecretValue(readRawString(value.value));
	const createdAt = readTrimmedString(value.createdAt);
	const updatedAt = readTrimmedString(value.updatedAt);

	if (id === null || name.length === 0 || secretValue.length === 0) {
		return null;
	}

	return {
		id,
		name,
		kind,
		value: secretValue,
		createdAt: createdAt.length === 0 ? updatedAt : createdAt,
		updatedAt: updatedAt.length === 0 ? createdAt : updatedAt
	};
}

function sortEnvironmentSecrets(secrets: readonly EnvironmentSecretRecord[]) {
	return [...secrets].sort((left, right) =>
		left.name.localeCompare(right.name, 'en-US', { sensitivity: 'base' })
	);
}

function normalizeSecretName(value: string) {
	return value.trim().replace(/\s+/g, ' ').slice(0, ENVIRONMENT_SECRET_NAME_MAX_LENGTH);
}

function normalizeSecretValue(value: string) {
	return value.slice(0, ENVIRONMENT_SECRET_VALUE_MAX_LENGTH);
}

function normalizeSecretKind(value: unknown): EnvironmentSecretKind {
	return environmentSecretKindOptions.some((option) => option.id === value)
		? (value as EnvironmentSecretKind)
		: 'api-key';
}

function normalizeRecordId(value: unknown) {
	const id = readTrimmedString(value);

	return id.length === 0 ? null : id;
}

function createSecretId() {
	if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
		return crypto.randomUUID();
	}

	return `secret-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function createSecretNameKey(name: string) {
	return normalizeSecretName(name).toLocaleLowerCase('en-US');
}

function readRawString(value: unknown) {
	return typeof value === 'string' ? value : '';
}

function readTrimmedString(value: unknown) {
	return typeof value === 'string' ? value.trim() : '';
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}
