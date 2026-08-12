/* llmnav/1 module
id=workduck.workspace.sync
role=Serialize, encrypt, parse, decrypt, and normalize versioned workspace and project-registry synchronization envelopes.
owns=workspace sync format|encrypted sync envelope|registry payload normalization
excludes=Git synchronization|sync file transport
search=encrypt workspace sync|decrypt registry envelope|workspace sync payload
invariant=Decrypted data is accepted only when envelope algorithms, versions, and normalized registry payloads match the closed sync contract.
stability=contract
*/
import { isObjectRecord } from '$lib/shared/object-record';
import { getTauriInvoke } from '$lib/tauri/tauri-invoke';
import {
	normalizeProjectRegistry,
	WORKDUCK_PROJECT_REGISTRY_VERSION,
	type ProjectRegistry
} from '$lib/projects/project-registry';
import {
	normalizeWorkspaceRegistry,
	parseWorkspaceRegistry,
	serializeWorkspaceRegistry,
	type WorkspaceRegistry
} from './workspace-registry';
import { normalizeWorkspacePathForStorage } from './workspace-path-format';

export const WORKSPACE_SYNC_FORMAT = 'workduck.workspace-sync';
export const WORKSPACE_SYNC_VERSION = 1;
export const WORKSPACE_SYNC_PAYLOAD_FORMAT = 'workduck.sync-data';
export const WORKSPACE_SYNC_PAYLOAD_VERSION = 1;

export type WorkspaceSyncCryptoError =
	| 'workspace-sync-password-required'
	| 'workspace-sync-plaintext-required'
	| 'workspace-sync-envelope-invalid'
	| 'workspace-sync-salt-invalid'
	| 'workspace-sync-nonce-invalid'
	| 'workspace-sync-ciphertext-invalid'
	| 'workspace-sync-key-derivation-failed'
	| 'workspace-sync-encryption-failed'
	| 'workspace-sync-decryption-failed'
	| 'workspace-sync-plaintext-invalid'
	| 'workspace-sync-unavailable';

export type WorkspaceSyncRegistryError =
	| WorkspaceSyncCryptoError
	| 'workspace-sync-registry-invalid';

export interface WorkspaceSyncData {
	readonly format: typeof WORKSPACE_SYNC_PAYLOAD_FORMAT;
	readonly version: typeof WORKSPACE_SYNC_PAYLOAD_VERSION;
	readonly workspaceRegistry: WorkspaceRegistry;
	readonly projectRegistries: Record<string, ProjectRegistry>;
}

export interface WorkspaceSyncEnvelope {
	readonly format: typeof WORKSPACE_SYNC_FORMAT;
	readonly version: typeof WORKSPACE_SYNC_VERSION;
	readonly kdf: {
		readonly algorithm: 'argon2id';
		readonly version: 19;
		readonly memoryKiB: number;
		readonly iterations: number;
		readonly parallelism: number;
		readonly salt: string;
	};
	readonly cipher: {
		readonly algorithm: 'xchacha20poly1305';
		readonly nonce: string;
	};
	readonly ciphertext: string;
}

export type WorkspaceSyncEncryptionResult =
	| {
			readonly ok: true;
			readonly envelope: WorkspaceSyncEnvelope;
	  }
	| {
			readonly ok: false;
			readonly error: WorkspaceSyncCryptoError;
	  };

export type WorkspaceSyncRegistryDecryptionResult =
	| {
			readonly ok: true;
			readonly registry: WorkspaceRegistry;
	  }
	| {
			readonly ok: false;
			readonly error: WorkspaceSyncRegistryError;
	  };

export type WorkspaceSyncDataDecryptionResult =
	| {
			readonly ok: true;
			readonly data: WorkspaceSyncData;
	  }
	| {
			readonly ok: false;
			readonly error: WorkspaceSyncRegistryError;
	  };

interface WorkspaceSyncEncryptionResponse {
	readonly ok: boolean;
	readonly envelope?: WorkspaceSyncEnvelope | null;
	readonly error?: WorkspaceSyncCryptoError | null;
}

interface WorkspaceSyncDecryptionResponse {
	readonly ok: boolean;
	readonly plaintext?: string | null;
	readonly error?: WorkspaceSyncCryptoError | null;
}

