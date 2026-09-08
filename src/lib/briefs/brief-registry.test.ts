import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { workduckLanguageOptions } from '$lib/i18n/workduck-language-options';
import { briefMessages } from './brief-messages';
import {
	BRIEF_INSTRUCTIONS_MAX_LENGTH, createEmptyBriefRegistry, exportBriefForCodex,
	listBriefRepositoryChoices, parseBriefRegistry, saveBriefDraft, setBriefArchived,
	type BriefDraft
} from './brief-registry';
import type { ProjectRegistry } from '$lib/projects/project-registry';

const now = '2026-09-08T00:00:00.000Z';
const draft: BriefDraft = {
	id: 'brief-1', title: 'Fix the build', instructions: 'Run the configured build check.',
	project: { kind: 'project', id: 'project-1', label: 'Example' },
	repository: { kind: 'repo', id: 'repo-1', label: 'api' }, repositoryPath: 'projects/example/api'
};

describe('durable agent briefs', () => {
	test('creates, reopens, edits, archives, and restores without changing identity', () => {
		const created = saveBriefDraft(createEmptyBriefRegistry('ws-1'), draft, now)!;
		assert.equal(created.briefs[0]?.id, 'brief-1');
		const reopened = parseBriefRegistry(JSON.stringify(created), 'ws-1')!;
		assert.deepEqual(reopened, created);
		const edited = saveBriefDraft(reopened, { ...draft, title: 'New title' }, '2026-09-08T01:00:00.000Z')!;
		assert.equal(edited.briefs.length, 1);
		assert.equal(edited.briefs[0]?.createdAt, now);
		assert.equal(edited.briefs[0]?.title, 'New title');
		const archived = setBriefArchived(edited, 'brief-1', true, now);
		assert.equal(saveBriefDraft(archived, draft, now), null);
		assert.equal(setBriefArchived(archived, 'brief-1', false, now).briefs[0]?.archived, false);
	});

	test('rejects corrupt, future, cross-workspace, duplicate, and extra-field data', () => {
		const registry = saveBriefDraft(createEmptyBriefRegistry('ws-1'), draft, now)!;
		assert.equal(parseBriefRegistry('{', 'ws-1'), null);
		assert.equal(parseBriefRegistry(JSON.stringify(registry), 'ws-2'), null);
		for (const value of [
			{ ...registry, version: 2 }, { ...registry, revision: -1 },
			{ ...registry, revision: 1.5 }, { ...registry, futureData: true },
			{ ...registry, briefs: [registry.briefs[0], registry.briefs[0]] },
			{ ...registry, briefs: [{ ...registry.briefs[0], instructions: '' }] }
		]) assert.equal(parseBriefRegistry(JSON.stringify(value), 'ws-1'), null);
	});

	test('rejects blank and oversized input without modifying the previous registry', () => {
		const registry = createEmptyBriefRegistry('ws-1');
		assert.equal(saveBriefDraft(registry, { ...draft, title: '  ' }, now), null);
		assert.equal(saveBriefDraft(registry, { ...draft, instructions: 'x'.repeat(BRIEF_INSTRUCTIONS_MAX_LENGTH + 1) }, now), null);
		assert.deepEqual(registry.briefs, []);
	});

	test('uses stable references and reuses the Codex export compiler', () => {
		const brief = saveBriefDraft(createEmptyBriefRegistry('ws-1'), draft, now)!.briefs[0]!;
		const output = exportBriefForCodex(brief);
		assert.equal(output.filename, 'codex-brief.md');
		assert.match(output.content, /agent-brief:brief-1/);
		assert.match(output.content, /project:project-1/);
		assert.match(output.content, /repo:repo-1/);
		assert.ok(output.content.includes(draft.instructions));
	});

	test('resolves a grouped repository to its owning project without matching titles', () => {
		const base = { description: '', path: 'projects/example', githubCredentialSecretId: null, tags: [], createdAt: now, updatedAt: now };
		const repository = { name: 'api', path: 'projects/example/api', remoteUrl: null, upstreamRemoteUrl: null, githubCredentialSecretId: null, favorite: false, tags: [], createdAt: now, updatedAt: now };
		const registry: ProjectRegistry = { version: 1, workspaceId: 'ws-1', updatedAt: now, nodes: [
			{ ...base, id: 'project-1', kind: 'project', parentId: null, name: 'Same', repositories: [] },
			{ ...base, id: 'group-1', kind: 'group', parentId: 'project-1', name: 'Same', repositories: [{ ...repository, id: 'repo-1' }] },
			{ ...base, id: 'project-2', kind: 'project', parentId: null, name: 'Same', repositories: [{ ...repository, id: 'repo-2' }] }
		] };
		assert.deepEqual(listBriefRepositoryChoices(registry).map((choice) => [choice.project.id, choice.repository.id]), [
			['project-1', 'repo-1'], ['project-2', 'repo-2']
		]);
	});

	test('provides all brief messages in each supported language', () => {
		const keys = Object.keys(briefMessages.en).sort();
		for (const language of workduckLanguageOptions) {
			assert.deepEqual(Object.keys(briefMessages[language.id]).sort(), keys);
			assert.ok(Object.values(briefMessages[language.id]).every((value) => value.trim().length > 0));
		}
	});
});
