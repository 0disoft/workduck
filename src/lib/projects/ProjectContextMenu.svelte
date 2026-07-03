<script lang="ts">
	import type { WorkduckMessages } from '$lib/i18n/workduck-message-contract';
	import { styleProperties } from '$lib/ui/style-properties-action';
	import type { ProjectContextMenuState } from './project-board-types';
	import type { ProjectRepositoryTask } from './project-repository-task';

	interface Props {
		readonly contextMenu: ProjectContextMenuState;
		readonly projectMessages: WorkduckMessages['projects'];
		contextMenuElement: HTMLElement | undefined;
		readonly canOpenContextFolder: boolean;
		readonly canCloneContextRepository: boolean;
		readonly canInitializeContextRepository: boolean;
		readonly canPublishContextRepository: boolean;
		readonly canApplySsealedContextRepository: boolean;
		readonly canEditContextGithubCredential: boolean;
		readonly onOpenFolder: () => Promise<void>;
		readonly onEditDetails: () => void;
		readonly onEditDescription: () => void;
		readonly onEditGithubCredential: () => void;
		readonly onEditRemoteUrl: () => void;
		readonly onEditTags: () => void;
		readonly onDelete: () => void;
		readonly onCloneRepository: () => Promise<void>;
		readonly onInitializeRepository: () => Promise<void>;
		readonly onPublishRepository: () => void;
		readonly onApplySsealedRepository: () => void;
		readonly onRepositoryTask: (task: ProjectRepositoryTask) => Promise<void>;
	}

	let {
		contextMenu,
		projectMessages,
		contextMenuElement = $bindable(),
		canOpenContextFolder,
		canCloneContextRepository,
		canInitializeContextRepository,
		canPublishContextRepository,
		canApplySsealedContextRepository,
		canEditContextGithubCredential,
		onOpenFolder,
		onEditDetails,
		onEditDescription,
		onEditGithubCredential,
		onEditRemoteUrl,
		onEditTags,
		onDelete,
		onCloneRepository,
		onInitializeRepository,
		onPublishRepository,
		onApplySsealedRepository,
		onRepositoryTask
	}: Props = $props();
</script>

<div
	class="workduck-context-menu"
	role="menu"
	aria-label="Project actions"
	use:styleProperties={{ left: `${contextMenu.x}px`, top: `${contextMenu.y}px` }}
	bind:this={contextMenuElement}
>
	{#if contextMenu.target.type === 'node'}
		{#if canOpenContextFolder}
			<button
				class="workduck-context-menu-item"
				type="button"
				role="menuitem"
				onclick={() => void onOpenFolder()}
			>
				{projectMessages.contextMenu.openFolder}
			</button>
		{/if}
		<button
			class="workduck-context-menu-item"
			type="button"
			role="menuitem"
			onclick={onEditDetails}
		>
			{projectMessages.contextMenu.editDetails}
		</button>
		<button
			class="workduck-context-menu-item"
			type="button"
			role="menuitem"
			onclick={onEditDescription}
		>
			{projectMessages.contextMenu.editDescription}
		</button>
		{#if canEditContextGithubCredential}
			<button
				class="workduck-context-menu-item"
				type="button"
				role="menuitem"
				onclick={onEditGithubCredential}
			>
				{projectMessages.contextMenu.githubCredential}
			</button>
		{/if}
		<button class="workduck-context-menu-item" type="button" role="menuitem" onclick={onEditTags}>
			{projectMessages.contextMenu.editTags}
		</button>
		<button
			class="workduck-context-menu-item workduck-context-menu-item-danger"
			type="button"
			role="menuitem"
			onclick={onDelete}
		>
			{projectMessages.contextMenu.delete}
		</button>
	{:else}
		{#if canCloneContextRepository}
			<button
				class="workduck-context-menu-item"
				type="button"
				role="menuitem"
				onclick={() => void onCloneRepository()}
			>
				{projectMessages.contextMenu.clone}
			</button>
		{/if}
		{#if canInitializeContextRepository}
			<button
				class="workduck-context-menu-item"
				type="button"
				role="menuitem"
				onclick={() => void onInitializeRepository()}
			>
				{projectMessages.contextMenu.initializeGit}
			</button>
		{/if}
		{#if canPublishContextRepository}
			<button
				class="workduck-context-menu-item"
				type="button"
				role="menuitem"
				onclick={onPublishRepository}
			>
				{projectMessages.contextMenu.publish}
			</button>
		{/if}
		{#if canApplySsealedContextRepository}
			<button
				class="workduck-context-menu-item"
				type="button"
				role="menuitem"
				onclick={onApplySsealedRepository}
			>
				{projectMessages.contextMenu.applySsealed}
			</button>
		{/if}
		{#if canOpenContextFolder}
			<button
				class="workduck-context-menu-item"
				type="button"
				role="menuitem"
				onclick={() => void onOpenFolder()}
			>
				{projectMessages.contextMenu.openFolder}
			</button>
			<div class="workduck-context-menu-separator" role="separator"></div>
			<button
				class="workduck-context-menu-item"
				type="button"
				role="menuitem"
				onclick={() => void onRepositoryTask('open-terminal')}
			>
				{projectMessages.contextMenu.openTerminal}
			</button>
			<button
				class="workduck-context-menu-item"
				type="button"
				role="menuitem"
				onclick={() => void onRepositoryTask('install-dependencies')}
			>
				{projectMessages.contextMenu.installDependencies}
			</button>
			<button
				class="workduck-context-menu-item"
				type="button"
				role="menuitem"
				onclick={() => void onRepositoryTask('update-dependencies')}
			>
				{projectMessages.contextMenu.updateDependencies}
			</button>
			<button
				class="workduck-context-menu-item"
				type="button"
				role="menuitem"
				onclick={() => void onRepositoryTask('start-dev-server')}
			>
				{projectMessages.contextMenu.startDevServer}
			</button>
			<button
				class="workduck-context-menu-item"
				type="button"
				role="menuitem"
				onclick={() => void onRepositoryTask('build')}
			>
				{projectMessages.contextMenu.build}
			</button>
			<button
				class="workduck-context-menu-item"
				type="button"
				role="menuitem"
				onclick={() => void onRepositoryTask('preview')}
			>
				{projectMessages.contextMenu.preview}
			</button>
		{/if}
		<div class="workduck-context-menu-separator" role="separator"></div>
		<button class="workduck-context-menu-item" type="button" role="menuitem" onclick={onEditTags}>
			{projectMessages.contextMenu.editTags}
		</button>
		{#if canEditContextGithubCredential}
			<button
				class="workduck-context-menu-item"
				type="button"
				role="menuitem"
				onclick={onEditGithubCredential}
			>
				{projectMessages.contextMenu.githubCredential}
			</button>
		{/if}
		<button
			class="workduck-context-menu-item"
			type="button"
			role="menuitem"
			onclick={onEditRemoteUrl}
		>
			{projectMessages.contextMenu.remoteUrl}
		</button>
		<button
			class="workduck-context-menu-item workduck-context-menu-item-danger"
			type="button"
			role="menuitem"
			onclick={onDelete}
		>
			{projectMessages.contextMenu.delete}
		</button>
	{/if}
</div>
