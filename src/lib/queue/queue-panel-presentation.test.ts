import { plugin, Transpiler } from 'bun';
import { expect, test } from 'bun:test';
import { compileModule } from 'svelte/compiler';
import { createEmptyAgentRegistry, upsertAgent, type AgentRecord } from '#lib/agents/agent-registry.ts';
import { getWorkduckMessages } from '#lib/i18n/workduck-language.ts';
import { addProjectNode, createEmptyProjectRegistry } from '#lib/projects/project-registry.ts';
import { createEmptyReferenceRegistry, upsertReference } from '#lib/references/reference-registry.ts';
import { getDefaultSkills } from '#lib/skills/skill-registry.ts';
import { getRecordLabelById, getSkillDisplayName } from './queue-panel-labels';

await plugin({
	name: 'queue-presentation-runes',
	setup(build) {
		build.onLoad({ filter: /queue-panel-presentation(?:-harness)?\.svelte\.ts$/ }, async ({ path }) => {
			const source = new Transpiler({ loader: 'ts' }).transformSync(await Bun.file(path).text());
			return { contents: compileModule(source, { filename: path, generate: 'client' }).js.code, loader: 'js' };
		});
	}
});
const { createQueuePanelPresentationHarness } = await import('./queue-panel-presentation-harness.svelte');

function catalogs() {
	const agent = upsertAgent(createEmptyAgentRegistry('workspace'), { name: 'First agent', environmentSecretId: 'secret' });
	const project = addProjectNode(createEmptyProjectRegistry('workspace'), { kind: 'project', name: 'First project', path: 'projects/demo' });
	const reference = upsertReference(createEmptyReferenceRegistry('workspace'), { title: 'First reference', sourceUrl: '', content: 'Reference', tags: [] });
	if (!agent.ok || !project.ok || !reference.ok) throw new Error('invalid fixture');
	return {
		skills: getDefaultSkills(), agents: agent.registry.agents, projects: project.registry.nodes,
		references: reference.registry.references,
		repositories: [{ id: 'repository', name: 'Repository', label: 'Project / Repository', description: '', tags: [], searchText: 'repository' }]
	};
}

test('Queue context names preserve first matches, unknown IDs, task order, and source ordering', () => {
	const initial = catalogs();
	const duplicated = {
		...initial,
		skills: [...initial.skills,
			{ ...initial.skills[0]!, id: 'custom', name: 'Zeta custom' },
			{ ...initial.skills[0]!, id: 'custom', name: 'Alpha custom' }
		],
		agents: [...initial.agents, { ...initial.agents[0]!, name: 'Later agent' }],
		projects: [...initial.projects, { ...initial.projects[0]!, name: 'Later project' }],
		references: [...initial.references, { ...initial.references[0]!, title: 'Later reference' }],
		repositories: [...initial.repositories, { ...initial.repositories[0]!, label: 'Later repository' }]
	};
	const harness = createQueuePanelPresentationHarness(duplicated);
	try {
		const view = harness.presentation;
		for (const id of ['missing', initial.agents[0]!.id]) {
			expect(view.getAgentLabelById(id)).toBe(getRecordLabelById(duplicated.agents, id, value => value.name));
		}
		expect(view.getProjectLabelById(initial.projects[0]!.id)).toBe('First project');
		expect(view.getReferenceLabelById(initial.references[0]!.id)).toBe('First reference');
		expect(view.getRepositoryLabelById('repository')).toBe('Project / Repository');
		expect(view.getSkillLabelById('custom')).toBe('Alpha custom');
		for (const skill of initial.skills) {
			expect(view.getSkillLabelById(skill.id)).toBe(getSkillDisplayName(getWorkduckMessages('en'), skill));
		}
		const task = { id: 'task', title: 'Task', body: 'Body', agentIds: ['missing', initial.agents[0]!.id, 'missing'] };
		expect(view.getQueueTaskAgentLabels(task)).toEqual(['missing', 'First agent', 'missing']);
		expect(view.getSkillLabelById('missing')).toBe('missing');
		expect(view.getProjectLabelById('missing')).toBe('missing');
		expect(view.getRepositoryLabelById('missing')).toBe('missing');
		expect(view.getReferenceLabelById('missing')).toBe('missing');
		expect(initial.skills.map(skill => skill.id)).toEqual(getDefaultSkills().map(skill => skill.id));
	} finally { harness.dispose(); }
});

test('Queue context names and skill ordering follow current catalogs and language', () => {
	const initial = catalogs();
	const harness = createQueuePanelPresentationHarness(initial);
	try {
		const skill = initial.skills[0]!;
		const agentId = initial.agents[0]!.id;
		expect(harness.presentation.getAgentLabelById(agentId)).toBe('First agent');
		harness.setLanguage('ko');
		expect(harness.presentation.getSkillLabelById(skill.id)).toBe(getSkillDisplayName(getWorkduckMessages('ko'), skill));
		const renamed = initial.agents.map(agent => ({ ...agent, name: 'Renamed agent' }));
		harness.setCatalogs({ ...initial, agents: renamed });
		expect(harness.presentation.getAgentLabelById(agentId)).toBe('Renamed agent');
		harness.setCatalogs({ ...initial, agents: [] });
		expect(harness.presentation.getAgentLabelById(agentId)).toBe(agentId);
		const expected = [...initial.skills].sort((left, right) =>
			getSkillDisplayName(getWorkduckMessages('ko'), left).localeCompare(getSkillDisplayName(getWorkduckMessages('ko'), right), undefined, { numeric: true, sensitivity: 'base' }));
		expect(harness.presentation.allSkills.map(value => value.id)).toEqual(expected.map(value => value.id));
	} finally { harness.dispose(); }
});

test('repeated context label lookups do not rescan unchanged catalog IDs', () => {
	const initial = catalogs();
	let idReads = 0;
	const agents = Array.from({ length: 64 }, (_, index): AgentRecord => ({
		...initial.agents[0]!, get id() { idReads += 1; return `agent_${index}`; }, name: `Agent ${index}`
	}));
	const harness = createQueuePanelPresentationHarness({ ...initial, agents });
	try {
		expect(harness.presentation.getAgentLabelById('agent_63')).toBe('Agent 63');
		idReads = 0;
		for (let index = 0; index < 100; index += 1) {
			expect(harness.presentation.getAgentLabelById('agent_63')).toBe('Agent 63');
		}
		expect(idReads).toBe(0);
	} finally { harness.dispose(); }
});
