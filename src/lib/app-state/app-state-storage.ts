import { isObjectRecord } from '$lib/shared/object-record';
import { getTauriInvoke } from '$lib/tauri/tauri-invoke';

export const WORKDUCK_APP_STATE_PENDING_STORAGE_KEY_PREFIX = 'workduck.appState.pending.v1';
export const WORKDUCK_APP_STATE_KEYS = [
	'appearance-settings',
	'sync-settings',
	'system-settings',
	'workspace-registry'
] as const;

export type WorkduckAppStateKey = (typeof WORKDUCK_APP_STATE_KEYS)[number];

export const WORKDUCK_APPEARANCE_APP_STATE_KEY = 'appearance-settings' as const;
export const WORKDUCK_SYNC_APP_STATE_KEY = 'sync-settings' as const;
export const WORKDUCK_SYSTEM_APP_STATE_KEY = 'system-settings' as const;
export const WORKDUCK_WORKSPACE_REGISTRY_APP_STATE_KEY = 'workspace-registry' as const;

export interface WorkduckAppStateSeed {
	readonly key: WorkduckAppStateKey;
	readonly legacyStorageKey: string;
	readonly valueJson: string;
}

export type WorkduckAppStateStorageError =
	| 'app-state-storage-unavailable'
	| 'app-state-read-failed'
	| 'app-state-write-failed';

export type WorkduckAppStateInitializationResult =
	| { readonly ok: true }
	| { readonly ok: false; readonly error: WorkduckAppStateStorageError };

export type WorkduckAppStateValueReadResult =
	| { readonly ok: true; readonly valueJson: string | null }
	| {
			readonly ok: false;
			readonly valueJson: string | null;
			readonly error: WorkduckAppStateStorageError;
	  };

export type WorkduckAppStateValueWriteResult =
	| { readonly ok: true; readonly valueJson: string }
	| {
			readonly ok: false;
			readonly valueJson: string;
			readonly error: WorkduckAppStateStorageError;
	  };

interface BrowserStorage {
	getItem(key: string): string | null;
	setItem(key: string, value: string): void;
	removeItem(key: string): void;
}

interface PendingAppStateWrite {
	readonly valueJson: string;
	readonly updatedAt: string;
}

interface NativeAppStateReadResponse {
	readonly ok: boolean;
	readonly records?: Record<string, string> | null;
	readonly error?: string | null;
}

interface NativeAppStateWriteResponse {
	readonly ok: boolean;
	readonly error?: string | null;
}

type AppStateBackend = 'uninitialized' | 'browser' | 'sqlite' | 'native-unavailable';

const cachedValues = new Map<WorkduckAppStateKey, string>();
const legacyStorageKeys = new Map<WorkduckAppStateKey, string>();
let backend: AppStateBackend = 'uninitialized';
let initializationError: WorkduckAppStateStorageError | null = null;
let pendingFlush: Promise<boolean> | null = null;
let browserStorageForTest: BrowserStorage | undefined;