export async function encryptWorkspaceRegistryForSync(
	registry: WorkspaceRegistry,
	password: string
): Promise<WorkspaceSyncEncryptionResult> {
	return encryptWorkspaceSyncPayload(serializeWorkspaceRegistry(registry), password);
}

export async function encryptWorkspaceDataForSync(
	workspaceRegistry: WorkspaceRegistry,
	projectRegistries: Record<string, ProjectRegistry>,
	password: string
): Promise<WorkspaceSyncEncryptionResult> {
	return encryptWorkspaceSyncPayload(
		serializeWorkspaceSyncData(workspaceRegistry, projectRegistries),
		password
	);
}

export async function decryptWorkspaceRegistryFromSync(
	envelope: WorkspaceSyncEnvelope,
	password: string
): Promise<WorkspaceSyncRegistryDecryptionResult> {
	const result = await decryptWorkspaceSyncPayload(envelope, password);

	if (!result.ok) {
		return result;
	}

	if (!looksLikeWorkspaceRegistryPlaintext(result.plaintext)) {
		return { ok: false, error: 'workspace-sync-registry-invalid' };
	}

	const registry = parseWorkspaceRegistry(result.plaintext);

	return { ok: true, registry };
}

export async function decryptWorkspaceDataFromSync(
	envelope: WorkspaceSyncEnvelope,
	password: string
): Promise<WorkspaceSyncDataDecryptionResult> {
	const result = await decryptWorkspaceSyncPayload(envelope, password);

	if (!result.ok) {
		return result;
	}

	const data = parseWorkspaceSyncData(result.plaintext);

	return data === null
		? { ok: false, error: 'workspace-sync-registry-invalid' }
		: { ok: true, data };
}

export function parseWorkspaceSyncEnvelope(serializedEnvelope: string): WorkspaceSyncEnvelope | null {
	try {
		const value: unknown = JSON.parse(serializedEnvelope);

		return isWorkspaceSyncEnvelope(value) ? value : null;
	} catch {
		return null;
	}
}

function serializeWorkspaceSyncData(
	workspaceRegistry: WorkspaceRegistry,
	projectRegistries: Record<string, ProjectRegistry>
) {
	const normalizedWorkspaceRegistry = normalizeWorkspaceRegistry(workspaceRegistry);
	const workspacePathById = new Map(
		normalizedWorkspaceRegistry.workspaces.map((workspace) => [workspace.id, workspace.path])
	);

	return JSON.stringify({
		format: WORKSPACE_SYNC_PAYLOAD_FORMAT,
		version: WORKSPACE_SYNC_PAYLOAD_VERSION,
		workspaceRegistry: normalizedWorkspaceRegistry,
		projectRegistries: Object.fromEntries(
			normalizedWorkspaceRegistry.workspaces.map((workspace) => [
				workspace.id,
				createProjectRegistrySyncSnapshot(
					normalizeProjectRegistry(projectRegistries[workspace.id], workspace.id),
					workspacePathById.get(workspace.id) ?? ''
				)
			])
		)
	});
}

function parseWorkspaceSyncData(plaintext: string): WorkspaceSyncData | null {
	try {
		const value: unknown = JSON.parse(plaintext);

		if (looksLikeWorkspaceRegistryValue(value)) {
			const workspaceRegistry = normalizeWorkspaceRegistry(value);

			return {
				format: WORKSPACE_SYNC_PAYLOAD_FORMAT,
				version: WORKSPACE_SYNC_PAYLOAD_VERSION,
				workspaceRegistry,
				projectRegistries: {}
			};
		}

		if (
			!isObjectRecord(value) ||
			value.format !== WORKSPACE_SYNC_PAYLOAD_FORMAT ||
			value.version !== WORKSPACE_SYNC_PAYLOAD_VERSION ||
			!isObjectRecord(value.projectRegistries)
		) {
			return null;
		}

		const projectRegistrySnapshots = value.projectRegistries;
		const workspaceRegistry = normalizeWorkspaceRegistry(value.workspaceRegistry);
		const workspacePathById = new Map(
			workspaceRegistry.workspaces.map((workspace) => [workspace.id, workspace.path])
		);
		const projectRegistries = Object.fromEntries(
			workspaceRegistry.workspaces.map((workspace) => [
				workspace.id,
				restoreProjectRegistrySyncSnapshot(
					projectRegistrySnapshots[workspace.id],
					workspace.id,
					workspacePathById.get(workspace.id) ?? ''
				)
			])
		);

		return {
			format: WORKSPACE_SYNC_PAYLOAD_FORMAT,
			version: WORKSPACE_SYNC_PAYLOAD_VERSION,
			workspaceRegistry,
			projectRegistries
		};
	} catch {
		return null;
	}
}

