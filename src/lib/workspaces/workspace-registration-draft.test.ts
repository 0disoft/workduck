import { afterEach, expect, test } from 'bun:test';
import { setWorkspaceRegistrationPath, suggestWorkspaceName, takeWorkspaceRegistrationPath } from './workspace-registration-draft';

afterEach(() => { takeWorkspaceRegistrationPath(); });

test('folder handoff normalizes Windows paths and is consumed by only one registration', () => {
	setWorkspaceRegistrationPath(' \\\\?\\C:\\workspaces\\workduck ');
	expect(takeWorkspaceRegistrationPath()).toBe('C:\\workspaces\\workduck');
	expect(takeWorkspaceRegistrationPath()).toBeNull();
});

test('suggested names handle both separators without using a drive root as a name', () => {
	expect(suggestWorkspaceName('C:\\workspaces\\workduck\\')).toBe('workduck');
	expect(suggestWorkspaceName('/home/developer/projects/')).toBe('projects');
	expect(suggestWorkspaceName('C:\\')).toBe('');
	expect(suggestWorkspaceName('/')).toBe('');
});
