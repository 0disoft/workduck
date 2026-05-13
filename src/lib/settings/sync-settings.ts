import { normalizeWorkspacePathForStorage } from '$lib/workspaces/workspace-path-format';
import { WORKSPACE_PATH_MAX_LENGTH } from '$lib/workspaces/workspace-registry';
import {
	DEFAULT_WORKSPACE_SYNC_FILE_NAME,
	normalizeWorkspaceSyncFileName,
	WORKSPACE_SYNC_FILE_NAME_MAX_LENGTH
} from '$lib/workspaces/workspace-sync-file';

export const WORKDUCK_SYNC_SETTINGS_STORAGE_KEY = 'workduck.syncSettings.v1';
export const DEFAULT_SYNC_PROFILE_NAME = 'Personal sync';
export const SYNC_PROFILE_NAME_MAX_LENGTH = 80;

export interface SyncSettings {
	readonly profileName: string;
	readonly folderPath: string;
	readonly fileName: string;
}

export function createDefaultSyncSettings(): SyncSettings {
	return {
		profileName: DEFAULT_SYNC_PROFILE_NAME,
		folderPath: '',
		fileName: DEFAULT_WORKSPACE_SYNC_FILE_NAME
	};
}

export function parseSyncSettings(serializedSettings: string | null): SyncSettings {
	if (serializedSettings === null) {
		return createDefaultSyncSettings();
	}

	try {
		return normalizeSyncSettings(JSON.parse(serializedSettings));
	} catch {
		return createDefaultSyncSettings();
	}
}

export function serializeSyncSettings(settings: SyncSettings) {
	return JSON.stringify(normalizeSyncSettings(settings));
}

export function normalizeSyncSettings(value: unknown): SyncSettings {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) {
		return createDefaultSyncSettings();
	}

	const profileName = readOptionalString(value, 'profileName');
	const fileName = readOptionalString(value, 'fileName');

	return {
		profileName: normalizeSyncProfileName(profileName ?? DEFAULT_SYNC_PROFILE_NAME),
		folderPath: normalizeWorkspacePathForStorage(readString(value, 'folderPath')).slice(
			0,
			WORKSPACE_PATH_MAX_LENGTH
		),
		fileName: normalizeWorkspaceSyncFileName(fileName ?? DEFAULT_WORKSPACE_SYNC_FILE_NAME).slice(
			0,
			WORKSPACE_SYNC_FILE_NAME_MAX_LENGTH
		)
	};
}

export function normalizeSyncProfileName(profileName: string) {
	return profileName.trim().slice(0, SYNC_PROFILE_NAME_MAX_LENGTH);
}

function readString(value: object, key: string) {
	return key in value && typeof value[key as keyof typeof value] === 'string'
		? String(value[key as keyof typeof value])
		: '';
}

function readOptionalString(value: object, key: string) {
	return key in value && typeof value[key as keyof typeof value] === 'string'
		? String(value[key as keyof typeof value])
		: null;
}
