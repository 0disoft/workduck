<script lang="ts">
	import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
	import { defaultHighlightStyle, syntaxHighlighting } from '@codemirror/language';
	import { Compartment, EditorState, type Extension } from '@codemirror/state';
	import { drawSelection, EditorView, highlightSpecialChars, keymap } from '@codemirror/view';
	import { onDestroy, onMount } from 'svelte';

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
	let configuredLanguage: ArtifactEditorLanguage | undefined;
	let languageLoadId = 0;
	let lastValue = '';

	const languageCompartment = new Compartment();
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
			backgroundColor: '#171b1f',
			color: '#f5f3e7',
			fontSize: '0.875rem'
		},
		'.cm-scroller': {
			fontFamily:
				'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
			lineHeight: '1.5'
		},
		'.cm-content': {
			padding: '0.75rem 0'
		},
		'.cm-line': {
			padding: '0 0.75rem'
		},
		'.cm-gutters': {
			backgroundColor: '#202020',
			borderRight: '1px solid #2f3f55',
			color: '#7d8ca1'
		},
		'.cm-activeLine, .cm-activeLineGutter': {
			backgroundColor: 'rgba(251, 255, 98, 0.08)'
		},
		'&.cm-focused': {
			outline: '2px solid #fbff62',
			outlineOffset: '-2px'
		},
		'.cm-selectionBackground, &.cm-focused .cm-selectionBackground': {
			backgroundColor: 'rgba(251, 255, 98, 0.18)'
		},
		'.cm-cursor': {
			borderLeftColor: '#fbff62'
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

	onMount(() => {
		lastValue = value;
		editor = new EditorView({
			parent: editorHost,
			state: createEditorState(value)
		});
		void reconfigureLanguage(language);
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
</script>

<div class="artifact-editor" bind:this={editorHost}></div>

<style>
	.artifact-editor {
		height: 100%;
		min-height: 100%;
		overflow: hidden;
		border: 0;
		background: #171b1f;
	}

	:global(.artifact-editor .cm-editor) {
		height: 100%;
	}
</style>
