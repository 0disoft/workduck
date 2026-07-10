import { getTauriInvoke } from '$lib/tauri/tauri-invoke';
import { normalizeWorkspacePathForStorage } from '$lib/workspaces/workspace-path-format';
import type { WorkduckMessages } from '$lib/i18n/workduck-message-contract';
import {
	SSEALED_SCAFFOLD_PROFILES,
	SSEALED_SCAFFOLD_SCOPES
} from './ssealed-scaffold-generated';

export type ProjectFolderError =
	| 'project-folder-workspace-required'
	| 'project-folder-workspace-not-absolute'
	| 'project-folder-workspace-not-found'
	| 'project-folder-workspace-not-directory'
	| 'project-folder-workspace-permission-denied'
	| 'project-folder-workspace-unreadable'
	| 'project-folder-root-invalid'
	| 'project-folder-parent-required'
	| 'project-folder-parent-invalid'
	| 'project-folder-parent-not-found'
	| 'project-folder-path-required'
	| 'project-folder-path-invalid'
	| 'project-folder-name-required'
	| 'project-folder-name-invalid'
	| 'project-folder-conflict'
	| 'project-folder-create-failed'
	| 'project-folder-ssealed-scaffold-failed'
	| 'project-folder-ssealed-scaffold-locked'
	| 'project-folder-open-path-required'
	| 'project-folder-open-path-not-absolute'
	| 'project-folder-open-path-not-found'
	| 'project-folder-open-path-not-directory'
	| 'project-folder-open-path-permission-denied'
	| 'project-folder-repository-path-outside-workspace'
	| 'project-folder-open-failed'
	| 'project-folder-delete-path-required'
	| 'project-folder-delete-path-not-absolute'
	| 'project-folder-delete-path-not-found'
	| 'project-folder-delete-path-not-directory'
	| 'project-folder-delete-path-outside-workspace'
	| 'project-folder-delete-path-permission-denied'
	| 'project-folder-delete-failed'
	| 'project-folder-unavailable';

export type SsealedScaffoldApplyScope = (typeof SSEALED_SCAFFOLD_SCOPES)[number];
export type SsealedScaffoldScope = 'none' | SsealedScaffoldApplyScope;
export type SsealedScaffoldProfile = (typeof SSEALED_SCAFFOLD_PROFILES)[number];
export type SsealedScaffoldDensity = 'minimal' | 'standard' | 'strict';
export type SsealedScaffoldFileStatus = 'missing' | 'added' | 'unchanged' | 'conflict';
export type SsealedScaffoldMessages = WorkduckMessages['projects']['ssealedScaffold'];

export interface SsealedScaffoldFilePlan {
	readonly path: string;
	readonly kind: string;
	readonly checksum: string;
	readonly status: SsealedScaffoldFileStatus;
}

export interface SsealedScaffoldPlan {
	readonly toolVersion: string;
	readonly scope: SsealedScaffoldApplyScope;
	readonly profile: SsealedScaffoldProfile;
	readonly density: SsealedScaffoldDensity;
	readonly runner: string;
	readonly files: readonly SsealedScaffoldFilePlan[];
	readonly missingCount: number;
	readonly addedCount: number;
	readonly unchangedCount: number;
	readonly conflictCount: number;
}

export type ProjectFolderCreateResult =
	| {
			readonly ok: true;
			readonly folderName: string;
			readonly relativePath: string;
	  }
	| {
			readonly ok: false;
			readonly error: ProjectFolderError;
	  };

export type ProjectFolderOpenResult =
	| {
			readonly ok: true;
	  }
	| {
			readonly ok: false;
			readonly error: ProjectFolderError;
	  };

export type ProjectFolderDeleteResult =
	| {
			readonly ok: true;
	  }
	| {
			readonly ok: false;
			readonly error: ProjectFolderError;
	  };

export type SsealedScaffoldPlanResult =
	| {
			readonly ok: true;
			readonly plan: SsealedScaffoldPlan;
	  }
	| {
			readonly ok: false;
			readonly error: ProjectFolderError;
	  };

interface ProjectFolderCreateResponse {
	readonly ok: boolean;
	readonly folderName?: string | null;
	readonly relativePath?: string | null;
	readonly error?: ProjectFolderError | null;
}

interface ProjectFolderOpenResponse {
	readonly ok: boolean;
	readonly error?: ProjectFolderError | null;
}

interface ProjectFolderDeleteResponse {
	readonly ok: boolean;
	readonly error?: ProjectFolderError | null;
}

