export interface QueueAutoRefreshScheduler {
	reschedule: () => void;
	dispose: () => void;
}

interface QueueAutoRefreshSchedulerEnvironment {
	readonly document: Pick<Document, 'visibilityState' | 'addEventListener' | 'removeEventListener'>;
	readonly window: Pick<Window, 'setTimeout' | 'clearTimeout' | 'addEventListener' | 'removeEventListener'>;
}

interface StartQueueAutoRefreshSchedulerOptions {
	readonly getDelayMs: () => number;
	readonly refresh: () => void;
	readonly environment: QueueAutoRefreshSchedulerEnvironment;
}

export function startQueueAutoRefreshScheduler({
	getDelayMs,
	refresh,
	environment
}: StartQueueAutoRefreshSchedulerOptions): QueueAutoRefreshScheduler {
	let timeoutId: number | undefined;
	let isMounted = true;

	function clearTimeoutHandle() {
		if (timeoutId === undefined) {
			return;
		}

		environment.window.clearTimeout(timeoutId);
		timeoutId = undefined;
	}

	function refreshNow() {
		clearTimeoutHandle();
		refresh();
	}

	function reschedule() {
		if (!isMounted) {
			return;
		}

		clearTimeoutHandle();
		timeoutId = environment.window.setTimeout(() => {
			timeoutId = undefined;
			refresh();
		}, getDelayMs());
	}

	const handleVisibilityChange = () => {
		if (environment.document.visibilityState === 'visible') {
			refreshNow();
			return;
		}

		reschedule();
	};

	reschedule();
	environment.document.addEventListener('visibilitychange', handleVisibilityChange);
	environment.window.addEventListener('focus', refreshNow);

	return {
		reschedule,
		dispose: () => {
			isMounted = false;
			clearTimeoutHandle();
			environment.document.removeEventListener('visibilitychange', handleVisibilityChange);
			environment.window.removeEventListener('focus', refreshNow);
		}
	};
}
