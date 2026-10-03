/* llmnav/1 module
id=workduck.projects.registry-writer
role=Own project registry save feedback within the initiating workspace view lifetime.
owns=registry write admission|save result ownership|workspace view lifetime
excludes=registry storage implementation|dialog busy state|repository operations
search=project registry save|late registry write response|workspace save ownership
invariant=Writes return their storage outcome, but only the live initiating view receives feedback; foreign workspace drafts and disposed views cannot start writes.
stability=architecture
*/
import type { WorkspaceRecord } from '#lib/workspaces/workspace-registry.ts';
import type { ProjectRegistry } from './project-registry';
import { writeProjectRegistryForBoard } from './project-board-storage-actions';

interface ProjectBoardRegistryWriterInput {
	readonly workspace: () => WorkspaceRecord;
	readonly update: Parameters<typeof writeProjectRegistryForBoard>[1];
}

export function createProjectBoardRegistryWriter(input: ProjectBoardRegistryWriterInput) {
	let workspaceId = $derived(input.workspace().id);
	let workspacePath = $derived(input.workspace().path);
	let activeScope: { readonly workspaceId: string; readonly workspacePath: string } | null = null;
	$effect(() => {
		const scope = { workspaceId, workspacePath };
		activeScope = scope;
		return () => {
			if (activeScope === scope) activeScope = null;
		};
	});

	return async function persistRegistry(nextRegistry: ProjectRegistry) {
		const scope = activeScope;
		if (
			scope === null || nextRegistry.workspaceId !== scope.workspaceId ||
			scope.workspaceId !== workspaceId || scope.workspacePath !== workspacePath
		) return false;

		return writeProjectRegistryForBoard(nextRegistry, (next) => {
			if (
				activeScope === scope &&
				scope.workspaceId === workspaceId && scope.workspacePath === workspacePath
			) input.update(next);
		});
	};
}
