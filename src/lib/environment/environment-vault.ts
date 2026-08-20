import { isObjectRecord } from '$lib/shared/object-record';
export const ENVIRONMENT_VAULT_VERSION = 1;
export const ENVIRONMENT_SECRET_NAME_MAX_LENGTH = 120;
export const ENVIRONMENT_SECRET_VALUE_MAX_LENGTH = 16_384;
export const ENVIRONMENT_SECRET_TAGS_MAX_COUNT = 8;
export const ENVIRONMENT_SECRET_NATIVE_REFERENCE_PREFIX = 'workduck-secret-ref:v1:';

export const environmentSecretKindOptions = [
	{ id: 'api-key', label: 'API key' },
	{ id: 'token', label: 'Token' },
	{ id: 'ssh-key', label: 'SSH key' },
	{ id: 'account', label: 'Account' },
	{ id: 'password', label: 'Password' },
	{ id: 'other', label: 'Other' }
] as const;

export const environmentSecretTagOptions = [
	{ id: 'llm', label: 'LLM' },
	{ id: 'github', label: 'GitHub' },
	{ id: 'gitlab', label: 'GitLab' },
	{ id: 'openai', label: 'OpenAI' },
	{ id: 'anthropic', label: 'Anthropic' },
	{ id: 'openrouter', label: 'OpenRouter' },
	{ id: 'umans', label: 'Umans' },
	{ id: 'cloud', label: 'Cloud' },
	{ id: 'database', label: 'Database' },
	{ id: 'auth', label: 'Auth' },
	{ id: 'sync', label: 'Sync' },
	{ id: 'deployment', label: 'Deployment' },
	{ id: 'monitoring', label: 'Monitoring' },
	{ id: 'payment', label: 'Payment' },
	{ id: 'storage', label: 'Storage' }
] as const;

export type EnvironmentSecretKind = (typeof environmentSecretKindOptions)[number]['id'];
export type EnvironmentSecretTag = (typeof environmentSecretTagOptions)[number]['id'];

export type EnvironmentVaultError =
	| 'environment-secret-name-required'
	| 'environment-secret-kind-required'
	| 'environment-secret-tag-required'
	| 'environment-secret-name-duplicate'
	| 'environment-secret-value-required'
	| 'environment-secret-not-found'
	| 'environment-vault-invalid';

export interface EnvironmentSecretRecord {
	readonly id: string;
	readonly name: string;
	readonly kind: EnvironmentSecretKind;
	readonly tags: readonly EnvironmentSecretTag[];
	/**
	 * Stored payloads use the plaintext value immediately before native encryption.
	 * Native session views replace it with an opaque workduck-secret-ref handle.
	 */
	readonly value: string;
	readonly valueLength?: number;
	readonly createdAt: string;
	readonly updatedAt: string;
}

export interface EnvironmentVault {
	readonly version: typeof ENVIRONMENT_VAULT_VERSION;
	readonly workspaceId: string;
	readonly secrets: readonly EnvironmentSecretRecord[];
	readonly updatedAt: string;
	readonly nativeManaged?: true;
}

export interface EnvironmentSecretInput {
	readonly id?: string | null;
	readonly name: string;
	readonly kind: EnvironmentSecretKind | '';
	readonly tags: readonly EnvironmentSecretTag[];
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
	const tags = normalizeSecretTags(input.tags);
	const secretId = normalizeRecordId(input.id ?? null);

	if (name.length === 0) {
		return { ok: false, vault: normalizedVault, error: 'environment-secret-name-required' };
	}

	if (value.length === 0) {
		return { ok: false, vault: normalizedVault, error: 'environment-secret-value-required' };
	}

	if (!isEnvironmentSecretKind(input.kind)) {
		return { ok: false, vault: normalizedVault, error: 'environment-secret-kind-required' };
	}

