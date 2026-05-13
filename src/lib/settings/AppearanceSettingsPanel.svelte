<script lang="ts">
	import { onMount } from 'svelte';

	import {
		EDITOR_FONT_SIZE_MAX_PX,
		EDITOR_FONT_SIZE_MIN_PX,
		EDITOR_TAB_SIZE_MAX,
		EDITOR_TAB_SIZE_MIN,
		INTERFACE_FONT_SIZE_MAX_PX,
		INTERFACE_FONT_SIZE_MIN_PX,
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

	let appearanceSettings = $state<AppearanceSettings>(createDefaultAppearanceSettings());
	let appearanceStorageError = $state<string | null>(null);

	function readAppearanceFromStorage() {
		const result = readAppearanceSettingsFromBrowser();

		appearanceSettings = result.settings;
		appearanceStorageError = result.ok ? null : 'Appearance settings could not be loaded.';
	}

	function persistAppearanceSettings(nextSettings: AppearanceSettings) {
		const result = writeAppearanceSettingsToBrowser(nextSettings);

		appearanceSettings = result.settings;
		appearanceStorageError = result.ok ? null : 'Appearance settings could not be saved.';
	}

	function handleInterfaceFontSizeChange(event: Event) {
		const target = event.currentTarget;

		if (!(target instanceof HTMLInputElement)) {
			return;
		}

		persistAppearanceSettings({
			...appearanceSettings,
			fontSizePx: Number(target.value)
		});
	}

	function handleEditorFontSizeChange(event: Event) {
		const target = event.currentTarget;

		if (!(target instanceof HTMLInputElement)) {
			return;
		}

		persistAppearanceSettings({
			...appearanceSettings,
			editorFontSizePx: Number(target.value)
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

	function handleEditorTabSizeChange(event: Event) {
		const target = event.currentTarget;

		if (!(target instanceof HTMLInputElement)) {
			return;
		}

		persistAppearanceSettings({
			...appearanceSettings,
			editorTabSize: Number(target.value)
		});
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
	aria-label="Appearance"
>
	<form class="workduck-preferences-form" onsubmit={(event) => event.preventDefault()}>
		<label class="workduck-form-field" for="interface-font-size">
			<span>Interface font size</span>
			<input
				id="interface-font-size"
				class="workduck-input"
				type="number"
				min={INTERFACE_FONT_SIZE_MIN_PX}
				max={INTERFACE_FONT_SIZE_MAX_PX}
				step="1"
				value={appearanceSettings.fontSizePx}
				onchange={handleInterfaceFontSizeChange}
			/>
		</label>

		<label class="workduck-form-field" for="editor-font-size">
			<span>Editor font size</span>
			<input
				id="editor-font-size"
				class="workduck-input"
				type="number"
				min={EDITOR_FONT_SIZE_MIN_PX}
				max={EDITOR_FONT_SIZE_MAX_PX}
				step="1"
				value={appearanceSettings.editorFontSizePx}
				onchange={handleEditorFontSizeChange}
			/>
		</label>

		<label class="workduck-form-field" for="editor-font">
			<span>Editor font</span>
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

		<label class="workduck-form-field" for="editor-tab-size">
			<span>Editor tab size</span>
			<input
				id="editor-tab-size"
				class="workduck-input"
				type="number"
				min={EDITOR_TAB_SIZE_MIN}
				max={EDITOR_TAB_SIZE_MAX}
				step="1"
				value={appearanceSettings.editorTabSize}
				onchange={handleEditorTabSizeChange}
			/>
		</label>
	</form>

	{#if appearanceStorageError !== null}
		<p class="workduck-inline-error" aria-live="polite">{appearanceStorageError}</p>
	{/if}
</section>
