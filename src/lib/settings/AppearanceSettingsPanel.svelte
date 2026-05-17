<script lang="ts">
	import { onMount } from 'svelte';

	import {
		getWorkduckMessages,
		workduckLanguageOptions,
		type WorkduckLanguageId
	} from '$lib/i18n/workduck-language';
	import {
		EDITOR_TAB_SIZE_STEP_VALUES,
		FONT_SIZE_STEP_VALUES,
		createDefaultAppearanceSettings,
		editorFontOptions,
		type AppearanceSettings,
		type EditorFontId
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
	let editorTabSizeStepOptions = $derived(
		EDITOR_TAB_SIZE_STEP_VALUES.map((tabSize) => ({
			value: tabSize,
			label: formatTabSizeLabel(tabSize)
		}))
	);

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

	function handleEditorFontSizeChange(editorFontSizePx: number) {
		persistAppearanceSettings({
			...appearanceSettings,
			editorFontSizePx
		});
	}

	function handleEditorFontChange(event: Event) {
		const target = event.currentTarget;

		if (!(target instanceof HTMLSelectElement)) {
			return;
		}

		persistAppearanceSettings({
			...appearanceSettings,
			editorFontId: target.value as EditorFontId
		});
	}

	function handleEditorTabSizeChange(editorTabSize: number) {
		persistAppearanceSettings({
			...appearanceSettings,
			editorTabSize
		});
	}

	function formatFontSizeLabel(fontSizePx: number) {
		return `${fontSizePx} px`;
	}

	function formatTabSizeLabel(tabSize: number) {
		return `${tabSize} ${messages.settings.appearance.spaces}`;
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

		<StepRangeField
			id="editor-font-size"
			label={messages.settings.appearance.editorFontSize}
			value={appearanceSettings.editorFontSizePx}
			options={fontSizeStepOptions}
			valueLabel={formatFontSizeLabel(appearanceSettings.editorFontSizePx)}
			onValueChange={handleEditorFontSizeChange}
		/>

		<label class="workduck-form-field" for="editor-font">
			<span>{messages.settings.appearance.editorFont}</span>
			<select
				id="editor-font"
				class="workduck-select"
				value={appearanceSettings.editorFontId}
				onchange={handleEditorFontChange}
			>
				{#each editorFontOptions as editorFontOption}
					<option value={editorFontOption.id}>{editorFontOption.label}</option>
				{/each}
			</select>
		</label>

		<StepRangeField
			id="editor-tab-size"
			label={messages.settings.appearance.editorTabSize}
			value={appearanceSettings.editorTabSize}
			options={editorTabSizeStepOptions}
			valueLabel={formatTabSizeLabel(appearanceSettings.editorTabSize)}
			onValueChange={handleEditorTabSizeChange}
		/>
	</form>

	{#if appearanceStorageError !== null}
		<p class="workduck-inline-error" aria-live="polite">{appearanceStorageError}</p>
	{/if}
</section>