export async function initializeWorkduckAppState(
	seeds: readonly WorkduckAppStateSeed[]
): Promise<WorkduckAppStateInitializationResult> {
	registerSeeds(seeds);
	const storage = getBrowserStorage();
	const invoke = getTauriInvoke();

	if (invoke === undefined) {
		backend = 'browser';
		initializationError = null;

		for (const seed of seeds) {
			cachedValues.set(seed.key, readBrowserValue(storage, seed.legacyStorageKey) ?? seed.valueJson);
		}

		return { ok: true };
	}

	const pendingWrites = readPendingWrites(storage);
	const resolvedValues = new Map(
		seeds.map((seed) => [seed.key, pendingWrites[seed.key]?.valueJson ?? seed.valueJson])
	);

	try {
		const response = await invoke<NativeAppStateReadResponse>('read_app_state_records', {
			keys: seeds.map((seed) => seed.key)
		});
		const nativeRecords = parseNativeReadResponse(response);
		const recordsToWrite: Partial<Record<WorkduckAppStateKey, PendingAppStateWrite>> = {};
		const now = new Date().toISOString();

		for (const seed of seeds) {
			const pendingWrite = pendingWrites[seed.key];
			const nativeValue = nativeRecords[seed.key];
			const valueJson = pendingWrite?.valueJson ?? nativeValue ?? seed.valueJson;

			cachedValues.set(seed.key, valueJson);
			resolvedValues.set(seed.key, valueJson);

			if (pendingWrite !== undefined) {
				recordsToWrite[seed.key] = pendingWrite;
			} else if (nativeValue === undefined) {
				recordsToWrite[seed.key] = {
					valueJson: seed.valueJson,
					updatedAt: now
				};
			}
		}

		if (hasRecords(recordsToWrite)) {
			const writeResponse = await invoke<NativeAppStateWriteResponse>('write_app_state_records', {
				records: recordsToWrite
			});

			if (!isSuccessfulNativeWriteResponse(writeResponse)) {
				return failInitialization('app-state-write-failed', resolvedValues);
			}

			removeFlushedPendingWrites(storage, recordsToWrite);
		}

		removeLegacyValues(storage, seeds);
		backend = 'sqlite';
		initializationError = null;
		return { ok: true };
	} catch {
		return failInitialization('app-state-read-failed', resolvedValues);
	}
}

export function readWorkduckAppStateValue(
	key: WorkduckAppStateKey,
	legacyStorageKey: string
): WorkduckAppStateValueReadResult {
	legacyStorageKeys.set(key, legacyStorageKey);
	const invoke = getTauriInvoke();

	if (backend === 'browser' || (backend === 'uninitialized' && invoke === undefined)) {
		const storage = getBrowserStorage();
		const valueJson = readBrowserValue(storage, legacyStorageKey) ?? cachedValues.get(key) ?? null;

		return storage === undefined
			? {
					ok: false,
					valueJson,
					error: 'app-state-storage-unavailable'
				}
			: { ok: true, valueJson };
	}

	const valueJson = cachedValues.get(key) ?? null;

	return initializationError === null
		? { ok: true, valueJson }
		: { ok: false, valueJson, error: initializationError };
}

export function writeWorkduckAppStateValue(
	key: WorkduckAppStateKey,
	legacyStorageKey: string,
	valueJson: string
): WorkduckAppStateValueWriteResult {
	legacyStorageKeys.set(key, legacyStorageKey);

	if (!isJsonObjectText(valueJson)) {
		return {
			ok: false,
			valueJson,
			error: 'app-state-write-failed'
		};
	}

	const storage = getBrowserStorage();
	const invoke = getTauriInvoke();

	if (invoke === undefined || backend === 'browser') {
		if (!writeBrowserValue(storage, legacyStorageKey, valueJson)) {
			return {
				ok: false,
				valueJson,
				error: 'app-state-storage-unavailable'
			};
		}

		cachedValues.set(key, valueJson);
		return { ok: true, valueJson };
	}

	if (storage === undefined) {
		return {
			ok: false,
			valueJson,
			error: 'app-state-storage-unavailable'
		};
	}

	if (
		!writePendingWrite(storage, key, {
			valueJson,
			updatedAt: new Date().toISOString()
		})
	) {
		return {
			ok: false,
			valueJson,
			error: 'app-state-write-failed'
		};
	}

	cachedValues.set(key, valueJson);
	queueMicrotask(() => {
		void flushWorkduckAppStateWrites();
	});
	return { ok: true, valueJson };
}

export function subscribeWorkduckAppStateValue(
	key: WorkduckAppStateKey,
	callback: (valueJson: string) => void
): () => void {
	if (typeof window === 'undefined') {
		return () => undefined;
	}

	function handleStorage(event: StorageEvent) {
		if (
			event.storageArea !== window.localStorage ||
			event.key !== createPendingStorageKey(key) ||
			event.newValue === null
		) {
			return;
		}

		const pendingWrite = parsePendingWrite(event.newValue);

		if (pendingWrite === null || cachedValues.get(key) === pendingWrite.valueJson) {
			return;
		}

		cachedValues.set(key, pendingWrite.valueJson);
		callback(pendingWrite.valueJson);
	}

	window.addEventListener('storage', handleStorage);

	return () => {
		window.removeEventListener('storage', handleStorage);
	};
}

