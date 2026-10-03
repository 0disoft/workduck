/* llmnav/1 module
id=workduck.briefs.registry
role=Validate workspace-owned task briefs, preserve stable repository references, and compile Codex exports.
owns=brief lifecycle|strict registry parsing|repository selection|Codex brief export
excludes=filesystem writes|agent execution
search=saved agent brief|brief archive restore|repository brief instructions
invariant=Invalid registries fail closed and brief identity survives edits and archive transitions.
stability=contract
*/
import type { ProjectRef, RepoRef } from '@workduck/core';
import { compileAgentBriefPromptExport } from '@workduck/agents';
import { isObjectRecord } from '#lib/shared/object-record.ts';
import type { ProjectRegistry } from '#lib/projects/project-registry.ts';

export const BRIEF_TITLE_MAX_LENGTH = 120;
export const BRIEF_INSTRUCTIONS_MAX_LENGTH = 16_000;
export const BRIEF_REGISTRY_MAX_COUNT = 500;

export interface BriefRecord {
	readonly id: string;
	readonly title: string;
	readonly project: ProjectRef;
	readonly repository: RepoRef;
	readonly repositoryPath: string | null;
	readonly instructions: string;
	readonly archived: boolean;
	readonly createdAt: string;
	readonly updatedAt: string;
}

export interface BriefRegistry {
	readonly version: 1;
	readonly revision: number;
	readonly workspaceId: string;
	readonly briefs: readonly BriefRecord[];
}

export interface BriefRepositoryChoice {
	readonly project: ProjectRef;
	readonly repository: RepoRef;
	readonly repositoryPath: string | null;
}

export type BriefDraft = BriefRepositoryChoice & {
	readonly id: string;
	readonly title: string;
	readonly instructions: string;
};

export function createEmptyBriefRegistry(workspaceId: string): BriefRegistry {
	return { version: 1, revision: 0, workspaceId, briefs: [] };
}

export function parseBriefRegistry(content: string, workspaceId: string): BriefRegistry | null {
	try {
		const value: unknown = JSON.parse(content);
		if (
			!isObjectRecord(value) || !onlyKeys(value, ['version', 'revision', 'workspaceId', 'briefs']) ||
			value.version !== 1 || value.workspaceId !== workspaceId ||
			!Number.isSafeInteger(value.revision) || (value.revision as number) < 0 ||
			!Array.isArray(value.briefs) || value.briefs.length > BRIEF_REGISTRY_MAX_COUNT ||
			!value.briefs.every(isBriefRecord)
		) return null;
		const briefs = value.briefs as BriefRecord[];
		if (new Set(briefs.map((brief) => brief.id)).size !== briefs.length) return null;
		return { version: 1, revision: value.revision as number, workspaceId, briefs };
	} catch {
		return null;
	}
}

export function saveBriefDraft(
	registry: BriefRegistry,
	draft: BriefDraft,
	now = new Date().toISOString()
): BriefRegistry | null {
	const existing = registry.briefs.find((brief) => brief.id === draft.id);
	if (existing?.archived || (!existing && registry.briefs.length >= BRIEF_REGISTRY_MAX_COUNT)) return null;
	const brief: BriefRecord = {
		id: draft.id,
		title: draft.title.trim(),
		project: draft.project,
		repository: draft.repository,
		repositoryPath: draft.repositoryPath,
		instructions: draft.instructions.trim(),
		archived: false,
		createdAt: existing?.createdAt ?? now,
		updatedAt: now
	};
	if (!isBriefRecord(brief)) return null;
	return {
		...registry,
		briefs: existing
			? registry.briefs.map((item) => item.id === brief.id ? brief : item)
			: [brief, ...registry.briefs]
	};
}

export function setBriefArchived(
	registry: BriefRegistry, id: string, archived: boolean, now = new Date().toISOString()
): BriefRegistry {
	return { ...registry, briefs: registry.briefs.map((brief) => brief.id === id
		? { ...brief, archived, updatedAt: now } : brief) };
}

export function listBriefRepositoryChoices(registry: ProjectRegistry): readonly BriefRepositoryChoice[] {
	const nodes = new Map(registry.nodes.map((node) => [node.id, node]));
	return registry.nodes.flatMap((node) => {
		let project = node;
		const visited = new Set<string>();
		while (project.kind !== 'project' && project.parentId !== null && !visited.has(project.id)) {
			visited.add(project.id);
			const parent = nodes.get(project.parentId);
			if (!parent) return [];
			project = parent;
		}
		if (project.kind !== 'project') return [];
		return node.repositories.map((repository): BriefRepositoryChoice => ({
			project: { kind: 'project', id: project.id, label: project.name },
			repository: { kind: 'repo', id: repository.id, label: repository.name },
			repositoryPath: repository.path
		}));
	});
}

export function exportBriefForCodex(brief: BriefRecord) {
	return compileAgentBriefPromptExport({
		target: 'codex', title: brief.title, project: brief.project,
		brief: { kind: 'agent-brief', id: brief.id, label: brief.title },
		artifacts: [], gates: [],
		instructions: [
			`Repository: ${brief.repository.label} (repo:${brief.repository.id})`,
			...(brief.repositoryPath ? [`Repository path: ${brief.repositoryPath}`] : []),
			brief.instructions
		]
	});
}

export function isBriefRecord(value: unknown): value is BriefRecord {
	return isObjectRecord(value) &&
		onlyKeys(value, ['id', 'title', 'project', 'repository', 'repositoryPath', 'instructions', 'archived', 'createdAt', 'updatedAt']) &&
		boundedString(value.id, 160) && boundedString(value.title, BRIEF_TITLE_MAX_LENGTH) &&
		isRef(value.project, 'project') && isRef(value.repository, 'repo') &&
		(value.repositoryPath === null || boundedString(value.repositoryPath, 1024)) &&
		boundedString(value.instructions, BRIEF_INSTRUCTIONS_MAX_LENGTH) &&
		typeof value.archived === 'boolean' && validDate(value.createdAt) && validDate(value.updatedAt);
}

function isRef(value: unknown, kind: 'project' | 'repo'): boolean {
	return isObjectRecord(value) && onlyKeys(value, ['kind', 'id', 'label']) &&
		value.kind === kind && boundedString(value.id, 160) && boundedString(value.label, 120);
}

function boundedString(value: unknown, max: number): value is string {
	return typeof value === 'string' && value.trim().length > 0 && value.length <= max;
}

function validDate(value: unknown): value is string {
	return typeof value === 'string' && value.length <= 40 && Number.isFinite(Date.parse(value));
}

function onlyKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
	return Object.keys(value).every((key) => keys.includes(key));
}