interface SsealedScaffoldFilePlanResponse {
	readonly path?: string | null;
	readonly kind?: string | null;
	readonly checksum?: string | null;
	readonly status?: string | null;
}

interface SsealedScaffoldPlanResponse {
	readonly toolVersion?: string | null;
	readonly scope?: string | null;
	readonly profile?: string | null;
	readonly density?: string | null;
	readonly runner?: string | null;
	readonly files?: readonly SsealedScaffoldFilePlanResponse[] | null;
	readonly missingCount?: number | null;
	readonly addedCount?: number | null;
	readonly unchangedCount?: number | null;
	readonly conflictCount?: number | null;
}

interface SsealedScaffoldPlanResultResponse {
	readonly ok: boolean;
	readonly plan?: SsealedScaffoldPlanResponse | null;
	readonly error?: ProjectFolderError | null;
}

export async function createProjectFolder(
	workspacePath: string,
	folderName: string
): Promise<ProjectFolderCreateResult> {
	return createProjectFolderFromCommand('create_project_folder', {
		workspacePath: normalizeWorkspacePathForStorage(workspacePath),
		folderName
	});
}

export async function createProjectGroupFolder(
	workspacePath: string,
	parentRelativePath: string,
	folderName: string,
	options: {
		readonly ssealedScaffoldScope?: SsealedScaffoldScope;
		readonly ssealedScaffoldProfile?: SsealedScaffoldProfile;
	} = {}
): Promise<ProjectFolderCreateResult> {
	const ssealedScaffoldScope =
		options.ssealedScaffoldScope === undefined || options.ssealedScaffoldScope === 'none'
			? null
			: options.ssealedScaffoldScope;

	return createProjectFolderFromCommand('create_project_group_folder', {
		workspacePath: normalizeWorkspacePathForStorage(workspacePath),
		parentRelativePath,
		folderName,
		ssealedScaffoldScope,
		ssealedScaffoldProfile:
			ssealedScaffoldScope === null
				? null
				: options.ssealedScaffoldProfile ?? getDefaultSsealedScaffoldProfile()
	});
}

export async function ensureProjectFolderPath(
	workspacePath: string,
	relativePath: string
): Promise<ProjectFolderCreateResult> {
	return createProjectFolderFromCommand('ensure_project_folder_path', {
		workspacePath: normalizeWorkspacePathForStorage(workspacePath),
		relativePath
	});
}

export async function openProjectFolderPath(path: string): Promise<ProjectFolderOpenResult> {
	return openProjectFolderFromCommand('open_project_folder_path', {
		path: normalizeWorkspacePathForStorage(path)
	});
}

export async function openProjectNodeFolder(
	workspacePath: string,
	relativePath: string
): Promise<ProjectFolderOpenResult> {
	return openProjectFolderFromCommand('open_project_node_folder', {
		workspacePath: normalizeWorkspacePathForStorage(workspacePath),
		relativePath
	});
}

export async function deleteProjectNodeFolder(
	workspacePath: string,
	relativePath: string
): Promise<ProjectFolderDeleteResult> {
	return deleteProjectFolderFromCommand('delete_project_node_folder', {
		workspacePath: normalizeWorkspacePathForStorage(workspacePath),
		relativePath
	});
}

export async function deleteProjectRepositoryFolder(
	workspacePath: string,
	path: string
): Promise<ProjectFolderDeleteResult> {
	return deleteProjectFolderFromCommand('delete_project_repository_folder', {
		workspacePath: normalizeWorkspacePathForStorage(workspacePath),
		path: normalizeWorkspacePathForStorage(path)
	});
}

export async function previewSsealedScaffoldForRepository(
	workspacePath: string,
	path: string,
	scope: SsealedScaffoldApplyScope,
	profile: SsealedScaffoldProfile
): Promise<SsealedScaffoldPlanResult> {
	return runSsealedScaffoldRepositoryCommand('preview_ssealed_scaffold_for_repository', {
		workspacePath: normalizeWorkspacePathForStorage(workspacePath),
		path: normalizeWorkspacePathForStorage(path),
		ssealedScaffoldScope: scope,
		ssealedScaffoldProfile: profile
	});
}

export async function applySsealedScaffoldToRepository(
	workspacePath: string,
	path: string,
	scope: SsealedScaffoldApplyScope,
	profile: SsealedScaffoldProfile
): Promise<SsealedScaffoldPlanResult> {
	return runSsealedScaffoldRepositoryCommand('apply_ssealed_scaffold_to_repository', {
		workspacePath: normalizeWorkspacePathForStorage(workspacePath),
		path: normalizeWorkspacePathForStorage(path),
		ssealedScaffoldScope: scope,
		ssealedScaffoldProfile: profile
	});
}