function createProjectRegistrySyncSnapshot(registry: ProjectRegistry, workspacePath: string) {
	return {
		version: WORKDUCK_PROJECT_REGISTRY_VERSION,
		workspaceId: registry.workspaceId,
		updatedAt: registry.updatedAt,
		nodes: registry.nodes.map((node) => ({
			...node,
			repositories: node.repositories.map((repository) => ({
				...repository,
				path: null,
				localPath: repository.path === null
					? null
					: createWorkspaceRelativePath(workspacePath, repository.path)
			}))
		}))
	};
}

function restoreProjectRegistrySyncSnapshot(
	value: unknown,
	workspaceId: string,
	workspacePath: string
) {
	if (!isObjectRecord(value)) {
		return normalizeProjectRegistry(null, workspaceId);
	}

	const nodes = Array.isArray(value.nodes)
		? value.nodes.map((node) => {
				if (!isObjectRecord(node)) {
					return node;
				}

				const repositories = Array.isArray(node.repositories)
					? node.repositories.map((repository) => {
							if (!isObjectRecord(repository)) {
								return repository;
							}

							const localPath = readOptionalString(repository.localPath);
							const safeLocalPath = normalizeSyncedLocalPath(localPath);

							return {
								...repository,
								path:
									safeLocalPath === null
										? null
										: createWorkspaceChildPath(workspacePath, safeLocalPath)
							};
						})
					: [];

				return {
					...node,
					repositories
				};
			})
		: [];

	return normalizeProjectRegistry(
		{
			...value,
			version: WORKDUCK_PROJECT_REGISTRY_VERSION,
			workspaceId,
			nodes
		},
		workspaceId
	);
}

function createWorkspaceRelativePath(workspacePath: string, childPath: string) {
	const workspacePathKey = createPathBoundaryKey(workspacePath);
	const childPathKey = createPathBoundaryKey(childPath);
	const workspacePathValue = createPathBoundaryValue(workspacePath);
	const childPathValue = createPathBoundaryValue(childPath);

	if (workspacePathKey.length === 0 || childPathKey.length === 0) {
		return null;
	}

	if (childPathKey === workspacePathKey) {
		return '';
	}

	if (!childPathKey.startsWith(`${workspacePathKey}/`)) {
		return null;
	}

	return childPathValue.slice(workspacePathValue.length + 1);
}

function createWorkspaceChildPath(workspacePath: string, relativePath: string) {
	const normalizedWorkspacePath = normalizeWorkspacePathForStorage(workspacePath).replace(/[\\/]+$/u, '');
	const normalizedRelativePath = relativePath
		.trim()
		.replaceAll('\\', '/')
		.replace(/^\/+|\/+$/gu, '');
	const pathSeparator = readWorkspacePathSeparator(normalizedWorkspacePath);

	return normalizedRelativePath.length === 0
		? normalizedWorkspacePath
		: `${normalizedWorkspacePath}${pathSeparator}${normalizedRelativePath.replaceAll(
				'/',
				pathSeparator
			)}`;
}

function createPathBoundaryKey(path: string) {
	return createPathBoundaryValue(path).toLowerCase();
}

