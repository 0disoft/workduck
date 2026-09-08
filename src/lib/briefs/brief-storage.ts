import { readWorkspaceDataFile, writeWorkspaceRegistryFile, type WorkspaceDataFileError } from '$lib/workspaces/workspace-data-file';
import { createEmptyBriefRegistry, parseBriefRegistry, type BriefRegistry } from './brief-registry';

export type BriefStorageResult =
	| { readonly ok: true; readonly registry: BriefRegistry }
	| { readonly ok: false; readonly error: WorkspaceDataFileError | 'brief-registry-invalid' };

export async function readBriefRegistry(workspaceId: string, workspacePath: string): Promise<BriefStorageResult> {
	const result = await readWorkspaceDataFile(workspacePath, 'briefs.json');
	if (!result.ok) return result;
	if (result.content === null) return { ok: true, registry: createEmptyBriefRegistry(workspaceId) };
	const registry = parseBriefRegistry(result.content, workspaceId);
	return registry ? { ok: true, registry } : { ok: false, error: 'brief-registry-invalid' };
}

export async function writeBriefRegistry(registry: BriefRegistry, workspacePath: string): Promise<BriefStorageResult> {
	const content = JSON.stringify(registry);
	if (parseBriefRegistry(content, registry.workspaceId) === null) return { ok: false, error: 'brief-registry-invalid' };
	const result = await writeWorkspaceRegistryFile(workspacePath, 'briefs.json', registry.revision, content);
	if (!result.ok) return result;
	const persisted = parseBriefRegistry(result.content, registry.workspaceId);
	if (persisted === null || persisted.revision !== registry.revision + 1) return { ok: false, error: 'brief-registry-invalid' };
	return { ok: true, registry: persisted };
}
