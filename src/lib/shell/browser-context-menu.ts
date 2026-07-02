export function suppressBrowserContextMenu() {
	function preventBrowserContextMenu(event: MouseEvent) {
		if (isEditableContextMenuTarget(event.target)) {
			return;
		}

		event.preventDefault();
	}

	window.addEventListener('contextmenu', preventBrowserContextMenu, { capture: true });

	return () => {
		window.removeEventListener('contextmenu', preventBrowserContextMenu, { capture: true });
	};
}

function isEditableContextMenuTarget(target: EventTarget | null) {
	if (!(target instanceof Element)) {
		return false;
	}

	if (target.closest('input, textarea, select') !== null) {
		return true;
	}

	return target instanceof HTMLElement && target.isContentEditable;
}
