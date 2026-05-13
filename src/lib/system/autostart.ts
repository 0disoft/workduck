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

interface TauriAutostartApi {
	readonly enable?: () => Promise<void>;
	readonly disable?: () => Promise<void>;
	readonly isEnabled?: () => Promise<boolean>;
}

interface TauriGlobalWindow {
	readonly __TAURI__?: {
		readonly autostart?: TauriAutostartApi;
	};
}

export async function readWorkduckAutostartEnabled(): Promise<WorkduckAutostartReadResult> {
	const autostart = getTauriAutostart();

	if (autostart?.isEnabled === undefined) {
		return { ok: false, enabled: false, error: 'autostart-unavailable' };
	}

	try {
		return { ok: true, enabled: await autostart.isEnabled() };
	} catch {
		return { ok: false, enabled: false, error: 'autostart-read-failed' };
	}
}

export async function setWorkduckAutostartEnabled(
	enabled: boolean
): Promise<WorkduckAutostartWriteResult> {
	const autostart = getTauriAutostart();

	if (autostart?.enable === undefined || autostart.disable === undefined) {
		return { ok: false, enabled, error: 'autostart-unavailable' };
	}

	try {
		if (enabled) {
			await autostart.enable();
		} else {
			await autostart.disable();
		}
	} catch {
		return { ok: false, enabled, error: 'autostart-write-failed' };
	}

	const readResult = await readWorkduckAutostartEnabled();

	if (!readResult.ok) {
		return { ok: false, enabled, error: 'autostart-read-failed' };
	}

	return { ok: true, enabled: readResult.enabled };
}

function getTauriAutostart() {
	if (typeof window === 'undefined') {
		return undefined;
	}

	return (window as unknown as TauriGlobalWindow).__TAURI__?.autostart;
}
