export const frAgentsMessages = {
	title: 'Agents',
	list: 'Liste des agents',
	details: 'Détails de l\'agent',
	registeredCount: '{count} agents',
	newAgent: 'Nouvel agent',
	editAgent: 'Modifier l\'agent',
	provider: 'Fournisseur',
	model: 'Modèle',
	modelId: 'ID du modèle',
	defaultModel: 'Modèle par défaut',
	customModel: 'Modèle personnalisé',
	apiKeyPlaceholder: 'Sélectionnez une clé API',
	vaultLockedHint:
		'Le coffre-fort de l\'environnement est verrouillé. Déverrouillez-le dans Environnement avant de créer un nouvel agent.',
	noLlmApiKeysHint:
		'Aucune clé API n\'est étiquetée pour une utilisation LLM. Ajoutez une clé API dans Environnement et donnez-lui le tag llm.',
	missingApiKeyHint:
		'La clé API liée n\'a pas été trouvée dans le coffre-fort actuel. Sélectionnez une autre clé ou vérifiez l\'Environnement.',
	removeConfirm: 'Supprimer l\'agent "{name}" ?',
	providers: {
		auto: 'Auto',
		openrouter: 'OpenRouter',
		deepseek: 'DeepSeek',
		openai: 'OpenAI'
	},
	saved: 'Enregistré.',
	removed: 'Supprimé.',
	evaluation: {
		title: 'Évaluation',
		overviewTitle: 'Aperçu des évaluations',
		overviewEmpty: 'Aucun agent enregistré.',
		empty: 'Aucune évaluation',
		noScore: '-',
		rankBy: 'Classer par',
		overallScore: 'Score global',
		count: '{count} évaluations',
		reset: 'Réinitialiser les évaluations',
		resetConfirm: 'Réinitialiser les évaluations accumulées de cet agent ?',
		resetSaved: 'Les évaluations ont été réinitialisées.',
		resetAt: 'Réinitialisé le : {date}',
		criteria: {
			problemUnderstanding: {
				label: 'Compréhension du problème',
				description: 'Évalue si l\'intention réelle, les contraintes et le contexte ont été compris.'
			},
			logicalValidity: {
				label: 'Validité logique',
				description: 'Évalue si les affirmations et conclusions évitent les sauts logiques non justifiés.'
			},
			practicalFeasibility: {
				label: 'Faisabilité pratique',
				description: 'Évalue si la réponse est applicable compte tenu des contraintes réelles du marché, de l\'équipe et de la technique.'
			},
			creativeInsight: {
				label: 'Perspicacité créative',
				description: 'Évalue si la réponse offre un nouvel angle utile plutôt qu\'une simple reformulation d\'idées connues.'
			},
			riskDetection: {
				label: 'Détection des risques',
				description: 'Évalue si les modes de défaillance, les coûts cachés et les effets secondaires ont été identifiés.'
			}
		}
	},
	errors: {
		nameRequired: 'Le nom est obligatoire.',
		authRequired: 'Sélectionnez une clé API.',
		nameDuplicate: 'Le nom existe déjà.',
		notFound: 'L\'agent n\'a pas été trouvé.',
		readFailed: 'Les agents n\'ont pas pu être lus.',
		saveFailed: 'Les agents n\'ont pas pu être enregistrés.'
	}
} as const;
