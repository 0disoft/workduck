<script lang="ts">
	import { onMount } from 'svelte';

	import { getWorkduckMessages } from '$lib/i18n/workduck-language';
	import {
		readWorkduckAutostartEnabled,
		setWorkduckAutostartEnabled,
		type WorkduckAutostartError
	} from '$lib/system/autostart';
	import { syncWorkduckTrayIconEnabled } from '$lib/system/tray';

	import {
		createDefaultSystemSettings,
		WORKSPACE_IDLE_LOCK_MINUTE_OPTIONS,
		shouldShowWorkduckTrayIcon,
		type SystemSettings
	} from './system-settings';
	import {
		createDefaultAppearanceSettings,
		type AppearanceSettings
	} from './appearance-settings';
	import {
		readAppearanceSettingsFromBrowser,
		subscribeAppearanceSettings
	} from './appearance-storage';
	import {
		readSystemSettingsFromBrowser,
		subscribeSystemSettings,
		writeSystemSettingsToBrowser
	} from './system-storage';

	let appearanceSettings = $state<AppearanceSettings>(createDefaultAppearanceSettings());
	let systemSettings = $state<SystemSettings>(createDefaultSystemSettings());
	let systemStorageError = $state<string | null>(null);
	let autostartEnabled = $state(false);
	let autostartBusy = $state(false);
	let autostartError = $state<WorkduckAutostartError | null>(null);
	let messages = $derived(getWorkduckMessages(appearanceSettings.languageId));

	function readSystemFromStorage() {
		const result = readSystemSettingsFromBrowser();

		systemSettings = result.settings;
		systemStorageError = result.ok ? null : messages.settings.system.loadError;
	}

	function persistSystemSettings(nextSettings: SystemSettings) {
		const result = writeSystemSettingsToBrowser(nextSettings);

		systemSettings = result.settings;
		systemStorageError = result.ok ? null : messages.settings.system.saveError;
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

	function handleWorkspaceIdleLockMinutesChange(event: Event) {
		const target = event.currentTarget;

		if (!(target instanceof HTMLSelectElement)) {
			return;
		}

		persistSystemSettings({
			...systemSettings,
			workspaceIdleLockMinutes: Number(target.value)
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
			return messages.settings.system.autostartUnavailable;
		}

		if (error === 'autostart-read-failed') {
			return messages.settings.system.autostartReadFailed;
		}

		return messages.settings.system.autostartSaveFailed;
	}

	onMount(() => {
		appearanceSettings = readAppearanceSettingsFromBrowser().settings;
		readSystemFromStorage();
		void refreshAutostartState();

		const unsubscribeAppearanceSettings = subscribeAppearanceSettings((nextSettings) => {
			appearanceSettings = nextSettings;
		});
		const unsubscribeSystemSettings = subscribeSystemSettings((nextSettings) => {
			systemSettings = nextSettings;
			systemStorageError = null;
			void syncWorkduckTrayIconEnabled(shouldShowWorkduckTrayIcon(nextSettings));
		});

		return () => {
			unsubscribeAppearanceSettings();
			unsubscribeSystemSettings();
		};
	});
</script>

<section id="settings-panel-system" class="workduck-settings-section" aria-label={messages.settings.system.section}>
	<form class="workduck-system-settings-form" onsubmit={(event) => event.preventDefault()}>
		<label class="workduck-toggle-field" for="start-on-sign-in">
			<span class="workduck-toggle-label">{messages.settings.system.startOnSignIn}</span>
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
			<span class="workduck-toggle-label">{messages.settings.system.showTrayIcon}</span>
			<input
				id="show-tray-icon"
				class="workduck-checkbox"
				type="checkbox"
				checked={systemSettings.showTrayIcon}
				onchange={handleShowTrayIconChange}
			/>
		</label>

		<label class="workduck-toggle-field" for="minimize-to-tray">
			<span class="workduck-toggle-label">{messages.settings.system.minimizeToTray}</span>
			<input
				id="minimize-to-tray"
				class="workduck-checkbox"
				type="checkbox"
				checked={systemSettings.minimizeToTray}
				onchange={handleMinimizeToTrayChange}
			/>
		</label>

		<label class="workduck-form-field" for="workspace-idle-lock-minutes">
			<span>{messages.settings.system.workspaceIdleLock}</span>
			<select
				id="workspace-idle-lock-minutes"
				class="workduck-select"
				value={systemSettings.workspaceIdleLockMinutes}
				onchange={handleWorkspaceIdleLockMinutesChange}
			>
				{#each WORKSPACE_IDLE_LOCK_MINUTE_OPTIONS as minuteOption}
					<option value={minuteOption}>
						{minuteOption === 0
							? messages.settings.system.workspaceIdleLockNever
							: messages.settings.system.workspaceIdleLockMinutes.replace(
									'{minutes}',
									String(minuteOption)
								)}
					</option>
				{/each}
			</select>
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
