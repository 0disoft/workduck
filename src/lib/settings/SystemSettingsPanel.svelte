<script lang="ts">
	import { onMount } from 'svelte';

	import {
		readWorkduckAutostartEnabled,
		setWorkduckAutostartEnabled,
		type WorkduckAutostartError
	} from '$lib/system/autostart';
	import { syncWorkduckTrayIconEnabled } from '$lib/system/tray';

	import {
		createDefaultSystemSettings,
		shouldShowWorkduckTrayIcon,
		type SystemSettings
	} from './system-settings';
	import {
		readSystemSettingsFromBrowser,
		subscribeSystemSettings,
		writeSystemSettingsToBrowser
	} from './system-storage';

	let systemSettings = $state<SystemSettings>(createDefaultSystemSettings());
	let systemStorageError = $state<string | null>(null);
	let autostartEnabled = $state(false);
	let autostartBusy = $state(false);
	let autostartError = $state<WorkduckAutostartError | null>(null);

	function readSystemFromStorage() {
		const result = readSystemSettingsFromBrowser();

		systemSettings = result.settings;
		systemStorageError = result.ok ? null : 'System settings could not be loaded.';
	}

	function persistSystemSettings(nextSettings: SystemSettings) {
		const result = writeSystemSettingsToBrowser(nextSettings);

		systemSettings = result.settings;
		systemStorageError = result.ok ? null : 'System settings could not be saved.';
		void syncWorkduckTrayIconEnabled(shouldShowWorkduckTrayIcon(result.settings));
	}

	function handleShowTrayIconChange(event: Event) {
		const target = event.currentTarget;

		if (!(target instanceof HTMLInputElement)) {
			return;
		}

		persistSystemSettings({
			...systemSettings,
			showTrayIcon: target.checked,
			minimizeToTray: target.checked ? systemSettings.minimizeToTray : false
		});
	}

	function handleMinimizeToTrayChange(event: Event) {
		const target = event.currentTarget;

		if (!(target instanceof HTMLInputElement)) {
			return;
		}

		persistSystemSettings({
			...systemSettings,
			showTrayIcon: target.checked ? true : systemSettings.showTrayIcon,
			minimizeToTray: target.checked
		});
	}

	async function refreshAutostartState() {
		autostartBusy = true;
		const result = await readWorkduckAutostartEnabled();

		autostartBusy = false;
		autostartEnabled = result.enabled;
		autostartError = result.ok ? null : result.error;
	}

	async function handleAutostartChange(event: Event) {
		const target = event.currentTarget;

		if (!(target instanceof HTMLInputElement)) {
			return;
		}

		const nextEnabled = target.checked;
		const previousEnabled = autostartEnabled;

		autostartBusy = true;
		const result = await setWorkduckAutostartEnabled(nextEnabled);

		autostartBusy = false;
		autostartEnabled = result.ok ? result.enabled : previousEnabled;
		autostartError = result.ok ? null : result.error;
	}

	function createAutostartErrorMessage(error: WorkduckAutostartError) {
		if (error === 'autostart-unavailable') {
			return 'Autostart is available in the desktop app.';
		}

		if (error === 'autostart-read-failed') {
			return 'Autostart status could not be loaded.';
		}

		return 'Autostart setting could not be saved.';
	}

	onMount(() => {
		readSystemFromStorage();
		void refreshAutostartState();

		const unsubscribeSystemSettings = subscribeSystemSettings((nextSettings) => {
			systemSettings = nextSettings;
			systemStorageError = null;
			void syncWorkduckTrayIconEnabled(shouldShowWorkduckTrayIcon(nextSettings));
		});

		return unsubscribeSystemSettings;
	});
</script>

<section id="settings-panel-system" class="workduck-settings-section" aria-label="System">
	<form class="workduck-system-settings-form" onsubmit={(event) => event.preventDefault()}>
		<label class="workduck-toggle-field" for="start-on-sign-in">
			<span class="workduck-toggle-label">Start on Windows sign-in</span>
			<input
				id="start-on-sign-in"
				class="workduck-checkbox"
				type="checkbox"
				checked={autostartEnabled}
				disabled={autostartBusy || autostartError === 'autostart-unavailable'}
				onchange={handleAutostartChange}
			/>
		</label>

		<label class="workduck-toggle-field" for="show-tray-icon">
			<span class="workduck-toggle-label">Show tray icon</span>
			<input
				id="show-tray-icon"
				class="workduck-checkbox"
				type="checkbox"
				checked={systemSettings.showTrayIcon}
				onchange={handleShowTrayIconChange}
			/>
		</label>

		<label class="workduck-toggle-field" for="minimize-to-tray">
			<span class="workduck-toggle-label">Minimize to tray</span>
			<input
				id="minimize-to-tray"
				class="workduck-checkbox"
				type="checkbox"
				checked={systemSettings.minimizeToTray}
				onchange={handleMinimizeToTrayChange}
			/>
		</label>
	</form>

	{#if systemStorageError !== null}
		<p class="workduck-inline-error" aria-live="polite">{systemStorageError}</p>
	{/if}

	{#if autostartError !== null}
		<p class="workduck-inline-error" aria-live="polite">
			{createAutostartErrorMessage(autostartError)}
		</p>
	{/if}
</section>
