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
	const jsonTargets = extractEvaluationTargetsFromJsonTemplate(lines.join('\n'));

	if (jsonTargets.length > 0) {
		return jsonTargets;
	}

	const startIndex = findSectionStart(lines, ['평가 대상:', 'Targets:']);

	if (startIndex === -1) {
		return [];
	}

	const targets: QueueEvaluationDelegationTarget[] = [];
	let currentTarget: { name: string; details: string[] } | null = null;

	for (let index = startIndex + 1; index < lines.length; index += 1) {
		const line = lines[index] ?? '';
		const trimmed = line.trim();

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

function extractEvaluationTargetsFromJsonTemplate(content: string) {
	const markerIndex = content.indexOf('"evaluations"');

	if (markerIndex === -1) {
		return [];
	}

	const objectStartIndex = content.lastIndexOf('{', markerIndex);

	if (objectStartIndex === -1) {
		return [];
	}

	const objectText = findBalancedObjectText(content, objectStartIndex);

	if (objectText === null) {
		return [];
	}

	try {
		const parsed: unknown = JSON.parse(objectText);

		if (!isRecord(parsed) || !Array.isArray(parsed.evaluations)) {
			return [];
		}

		return parsed.evaluations.flatMap((evaluation): QueueEvaluationDelegationTarget[] => {
			if (!isRecord(evaluation)) {
				return [];
			}

			const agentName = readDisplayText(evaluation.agentName);
			const reportTaskId = readDisplayText(evaluation.reportTaskId);

			if (agentName.length === 0 && reportTaskId.length === 0) {
				return [];
			}

			return [
				{
					name: agentName || reportTaskId,
					details: reportTaskId.length > 0 ? [`응답 ID: ${reportTaskId}`] : []
				}
			];
		});
	} catch {
		return [];
	}
}

function findBalancedObjectText(content: string, startIndex: number) {
	let depth = 0;
	let inString = false;
	let escaped = false;

	for (let index = startIndex; index < content.length; index += 1) {
		const character = content[index];

		if (inString) {
			if (escaped) {
				escaped = false;
			} else if (character === '\\') {
				escaped = true;
			} else if (character === '"') {
				inString = false;
			}

			continue;
		}

		if (character === '"') {
			inString = true;
			continue;
		}

		if (character === '{') {
			depth += 1;
		} else if (character === '}') {
			depth -= 1;

			if (depth === 0) {
				return content.slice(startIndex, index + 1);
			}
		}
	}

	return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

function readDisplayText(value: unknown) {
	return typeof value === 'string' ? value.trim() : '';
}
