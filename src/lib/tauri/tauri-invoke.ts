import { invoke, isTauri } from '@tauri-apps/api/core';

export type TauriInvoke = <T>(command: string, args?: Record<string, unknown>) => Promise<T>;

export function isTauriRuntimeAvailable(): boolean {
	return isTauri();
}

export function getTauriInvoke(): TauriInvoke | undefined {
	if (!isTauriRuntimeAvailable()) {
		return undefined;
	}

	return invoke as TauriInvoke;
}
