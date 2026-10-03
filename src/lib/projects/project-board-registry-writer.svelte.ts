/* llmnav/1 module
id=workduck.projects.registry-writer
role=Own pending project registry edits and save feedback within the initiating workspace view lifetime.
owns=registry write admission|pending and failed registry drafts|save result ownership|workspace view lifetime|conflict recovery
excludes=registry storage implementation|dialog busy state|repository operations
search=project registry save|late registry write response|workspace save ownership|concurrent project field edits
invariant=Edits build on the latest draft, writes compare the last accepted snapshot, conflicts require reload, and only the live initiating view receives feedback.
stability=architecture
*/
import type { WorkspaceRecord } from '#lib/workspaces/workspace-registry.ts';
import type { ProjectRegistry } from './project-registry';
import { readProjectRegistry, type ProjectRegistryStorageError } from './project-storage';
import { writeProjectRegistryForBoard } from './project-board-storage-actions';

interface ProjectBoardRegistryWriterInput {
	readonly workspace: () => WorkspaceRecord;
	readonly registry: () => ProjectRegistry;
	readonly update: Parameters<typeof writeProjectRegistryForBoard>[1];
}

interface ProjectBoardRegistryWriteScope {
	readonly workspaceId: string;
	readonly workspacePath: string;
	acceptedRegistry?: ProjectRegistry;
	lastWrite?: Promise<boolean>;
}

export function createProjectBoardRegistryWriter(input: ProjectBoardRegistryWriterInput) {
	let workspaceId = $derived(input.workspace().id);
	let workspacePath = $derived(input.workspace().path);
	let activeScope: ProjectBoardRegistryWriteScope | null = null;
	let reloadingScope = $state.raw<ProjectBoardRegistryWriteScope | null>(null);
	let conflictedScope = $state.raw<ProjectBoardRegistryWriteScope | null>(null);
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
		if (reloadingScope === scope || conflictedScope === scope) return false;
		if (draftProjection === null) scope.acceptedRegistry = input.registry();

		const projection = { scope, registry: nextRegistry, error: null };
		draftProjection = projection;
		try {
			const saving = writeProjectRegistryForBoard(nextRegistry, (next) => {
				if (next.storageError === null) scope.acceptedRegistry = next.registry;
				if (next.storageError === 'project-registry-revision-conflict' && isCurrentScope(scope)) conflictedScope = scope;
				if (draftProjection !== projection || !isCurrentScope(scope)) return;
				input.update({ ...next, registry: next.storageError === null ? next.registry : input.registry() });
				if (next.storageError !== null) {
					draftProjection = { scope, registry: next.registry, error: next.storageError };
				}
			}, async () => scope.acceptedRegistry!);
			scope.lastWrite = saving;
			return await saving;
		} finally {
			if (draftProjection === projection) draftProjection = null;
		}
	}

	return Object.assign(persistRegistry, {
		async reload() {
			const scope = activeScope;
			if (!isCurrentScope(scope) || scope === null || reloadingScope === scope) return false;
			reloadingScope = scope;
			try {
				await scope.lastWrite;
				if (!isCurrentScope(scope)) return false;
				const result = await readProjectRegistry(scope.workspaceId);
				if (!isCurrentScope(scope)) return false;
				if (!result.ok) {
					input.update({ registry: input.registry(), storageError: result.error });
					if (draftProjection?.scope === scope) draftProjection = { ...draftProjection, error: result.error };
					return false;
				}
				scope.acceptedRegistry = result.registry;
				draftProjection = null;
				if (conflictedScope === scope) conflictedScope = null;
				input.update({ registry: result.registry, storageError: null });
				return true;
			} finally {
				if (reloadingScope === scope) reloadingScope = null;
			}
		},
		isReloading() { return reloadingScope !== null && isCurrentScope(reloadingScope); },
		hasConflict() { return conflictedScope !== null && isCurrentScope(conflictedScope); },
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
