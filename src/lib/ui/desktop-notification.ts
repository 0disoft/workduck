import {
	isPermissionGranted,
	requestPermission,
	sendNotification
} from '@tauri-apps/plugin-notification';

export interface DesktopNotificationInput {
	readonly title: string;
	readonly body: string;
	readonly tag: string;
}

type DesktopNotificationPermission = NotificationPermission | 'unsupported';
type NativeNotificationSendResult = 'sent' | 'not-granted' | 'unsupported';

export async function prepareDesktopNotificationPermission(): Promise<DesktopNotificationPermission> {
	const nativePermission = await prepareNativeNotificationPermission();
	if (nativePermission !== 'unsupported') {
		return nativePermission;
	}

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
	if (documentIsVisibleAndFocused()) {
		return;
	}

	void showNativeNotification(input).then((result) => {
		if (result === 'unsupported') {
			showWebNotification(input);
		}
	});
}

async function prepareNativeNotificationPermission(): Promise<DesktopNotificationPermission> {
	try {
		if (await isPermissionGranted()) {
			return 'granted';
		}

		return await requestPermission();
	} catch {
		return 'unsupported';
	}
}

async function showNativeNotification(
	input: DesktopNotificationInput
): Promise<NativeNotificationSendResult> {
	try {
		if (!(await isPermissionGranted())) {
			return 'not-granted';
		}

		sendNotification({
			title: input.title,
			body: input.body,
			group: input.tag,
			autoCancel: true
		});
		return 'sent';
	} catch {
		return 'unsupported';
	}
}

function showWebNotification(input: DesktopNotificationInput) {
	if (!desktopNotificationsAreAvailable() || Notification.permission !== 'granted') {
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

function documentIsVisibleAndFocused() {
	return (
		typeof document !== 'undefined' &&
		document.visibilityState === 'visible' &&
		document.hasFocus()
	);
}

function desktopNotificationsAreAvailable() {
	return (
		typeof window !== 'undefined' &&
		typeof document !== 'undefined' &&
		typeof Notification !== 'undefined'
	);
}
