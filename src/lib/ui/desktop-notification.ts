export interface DesktopNotificationInput {
	readonly title: string;
	readonly body: string;
	readonly tag: string;
}

type DesktopNotificationPermission = NotificationPermission | 'unsupported';

export async function prepareDesktopNotificationPermission(): Promise<DesktopNotificationPermission> {
	if (!desktopNotificationsAreAvailable()) {
		return 'unsupported';
	}

	if (Notification.permission !== 'default') {
		return Notification.permission;
	}

	try {
		return await Notification.requestPermission();
	} catch {
		return Notification.permission;
	}
}

export function showDesktopNotificationWhenUnfocused(input: DesktopNotificationInput) {
	if (!desktopNotificationsAreAvailable() || Notification.permission !== 'granted') {
		return;
	}

	if (document.visibilityState === 'visible' && document.hasFocus()) {
		return;
	}

	try {
		const notification = new Notification(input.title, {
			body: input.body,
			tag: input.tag
		});

		notification.onclick = () => {
			window.focus();
			notification.close();
		};
	} catch {
		// The in-app status toast remains the fallback when the host blocks desktop notifications.
	}
}

function desktopNotificationsAreAvailable() {
	return (
		typeof window !== 'undefined' &&
		typeof document !== 'undefined' &&
		typeof Notification !== 'undefined'
	);
}
