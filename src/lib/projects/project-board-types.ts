import type { ProjectNodeRecord, ProjectRepositoryLinkRecord } from './project-registry';

export type ProjectDialogMode = 'project' | 'group' | 'repository';
export type ProjectRepositorySourceMode = 'folder' | 'remote';

export type ProjectContextMenuTarget =
	| {
			readonly type: 'node';
			readonly nodeId: string;
	  }
	| {
			readonly type: 'repository';
			readonly nodeId: string;
			readonly repositoryId: string;
	  };

export type ProjectDeleteCandidate =
	| {
			readonly type: 'node';
			readonly node: ProjectNodeRecord;
	  }
	| {
			readonly type: 'repository';
			readonly node: ProjectNodeRecord;
			readonly repository: ProjectRepositoryLinkRecord;
	  };

export type ProjectTagEditorTarget =
	| {
			readonly type: 'node';
			readonly node: ProjectNodeRecord;
	  }
	| {
			readonly type: 'repository';
			readonly node: ProjectNodeRecord;
			readonly repository: ProjectRepositoryLinkRecord;
	  };

export type ProjectGithubCredentialEditorTarget =
	| {
			readonly type: 'node';
			readonly node: ProjectNodeRecord;
	  }
	| {
			readonly type: 'repository';
			readonly node: ProjectNodeRecord;
			readonly repository: ProjectRepositoryLinkRecord;
	  };

export interface ProjectContextMenuState {
	readonly x: number;
	readonly y: number;
	readonly target: ProjectContextMenuTarget;
}

export interface ProjectDialogState {
	readonly mode: ProjectDialogMode;
	readonly targetNodeId: string | null;
}

export interface ProjectRepositoryTarget {
	readonly node: ProjectNodeRecord;
	readonly repository: ProjectRepositoryLinkRecord;
}
