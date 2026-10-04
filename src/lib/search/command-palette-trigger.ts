export const WORKDUCK_COMMAND_PALETTE_OPEN_EVENT = 'workduck:command-palette-open';

export interface WorkduckCommandPaletteOpenDetail {
	readonly source: string | null;
}

export function requestWorkduckCommandPaletteOpen(source: string | null = null) {
	if (typeof window === 'undefined') {
		return;
	}

	window.dispatchEvent(
		new CustomEvent<WorkduckCommandPaletteOpenDetail>(WORKDUCK_COMMAND_PALETTE_OPEN_EVENT, {
			detail: { source }
		})
	);
}

export function subscribeWorkduckCommandPaletteOpen(
	subscriber: (detail: WorkduckCommandPaletteOpenDetail) => void
) {
	if (typeof window === 'undefined') {
		return () => {};
	}

	const handleOpen = (event: Event) => {
		if (!(event instanceof CustomEvent)) {
			subscriber({ source: null });
			return;
		}

		const detail = event.detail as WorkduckCommandPaletteOpenDetail | null | undefined;
		subscriber({ source: typeof detail?.source === 'string' ? detail.source : null });
	};

	window.addEventListener(WORKDUCK_COMMAND_PALETTE_OPEN_EVENT, handleOpen);

	return () => {
		window.removeEventListener(WORKDUCK_COMMAND_PALETTE_OPEN_EVENT, handleOpen);
	};
}
