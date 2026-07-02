import { invoke, isTauri } from '@tauri-apps/api/core';

export type TauriInvoke = <T>(command: string, args?: Record<string, unknown>) => Promise<T>;

let tauriInvokeForTest: TauriInvoke | undefined;

export function isTauriRuntimeAvailable(): boolean {
	return isTauri();
}

export function getTauriInvoke(): TauriInvoke | undefined {
	if (tauriInvokeForTest !== undefined) {
		return tauriInvokeForTest;
	}

	if (!isTauriRuntimeAvailable()) {
		return undefined;
	}

	return invoke as TauriInvoke;
}

export function setTauriInvokeForTest(invokeOverride: TauriInvoke | undefined): void {
	tauriInvokeForTest = invokeOverride;
}
