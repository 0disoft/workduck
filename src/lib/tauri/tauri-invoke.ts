export type TauriInvoke = <T>(command: string, args?: Record<string, unknown>) => Promise<T>;

export interface WorkduckTauriCoreApi {
	readonly invoke?: TauriInvoke;
}

export interface WorkduckTauriGlobal {
	readonly app?: unknown;
	readonly autostart?: unknown;
	readonly core?: WorkduckTauriCoreApi;
	readonly tray?: unknown;
	readonly window?: unknown;
}

interface TauriGlobalWindow {
	readonly __TAURI__?: WorkduckTauriGlobal;
}

export function getTauriGlobal(): WorkduckTauriGlobal | undefined {
	if (typeof window === 'undefined') {
		return undefined;
	}

	return (window as unknown as TauriGlobalWindow).__TAURI__;
}

export function getTauriInvoke(): TauriInvoke | undefined {
	return getTauriGlobal()?.core?.invoke;
}