function createPathBoundaryValue(path: string) {
	return normalizeWorkspacePathForStorage(path)
		.replaceAll('\\', '/')
		.replace(/^\/\/\?\//u, '')
		.replace(/\/+$/u, '');
}

function readWorkspacePathSeparator(workspacePath: string) {
	return /^[A-Za-z]:[\\/]/u.test(workspacePath) || workspacePath.includes('\\') ? '\\' : '/';
}

async function encryptWorkspaceSyncPayload(
	plaintext: string,
	password: string
): Promise<WorkspaceSyncEncryptionResult> {
	if (password.length === 0) {
		return { ok: false, error: 'workspace-sync-password-required' };
	}

	const invoke = getTauriInvoke();

	if (invoke === undefined) {
		return { ok: false, error: 'workspace-sync-unavailable' };
	}

	try {
		const response = await invoke<WorkspaceSyncEncryptionResponse>(
			'encrypt_workspace_sync_payload',
			{
				password,
				plaintext
			}
		);

		if (response.ok && isWorkspaceSyncEnvelope(response.envelope)) {
			return { ok: true, envelope: response.envelope };
		}

		return {
			ok: false,
			error: isWorkspaceSyncCryptoError(response.error)
				? response.error
				: 'workspace-sync-encryption-failed'
		};
	} catch {
		return { ok: false, error: 'workspace-sync-encryption-failed' };
	}
}

async function decryptWorkspaceSyncPayload(
	envelope: WorkspaceSyncEnvelope,
	password: string
): Promise<
	| {
			readonly ok: true;
			readonly plaintext: string;
	  }
	| {
			readonly ok: false;
			readonly error: WorkspaceSyncCryptoError;
	  }
> {
	if (password.length === 0) {
		return { ok: false, error: 'workspace-sync-password-required' };
	}

	const invoke = getTauriInvoke();

	if (invoke === undefined) {
		return { ok: false, error: 'workspace-sync-unavailable' };
	}

	try {
		const response = await invoke<WorkspaceSyncDecryptionResponse>(
			'decrypt_workspace_sync_payload',
			{
				password,
				envelope
			}
		);

		if (response.ok && typeof response.plaintext === 'string') {
			return { ok: true, plaintext: response.plaintext };
		}

		return {
			ok: false,
			error: isWorkspaceSyncCryptoError(response.error)
				? response.error
				: 'workspace-sync-decryption-failed'
		};
	} catch {
		return { ok: false, error: 'workspace-sync-decryption-failed' };
	}
}

function isWorkspaceSyncEnvelope(value: unknown): value is WorkspaceSyncEnvelope {
	if (!isObjectRecord(value) || !isObjectRecord(value.kdf) || !isObjectRecord(value.cipher)) {
		return false;
	}

	return (
		value.format === WORKSPACE_SYNC_FORMAT &&
		value.version === WORKSPACE_SYNC_VERSION &&
		value.kdf.algorithm === 'argon2id' &&
		value.kdf.version === 19 &&
		typeof value.kdf.memoryKiB === 'number' &&
		typeof value.kdf.iterations === 'number' &&
		typeof value.kdf.parallelism === 'number' &&
		typeof value.kdf.salt === 'string' &&
		value.cipher.algorithm === 'xchacha20poly1305' &&
		typeof value.cipher.nonce === 'string' &&
		typeof value.ciphertext === 'string'
	);
}

function isWorkspaceSyncCryptoError(value: unknown): value is WorkspaceSyncCryptoError {
	return (
		value === 'workspace-sync-password-required' ||
		value === 'workspace-sync-plaintext-required' ||
		value === 'workspace-sync-envelope-invalid' ||
		value === 'workspace-sync-salt-invalid' ||
		value === 'workspace-sync-nonce-invalid' ||
		value === 'workspace-sync-ciphertext-invalid' ||
		value === 'workspace-sync-key-derivation-failed' ||
		value === 'workspace-sync-encryption-failed' ||
		value === 'workspace-sync-decryption-failed' ||
		value === 'workspace-sync-plaintext-invalid' ||
		value === 'workspace-sync-unavailable'
	);
}

function looksLikeWorkspaceRegistryPlaintext(plaintext: string) {
	try {
		const value: unknown = JSON.parse(plaintext);

		return looksLikeWorkspaceRegistryValue(value);
	} catch {
		return false;
	}
}

function looksLikeWorkspaceRegistryValue(value: unknown) {
	return isObjectRecord(value) && Array.isArray(value.workspaces);
}

function readOptionalString(value: unknown) {
	return typeof value === 'string' ? value.trim() : null;
}

function normalizeSyncedLocalPath(value: string | null) {
	if (value === null) {
		return null;
	}

	const normalizedValue = value.trim().replaceAll('\\', '/').replace(/^\/+|\/+$/gu, '');

	if (normalizedValue.length === 0) {
		return '';
	}

	const segments = normalizedValue.split('/').filter(Boolean);

	return segments.length > 0 && segments.every((segment) => segment !== '.' && segment !== '..')
		? segments.join('/')
		: null;
}
