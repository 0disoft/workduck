/* llmnav/1 module
id=workduck.briefs.runs
role=Validate durable links between saved brief snapshots and existing repository or queue executions.
owns=run link identity|link-time brief snapshots|duplicate link rejection
excludes=execution launch|source record reads|gate evaluation
search=brief run links|saved execution association|link time instructions
invariant=Each brief and source pair is unique and unlinking never mutates the original execution.
stability=contract
*/
import { isObjectRecord } from '#lib/shared/object-record.ts';
import { isBriefRecord, type BriefRecord } from './brief-registry';

export type BriefRunSourceKind = 'repository-task' | 'queue-work-order';
export interface BriefRunLink {
	readonly id: string;
	readonly brief: BriefRecord;
	readonly sourceKind: BriefRunSourceKind;
	readonly sourceId: string;
	readonly createdAt: string;
}
export interface BriefRunRegistry {
	readonly version: 1;
	readonly workspaceId: string;
	readonly revision: number;
	readonly links: readonly BriefRunLink[];
}

export function createEmptyBriefRunRegistry(workspaceId: string): BriefRunRegistry {
	return { version: 1, workspaceId, revision: 0, links: [] };
}

export function parseBriefRunRegistry(content: string, workspaceId: string): BriefRunRegistry | null {
	try {
		const value: unknown = JSON.parse(content);
		if (!isObjectRecord(value) || value.version !== 1 || value.workspaceId !== workspaceId ||
			Object.keys(value).some((key) => !['version', 'workspaceId', 'revision', 'links'].includes(key)) ||
			!Number.isSafeInteger(value.revision) || (value.revision as number) < 0 ||
			!Array.isArray(value.links) || value.links.length > 200 || !value.links.every(isRunLink)) return null;
		const links = value.links as BriefRunLink[];
		if (new Set(links.map((link) => link.id)).size !== links.length ||
			new Set(links.map(linkKey)).size !== links.length) return null;
		return { version: 1, workspaceId, revision: value.revision as number, links };
	} catch { return null; }
}

export function addBriefRunLink(registry: BriefRunRegistry, link: BriefRunLink): BriefRunRegistry | null {
	if (!isRunLink(link) || link.brief.archived || registry.links.length >= 200) return null;
	if (registry.links.some((existing) => existing.id === link.id || linkKey(existing) === linkKey(link))) return null;
	return { ...registry, links: [link, ...registry.links] };
}

export function removeBriefRunLink(registry: BriefRunRegistry, id: string): BriefRunRegistry {
	return { ...registry, links: registry.links.filter((link) => link.id !== id) };
}

function linkKey(link: BriefRunLink) {
	return JSON.stringify([link.brief.id, link.sourceKind, link.sourceId]);
}

function isRunLink(value: unknown): value is BriefRunLink {
	return isObjectRecord(value) &&
		Object.keys(value).every((key) => ['id', 'brief', 'sourceKind', 'sourceId', 'createdAt'].includes(key)) &&
		typeof value.id === 'string' && value.id.trim().length > 0 && value.id.length <= 160 &&
		isBriefRecord(value.brief) &&
		(value.sourceKind === 'repository-task' || value.sourceKind === 'queue-work-order') &&
		typeof value.sourceId === 'string' && value.sourceId.trim().length > 0 && value.sourceId.length <= 200 &&
		typeof value.createdAt === 'string' && value.createdAt.length <= 40 && Number.isFinite(Date.parse(value.createdAt));
}
