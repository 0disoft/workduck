import { readAgentRegistry } from '$lib/agents/agent-registry-storage';
import { readProjectRegistry } from '$lib/projects/project-storage';
import { readProjectRepositoryTaskRunRecords } from '$lib/projects/project-repository-task';
import { listQueueFiles } from '$lib/queue/queue-folder';
import { readReferenceRegistry } from '$lib/references/reference-registry-storage';
import type { WorkspaceRecord } from '$lib/workspaces/workspace-registry';

import {
	buildWorkspaceCommandPaletteItems,
	type CommandPaletteItem
} from './command-palette-index';

export interface WorkspaceCommandPaletteLoadResult {
	readonly items: readonly CommandPaletteItem[];
	readonly degraded: boolean;
}

export async function loadWorkspaceCommandPaletteItems(
	workspace: WorkspaceRecord
): Promise<WorkspaceCommandPaletteLoadResult> {
	const [projectResult, agentResult, referenceResult, queueResult, taskRunResult] =
		await Promise.all([
			readProjectRegistry(workspace.id),
			readAgentRegistry(workspace.id, workspace.path),
			readReferenceRegistry(workspace.id, workspace.path),
			listQueueFiles(workspace.path),
			readProjectRepositoryTaskRunRecords(workspace.path)
		]);

	return {
		items: buildWorkspaceCommandPaletteItems({
			projectRegistry: projectResult.registry,
			agentRegistry: agentResult.registry,
			referenceRegistry: referenceResult.registry,
			queueFiles: queueResult.ok ? queueResult.files : [],
			taskRuns: taskRunResult.records
		}),
		degraded:
			!projectResult.ok ||
			!agentResult.ok ||
			!referenceResult.ok ||
			!queueResult.ok ||
			!taskRunResult.ok
	};
}
