import { invoke, isTauri } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

export type TauriInvoke = <T>(command: string, args?: Record<string, unknown>) => Promise<T>;
export type TauriListen = typeof listen;

let tauriInvokeForTest: TauriInvoke | undefined;
let tauriListenForTest: TauriListen | undefined;

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

export function getTauriListen(): TauriListen | undefined {
	return tauriListenForTest ?? (isTauriRuntimeAvailable() ? listen : undefined);
}

export function setTauriListenForTest(listenOverride: TauriListen | undefined): void {
	tauriListenForTest = listenOverride;
}