export async function flushWorkduckAppStateWrites(): Promise<boolean> {
	if (pendingFlush !== null) {
		return pendingFlush;
	}

	pendingFlush = flushPendingWrites().finally(() => {
		pendingFlush = null;
	});

	return pendingFlush;
}

async function flushPendingWrites(): Promise<boolean> {
	const storage = getBrowserStorage();
	const invoke = getTauriInvoke();

	if (storage === undefined || invoke === undefined) {
		return false;
	}

	const pendingWrites = readPendingWrites(storage);

	if (!hasRecords(pendingWrites)) {
		return true;
	}

	try {
		const response = await invoke<NativeAppStateWriteResponse>('write_app_state_records', {
			records: pendingWrites
		});

		if (!isSuccessfulNativeWriteResponse(response)) {
			return false;
		}

		removeFlushedPendingWrites(storage, pendingWrites);
		removeLegacyValuesForRecords(storage, pendingWrites);
		backend = 'sqlite';
		initializationError = null;

		if (hasRecords(readPendingWrites(storage))) {
			queueMicrotask(() => {
				void flushWorkduckAppStateWrites();
			});
		}

		return true;
	} catch {
		return false;
	}
}

function registerSeeds(seeds: readonly WorkduckAppStateSeed[]) {
	for (const seed of seeds) {
		legacyStorageKeys.set(seed.key, seed.legacyStorageKey);

		if (isJsonObjectText(seed.valueJson)) {
			cachedValues.set(seed.key, seed.valueJson);
		}
	}
}

function failInitialization(
	error: WorkduckAppStateStorageError,
	fallbackValues: ReadonlyMap<WorkduckAppStateKey, string>
): WorkduckAppStateInitializationResult {
	for (const [key, valueJson] of fallbackValues) {
		cachedValues.set(key, valueJson);
	}

	backend = 'native-unavailable';
	initializationError = error;
	return { ok: false, error };
}

function parseNativeReadResponse(
	response: NativeAppStateReadResponse
): Partial<Record<WorkduckAppStateKey, string>> {
	if (!response.ok || !isObjectRecord(response.records)) {
		throw new Error('invalid app state read response');
	}

	const records: Partial<Record<WorkduckAppStateKey, string>> = {};

	for (const key of WORKDUCK_APP_STATE_KEYS) {
		const valueJson = response.records[key];

		if (valueJson === undefined) {
			continue;
		}

		if (typeof valueJson !== 'string' || !isJsonObjectText(valueJson)) {
			throw new Error('invalid app state record');
		}

		records[key] = valueJson;
	}

	return records;
}

function isSuccessfulNativeWriteResponse(response: NativeAppStateWriteResponse) {
	return response.ok === true;
}

function readPendingWrites(
	storage: BrowserStorage | undefined
): Partial<Record<WorkduckAppStateKey, PendingAppStateWrite>> {
	const records: Partial<Record<WorkduckAppStateKey, PendingAppStateWrite>> = {};

	if (storage === undefined) {
		return records;
	}

	for (const key of WORKDUCK_APP_STATE_KEYS) {
		const pendingWrite = readPendingWrite(storage, key);

		if (pendingWrite !== null) {
			records[key] = pendingWrite;
		}
	}

	return records;
}

function readPendingWrite(
	storage: BrowserStorage,
	key: WorkduckAppStateKey
): PendingAppStateWrite | null {
	try {
		return parsePendingWrite(storage.getItem(createPendingStorageKey(key)));
	} catch {
		return null;
	}
}

