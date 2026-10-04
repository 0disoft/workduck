import { normalizeWorkspacePathForStorage } from './workspace-path-format';

// A folder selection survives navigation to Settings, without persisting an
// unfinished registration or putting a local filesystem path into the URL.
let selectedPath: string | null = null;

export function setWorkspaceRegistrationPath(path: string) {
	selectedPath = normalizeWorkspacePathForStorage(path) || null;
}

export function takeWorkspaceRegistrationPath() {
	const path = selectedPath;
	selectedPath = null;
	return path;
}

export function suggestWorkspaceName(path: string) {
	const normalizedPath = normalizeWorkspacePathForStorage(path);
	const name = normalizedPath.split(/[\\/]+/).filter(Boolean).at(-1) ?? '';
	return /^[A-Za-z]:$/.test(name) ? '' : name;
}
