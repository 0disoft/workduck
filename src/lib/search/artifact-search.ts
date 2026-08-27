import { getTauriInvoke } from '$lib/tauri/tauri-invoke';

import type { CommandPaletteItem } from './command-palette-index';

export type CommandPaletteArtifactSearchError =
	| 'command-palette-workspace-required'
	| 'command-palette-query-invalid'
	| 'command-palette-search-unavailable'
	| 'command-palette-search-failed';

export type CommandPaletteArtifactSearchResult =
	| {
			readonly ok: true;
			readonly items: readonly CommandPaletteItem[];
	  }
	| {
			readonly ok: false;
			readonly items: readonly CommandPaletteItem[];
			readonly error: CommandPaletteArtifactSearchError;
	  };

interface CommandPaletteArtifactResponseItem {
	readonly id?: string | null;
	readonly artifactKind?: string | null;
	readonly artifactId?: string | null;
	readonly projectId?: string | null;
	readonly schemaId?: string | null;
	readonly snippet?: string | null;
}

interface CommandPaletteArtifactSearchResponse {
	readonly ok?: boolean;
	readonly results?: readonly CommandPaletteArtifactResponseItem[] | null;
	readonly error?: CommandPaletteArtifactSearchError | null;
}

export async function searchCommandPaletteArtifacts(
	workspaceId: string,
	query: string,
	limit = 8
): Promise<CommandPaletteArtifactSearchResult> {
	const normalizedWorkspaceId = workspaceId.trim();
	const normalizedQuery = query.trim();

	if (normalizedWorkspaceId.length === 0) {
		return { ok: false, items: [], error: 'command-palette-workspace-required' };
	}

	if (normalizedQuery.length === 0) {
		return { ok: true, items: [] };
	}

	const invoke = getTauriInvoke();
	if (invoke === undefined) {
		return { ok: false, items: [], error: 'command-palette-search-unavailable' };
	}

	try {
		const boundedLimit = Number.isFinite(limit) ? Math.max(1, Math.trunc(limit)) : 8;
		const response = await invoke<CommandPaletteArtifactSearchResponse>(
			'search_command_palette_artifacts',
			{
				workspaceId: normalizedWorkspaceId,
				query: normalizedQuery,
				limit: boundedLimit
			}
		);
		const items = Array.isArray(response.results)
			? response.results
					.map((value) => normalizeArtifactResult(value, normalizedQuery))
					.filter((item): item is CommandPaletteItem => item !== null)
			: [];

		if (response.ok === true) {
			return { ok: true, items };
		}

		return {
			ok: false,
			items,
			error: isCommandPaletteArtifactSearchError(response.error)
				? response.error
				: 'command-palette-search-failed'
		};
	} catch {
		return { ok: false, items: [], error: 'command-palette-search-failed' };
	}
}

function normalizeArtifactResult(
	value: CommandPaletteArtifactResponseItem,
	query: string
): CommandPaletteItem | null {
	if (
		typeof value.id !== 'string' ||
		typeof value.artifactKind !== 'string' ||
		typeof value.artifactId !== 'string'
	) {
		return null;
	}

	const id = value.id.trim();
	const artifactKind = value.artifactKind.trim();
	const artifactId = value.artifactId.trim();
	const projectId = normalizeOptionalText(value.projectId);
	const schemaId = normalizeOptionalText(value.schemaId);
	const snippet = compactText(normalizeOptionalText(value.snippet) ?? '');

	if (id.length === 0 || artifactKind.length === 0 || artifactId.length === 0) {
		return null;
	}

	const description = [artifactKind, schemaId, projectId, snippet].filter(Boolean).join(' · ');

	return {
		id: `artifact:${id}`,
		kind: 'artifact',
		title: artifactId,
		description,
		href: '/',
		searchText: [query, artifactId, artifactKind, projectId ?? '', schemaId ?? '', snippet].join(' ')
	};
}

function normalizeOptionalText(value: unknown) {
	if (typeof value !== 'string') {
		return null;
	}

	const normalized = value.replace(/\s+/gu, ' ').trim();

	return normalized.length > 0 ? normalized : null;
}

function compactText(value: string, maxLength = 180) {
	return value.length <= maxLength ? value : `${value.slice(0, maxLength - 1)}…`;
}

function isCommandPaletteArtifactSearchError(
	value: unknown
): value is CommandPaletteArtifactSearchError {
	return (
		value === 'command-palette-workspace-required' ||
		value === 'command-palette-query-invalid' ||
		value === 'command-palette-search-unavailable' ||
		value === 'command-palette-search-failed'
	);
}
