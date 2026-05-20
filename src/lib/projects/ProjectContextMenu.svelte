<script lang="ts">
	import type { ProjectContextMenuState } from './project-board-types';

	interface Props {
		readonly contextMenu: ProjectContextMenuState;
		contextMenuElement: HTMLElement | undefined;
		readonly canOpenContextFolder: boolean;
		readonly canCloneContextRepository: boolean;
		readonly canInitializeContextRepository: boolean;
		readonly canPublishContextRepository: boolean;
		readonly canEditContextGithubCredential: boolean;
		readonly onOpenFolder: () => Promise<void>;
		readonly onEditDescription: () => void;
		readonly onEditGithubCredential: () => void;
		readonly onEditTags: () => void;
		readonly onDelete: () => void;
		readonly onCloneRepository: () => Promise<void>;
		readonly onInitializeRepository: () => Promise<void>;
		readonly onPublishRepository: () => void;
	}

	let {
		contextMenu,
		contextMenuElement = $bindable(),
		canOpenContextFolder,
		canCloneContextRepository,
		canInitializeContextRepository,
		canPublishContextRepository,
		canEditContextGithubCredential,
		onOpenFolder,
		onEditDescription,
		onEditGithubCredential,
		onEditTags,
		onDelete,
		onCloneRepository,
		onInitializeRepository,
		onPublishRepository
	}: Props = $props();
</script>

<div
	class="workduck-context-menu"
	role="menu"
	aria-label="Project actions"
	style={`left: ${contextMenu.x}px; top: ${contextMenu.y}px;`}
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
				Open folder
			</button>
		{/if}
		<button
			class="workduck-context-menu-item"
			type="button"
			role="menuitem"
			onclick={onEditDescription}
		>
			Edit description
		</button>
		{#if canEditContextGithubCredential}
			<button
				class="workduck-context-menu-item"
				type="button"
				role="menuitem"
				onclick={onEditGithubCredential}
			>
				GitHub credential
			</button>
		{/if}
		<button class="workduck-context-menu-item" type="button" role="menuitem" onclick={onEditTags}>
			Edit tags
		</button>
		<button
			class="workduck-context-menu-item workduck-context-menu-item-danger"
			type="button"
			role="menuitem"
			onclick={onDelete}
		>
			Delete
		</button>
	{:else}
		{#if canCloneContextRepository}
			<button
				class="workduck-context-menu-item"
				type="button"
				role="menuitem"
				onclick={() => void onCloneRepository()}
			>
				Clone
			</button>
		{/if}
		{#if canInitializeContextRepository}
			<button
				class="workduck-context-menu-item"
				type="button"
				role="menuitem"
				onclick={() => void onInitializeRepository()}
			>
				Initialize Git
			</button>
		{/if}
		{#if canPublishContextRepository}
			<button
				class="workduck-context-menu-item"
				type="button"
				role="menuitem"
				onclick={onPublishRepository}
			>
				Publish
			</button>
		{/if}
		{#if canOpenContextFolder}
			<button
				class="workduck-context-menu-item"
				type="button"
				role="menuitem"
				onclick={() => void onOpenFolder()}
			>
				Open folder
			</button>
		{/if}
		<button class="workduck-context-menu-item" type="button" role="menuitem" onclick={onEditTags}>
			Edit tags
		</button>
		{#if canEditContextGithubCredential}
			<button
				class="workduck-context-menu-item"
				type="button"
				role="menuitem"
				onclick={onEditGithubCredential}
			>
				GitHub credential
			</button>
		{/if}
		<button
			class="workduck-context-menu-item workduck-context-menu-item-danger"
			type="button"
			role="menuitem"
			onclick={onDelete}
		>
			Delete
		</button>
	{/if}
</div>
