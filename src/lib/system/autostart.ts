import { getTauriInvoke } from '$lib/tauri/tauri-invoke';

export type WorkduckAutostartError =
	| 'autostart-unavailable'
	| 'autostart-read-failed'
	| 'autostart-write-failed';

export type WorkduckAutostartReadResult =
	| {
			readonly ok: true;
			readonly enabled: boolean;
	  }
	| {
			readonly ok: false;
			readonly enabled: false;
			readonly error: WorkduckAutostartError;
	  };

export type WorkduckAutostartWriteResult =
	| {
			readonly ok: true;
			readonly enabled: boolean;
	  }
	| {
			readonly ok: false;
			readonly enabled: boolean;
			readonly error: WorkduckAutostartError;
	  };

export async function readWorkduckAutostartEnabled(): Promise<WorkduckAutostartReadResult> {
	const invoke = getTauriInvoke();

	if (invoke === undefined) {
		return { ok: false, enabled: false, error: 'autostart-unavailable' };
	}

	try {
		return normalizeAutostartReadResponse(
			await invoke<unknown>('read_workduck_autostart_enabled')
		);
	} catch {
		return { ok: false, enabled: false, error: 'autostart-read-failed' };
	}
}

export async function setWorkduckAutostartEnabled(
	enabled: boolean
): Promise<WorkduckAutostartWriteResult> {
	const invoke = getTauriInvoke();

	if (invoke === undefined) {
		return { ok: false, enabled, error: 'autostart-unavailable' };
	}

	try {
		return normalizeAutostartWriteResponse(
			await invoke<unknown>('set_workduck_autostart_enabled', { enabled }),
			enabled
		);
	} catch {
		return { ok: false, enabled, error: 'autostart-write-failed' };
	}
}

function normalizeAutostartReadResponse(response: unknown): WorkduckAutostartReadResult {
	if (isAutostartSuccessResponse(response)) {
		return { ok: true, enabled: response.enabled };
	}

	if (isAutostartFailureResponse(response)) {
		return { ok: false, enabled: false, error: response.error };
	}

	return { ok: false, enabled: false, error: 'autostart-read-failed' };
}

function normalizeAutostartWriteResponse(
	response: unknown,
	requestedEnabled: boolean
): WorkduckAutostartWriteResult {
	if (isAutostartSuccessResponse(response)) {
		return { ok: true, enabled: response.enabled };
	}

	if (isAutostartFailureResponse(response)) {
		return { ok: false, enabled: requestedEnabled, error: response.error };
	}

	return { ok: false, enabled: requestedEnabled, error: 'autostart-write-failed' };
}

function isAutostartSuccessResponse(
	response: unknown
): response is { readonly ok: true; readonly enabled: boolean } {
	return isObjectRecord(response) && response.ok === true && typeof response.enabled === 'boolean';
}

function isAutostartFailureResponse(
	response: unknown
): response is { readonly ok: false; readonly error: WorkduckAutostartError } {
	return (
		isObjectRecord(response) &&
		response.ok === false &&
		isWorkduckAutostartError(response.error)
	);
}

function isWorkduckAutostartError(error: unknown): error is WorkduckAutostartError {
	return (
		error === 'autostart-unavailable' ||
		error === 'autostart-read-failed' ||
		error === 'autostart-write-failed'
	);
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}
