import { check, type DownloadEvent, type Update } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';

import { isTauriRuntimeAvailable } from '$lib/tauri/tauri-invoke';

const UPDATE_CHECK_TIMEOUT_MS = 15_000;
const UPDATE_INSTALL_TIMEOUT_MS = 120_000;

export interface WorkduckAvailableUpdate {
	readonly version: string;
	readonly currentVersion: string;
	readonly body: string | undefined;
}

export interface WorkduckUpdateInstallProgress {
	readonly downloadedBytes: number;
	readonly contentLength: number | undefined;
}

let pendingUpdate: Update | null = null;

export async function checkForWorkduckUpdate(): Promise<WorkduckAvailableUpdate | null> {
	if (!isTauriRuntimeAvailable()) {
		return null;
	}

	const update = await check({ timeout: UPDATE_CHECK_TIMEOUT_MS });
	if (update === null) {
		pendingUpdate = null;
		return null;
	}

	pendingUpdate = update;
	return {
		version: update.version,
		currentVersion: update.currentVersion,
		body: update.body
	};
}

export async function installPendingWorkduckUpdate(
	onProgress: (progress: WorkduckUpdateInstallProgress) => void
): Promise<void> {
	if (pendingUpdate === null) {
		pendingUpdate = await check({ timeout: UPDATE_CHECK_TIMEOUT_MS });
	}

	if (pendingUpdate === null) {
		return;
	}

	let downloadedBytes = 0;
	let contentLength: number | undefined;

	await pendingUpdate.downloadAndInstall((event: DownloadEvent) => {
		if (event.event === 'Started') {
			downloadedBytes = 0;
			contentLength = event.data.contentLength;
			onProgress({ downloadedBytes, contentLength });
			return;
		}

		if (event.event === 'Progress') {
			downloadedBytes += event.data.chunkLength;
			onProgress({ downloadedBytes, contentLength });
			return;
		}

		if (event.event === 'Finished') {
			onProgress({ downloadedBytes: contentLength ?? downloadedBytes, contentLength });
		}
	}, { timeout: UPDATE_INSTALL_TIMEOUT_MS });

	pendingUpdate = null;
	await relaunch();
}
