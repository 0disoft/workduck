/* llmnav/1 module
id=workduck.workspace.registration
role=Register a workspace from one submitted form snapshot across directory validation, password hashing, conditional persistence, unlocking, and optional repository preparation.
owns=submitted registration snapshot|registration staging|post-commit unlock|repository option continuity
excludes=registry storage transport|password hash implementation|registration form rendering
search=workspace registration password race|submitted workspace options|registration commit before unlock
invariant=All registration stages use the same submitted password and options; failed persistence cannot unlock or prepare a repository; later form edits survive completion.
stability=architecture
*/
import { addWorkspace, type WorkspaceRecord, type WorkspaceRegistry, type WorkspaceRegistryError } from './workspace-registry';
import { validateWorkspacePath, type WorkspacePathValidationError } from './workspace-path';
import { createWorkspacePasswordHash, type WorkspacePasswordError } from './workspace-password';
import { markWorkspaceUnlocked } from './workspace-unlock';
import { setupWorkspaceRepository, type WorkspaceRepositorySetupResult } from './workspace-repository-setup';

export interface WorkspaceRegistrationInput {
	readonly name: string;
	readonly path: string;
	readonly password: string;
	readonly repositoryChoice: 'no' | 'yes' | null;
	readonly initializeGit: boolean;
	readonly installGitignore: boolean;
}

interface WorkspaceRegistrationContext {
	readonly getRegistry: () => WorkspaceRegistry;
	readonly persistRegistry: (registry: WorkspaceRegistry, expected: WorkspaceRegistry) => Promise<boolean>;
}

type WorkspaceRegistrationResult =
	| { readonly ok: true; readonly workspace: WorkspaceRecord; readonly repositorySetup: WorkspaceRepositorySetupResult | null }
	| { readonly ok: false; readonly phase: 'preparation'; readonly error: WorkspaceRegistryError | WorkspacePathValidationError | WorkspacePasswordError | 'workspace-repository-choice-required' }
	| { readonly ok: false; readonly phase: 'persistence' };

export async function registerWorkspace(
	input: WorkspaceRegistrationInput,
	context: WorkspaceRegistrationContext
): Promise<WorkspaceRegistrationResult> {
	// Copy primitive values before the first await; the caller may keep editing.
	const submitted = { ...input };
	if (submitted.repositoryChoice === null) return { ok: false, phase: 'preparation', error: 'workspace-repository-choice-required' };
	if (submitted.password.trim().length === 0) return { ok: false, phase: 'preparation', error: 'workspace-password-required' };
	const path = await validateWorkspacePath(submitted.path);
	if (!path.ok) return { ok: false, phase: 'preparation', error: path.error };
	const hash = await createWorkspacePasswordHash(submitted.password);
	if (!hash.ok) return { ok: false, phase: 'preparation', error: hash.error };
	const expected = context.getRegistry();
	const added = addWorkspace(expected, { name: submitted.name, path: path.path, passwordHash: hash.passwordHash });
	if (!added.ok) return { ok: false, phase: 'preparation', error: added.error };
	if (!await context.persistRegistry(added.registry, expected)) return { ok: false, phase: 'persistence' };
	markWorkspaceUnlocked(added.workspace.id, submitted.password);
	const repositorySetup = submitted.repositoryChoice === 'yes'
		? await setupWorkspaceRepository(added.workspace.path, {
			initializeGit: submitted.initializeGit, installGitignore: submitted.installGitignore
		}) : null;
	return { ok: true, workspace: added.workspace, repositorySetup };
}

export function isWorkspaceRegistrationInputEqual(
	left: WorkspaceRegistrationInput,
	right: WorkspaceRegistrationInput
) {
	return left.name === right.name && left.path === right.path && left.password === right.password &&
		left.repositoryChoice === right.repositoryChoice && left.initializeGit === right.initializeGit &&
		left.installGitignore === right.installGitignore;
}
