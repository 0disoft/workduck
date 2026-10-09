/* llmnav/1 module
id=workduck.briefs.run-evidence
role=Read bounded execution evidence and resolve saved brief links to their exact repository tasks, work orders, and reports.
owns=brief evidence loading|execution identity matching|workspace repository path containment
excludes=execution launch|gate evaluation|brief link persistence
search=brief execution evidence|linked task repository paths|Windows drive root and Unix backslash matching
invariant=Linked evidence requires unique source identity and the same workspace-owned repository; Windows spellings share a key while Unix case and literal backslashes remain distinct.
stability=contract
*/
import { readProjectRepositoryTaskRunRecords, type ProjectRepositoryTaskRunRecord } from '#lib/projects/project-repository-task.ts';
import { createRepositoryTaskRunPathKey } from '#lib/projects/project-repository-task-runs.ts';
import { listQueueFiles, readQueueFile } from '#lib/queue/queue-folder.ts';
import { parseQueueResultReport, parseQueueWorkOrder, type WorkduckQueueResultReport, type WorkduckQueueWorkOrder } from '#lib/queue/queue-artifacts.ts';
import { normalizeWorkspacePathForStorage } from '#lib/workspaces/workspace-path-format.ts';
import type { BriefRecord } from './brief-registry';
import type { BriefRunLink, BriefRunSourceKind } from './brief-run-registry';

export interface BriefRunEvidence {
	readonly taskRuns: readonly ProjectRepositoryTaskRunRecord[];
	readonly workOrders: readonly WorkduckQueueWorkOrder[];
	readonly reports: readonly WorkduckQueueResultReport[];
	readonly incomplete: boolean;
}
export interface BriefRunCandidate {
	readonly kind: BriefRunSourceKind;
	readonly id: string;
	readonly label: string;
}

export async function readBriefRunEvidence(workspacePath: string, signal?: AbortSignal, linkedTaskIds: readonly string[] = []): Promise<BriefRunEvidence> {
	const selectedIds = new Set(linkedTaskIds);
	const [tasks, queue, selectedTasks] = await Promise.all([
		readProjectRepositoryTaskRunRecords(workspacePath), listQueueFiles(workspacePath),
		selectedIds.size === 0 ? null : readProjectRepositoryTaskRunRecords(workspacePath, [...selectedIds])
	]);
	const allFiles = queue.ok ? queue.files.filter((file) => file.kind === 'work-order' || file.kind === 'result-report') : [];
	const files = allFiles.slice(0, 200);
	const workOrders: WorkduckQueueWorkOrder[] = [];
	const reports: WorkduckQueueResultReport[] = [];
	let incomplete = !tasks.ok || !queue.ok || selectedTasks?.ok === false || allFiles.length > files.length;
	for (let index = 0; index < files.length; index += 4) {
		if (signal?.aborted) { incomplete = true; break; }
		await Promise.all(files.slice(index, index + 4).map(async (file) => {
			const result = await readQueueFile(workspacePath, file.relativePath);
			if (!result.ok) { incomplete = true; return; }
			if (file.kind === 'work-order') {
				const parsed = parseQueueWorkOrder(result.content);
				if (parsed.ok) workOrders.push(parsed.workOrder); else incomplete = true;
			} else {
				const parsed = parseQueueResultReport(result.content);
				if (parsed.ok) reports.push(parsed.report); else incomplete = true;
			}
		}));
	}
	const taskRuns = [
		...(tasks.ok ? tasks.records.filter((record) => !selectedIds.has(record.id)) : []),
		...(selectedTasks?.ok ? selectedTasks.records : [])
	];
	return { taskRuns, workOrders, reports, incomplete };
}

export function listBriefRunCandidates(brief: BriefRecord, workspacePath: string, evidence: BriefRunEvidence): readonly BriefRunCandidate[] {
	const repositoryPath = brief.repositoryPath === null ? null : repositoryPathKey(workspacePath, brief.repositoryPath);
	const tasks = evidence.taskRuns.filter((task) => repositoryPath !== null && repositoryPathKey(workspacePath, task.repositoryPath) === repositoryPath &&
		evidence.taskRuns.filter((other) => other.id === task.id).length === 1);
	const orders = evidence.incomplete ? [] : evidence.workOrders.filter((order) => order.tasks.some((task) => task.repositoryIds?.includes(brief.repository.id)) &&
		evidence.workOrders.filter((other) => other.ref.id === order.ref.id).length === 1);
	return [
		...tasks.map((task): BriefRunCandidate => ({ kind: 'repository-task', id: task.id, label: `${task.task} · ${task.startedAt}` })),
		...orders.map((order): BriefRunCandidate => ({ kind: 'queue-work-order', id: order.ref.id, label: order.ref.label }))
	];
}

export function findLinkedTask(link: BriefRunLink, workspacePath: string, evidence: BriefRunEvidence): ProjectRepositoryTaskRunRecord | null {
	if (link.sourceKind !== 'repository-task' || link.brief.repositoryPath === null) return null;
	const matches = evidence.taskRuns.filter((task) => task.id === link.sourceId);
	const task = matches.length === 1 ? matches[0]! : null;
	const expected = repositoryPathKey(workspacePath, link.brief.repositoryPath);
	return expected !== null && task && repositoryPathKey(workspacePath, task.repositoryPath) === expected ? task : null;
}

export function findLinkedWorkOrder(link: BriefRunLink, evidence: BriefRunEvidence): WorkduckQueueWorkOrder | null {
	if (link.sourceKind !== 'queue-work-order') return null;
	const matches = evidence.workOrders.filter((order) => order.ref.id === link.sourceId);
	const order = matches.length === 1 ? matches[0]! : null;
	return order?.tasks.some((task) => task.repositoryIds?.includes(link.brief.repository.id)) ? order : null;
}

export function findLinkedReports(link: BriefRunLink, evidence: BriefRunEvidence): readonly WorkduckQueueResultReport[] {
	const order = findLinkedWorkOrder(link, evidence);
	if (!order) return [];
	const taskIds = new Set(order.tasks.filter((task) => task.repositoryIds?.includes(link.brief.repository.id) &&
		order.tasks.filter((other) => other.id === task.id).length === 1).map((task) => task.id));
	return evidence.reports.filter((report) => report.sourceWorkOrder?.id === link.sourceId &&
		evidence.reports.filter((other) => other.ref.id === report.ref.id).length === 1)
		.map((report) => ({ ...report, tasks: report.tasks.filter((task) => taskIds.has(task.id)) }))
		.filter((report) => report.tasks.length > 0);
}

function repositoryPathKey(workspacePath: string, path: string): string | null {
	const workspace = normalizeWorkspacePathForStorage(workspacePath);
	const windows = /^(?:[a-z]:[\\/]|\\\\|\/\/)/iu.test(workspace);
	const root = createRepositoryTaskRunPathKey(workspace);
	let normalized = normalizeWorkspacePathForStorage(path);
	if (windows) normalized = normalized.replaceAll('\\', '/');
	if (!normalized.startsWith('/') && !/^[a-z]:[\\/]/iu.test(normalized)) {
		normalized = `${root}${root.endsWith('/') ? '' : '/'}${normalized}`;
	}
	if (normalized.split('/').some((part) => part === '..' || part === '.')) return null;
	const key = createRepositoryTaskRunPathKey(normalized);
	return key === root || key.startsWith(root.endsWith('/') ? root : `${root}/`) ? key : null;
}
