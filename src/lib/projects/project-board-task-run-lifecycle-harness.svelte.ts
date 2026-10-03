import type { WorkspaceRecord } from '#lib/workspaces/workspace-registry.ts';
import type { ProjectRepositoryLinkRecord } from './project-registry';
import type { ProjectRepositoryTaskRunRecordByRepositoryId } from './project-repository-task-runs';
import ProjectBoardRepositoryTaskRunLifecycle from './ProjectBoardRepositoryTaskRunLifecycle.svelte';

export function createProjectBoardTaskRunLifecycleHarness(
	initialWorkspace: WorkspaceRecord,
	initialRepositories: readonly ProjectRepositoryLinkRecord[]
) {
	let workspace = $state(initialWorkspace);
	let repositories = $state(initialRepositories);
	let records = $state<ProjectRepositoryTaskRunRecordByRepositoryId>({});
	const dispose = $effect.root(() => {
		ProjectBoardRepositoryTaskRunLifecycle(null as never, {
			get workspace() { return workspace; },
			get repositories() { return repositories; },
			get repositoryTaskRunById() { return records; },
			set repositoryTaskRunById(value) { records = value; }
		});
	});
	return {
		get records() { return records; },
		set records(value) { records = value; },
		setWorkspace(value: WorkspaceRecord) { workspace = value; },
		setRepositories(value: readonly ProjectRepositoryLinkRecord[]) { repositories = value; },
		dispose
	};
}
