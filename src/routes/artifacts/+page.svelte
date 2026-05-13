<script lang="ts">
	import ArtifactEditor from '$lib/artifacts/ArtifactEditor.svelte';
	import {
		artifactEditorLanguages,
		type ArtifactEditorLanguage
	} from '$lib/artifacts/editor-languages';
	import WorkspaceGate from '$lib/workspaces/WorkspaceGate.svelte';

	let draftContent = $state('');
	let draftLanguage = $state<ArtifactEditorLanguage>('markdown');
</script>

<svelte:head>
	<title>Artifacts - Workduck</title>
</svelte:head>

<main class="workduck-page workduck-page--editor">
	<header class="workduck-page-header">
		<h1 class="workduck-page-title">Artifacts</h1>

		<div class="workduck-page-actions">
			<label class="workduck-field">
				<span>Format</span>
				<select class="workduck-select" bind:value={draftLanguage}>
					{#each artifactEditorLanguages as editorLanguage}
						<option value={editorLanguage}>{editorLanguage}</option>
					{/each}
				</select>
			</label>
		</div>
	</header>

	<WorkspaceGate>
		<section class="workduck-editor-panel">
			<ArtifactEditor
				value={draftContent}
				language={draftLanguage}
				ariaLabel="Artifact content"
				onValueChange={(nextValue) => (draftContent = nextValue)}
			/>
		</section>
	</WorkspaceGate>
</main>