function parsePendingWrite(serializedWrite: string | null): PendingAppStateWrite | null {
	if (serializedWrite === null) {
		return null;
	}

	try {
		const value: unknown = JSON.parse(serializedWrite);

		if (
			!isObjectRecord(value) ||
			typeof value.valueJson !== 'string' ||
			!isJsonObjectText(value.valueJson) ||
			typeof value.updatedAt !== 'string' ||
			value.updatedAt.trim().length === 0
		) {
			return null;
		}

		return {
			valueJson: value.valueJson,
			updatedAt: value.updatedAt.trim()
		};
	} catch {
		return null;
	}
}

function writePendingWrite(
	storage: BrowserStorage,
	key: WorkduckAppStateKey,
	pendingWrite: PendingAppStateWrite
) {
	try {
		storage.setItem(createPendingStorageKey(key), JSON.stringify(pendingWrite));
		return true;
	} catch {
		return false;
	}
}

function removeFlushedPendingWrites(
	storage: BrowserStorage | undefined,
	flushedRecords: Partial<Record<WorkduckAppStateKey, PendingAppStateWrite>>
) {
	if (storage === undefined) {
		return;
	}

	for (const key of WORKDUCK_APP_STATE_KEYS) {
		const flushedRecord = flushedRecords[key];

		if (flushedRecord === undefined) {
			continue;
		}

		const currentRecord = readPendingWrite(storage, key);

		if (
			currentRecord?.valueJson !== flushedRecord.valueJson ||
			currentRecord.updatedAt !== flushedRecord.updatedAt
		) {
			continue;
		}

		try {
			storage.removeItem(createPendingStorageKey(key));
		} catch {
			continue;
		}
	}
}

function removeLegacyValues(storage: BrowserStorage | undefined, seeds: readonly WorkduckAppStateSeed[]) {
	if (storage === undefined) {
		return;
	}

	for (const seed of seeds) {
		try {
			storage.removeItem(seed.legacyStorageKey);
		} catch {
			continue;
		}
	}
}

function removeLegacyValuesForRecords(
	storage: BrowserStorage,
	records: Partial<Record<WorkduckAppStateKey, PendingAppStateWrite>>
) {
	for (const key of WORKDUCK_APP_STATE_KEYS) {
		if (records[key] === undefined) {
			continue;
		}

		const legacyStorageKey = legacyStorageKeys.get(key);

		if (legacyStorageKey === undefined) {
			continue;
		}

		try {
			storage.removeItem(legacyStorageKey);
		} catch {
			continue;
		}
	}
}

function readBrowserValue(storage: BrowserStorage | undefined, key: string) {
	if (storage === undefined) {
		return null;
	}

	try {
		return storage.getItem(key);
	} catch {
		return null;
	}
}

function writeBrowserValue(storage: BrowserStorage | undefined, key: string, valueJson: string) {
	if (storage === undefined) {
		return false;
	}

	try {
		storage.setItem(key, valueJson);
		return true;
	} catch {
		return false;
	}
}

function getBrowserStorage(): BrowserStorage | undefined {
	if (browserStorageForTest !== undefined) {
		return browserStorageForTest;
	}

	if (typeof window === 'undefined') {
		return undefined;
	}

	try {
		return window.localStorage;
	} catch {
		return undefined;
	}
}

function createPendingStorageKey(key: WorkduckAppStateKey) {
	return `${WORKDUCK_APP_STATE_PENDING_STORAGE_KEY_PREFIX}.${key}`;
}

function hasRecords(records: Partial<Record<WorkduckAppStateKey, unknown>>) {
	return WORKDUCK_APP_STATE_KEYS.some((key) => records[key] !== undefined);
}

function isJsonObjectText(valueJson: string) {
	try {
		return isObjectRecord(JSON.parse(valueJson));
	} catch {
		return false;
	}
}

export function setWorkduckAppStateBrowserStorageForTest(storage: BrowserStorage | undefined) {
	browserStorageForTest = storage;
}

export function resetWorkduckAppStateStorageForTest() {
	cachedValues.clear();
	legacyStorageKeys.clear();
	backend = 'uninitialized';
	initializationError = null;
	pendingFlush = null;
	browserStorageForTest = undefined;
}
