export const WORKDUCK_WORKSPACE_REGISTRY_STORAGE_KEY = 'workduck.workspaceRegistry.v1';
export const WORKSPACE_NAME_MAX_LENGTH = 80;
export const WORKSPACE_PATH_MAX_LENGTH = 1024;

export type WorkspaceRegistryError =
	| 'workspace-name-required'
	| 'workspace-path-required'
	| 'workspace-path-duplicate'
	| 'workspace-not-found';

export interface WorkspaceRecord {
	readonly id: string;
	readonly name: string;
	readonly path: string;
	readonly createdAt: string;
	readonly updatedAt: string;
}

export interface WorkspaceRegistry {
	readonly activeWorkspaceId: string | null;
	readonly workspaces: readonly WorkspaceRecord[];
}

export interface WorkspaceInput {
	readonly name: string;
	readonly path: string;
}

export type WorkspaceAddResult =
	| {
			readonly ok: true;
			readonly registry: WorkspaceRegistry;
			readonly workspace: WorkspaceRecord;
	  }
	| {
			readonly ok: false;
			readonly registry: WorkspaceRegistry;
			readonly error: WorkspaceRegistryError;
	  };

export type WorkspaceRegistryResult =
	| {
			readonly ok: true;
			readonly registry: WorkspaceRegistry;
	  }
	| {
			readonly ok: false;
			readonly registry: WorkspaceRegistry;
			readonly error: WorkspaceRegistryError;
	  };

export function createEmptyWorkspaceRegistry(): WorkspaceRegistry {
	return {
		activeWorkspaceId: null,
		workspaces: []
	};
}

export function parseWorkspaceRegistry(serializedRegistry: string | null): WorkspaceRegistry {
	if (serializedRegistry === null) {
		return createEmptyWorkspaceRegistry();
	}

	try {
		return normalizeWorkspaceRegistry(JSON.parse(serializedRegistry));
	} catch {
		return createEmptyWorkspaceRegistry();
	}
}

export function serializeWorkspaceRegistry(registry: WorkspaceRegistry): string {
	return JSON.stringify(normalizeWorkspaceRegistry(registry));
}

export function addWorkspace(
	registry: WorkspaceRegistry,
	input: WorkspaceInput,
	now = new Date()
): WorkspaceAddResult {
	const normalizedRegistry = normalizeWorkspaceRegistry(registry);
	const name = normalizeWorkspaceName(input.name);
	const path = normalizeWorkspacePath(input.path);

	if (name.length === 0) {
		return { ok: false, registry: normalizedRegistry, error: 'workspace-name-required' };
	}

	if (path.length === 0) {
		return { ok: false, registry: normalizedRegistry, error: 'workspace-path-required' };
	}

	if (
		normalizedRegistry.workspaces.some(
			(workspace) => getWorkspacePathKey(workspace.path) === getWorkspacePathKey(path)
		)
	) {
		return { ok: false, registry: normalizedRegistry, error: 'workspace-path-duplicate' };
	}

	const timestamp = now.toISOString();
	const workspace = {
		id: createWorkspaceId(),
		name,
		path,
		createdAt: timestamp,
		updatedAt: timestamp
	} satisfies WorkspaceRecord;

	return {
		ok: true,
		registry: {
			activeWorkspaceId: workspace.id,
			workspaces: [...normalizedRegistry.workspaces, workspace]
		},
		workspace
	};
}

export function switchWorkspace(
	registry: WorkspaceRegistry,
	workspaceId: string
): WorkspaceRegistryResult {
	const normalizedRegistry = normalizeWorkspaceRegistry(registry);

	if (!normalizedRegistry.workspaces.some((workspace) => workspace.id === workspaceId)) {
		return { ok: false, registry: normalizedRegistry, error: 'workspace-not-found' };
	}

	return {
		ok: true,
		registry: {
			...normalizedRegistry,
			activeWorkspaceId: workspaceId
		}
	};
}