	if (tags.length === 0) {
		return { ok: false, vault: normalizedVault, error: 'environment-secret-tag-required' };
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
		kind: input.kind,
		tags,
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
			version: normalizedVault.version,
			workspaceId: normalizedVault.workspaceId,
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
			version: normalizedVault.version,
			workspaceId: normalizedVault.workspaceId,
			secrets: normalizedVault.secrets.filter((secret) => secret.id !== secretId),
			updatedAt: now.toISOString()
		}
	};
}

export function createMaskedSecretValue(value: string) {
	return createMaskedSecretValueForLength(value.length);
}

export function createMaskedSecretValueForLength(valueLength: number) {
	return valueLength <= 0 ? '' : '•'.repeat(Math.min(12, Math.max(6, Math.floor(valueLength))));
}

export function isEnvironmentSecretNativeReference(value: string) {
	return value.startsWith(ENVIRONMENT_SECRET_NATIVE_REFERENCE_PREFIX);
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
		updatedAt: readTrimmedString(value.updatedAt),
		...(value.nativeManaged === true ? { nativeManaged: true as const } : {})
	};
}

function parseSecretRecord(value: unknown): EnvironmentSecretRecord | null {
	if (!isObjectRecord(value)) {
		return null;
	}

	const id = normalizeRecordId(value.id);
	const name = normalizeSecretName(readTrimmedString(value.name));
	const kind = normalizeSecretKind(value.kind);
	const tags = normalizeSecretTags(value.tags);
	const secretValue = normalizeSecretValue(readRawString(value.value));
	const valueLength = normalizeOptionalSecretValueLength(value.valueLength);
	const createdAt = readTrimmedString(value.createdAt);
	const updatedAt = readTrimmedString(value.updatedAt);

	if (id === null || name.length === 0 || secretValue.length === 0) {
		return null;
	}

	return {
		id,
		name,
		kind,
		tags,
		value: secretValue,
		...(valueLength === null ? {} : { valueLength }),
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

function normalizeOptionalSecretValueLength(value: unknown) {
	if (typeof value !== 'number' || !Number.isFinite(value)) {
		return null;
	}

	return Math.min(ENVIRONMENT_SECRET_VALUE_MAX_LENGTH, Math.max(0, Math.floor(value)));
}

function normalizeSecretKind(value: unknown): EnvironmentSecretKind {
	return isEnvironmentSecretKind(value) ? value : 'api-key';
}

function isEnvironmentSecretKind(value: unknown): value is EnvironmentSecretKind {
	return environmentSecretKindOptions.some((option) => option.id === value);
}

function normalizeSecretTags(value: unknown): EnvironmentSecretTag[] {
	if (!Array.isArray(value)) {
		return [];
	}

	const allowedTags = new Set(environmentSecretTagOptions.map((option) => option.id));
	const tags: EnvironmentSecretTag[] = [];

	for (const item of value) {
		if (typeof item !== 'string' || !allowedTags.has(item as EnvironmentSecretTag)) {
			continue;
		}

		const tag = item as EnvironmentSecretTag;

		if (!tags.includes(tag)) {
			tags.push(tag);
		}

		if (tags.length >= ENVIRONMENT_SECRET_TAGS_MAX_COUNT) {
			break;
		}
	}

	return tags;
}

function normalizeRecordId(value: unknown) {
	const id = readTrimmedString(value);

	return id.length === 0 ? null : id;
}

function createSecretId() {
	if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
		return crypto.randomUUID();
	}

	return `secret-${Date.now().toString(36)}-${createSecretRandomToken()}`;
}

function createSecretNameKey(name: string) {
	return normalizeSecretName(name).toLowerCase();
}

function createSecretRandomToken() {
	if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
		const values = new Uint8Array(8);
		crypto.getRandomValues(values);

		return Array.from(values, (value) => value.toString(36).padStart(2, '0')).join('');
	}

	throw new Error('Secure random values are unavailable.');
}

function readRawString(value: unknown) {
	return typeof value === 'string' ? value : '';
}

function readTrimmedString(value: unknown) {
	return typeof value === 'string' ? value.trim() : '';
}
