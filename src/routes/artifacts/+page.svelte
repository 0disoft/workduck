<script lang="ts">
	import ArtifactEditor from '$lib/artifacts/ArtifactEditor.svelte';
	import {
		artifactEditorLanguages,
		type ArtifactEditorLanguage
	} from '$lib/artifacts/editor-languages';

	let draftContent = $state('');
	let draftLanguage = $state<ArtifactEditorLanguage>('markdown');
</script>

<svelte:head>
	<title>Artifacts - Workduck</title>
</svelte:head>

<main class="min-h-[calc(100vh-3.25rem)] p-6">
	<header class="mb-4 flex flex-wrap items-center justify-between gap-3">
		<h1 class="text-xl leading-tight font-semibold">Artifacts</h1>
		<label class="flex items-center gap-2 text-sm text-[#4d524b]">
			<span>Format</span>
			<select
				class="border border-[#c7cec4] bg-white px-2 py-1 text-[#20211f]"
				bind:value={draftLanguage}
			>
				{#each artifactEditorLanguages as editorLanguage}
					<option value={editorLanguage}>{editorLanguage}</option>
				{/each}
			</select>
		</label>
	</header>

	<section class="h-[calc(100vh-8.5rem)] min-h-96">
		<ArtifactEditor
			value={draftContent}
			language={draftLanguage}
			ariaLabel="Artifact content"
			onValueChange={(nextValue) => (draftContent = nextValue)}
		/>
	</section>
</main>
