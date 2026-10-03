import { readWorkspaceDataFile, writeWorkspaceRegistryFile } from '#lib/workspaces/workspace-data-file.ts';
import { createEmptyBriefRunRegistry, parseBriefRunRegistry, type BriefRunRegistry } from './brief-run-registry';

export type BriefRunStorageResult =
	| { readonly ok: true; readonly registry: BriefRunRegistry }
	| { readonly ok: false; readonly error: string };

export async function readBriefRunRegistry(workspaceId: string, workspacePath: string): Promise<BriefRunStorageResult> {
	const result = await readWorkspaceDataFile(workspacePath, 'brief-runs.json');
	if (!result.ok) return result;
	if (result.content === null) return { ok: true, registry: createEmptyBriefRunRegistry(workspaceId) };
	const registry = parseBriefRunRegistry(result.content, workspaceId);
	return registry ? { ok: true, registry } : { ok: false, error: 'brief-runs-invalid' };
}

export async function writeBriefRunRegistry(registry: BriefRunRegistry, workspacePath: string): Promise<BriefRunStorageResult> {
	const content = JSON.stringify(registry);
	if (!parseBriefRunRegistry(content, registry.workspaceId)) return { ok: false, error: 'brief-runs-invalid' };
	const result = await writeWorkspaceRegistryFile(workspacePath, 'brief-runs.json', registry.revision, content);
	if (!result.ok) return result;
	const persisted = parseBriefRunRegistry(result.content, registry.workspaceId);
	return persisted && persisted.revision === registry.revision + 1
		? { ok: true, registry: persisted } : { ok: false, error: 'brief-runs-invalid' };
}
