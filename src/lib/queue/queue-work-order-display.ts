import type { WorkduckQueueWorkOrder, WorkduckQueueWorkOrderTask } from './queue-artifacts';

export interface QueueEvaluationDelegationTarget {
	readonly name: string;
	readonly details: readonly string[];
}

export interface QueueEvaluationDelegationDisplay {
	readonly reportLocation: string | null;
	readonly workspacePath: string | null;
	readonly criteria: readonly string[];
	readonly targets: readonly QueueEvaluationDelegationTarget[];
	readonly command: string | null;
}

export function createEvaluationDelegationDisplay(
	workOrder: WorkduckQueueWorkOrder,
	task: WorkduckQueueWorkOrderTask
): QueueEvaluationDelegationDisplay | null {
	if (workOrder.sourceReport === undefined || !task.body.includes('evaluate-batch')) {
		return null;
	}

	const lines = task.body.split(/\r?\n/);
	const reportLocation =
		findPrefixedValue(lines, ['결과 보고서:', 'Result report:']) ?? workOrder.sourceReport.label;
	const workspacePath = findPrefixedValue(lines, ['워크스페이스:', 'Workspace:']);
	const criteria = extractBulletSection(lines, ['평가 기준:', 'Criteria:']);
	const targets = extractEvaluationTargets(lines);
	const command = lines.find((line) => line.trim().startsWith('workduck agent evaluate-batch'))?.trim() ?? null;

	return {
		reportLocation,
		workspacePath,
		criteria,
		targets,
		command
	};
}

function findPrefixedValue(lines: readonly string[], prefixes: readonly string[]) {
	for (const line of lines) {
		const trimmed = line.trim();
		const prefix = prefixes.find((candidate) => trimmed.startsWith(candidate));

		if (prefix !== undefined) {
			const value = trimmed.slice(prefix.length).trim();

			return value.length > 0 ? value : null;
		}
	}

	return null;
}

function extractBulletSection(lines: readonly string[], labels: readonly string[]) {
	const startIndex = findSectionStart(lines, labels);

	if (startIndex === -1) {
		return [];
	}

	const values: string[] = [];

	for (let index = startIndex + 1; index < lines.length; index += 1) {
		const trimmed = lines[index]?.trim() ?? '';

		if (trimmed.length === 0) {
			break;
		}

		if (!trimmed.startsWith('- ')) {
			break;
		}

		values.push(trimmed.slice(2).trim());
	}

	return values;
}

function extractEvaluationTargets(lines: readonly string[]) {
	const startIndex = findSectionStart(lines, ['평가 대상:', 'Targets:']);

	if (startIndex === -1) {
		return [];
	}

	const targets: QueueEvaluationDelegationTarget[] = [];
	let currentTarget: { name: string; details: string[] } | null = null;

	for (let index = startIndex + 1; index < lines.length; index += 1) {
		const line = lines[index] ?? '';
		const trimmed = line.trim();

		if (trimmed.length === 0) {
			break;
		}

		const targetMatch = /^\d+\.\s+(.+)$/.exec(trimmed);

		if (targetMatch !== null) {
			if (currentTarget !== null) {
				targets.push(currentTarget);
			}

			currentTarget = {
				name: targetMatch[1]?.trim() ?? '',
				details: []
			};
			continue;
		}

		if (currentTarget !== null) {
			currentTarget.details.push(trimmed);
		}
	}

	if (currentTarget !== null) {
		targets.push(currentTarget);
	}

	return targets;
}

function findSectionStart(lines: readonly string[], labels: readonly string[]) {
	return lines.findIndex((line) => labels.includes(line.trim()));
}