export function getDefaultSsealedScaffoldApplyScope(): SsealedScaffoldApplyScope {
	return (
		findPreferredSsealedScaffoldOption(SSEALED_SCAFFOLD_SCOPES, ['general', 'design']) ??
		SSEALED_SCAFFOLD_SCOPES[0]
	);
}

export function getDefaultSsealedScaffoldProfile(): SsealedScaffoldProfile {
	return (
		SSEALED_SCAFFOLD_PROFILES.find((profile) => profile === 'generic') ??
		SSEALED_SCAFFOLD_PROFILES[0]
	);
}

export function getSsealedScaffoldOptionLabel(
	value: string,
	messages?: SsealedScaffoldMessages
) {
	return (
		getSsealedScaffoldMessageRecordValue(messages?.optionLabels, value) ??
		value
		.split('-')
		.filter((part) => part.length > 0)
		.map((part) => (part.toLowerCase() === 'cli' ? 'CLI' : capitalizeSsealedOptionPart(part)))
		.join(' ')
	);
}

export function getSsealedScaffoldScopeDescription(
	scope: SsealedScaffoldApplyScope,
	messages?: SsealedScaffoldMessages
) {
	const label = getSsealedScaffoldOptionLabel(scope, messages);

	return (
		messages?.scopeDescriptions[scope] ??
		messages?.fallbackScopeDescription.replace('{label}', label) ??
		ssealedScaffoldScopeDescriptions[scope] ??
		`Use the ${label} ssealed scaffold.`
	);
}

export function getSsealedScaffoldProfileDescription(
	profile: SsealedScaffoldProfile,
	messages?: SsealedScaffoldMessages
) {
	const label = getSsealedScaffoldOptionLabel(profile, messages);

	return (
		messages?.profileDescriptions[profile] ??
		messages?.fallbackProfileDescription.replace('{label}', label) ??
		ssealedScaffoldProfileDescriptions[profile] ??
		`Tune the scaffold for a ${label} repository.`
	);
}

export function getSsealedScaffoldScopeOptionText(
	scope: SsealedScaffoldApplyScope,
	messages?: SsealedScaffoldMessages
) {
	return formatSsealedScaffoldOptionText(
		getSsealedScaffoldOptionLabel(scope, messages),
		getSsealedScaffoldScopeDescription(scope, messages),
		messages
	);
}

export function getSsealedScaffoldProfileOptionText(
	profile: SsealedScaffoldProfile,
	messages?: SsealedScaffoldMessages
) {
	return formatSsealedScaffoldOptionText(
		getSsealedScaffoldOptionLabel(profile, messages),
		getSsealedScaffoldProfileDescription(profile, messages),
		messages
	);
}

export function isSsealedScaffoldApplyScope(value: unknown): value is SsealedScaffoldApplyScope {
	return typeof value === 'string' && stringListIncludes(SSEALED_SCAFFOLD_SCOPES, value);
}

export function isSsealedScaffoldScope(value: unknown): value is SsealedScaffoldScope {
	return value === 'none' || isSsealedScaffoldApplyScope(value);
}

export function isSsealedScaffoldProfile(value: unknown): value is SsealedScaffoldProfile {
	return typeof value === 'string' && stringListIncludes(SSEALED_SCAFFOLD_PROFILES, value);
}

function normalizeProjectRelativePath(path: string) {
	return path.trim().replaceAll('\\', '/');
}

async function createProjectFolderFromCommand(
	command: 'create_project_folder' | 'create_project_group_folder' | 'ensure_project_folder_path',
	args: Record<string, unknown>
): Promise<ProjectFolderCreateResult> {
	const invoke = getTauriInvoke();

	if (invoke === undefined) {
		return { ok: false, error: 'project-folder-unavailable' };
	}

	try {
		const response = await invoke<ProjectFolderCreateResponse>(command, args);

		if (
			response.ok &&
			typeof response.folderName === 'string' &&
			typeof response.relativePath === 'string'
		) {
			return {
				ok: true,
				folderName: response.folderName,
				relativePath: normalizeProjectRelativePath(response.relativePath)
			};
		}

		return {
			ok: false,
			error: isProjectFolderError(response.error)
				? response.error
				: 'project-folder-create-failed'
		};
	} catch {
		return { ok: false, error: 'project-folder-create-failed' };
	}
}

