<script lang="ts">
	import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
	import { defaultHighlightStyle, syntaxHighlighting } from '@codemirror/language';
	import { Compartment, EditorState, type Extension } from '@codemirror/state';
	import { drawSelection, EditorView, highlightSpecialChars, keymap } from '@codemirror/view';
	import { onDestroy, onMount } from 'svelte';

	import {
		createDefaultAppearanceSettings,
		type AppearanceSettings
	} from '$lib/settings/appearance-settings';
	import {
		readAppearanceSettingsFromBrowser,
		subscribeAppearanceSettings
	} from '$lib/settings/appearance-storage';

	import {
		loadArtifactEditorLanguageExtension,
		type ArtifactEditorLanguage
	} from './editor-languages';

	interface Props {
		readonly value?: string;
		readonly language?: ArtifactEditorLanguage;
		readonly ariaLabel?: string;
		readonly onValueChange?: (nextValue: string) => void;
	}

	let {
		value = '',
		language = 'markdown',
		ariaLabel = 'Artifact content',
		onValueChange
	}: Props = $props();

	let editorHost: HTMLDivElement;
	let editor: EditorView | undefined;
	let appearanceSettings = $state<AppearanceSettings>(createDefaultAppearanceSettings());
	let configuredLanguage: ArtifactEditorLanguage | undefined;
	let configuredTabSize = createDefaultAppearanceSettings().editorTabSize;
	let languageLoadId = 0;
	let lastValue = '';

	const languageCompartment = new Compartment();
	const tabSizeCompartment = new Compartment();
	const editorBaseExtensions: Extension[] = [
		highlightSpecialChars(),
		history(),
		drawSelection(),
		syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
		keymap.of([...defaultKeymap, ...historyKeymap])
	];

	const editorTheme = EditorView.theme({
		'&': {
			height: '100%',
			backgroundColor: 'var(--workduck-color-surface)',
			color: 'var(--workduck-color-text)',
			fontSize: 'var(--workduck-editor-font-size)'
		},
		'.cm-scroller': {
			fontFamily: 'var(--workduck-editor-font-family)',
			lineHeight: '1.5',
			tabSize: 'var(--workduck-editor-tab-size)'
		},
		'.cm-content': {
			padding: '0.75rem 0'
		},
		'.cm-line': {
			padding: '0 0.75rem'
		},
		'.cm-gutters': {
			backgroundColor: 'var(--workduck-color-panel)',
			borderRight: '1px solid var(--workduck-color-border)',
			color: 'var(--workduck-color-muted-strong)'
		},
		'.cm-activeLine, .cm-activeLineGutter': {
			backgroundColor: 'oklch(var(--workduck-oklch-accent) / 0.08)'
		},
		'&.cm-focused': {
			outline: '2px solid var(--workduck-color-accent)',
			outlineOffset: '-2px'
		},
		'.cm-selectionBackground, &.cm-focused .cm-selectionBackground': {
			backgroundColor: 'oklch(var(--workduck-oklch-accent) / 0.18)'
		},
		'.cm-cursor': {
			borderLeftColor: 'var(--workduck-color-accent)'
		}
	});

	const updateListener = EditorView.updateListener.of((update) => {
		if (!update.docChanged) {
			return;
		}

		const nextValue = update.state.doc.toString();
		lastValue = nextValue;
		onValueChange?.(nextValue);
	});

	function createEditorState(sourceValue: string) {
		return EditorState.create({
			doc: sourceValue,
			extensions: [
				...editorBaseExtensions,
				EditorView.lineWrapping,
				EditorView.contentAttributes.of({ 'aria-label': ariaLabel }),
				editorTheme,
				languageCompartment.of([]),
				tabSizeCompartment.of(EditorState.tabSize.of(appearanceSettings.editorTabSize)),
				updateListener
			]
		});
	}

	function replaceEditorContent(nextValue: string) {
		if (editor === undefined) {
			return;
		}

		const currentValue = editor.state.doc.toString();

		if (currentValue === nextValue) {
			return;
		}

		editor.dispatch({
			changes: {
				from: 0,
				to: currentValue.length,
				insert: nextValue
			}
		});
	}

	async function reconfigureLanguage(nextLanguage: ArtifactEditorLanguage) {
		if (editor === undefined || configuredLanguage === nextLanguage) {
			return;
		}

		const currentLoadId = ++languageLoadId;
		const languageExtension = await loadArtifactEditorLanguageExtension(nextLanguage);

		if (editor === undefined || currentLoadId !== languageLoadId || language !== nextLanguage) {
			return;
		}

		editor.dispatch({
			effects: languageCompartment.reconfigure(languageExtension)
		});
		configuredLanguage = nextLanguage;
	}

	function reconfigureTabSize(nextTabSize: number) {
		if (editor === undefined || configuredTabSize === nextTabSize) {
			return;
		}

		editor.dispatch({
			effects: tabSizeCompartment.reconfigure(EditorState.tabSize.of(nextTabSize))
		});
		configuredTabSize = nextTabSize;
	}

	onMount(() => {
		appearanceSettings = readAppearanceSettingsFromBrowser().settings;
		lastValue = value;
		editor = new EditorView({
			parent: editorHost,
			state: createEditorState(value)
		});
		configuredTabSize = appearanceSettings.editorTabSize;
		void reconfigureLanguage(language);

		const unsubscribeAppearanceSettings = subscribeAppearanceSettings((nextSettings) => {
			appearanceSettings = nextSettings;
		});

		return unsubscribeAppearanceSettings;
	});

	onDestroy(() => {
		languageLoadId += 1;
		editor?.destroy();
		editor = undefined;
	});

	$effect(() => {
		if (value === lastValue) {
			return;
		}

		replaceEditorContent(value);
		lastValue = value;
	});

	$effect(() => {
		void reconfigureLanguage(language);
	});

	$effect(() => {
		reconfigureTabSize(appearanceSettings.editorTabSize);
	});
</script>

<div class="artifact-editor" bind:this={editorHost}></div>

<style>
	.artifact-editor {
		height: 100%;
		min-height: 100%;
		overflow: hidden;
		border: 0;
		background: var(--workduck-color-surface);
	}

	:global(.artifact-editor .cm-editor) {
		height: 100%;
	}
</style>
