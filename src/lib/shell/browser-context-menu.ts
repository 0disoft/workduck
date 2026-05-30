export function suppressBrowserContextMenu() {
	function preventBrowserContextMenu(event: MouseEvent) {
		event.preventDefault();
	}

	window.addEventListener('contextmenu', preventBrowserContextMenu, { capture: true });

	return () => {
		window.removeEventListener('contextmenu', preventBrowserContextMenu, { capture: true });
	};
}
