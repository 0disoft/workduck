export const enSkillsMessages = {
		title: 'Skills',
		list: 'Skill list',
		details: 'Skill details',
		registeredCount: '{count} skills',
		newSkill: 'New skill',
		editSkill: 'Edit skill',
		copySkill: 'Copy',
		copyNameSuffix: 'copy',
		saved: 'Saved.',
		removed: 'Removed.',
		removeReferencedWarning:
			'{name} is used by {count} queue files. Click Remove again to delete it anyway.',
		optionGroups: {
			title: 'Work options',
			description: 'Configure the types, tones, and other choices shown when this skill is selected in the queue.',
			empty: 'No work options',
			addGroup: 'Add option group',
			removeGroup: 'Remove option group',
			groupLimit: 'Up to {max} option groups can be saved.',
			groupNameRequired: 'Option group {index} needs a name.',
			groupName: 'Group name',
			selectionMode: 'Selection mode',
			single: 'Choose one',
			multiple: 'Choose multiple',
			options: 'Options',
			addOption: 'Add option',
			removeOption: 'Remove option',
			optionName: 'Option name',
			optionDescription: 'Option description',
			noOptions: 'No options',
			optionRequired: 'Option group {index} needs at least one option.',
			optionLimit: 'Option group {index} can save up to {max} options.',
			optionNameRequired: 'Option {optionIndex} in group {groupIndex} needs a name.',
			countLabel: '{current}/{max}'
		},
		outputTypes: {
			writing: 'Writing',
			revision: 'Revision',
			'work-order': 'Work order',
			proposal: 'Proposal',
			'result-report': 'Result report',
			'agent-evaluation': 'Agent evaluation'
		},
		seedSkills: {
			proposalWriter: {
				name: 'Proposal writer',
				description:
					'Compare options and produce a proposal with recommendation and follow-up work.',
				instructions:
					'Return a workduck.queue-proposal/v1 artifact. Compare viable options, state tradeoffs, choose one recommendation, and include only concrete follow-up work orders when action is needed.'
			},
			writingAssistant: {
				name: 'Writing assistant',
				description: 'Draft or revise writing from a brief, style constraints, and references.',
				instructions:
					'Write the requested piece from the task body and selected references. Treat any Workduck work-order ID as the assignment label, not as extra evidence by itself. Obey explicit controls for paragraph count, sentences per paragraph, tone, audience, point of view, language, format, and forbidden phrases. If the task gives no controls, produce a polished concise draft in the task language. Use selected references as source material without inventing unsupported facts. For writing-draft response format, put the finished draft in summary, put style/source notes in strengths, put optional revision directions in recommendations, and put source gaps or assumptions in cautions.'
			},
			revisionAssistant: {
				name: 'Revision assistant',
				description: 'Revise drafts by selected purpose, tone, structure, and format options.',
				instructions:
					'Revise the provided draft according to the task body, selected references, and checked revision options. Preserve the original meaning and factual claims unless the task explicitly asks to change them. Multiple checked options can apply at once; resolve conflicts by keeping meaning first, then structure, then tone, then format. Use references only as support for factual fixes and do not invent unsupported facts. For revision-draft response format, put the revised text in summary, put the applied revision choices in strengths, put optional remaining revision ideas in recommendations, and put meaning changes, tradeoffs, source gaps, or facts to verify in cautions.'
			},
			codeReviewer: {
				name: 'Code reviewer',
				description: 'Review code or Git diff for correctness, maintainability, security, and runtime risks.',
				instructions:
					'Review the supplied code, file excerpts, or Git diff. Prefer the code-review response format when available. Lead with concrete findings ordered by severity, include file paths and line references when provided, and focus on defects, regressions, maintainability, performance, security, and framework-specific risks. Do not praise broadly or rewrite unrelated code. If evidence is missing, state the review gap instead of inventing context.'
			},
			commitHandoffWriter: {
				name: 'Commit and handoff writer',
				description: 'Turn change summaries into commit messages and continuation handoff notes.',
				instructions:
					'Analyze the supplied changed-file list, diff summary, work report, or task notes. Recommend one or more commit messages without staging, committing, or pushing. When requested, write a handoff that preserves completed work, open tasks, validation evidence, risks, and the next safe action. Do not claim commands were run unless the task supplies that evidence.'
			},
			techDebtJanitor: {
				name: 'Tech-debt janitor',
				description: 'Plan behavior-preserving refactors for legacy, tangled, or duplicated code.',
				instructions:
					'Inspect the supplied code or technical-debt brief and propose behavior-preserving refactoring steps. Preserve public API and business behavior unless the task explicitly allows redesign. Separate safe mechanical cleanup from risky design changes, name tests or checks needed before edits, and avoid broad rewrites without migration steps.'
			},
			releaseNoteWriter: {
				name: 'Release note writer',
				description: 'Create release notes or changelog drafts from commits, completed work, and reports.',
				instructions:
					'Write release notes or a changelog from the supplied commits, work-order reports, issue list, or change summary. Separate user-visible changes from internal maintenance. Do not invent shipped features, dates, version numbers, metrics, or validation evidence. Call out breaking changes, migration notes, and known limitations when evidence is provided.'
			},
			apiSchemaArchitect: {
				name: 'API schema architect',
				description: 'Design API endpoints, command contracts, payloads, and schemas from feature requirements.',
				instructions:
					'Turn the supplied feature requirement into an API or command contract proposal. Define resource or command boundaries, request and response payloads, error cases, validation rules, compatibility notes, and follow-up implementation tasks. Keep schemas aligned with the chosen style and do not claim an endpoint exists unless the task provides that evidence.'
			},
			agentResponseEvaluator: {
				name: 'Agent response evaluator',
				description: 'Evaluate an agent response with the five-criterion 1-9 rubric.',
				instructions:
					'Evaluate the response from only the task and the agent answer. Score problem understanding, logical validity, practical feasibility, creative insight, and risk detection from 1 to 9. Do not reward length by itself. Judge constraints, actionability, evidence, and risk handling. After choosing scores, save them to the same workspace with the workduck agent evaluate command. If the agent has a linked persona, that persona evaluation is updated too.'
			}
		},
		errors: {
			nameRequired: 'Name is required.',
			nameDuplicate: 'Name already exists.',
			outputTypeRequired: 'Output type is required.',
			instructionsRequired: 'Instructions are required.',
			notFound: 'Skill was not found.',
			readFailed: 'Skills could not be read.',
			saveFailed: 'Skills could not be saved.'
		}
	} as const;
