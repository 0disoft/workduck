/* llmnav/1 module
id=workduck.workspace.path-repair
role=Validate and save replacement directories for the initiating workspace.
owns=repair target|validation|cancellation|path conflicts
excludes=picker rendering|native validation|storage transport
search=workspace path repair target|reconnect workspace directory|cancel pending path repair
invariant=Keeps the initial workspace and path; cancelled validation never writes; path changes conflict; persistence compares the accepted snapshot.
stability=architecture
*/
import { updateWorkspacePath, type WorkspaceRecord, type WorkspaceRegistryError } from './workspace-registry';
import { validateWorkspacePath, type WorkspacePathError } from './workspace-path';
import { readWorkspaceRegistryFromBrowser, writeWorkspaceRegistryToBrowser, type WorkspaceRegistryStorageError } from './workspace-storage';

export type WorkspacePathRepairError = WorkspacePathError | WorkspaceRegistryError | WorkspaceRegistryStorageError | 'workspace-path-repair-cancelled';
type WorkspacePathRepairResult =
	| { readonly ok: true; readonly path: string }
	| { readonly ok: false; readonly error: WorkspacePathRepairError };

export async function repairWorkspacePath(
	workspace: WorkspaceRecord,
	nextPath: string,
	signal?: AbortSignal
): Promise<WorkspacePathRepairResult> {
	const id = workspace.id;
	const originalPath = workspace.path;
	const cancelled = { ok: false, error: 'workspace-path-repair-cancelled' } as const;
	if (signal?.aborted) return cancelled;
	const validated = await validateWorkspacePath(nextPath);
	if (signal?.aborted) return cancelled;
	if (!validated.ok) return validated;
	const current = readWorkspaceRegistryFromBrowser();
	if (!current.ok) return { ok: false, error: current.error };
	const target = current.registry.workspaces.find((candidate) => candidate.id === id);
	if (target === undefined) return { ok: false, error: 'workspace-not-found' };
	if (target.path !== originalPath) return { ok: false, error: 'workspace-registry-conflict' };
	const updated = updateWorkspacePath(current.registry, id, validated.path);
	if (!updated.ok) return { ok: false, error: updated.error };
	const saved = await writeWorkspaceRegistryToBrowser(updated.registry, current.registry, signal);
	if (signal?.aborted) return cancelled;
	return saved.ok ? { ok: true, path: validated.path } : { ok: false, error: saved.error };
}
