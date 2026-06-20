export const enAgentsMessages = {
		title: 'Agents',
		list: 'Agent list',
		details: 'Agent details',
		registeredCount: '{count} agents',
		newAgent: 'New agent',
		editAgent: 'Edit agent',
		provider: 'Provider',
		model: 'Model',
		modelId: 'Model ID',
		defaultModel: 'Default model',
		customModel: 'Custom model',
		apiKeyPlaceholder: 'Select an API key',
		vaultLockedHint:
			'The environment vault is locked. Unlock it in Environment before creating a new agent.',
		noLlmApiKeysHint:
			'No API keys are tagged for LLM use. Add an API key in Environment and give it the llm tag.',
		missingApiKeyHint:
			'The linked API key was not found in the current vault. Select another key or check Environment.',
		removeConfirm: 'Remove agent "{name}"?',
		providers: {
			auto: 'Auto',
			openrouter: 'OpenRouter',
			umans: 'Umans',
			deepseek: 'DeepSeek',
			openai: 'OpenAI'
		},
		saved: 'Saved.',
		removed: 'Removed.',
		evaluation: {
			title: 'Evaluation',
			overviewTitle: 'Evaluation overview',
			overviewEmpty: 'No agents registered.',
			empty: 'No evaluations',
			noScore: '-',
			rankBy: 'Rank by',
			overallScore: 'Overall score',
			count: '{count} evaluations',
			reset: 'Reset evaluations',
			resetConfirm: "Reset this agent's accumulated evaluations?",
			resetSaved: 'Evaluations were reset.',
			resetAt: 'Reset at: {date}',
			criteria: {
				problemUnderstanding: {
					label: 'Problem understanding',
					description: 'Tracks whether the real intent, constraints, and context were understood.'
				},
				logicalValidity: {
					label: 'Logical validity',
					description: 'Tracks whether claims and conclusions avoid unsupported leaps.'
				},
				practicalFeasibility: {
					label: 'Practical feasibility',
					description: 'Tracks whether the answer can work under real market, team, and technical constraints.'
				},
				creativeInsight: {
					label: 'Creative insight',
					description: 'Tracks whether the answer offers a useful new angle rather than a familiar remix.'
				},
				riskDetection: {
					label: 'Risk detection',
					description: 'Tracks whether failure modes, hidden costs, and side effects were identified.'
				}
			}
		},
		errors: {
			nameRequired: 'Name is required.',
			authRequired: 'Select an API key.',
			nameDuplicate: 'Name already exists.',
			notFound: 'Agent was not found.',
			readFailed: 'Agents could not be read.',
			saveFailed: 'Agents could not be saved.'
		}
	} as const;