async function openProjectFolderFromCommand(
	command: 'open_project_folder_path' | 'open_project_node_folder',
	args: Record<string, unknown>
): Promise<ProjectFolderOpenResult> {
	const invoke = getTauriInvoke();

	if (invoke === undefined) {
		return { ok: false, error: 'project-folder-unavailable' };
	}

	try {
		const response = await invoke<ProjectFolderOpenResponse>(command, args);

		if (response.ok) {
			return { ok: true };
		}

		return {
			ok: false,
			error: isProjectFolderError(response.error)
				? response.error
				: 'project-folder-open-failed'
		};
	} catch {
		return { ok: false, error: 'project-folder-open-failed' };
	}
}

async function deleteProjectFolderFromCommand(
	command: 'delete_project_node_folder' | 'delete_project_repository_folder',
	args: Record<string, unknown>
): Promise<ProjectFolderDeleteResult> {
	const invoke = getTauriInvoke();

	if (invoke === undefined) {
		return { ok: false, error: 'project-folder-unavailable' };
	}

	try {
		const response = await invoke<ProjectFolderDeleteResponse>(command, args);

		if (response.ok) {
			return { ok: true };
		}

		return {
			ok: false,
			error: isProjectFolderError(response.error)
				? response.error
				: 'project-folder-delete-failed'
		};
	} catch {
		return { ok: false, error: 'project-folder-delete-failed' };
	}
}

async function runSsealedScaffoldRepositoryCommand(
	command: 'preview_ssealed_scaffold_for_repository' | 'apply_ssealed_scaffold_to_repository',
	args: Record<string, unknown>
): Promise<SsealedScaffoldPlanResult> {
	const invoke = getTauriInvoke();

	if (invoke === undefined) {
		return { ok: false, error: 'project-folder-unavailable' };
	}

	try {
		const response = await invoke<SsealedScaffoldPlanResultResponse>(command, args);
		const plan = normalizeSsealedScaffoldPlan(response.plan);

		if (response.ok && plan !== null) {
			return { ok: true, plan };
		}

		return {
			ok: false,
			error: isProjectFolderError(response.error)
				? response.error
				: 'project-folder-ssealed-scaffold-failed'
		};
	} catch {
		return { ok: false, error: 'project-folder-ssealed-scaffold-failed' };
	}
}

function normalizeSsealedScaffoldPlan(
	plan: SsealedScaffoldPlanResponse | null | undefined
): SsealedScaffoldPlan | null {
	if (
		plan === null ||
		plan === undefined ||
		typeof plan.toolVersion !== 'string' ||
		!isSsealedScaffoldApplyScope(plan.scope) ||
		!isSsealedScaffoldProfile(plan.profile) ||
		!isSsealedScaffoldDensity(plan.density) ||
		typeof plan.runner !== 'string' ||
		!Array.isArray(plan.files) ||
		typeof plan.missingCount !== 'number' ||
		typeof plan.addedCount !== 'number' ||
		typeof plan.unchangedCount !== 'number' ||
		typeof plan.conflictCount !== 'number'
	) {
		return null;
	}

	const files = plan.files
		.map(normalizeSsealedScaffoldFilePlan)
		.filter((file): file is SsealedScaffoldFilePlan => file !== null);

	if (files.length !== plan.files.length) {
		return null;
	}

	return {
		toolVersion: plan.toolVersion,
		scope: plan.scope,
		profile: plan.profile,
		density: plan.density,
		runner: plan.runner,
		files,
		missingCount: plan.missingCount,
		addedCount: plan.addedCount,
		unchangedCount: plan.unchangedCount,
		conflictCount: plan.conflictCount
	};
}

function normalizeSsealedScaffoldFilePlan(
	file: SsealedScaffoldFilePlanResponse
): SsealedScaffoldFilePlan | null {
	if (
		typeof file.path !== 'string' ||
		typeof file.kind !== 'string' ||
		typeof file.checksum !== 'string' ||
		!isSsealedScaffoldFileStatus(file.status)
	) {
		return null;
	}

	return {
		path: file.path,
		kind: file.kind,
		checksum: file.checksum,
		status: file.status
	};
}

function isSsealedScaffoldDensity(value: unknown): value is SsealedScaffoldDensity {
	return value === 'minimal' || value === 'standard' || value === 'strict';
}

function capitalizeSsealedOptionPart(value: string) {
	const firstCharacter = value.at(0);

	return firstCharacter === undefined
		? value
		: `${firstCharacter.toUpperCase()}${value.slice(1)}`;
}

