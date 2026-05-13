export const WORKSPACE_PATH_DISPLAY_SEGMENT_COUNT = 3;

const WINDOWS_VERBATIM_PATH_PREFIX = '\\\\?\\';
const WINDOWS_VERBATIM_UNC_PATH_PREFIX = '\\\\?\\UNC\\';

export function normalizeWorkspacePathForStorage(path: string) {
	return removeWindowsVerbatimPathPrefix(path.trim());
}

export function formatWorkspacePathForDisplay(
	path: string,
	segmentCount = WORKSPACE_PATH_DISPLAY_SEGMENT_COUNT
) {
	const normalizedPath = normalizeWorkspacePathForStorage(path);
	const displaySegmentCount = Math.max(1, Math.trunc(segmentCount));
	const segments = normalizedPath.split(/[\\/]+/).filter(Boolean);

	if (segments.length <= displaySegmentCount) {
		return normalizedPath;
	}

	return segments.slice(-displaySegmentCount).join(getWorkspacePathSeparator(normalizedPath));
}

function removeWindowsVerbatimPathPrefix(path: string) {
	if (path.startsWith(WINDOWS_VERBATIM_UNC_PATH_PREFIX)) {
		return `\\\\${path.slice(WINDOWS_VERBATIM_UNC_PATH_PREFIX.length)}`;
	}

	if (path.startsWith(WINDOWS_VERBATIM_PATH_PREFIX)) {
		return path.slice(WINDOWS_VERBATIM_PATH_PREFIX.length);
	}

	return path;
}

function getWorkspacePathSeparator(path: string) {
	return path.includes('\\') ? '\\' : '/';
}
