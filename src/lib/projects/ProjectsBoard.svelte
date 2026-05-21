<script lang="ts">
	import type { WorkduckMessages } from '$lib/i18n/workduck-message-contract';
	import type { WorkduckLanguageId } from '$lib/i18n/workduck-language';
	import type { WorkspaceRecord } from '$lib/workspaces/workspace-registry';
	import ProjectBoardSurface from './ProjectBoardSurface.svelte';

	interface Props {
		readonly workspace: WorkspaceRecord;
		readonly title: string;
		readonly projectMessages: WorkduckMessages['projects'];
		readonly languageId: WorkduckLanguageId;
	}

	let { workspace, title, projectMessages, languageId }: Props = $props();
</script>

<ProjectBoardSurface {workspace} {title} {projectMessages} {languageId} />
