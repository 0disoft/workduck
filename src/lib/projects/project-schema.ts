/* llmnav/1 module
id=workduck.projects.schema
role=Define versioned project registry records, mutation inputs, result shapes, and field limits.
owns=project registry record shapes|project mutation input contracts|project field limits
excludes=normalization algorithms|registry persistence|Git operations
search=project registry record shapes|project mutation input contracts|project field limits
invariant=Project registry consumers share one versioned set of record shapes, mutation results, and field limits.
stability=contract
*/
export const WORKDUCK_PROJECT_REGISTRY_VERSION = 1;
export const PROJECT_NAME_MAX_LENGTH = 80;
export const PROJECT_DESCRIPTION_MAX_LENGTH = 160;
export const PROJECT_NODE_PATH_MAX_LENGTH = 1024;
export const PROJECT_TAG_MAX_LENGTH = 32;
export const PROJECT_TAGS_MAX_COUNT = 12;
export const PROJECT_REPOSITORY_NAME_MAX_LENGTH = 120;
export const PROJECT_REPOSITORY_PATH_MAX_LENGTH = 1024;
export const PROJECT_REPOSITORY_REMOTE_URL_MAX_LENGTH = 2048;

export type ProjectNodeKind = 'project' | 'group';

export type ProjectRegistryError =
	| 'project-name-required'
	| 'project-name-duplicate'
	| 'project-parent-not-found'
	| 'project-parent-invalid'
	| 'project-node-not-found'
	| 'project-path-required'
	| 'project-path-duplicate'
	| 'project-tags-too-many'
	| 'project-tag-too-long'
	| 'project-repository-target-invalid'
	| 'project-repository-not-found'
	| 'project-repository-name-required'
	| 'project-repository-source-required'
	| 'project-repository-path-required'
	| 'project-repository-path-outside-workspace'
	| 'project-repository-path-duplicate'
	| 'project-repository-remote-url-invalid'
	| 'project-repository-remote-url-duplicate';

export interface ProjectRepositoryLinkRecord {
	readonly id: string;
	readonly name: string;
	readonly path: string | null;
	readonly remoteUrl: string | null;
	readonly upstreamRemoteUrl: string | null;
	readonly githubCredentialSecretId: string | null;
	readonly favorite: boolean;
	readonly tags: readonly string[];
	readonly createdAt: string;
	readonly updatedAt: string;
}

export interface ProjectNodeRecord {
	readonly id: string;
	readonly kind: ProjectNodeKind;
	readonly parentId: string | null;
	readonly name: string;
	readonly description: string;
	readonly path: string;
	readonly githubCredentialSecretId: string | null;
	readonly tags: readonly string[];
	readonly repositories: readonly ProjectRepositoryLinkRecord[];
	readonly createdAt: string;
	readonly updatedAt: string;
}

export interface ProjectRegistry {
	readonly version: typeof WORKDUCK_PROJECT_REGISTRY_VERSION;
	readonly workspaceId: string;
	readonly nodes: readonly ProjectNodeRecord[];
	readonly updatedAt: string;
}

export type ProjectRegistryParseError =
	| 'project-registry-json-invalid'
	| 'project-registry-version-unsupported';

export type ProjectRegistryParseResult =
	| {
			readonly ok: true;
			readonly registry: ProjectRegistry;
	  }
	| {
			readonly ok: false;
			readonly error: ProjectRegistryParseError;
	  };

export interface ProjectNodeInput {
	readonly kind: ProjectNodeKind;
	readonly parentId?: string | null;
	readonly name: string;
	readonly description?: string;
	readonly path: string;
	readonly githubCredentialSecretId?: string | null;
	readonly tags?: readonly string[];
}

export interface ProjectRepositoryLinkInput {
	readonly nodeId: string;
	readonly name: string;
	readonly path?: string | null;
	readonly remoteUrl?: string | null;
	readonly upstreamRemoteUrl?: string | null;
	readonly githubCredentialSecretId?: string | null;
	readonly tags?: readonly string[];
}

export interface ProjectRepositoryRemoveInput {
	readonly nodeId: string;
	readonly repositoryId: string;
}

export interface ProjectRepositoryPathUpdateInput {
	readonly nodeId: string;
	readonly repositoryId: string;
	readonly path: string;
}

export interface ProjectRepositoryRemoteUrlUpdateInput {
	readonly nodeId: string;
	readonly repositoryId: string;
	readonly remoteUrl: string | null;
}

export interface ProjectRepositoryRemoteUrlBackfillInput {
	readonly repositoryId: string;
	readonly remoteUrl: string | null;
	readonly upstreamRemoteUrl?: string | null;
}

export interface ProjectRepositoryFavoriteUpdateInput {
	readonly nodeId: string;
	readonly repositoryId: string;
	readonly favorite: boolean;
}

export interface ProjectNodeTagsUpdateInput {
	readonly nodeId: string;
	readonly tags: readonly string[];
}

export interface ProjectNodeDescriptionUpdateInput {
	readonly nodeId: string;
	readonly description: string;
}

export interface ProjectNodeNameUpdateInput {
	readonly nodeId: string;
	readonly name: string;
}

export interface ProjectNodePathUpdateInput {
	readonly nodeId: string;
	readonly path: string;
}

export interface ProjectRepositoryTagsUpdateInput {
	readonly nodeId: string;
	readonly repositoryId: string;
	readonly tags: readonly string[];
}

export interface ProjectNodeGithubCredentialUpdateInput {
	readonly nodeId: string;
	readonly githubCredentialSecretId: string | null;
}

export interface ProjectRepositoryGithubCredentialUpdateInput {
	readonly nodeId: string;
	readonly repositoryId: string;
	readonly githubCredentialSecretId: string | null;
}

export type ProjectRegistryMutationResult =
	| {
			readonly ok: true;
			readonly registry: ProjectRegistry;
	  }
	| {
			readonly ok: false;
			readonly registry: ProjectRegistry;
			readonly error: ProjectRegistryError;
	  };

export interface ProjectRegistryBackfillResult {
	readonly registry: ProjectRegistry;
	readonly changed: boolean;
}

export interface ProjectTreeRow {
	readonly node: ProjectNodeRecord;
	readonly depth: number;
}

