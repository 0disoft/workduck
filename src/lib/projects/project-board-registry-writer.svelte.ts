/* llmnav/1 module
id=workduck.projects.registry-writer
role=Own pending project registry edits and save feedback within the initiating workspace view lifetime.
owns=registry write admission|pending and failed registry drafts|save result ownership|workspace view lifetime
excludes=registry storage implementation|dialog busy state|repository operations
search=project registry save|late registry write response|workspace save ownership|concurrent project field edits
invariant=Edits build on the latest draft, failed drafts remain available for retry, and only the live initiating view receives save feedback.
stability=architecture
*/
import type { WorkspaceRecord } from '#lib/workspaces/workspace-registry.ts';
import type { ProjectRegistry } from './project-registry';
import type { ProjectRegistryStorageError } from './project-storage';
import { writeProjectRegistryForBoard } from './project-board-storage-actions';

interface ProjectBoardRegistryWriterInput {
	readonly workspace: () => WorkspaceRecord;
	readonly registry: () => ProjectRegistry;
	readonly update: Parameters<typeof writeProjectRegistryForBoard>[1];
}

interface ProjectBoardRegistryWriteScope {
	readonly workspaceId: string;
	readonly workspacePath: string;
}

export function createProjectBoardRegistryWriter(input: ProjectBoardRegistryWriterInput) {
	let workspaceId = $derived(input.workspace().id);
	let workspacePath = $derived(input.workspace().path);
	let activeScope: ProjectBoardRegistryWriteScope | null = null;
	let draftProjection = $state.raw<{
		readonly scope: ProjectBoardRegistryWriteScope;
		readonly registry: ProjectRegistry;
		readonly error: ProjectRegistryStorageError | null;
	} | null>(null);
	$effect(() => {
		const scope = { workspaceId, workspacePath };
		activeScope = scope;
		return () => {
			if (activeScope === scope) activeScope = null;
			if (draftProjection?.scope === scope) draftProjection = null;
		};
	});

	function isCurrentScope(scope: ProjectBoardRegistryWriteScope | null) {
		return scope !== null && activeScope === scope &&
			scope.workspaceId === workspaceId && scope.workspacePath === workspacePath;
	}

	async function persistRegistry(nextRegistry: ProjectRegistry) {
		const scope = activeScope;
		if (
			scope === null || nextRegistry.workspaceId !== scope.workspaceId ||
			scope.workspaceId !== workspaceId || scope.workspacePath !== workspacePath
		) return false;

		const projection = { scope, registry: nextRegistry, error: null };
		draftProjection = projection;
		try {
			return await writeProjectRegistryForBoard(nextRegistry, (next) => {
				if (draftProjection !== projection || !isCurrentScope(scope)) return;
				input.update(next);
				if (next.storageError !== null) {
					draftProjection = { scope, registry: next.registry, error: next.storageError };
				}
			});
		} finally {
			if (draftProjection === projection) draftProjection = null;
		}
	}

	return Object.assign(persistRegistry, {
		getRegistry() {
			return draftProjection !== null && isCurrentScope(draftProjection.scope)
				? draftProjection.registry : input.registry();
		},
		getSaveError() {
			return draftProjection !== null && isCurrentScope(draftProjection.scope)
				? draftProjection.error : null;
		}
	});
}