function formatSsealedScaffoldOptionText(
	label: string,
	description: string,
	messages: SsealedScaffoldMessages | undefined
) {
	return (messages?.optionText ?? '{label} - {description}')
		.replace('{label}', label)
		.replace('{description}', description);
}

function getSsealedScaffoldMessageRecordValue(
	messages: Readonly<Record<string, string>> | undefined,
	key: string
) {
	return messages?.[key];
}

const ssealedScaffoldScopeDescriptions: Readonly<Record<string, string>> = {
	backend: 'Server APIs, databases, jobs, and backend ownership docs.',
	frontend: 'Browser UI, routes, components, and client behavior docs.',
	fullstack: 'Frontend and backend boundaries for one application repo.',
	general: 'Product and architecture docs when the stack is not decided yet.',
	mobile: 'Mobile app ownership, release, device, and runtime docs.',
	infra: 'Infrastructure, deployment, operations, and runbook docs.',
	data: 'Data pipeline, lineage, quality, and analytics contract docs.'
};

const ssealedScaffoldProfileDescriptions: Readonly<Record<string, string>> = {
	generic: 'Neutral defaults for an ordinary repository.',
	'cli-tool': 'Command-line tools with command, option, and release docs.',
	'api-service': 'HTTP or RPC services with API contracts and operation docs.',
	'desktop-app': 'Desktop apps with packaging, update, and runtime docs.',
	library: 'Reusable packages with public API and compatibility docs.',
	'web-app': 'Web applications with routing, rendering, and deployment docs.',
	'mobile-app': 'Mobile applications with platform, store, and device docs.',
	sdk: 'Developer SDKs with client API and versioning docs.',
	'worker-service': 'Background workers, queues, schedulers, and retry docs.',
	'infra-module': 'Infrastructure modules with plan, apply, and rollback docs.',
	'data-pipeline': 'Ingestion, transformation, lineage, and data quality docs.',
	'github-action': 'GitHub Actions with inputs, permissions, and release docs.',
	'browser-extension': 'Browser extensions with permissions and store release docs.',
	plugin: 'Plugin-style integrations with host contracts and lifecycle docs.',
	'docs-site': 'Documentation sites with navigation and publishing docs.',
	monorepo: 'Multi-package repositories with workspace and ownership docs.'
};

function findPreferredSsealedScaffoldOption<const Option extends string>(
	values: readonly Option[],
	preferredValues: readonly string[]
): Option | undefined {
	return preferredValues.find((value): value is Option => stringListIncludes(values, value));
}

function stringListIncludes(values: readonly string[], value: string) {
	return values.includes(value);
}

function isSsealedScaffoldFileStatus(value: unknown): value is SsealedScaffoldFileStatus {
	return (
		value === 'missing' ||
		value === 'added' ||
		value === 'unchanged' ||
		value === 'conflict'
	);
}

function isProjectFolderError(value: unknown): value is ProjectFolderError {
	return (
		value === 'project-folder-workspace-required' ||
		value === 'project-folder-workspace-not-absolute' ||
		value === 'project-folder-workspace-not-found' ||
		value === 'project-folder-workspace-not-directory' ||
		value === 'project-folder-workspace-permission-denied' ||
		value === 'project-folder-workspace-unreadable' ||
		value === 'project-folder-root-invalid' ||
		value === 'project-folder-parent-required' ||
		value === 'project-folder-parent-invalid' ||
		value === 'project-folder-parent-not-found' ||
		value === 'project-folder-path-required' ||
		value === 'project-folder-path-invalid' ||
		value === 'project-folder-name-required' ||
		value === 'project-folder-name-invalid' ||
		value === 'project-folder-conflict' ||
		value === 'project-folder-create-failed' ||
		value === 'project-folder-ssealed-scaffold-failed' ||
		value === 'project-folder-ssealed-scaffold-locked' ||
		value === 'project-folder-open-path-required' ||
		value === 'project-folder-open-path-not-absolute' ||
		value === 'project-folder-open-path-not-found' ||
		value === 'project-folder-open-path-not-directory' ||
		value === 'project-folder-open-path-permission-denied' ||
		value === 'project-folder-repository-path-outside-workspace' ||
		value === 'project-folder-open-failed' ||
		value === 'project-folder-delete-path-required' ||
		value === 'project-folder-delete-path-not-absolute' ||
		value === 'project-folder-delete-path-not-found' ||
		value === 'project-folder-delete-path-not-directory' ||
		value === 'project-folder-delete-path-outside-workspace' ||
		value === 'project-folder-delete-path-permission-denied' ||
		value === 'project-folder-delete-failed' ||
		value === 'project-folder-unavailable'
	);
}