export function removeWorkspace(
	registry: WorkspaceRegistry,
	workspaceId: string
): WorkspaceRegistryResult {
	const normalizedRegistry = normalizeWorkspaceRegistry(registry);

	if (!normalizedRegistry.workspaces.some((workspace) => workspace.id === workspaceId)) {
		return { ok: false, registry: normalizedRegistry, error: 'workspace-not-found' };
	}

	const workspaces = normalizedRegistry.workspaces.filter((workspace) => workspace.id !== workspaceId);
	const activeWorkspaceId =
		normalizedRegistry.activeWorkspaceId === workspaceId
			? (workspaces[0]?.id ?? null)
			: normalizedRegistry.activeWorkspaceId;

	return {
		ok: true,
		registry: {
			activeWorkspaceId,
			workspaces
		}
	};
}

export function getActiveWorkspace(registry: WorkspaceRegistry): WorkspaceRecord | null {
	const normalizedRegistry = normalizeWorkspaceRegistry(registry);

	return (
		normalizedRegistry.workspaces.find(
			(workspace) => workspace.id === normalizedRegistry.activeWorkspaceId
		) ?? null
	);
}

function normalizeWorkspaceRegistry(value: unknown): WorkspaceRegistry {
	if (!isObjectRecord(value)) {
		return createEmptyWorkspaceRegistry();
	}

	const rawWorkspaces = Array.isArray(value.workspaces) ? value.workspaces : [];
	const workspaces: WorkspaceRecord[] = [];
	const seenWorkspaceIds = new Set<string>();
	const seenWorkspacePaths = new Set<string>();

	for (const rawWorkspace of rawWorkspaces) {
		const workspace = parseWorkspaceRecord(rawWorkspace);

		if (workspace === null) {
			continue;
		}

		const pathKey = getWorkspacePathKey(workspace.path);

		if (seenWorkspaceIds.has(workspace.id) || seenWorkspacePaths.has(pathKey)) {
			continue;
		}

		seenWorkspaceIds.add(workspace.id);
		seenWorkspacePaths.add(pathKey);
		workspaces.push(workspace);
	}

	const activeWorkspaceId =
		typeof value.activeWorkspaceId === 'string' &&
		workspaces.some((workspace) => workspace.id === value.activeWorkspaceId)
			? value.activeWorkspaceId
			: (workspaces[0]?.id ?? null);

	return {
		activeWorkspaceId,
		workspaces
	};
}

function parseWorkspaceRecord(value: unknown): WorkspaceRecord | null {
	if (!isObjectRecord(value)) {
		return null;
	}

	const id = readTrimmedString(value.id);
	const name = normalizeWorkspaceName(readTrimmedString(value.name));
	const path = normalizeWorkspacePath(readTrimmedString(value.path));
	const createdAt = readTrimmedString(value.createdAt);
	const updatedAt = readTrimmedString(value.updatedAt);

	if (id.length === 0 || name.length === 0 || path.length === 0) {
		return null;
	}

	return {
		id,
		name,
		path,
		createdAt: createdAt.length === 0 ? updatedAt : createdAt,
		updatedAt: updatedAt.length === 0 ? createdAt : updatedAt
	};
}

function createWorkspaceId() {
	if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
		return crypto.randomUUID();
	}

	return `workspace-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function getWorkspacePathKey(path: string) {
	return normalizeWorkspacePath(path).replaceAll('\\', '/').toLocaleLowerCase('en-US');
}

function normalizeWorkspaceName(value: string) {
	return value.trim().replace(/\s+/g, ' ').slice(0, WORKSPACE_NAME_MAX_LENGTH);
}

function normalizeWorkspacePath(value: string) {
	return value.trim().slice(0, WORKSPACE_PATH_MAX_LENGTH);
}

function readTrimmedString(value: unknown) {
	return typeof value === 'string' ? value.trim() : '';
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}
