<script lang="ts">
	import { onMount } from 'svelte';

	import {
		getWorkduckMessages,
		workduckLanguageOptions,
		type WorkduckLanguageId
	} from '$lib/i18n/workduck-language';
	import {
		FONT_SIZE_STEP_VALUES,
		createDefaultAppearanceSettings,
		type AppearanceSettings
	} from './appearance-settings';
	import {
		readAppearanceSettingsFromBrowser,
		subscribeAppearanceSettings,
		writeAppearanceSettingsToBrowser
	} from './appearance-storage';
	import StepRangeField from './StepRangeField.svelte';

	interface StepRangeOption {
		readonly value: number;
		readonly label: string;
	}

	const fontSizeStepOptions: readonly StepRangeOption[] = FONT_SIZE_STEP_VALUES.map(
		(fontSizePx) => ({
			value: fontSizePx,
			label: String(fontSizePx)
		})
	);
	let appearanceSettings = $state<AppearanceSettings>(createDefaultAppearanceSettings());
	let appearanceStorageError = $state<string | null>(null);
	let messages = $derived(getWorkduckMessages(appearanceSettings.languageId));

	function readAppearanceFromStorage() {
		const result = readAppearanceSettingsFromBrowser();

		appearanceSettings = result.settings;
		appearanceStorageError = result.ok ? null : messages.settings.appearance.loadError;
	}

	function persistAppearanceSettings(nextSettings: AppearanceSettings) {
		const result = writeAppearanceSettingsToBrowser(nextSettings);

		appearanceSettings = result.settings;
		appearanceStorageError = result.ok
			? null
			: getWorkduckMessages(result.settings.languageId).settings.appearance.saveError;
	}

	function handleLanguageChange(event: Event) {
		const target = event.currentTarget;

		if (!(target instanceof HTMLSelectElement)) {
			return;
		}

		persistAppearanceSettings({
			...appearanceSettings,
			languageId: target.value as WorkduckLanguageId
		});
	}

	function handleInterfaceFontSizeChange(fontSizePx: number) {
		persistAppearanceSettings({
			...appearanceSettings,
			fontSizePx
		});
	}

	function formatFontSizeLabel(fontSizePx: number) {
		return `${fontSizePx} px`;
	}

	onMount(() => {
		readAppearanceFromStorage();
		const unsubscribeAppearanceSettings = subscribeAppearanceSettings((nextSettings) => {
			appearanceSettings = nextSettings;
			appearanceStorageError = null;
		});

		return unsubscribeAppearanceSettings;
	});
</script>

<section
	id="settings-panel-appearance"
	class="workduck-settings-section"
	aria-label={messages.settings.appearance.section}
>
	<form
		class="workduck-preferences-form workduck-appearance-settings-form"
		onsubmit={(event) => event.preventDefault()}
	>
		<label class="workduck-form-field" for="workduck-language">
			<span>{messages.settings.appearance.language}</span>
			<select
				id="workduck-language"
				class="workduck-select"
				value={appearanceSettings.languageId}
				onchange={handleLanguageChange}
			>
				{#each workduckLanguageOptions as languageOption}
					<option value={languageOption.id}>{languageOption.label}</option>
				{/each}
			</select>
		</label>

		<StepRangeField
			id="interface-font-size"
			label={messages.settings.appearance.interfaceFontSize}
			value={appearanceSettings.fontSizePx}
			options={fontSizeStepOptions}
			valueLabel={formatFontSizeLabel(appearanceSettings.fontSizePx)}
			onValueChange={handleInterfaceFontSizeChange}
		/>
	</form>

	{#if appearanceStorageError !== null}
		<p class="workduck-inline-error" aria-live="polite">{appearanceStorageError}</p>
	{/if}
</section>
