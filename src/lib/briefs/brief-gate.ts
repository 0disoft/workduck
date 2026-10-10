/* llmnav/1 module
id=workduck.briefs.gate
role=Derive a local run and gate from linked execution evidence without treating report prose as verified checks.
owns=execution evidence classification|build gate projection|brief run graph
excludes=execution launch|manual approval|report author claims
search=brief gate evidence|verified build result|unverified report checks
invariant=Only a completed native build with exit code zero can pass; missing or prose-only evidence remains pending.
stability=contract
*/
import { createWorkbenchLocalRunLoop, type WorkbenchGateCheckInput } from '@workduck/workbench-engine';
import type { GateRef } from '@workduck/core';
import type { BriefRunLink } from './brief-run-registry';
import { findLinkedReports, findLinkedTask, findLinkedWorkOrder, type BriefRunEvidence } from './brief-run-evidence';

export type BriefGateReason = 'buildPassed' | 'executionFailed' | 'executionStopped' | 'running' | 'unverified' | 'missing' | 'reportNeedsReview' | 'unavailable';

export function deriveBriefGate(link: BriefRunLink, workspacePath: string, evidence: BriefRunEvidence) {
	const gate: GateRef = { kind: 'gate', id: `gate_${link.id}`, label: 'Execution evidence' };
	let checks: readonly WorkbenchGateCheckInput[] = [];
	let reason: BriefGateReason = link.sourceKind === 'queue-work-order' && evidence.unresolvedQueueIds?.includes(link.sourceId)
		? 'unavailable' : 'missing';
	const task = findLinkedTask(link, workspacePath, evidence);
	if (task) {
		if (task.state === 'failed' || (task.state === 'succeeded' && task.exitCode !== null && task.exitCode !== 0)) {
			reason = 'executionFailed';
			checks = [{ label: 'Native execution', state: 'failed' }];
		} else if (task.state === 'stopped') {
			reason = 'executionStopped';
			checks = [{ label: 'Native execution stopped', state: 'failed' }];
		} else if (task.state === 'running') {
			reason = 'running';
		} else if (task.task === 'build' && task.exitCode === 0 && task.finishedAt !== null &&
			Number.isFinite(Date.parse(task.startedAt)) && Number.isFinite(Date.parse(task.finishedAt)) &&
			Date.parse(task.finishedAt) >= Date.parse(task.startedAt)) {
			reason = 'buildPassed';
			checks = [{ label: 'Native build exit code', state: 'passed', details: 'exit code 0' }];
		} else {
			reason = 'unverified';
		}
	} else {
		const order = findLinkedWorkOrder(link, evidence);
		if (order?.status === 'failed') {
			reason = 'executionFailed'; checks = [{ label: 'Queue execution', state: 'failed' }];
		} else if (order?.status === 'running') {
			reason = 'running';
		} else if (order) {
			reason = findLinkedReports(link, evidence).length > 0 ? 'reportNeedsReview' : 'unverified';
		}
	}
	const loop = createWorkbenchLocalRunLoop({
		project: link.brief.project,
		brief: { kind: 'agent-brief', id: link.brief.id, label: link.brief.title },
		run: { kind: 'run', id: link.id, label: link.brief.title },
		title: link.brief.title, instructions: [link.brief.instructions],
		repoRefs: [link.brief.repository], artifacts: [], gates: [gate],
		gateEvaluations: [{ gate, checks }]
	});
	return { reason, state: loop.state, loop };
}
