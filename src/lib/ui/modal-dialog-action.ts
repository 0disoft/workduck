interface ModalDialogOptions {
	readonly initialFocusSelector?: string;
	readonly onClose?: (() => void) | undefined;
}

const focusableSelector = [
	'a[href]',
	'button:not([disabled])',
	'input:not([disabled])',
	'select:not([disabled])',
	'textarea:not([disabled])',
	'[tabindex]:not([tabindex="-1"])'
].join(',');

function getFocusableElements(node: HTMLElement) {
	return Array.from(node.querySelectorAll<HTMLElement>(focusableSelector)).filter(
		(element) => element.offsetParent !== null || element === document.activeElement
	);
}

export function modalDialog(node: HTMLElement, options: ModalDialogOptions = {}) {
	let currentOptions = options;
	const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;

	if (!node.hasAttribute('tabindex')) {
		node.tabIndex = -1;
	}

	function focusInitialElement() {
		window.requestAnimationFrame(() => {
			if (!node.isConnected) {
				return;
			}

			const preferredElement =
				currentOptions.initialFocusSelector === undefined
					? null
					: node.querySelector<HTMLElement>(currentOptions.initialFocusSelector);
			const focusableElements = getFocusableElements(node);
			const target = preferredElement ?? focusableElements[0] ?? node;
			target.focus({ preventScroll: true });
		});
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			if (currentOptions.onClose === undefined) {
				return;
			}

			event.preventDefault();
			event.stopPropagation();
			currentOptions.onClose();
			return;
		}

		if (event.key !== 'Tab') {
			return;
		}

		const focusableElements = getFocusableElements(node);

		if (focusableElements.length === 0) {
			event.preventDefault();
			node.focus({ preventScroll: true });
			return;
		}

		const firstElement = focusableElements[0];
		const lastElement = focusableElements[focusableElements.length - 1];

		if (firstElement === undefined || lastElement === undefined) {
			return;
		}

		if (event.shiftKey && document.activeElement === firstElement) {
			event.preventDefault();
			lastElement.focus({ preventScroll: true });
			return;
		}

		if (!event.shiftKey && document.activeElement === lastElement) {
			event.preventDefault();
			firstElement.focus({ preventScroll: true });
		}
	}

	node.addEventListener('keydown', handleKeydown);
	focusInitialElement();

	return {
		update(nextOptions: ModalDialogOptions = {}) {
			currentOptions = nextOptions;
		},
		destroy() {
			node.removeEventListener('keydown', handleKeydown);

			if (previousFocus !== null && previousFocus.isConnected) {
				previousFocus.focus({ preventScroll: true });
			}
		}
	};
}
