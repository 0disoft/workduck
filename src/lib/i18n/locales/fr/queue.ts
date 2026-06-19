export const frQueueMessages = {
	list: 'Fichiers de la file d\'attente',
	detail: 'Détails de la file d\'attente',
	filters: 'Filtres de la file d\'attente',
	contextMenu: 'Actions sur les fichiers de la file d\'attente',
	registeredCount: '{count} fichiers dans la file',
	executionFilters: 'Filtres de statut d\'exécution',
	readFilters: 'Filtres de statut de lecture',
	filterMenu: 'Filtres',
	activeFilterCount: '{count} filtres actifs',
	kindFilter: 'Type',
	priorityFilter: 'Priorité',
	sort: 'Trier',
	allFileKinds: 'Tous les types',
	allPriorities: 'Toutes les priorités',
	sortOptions: {
		'created-desc': 'Plus récent',
		'created-asc': 'Plus ancien',
		'priority-desc': 'Priorité la plus haute',
		'priority-asc': 'Priorité la plus basse'
	},
	pendingCountLabel: '{count} tâches en attente',
	resultReportReview: 'Examen du rapport de résultat',
	workOrderView: 'Vue de l\'ordre de travail',
	workOrderId: 'ID de la tâche',
	proposalView: 'Vue de la proposition',
	empty: 'Ajoutez des rapports ou des ordres de travail.',
	noMatches: 'Aucun fichier correspondant dans la file d\'attente.',
	addWork: 'Ajouter un travail',
	bulkDelete: 'Supprimer en lot',
	includePendingDelete: 'Inclure en attente',
	newWork: 'Nouveau travail',
	editWork: 'Modifier le travail',
	workTitle: 'Titre de la tâche',
	workType: 'Type de tâche',
	workTypes: {
		instruction: 'Instruction',
		directMessage: 'Message direct',
		vote: 'Vote/sélection'
	},
	workPriority: 'Priorité',
	responseLanguage: 'Langue de réponse',
	responseLanguages: {
		auto: 'Même langue que la tâche',
		ko: 'Coréen',
		en: 'Anglais',
		es: 'Espagnol',
		fr: 'Français',
		zh: 'Chinois simplifié',
		hi: 'Hindi'
	},
	responseFormat: 'Format de réponse',
	responseFormats: {
		general: 'Rapport général',
		'pros-cons': 'Avantages et inconvénients',
		'feature-proposal': 'Proposition de fonctionnalité',
		'execution-plan': 'Plan d\'exécution',
		'code-review': 'Revue de code',
		'risk-assessment': 'Évaluation des risques',
		'comparison-table': 'Tableau de comparaison',
		'decision-memo': 'Mémo de décision',
		'bug-analysis': 'Analyse de bug',
		'writing-draft': 'Brouillon de rédaction',
		'revision-draft': 'Brouillon de révision'
	},
	revisionOptions: {
		title: 'Options de révision',
		description: 'Les options sélectionnées sont ajoutées au corps de la tâche.',
		groups: {
			purpose: 'Objectif',
			tone: 'Ton',
			structure: 'Structure',
			format: 'Format'
		},
		options: {
			clarity: 'Rendre le sens évident',
			concise: 'Supprimer le superflu',
			persuasive: 'Accroître la persuasion',
			natural: 'Formulation naturelle',
			formal: 'Plus formel',
			casual: 'Plus informel',
			sharp: 'Plus tranchant',
			warm: 'Plus chaleureux',
			paragraphFlow: 'Améliorer l\'enchaînement des paragraphes',
			sentenceRhythm: 'Ajuster le rythme des phrases',
			headlineLead: 'Renforcer le titre/l\'accroche',
			preserveMeaning: 'Préserver le sens original',
			oneParagraph: 'Un seul paragraphe',
			bulletSummary: 'Inclure les points clés',
			markdownReady: 'Prêt pour Markdown',
			keepLength: 'Conserver une longueur similaire'
		}
	},
	skillOptions: {
		title: 'Options de skill',
		description: 'Choisissez le type, le ton, le format ou d\'autres options configurées par les skills sélectionnées.'
	},
	noProject: 'Aucun projet',
	noRepository: 'Aucun dépôt',
	noSkill: 'Aucune skill',
	noAgent: 'Aucun agent',
	noReference: 'Aucune référence',
	linkedSkill: 'Skill liée',
	assignment: 'Paramètres d\'exécution',
	advancedExecution: 'Paramètres d\'exécution avancés',
	internalSkills: 'Skills internes',
	workProjects: 'Projets associés',
	workRepositories: 'Dépôts associés',
	workAgents: 'Agents d\'exécution',
	workReferences: 'Références de la tâche',
	repositorySearchPlaceholder: 'Rechercher des dépôts',
	selectionCount: '{count} sélectionnés',
	workBody: 'Corps de la tâche',
	directMessageBody: 'Message',
	countLabel: '{current}/{max}',
	vote: {
		question: 'Question',
		options: 'Options',
		optionName: 'Nom de l\'option',
		optionDescription: 'Description',
		addOption: 'Ajouter une option',
		removeOption: 'Supprimer l\'option',
		criteria: 'Critères',
		result: 'Résultat du vote',
		choice: 'Choix',
		count: '{count} votes',
		invalid: '{count} réponses non analysées',
		optionCount: '{count} options',
		unparsed: 'Non analysé'
	},
	structuredResponseFormats: {
		general: {
			summary: 'Résumé',
			strengths: 'Points forts/Preuves',
			recommendations: 'Recommandations',
			cautions: 'Avertissements'
		},
		'pros-cons': {
			summary: 'Verdict',
			strengths: 'Avantages',
			recommendations: 'Jugement',
			cautions: 'Inconvénients'
		},
		'feature-proposal': {
			summary: 'Résumé',
			strengths: 'Preuves',
			recommendations: 'Idées de fonctionnalités',
			cautions: 'Avertissements'
		},
		'execution-plan': {
			summary: 'Objectif',
			strengths: 'Hypothèses',
			recommendations: 'Étapes',
			cautions: 'Risques'
		},
		'code-review': {
			summary: 'Revue générale',
			strengths: 'À conserver',
			recommendations: 'Corrections',
			cautions: 'Problèmes'
		},
		'risk-assessment': {
			summary: 'Verdict des risques',
			strengths: 'Atténuations',
			recommendations: 'Réponses',
			cautions: 'Risques clés'
		},
		'comparison-table': {
			summary: 'Verdict de comparaison',
			strengths: 'Critères',
			recommendations: 'Lignes de comparaison',
			cautions: 'Facteurs de décision'
		},
		'decision-memo': {
			summary: 'Décision',
			strengths: 'Justification',
			recommendations: 'Éléments de décision',
			cautions: 'Vérifications de suivi'
		},
		'bug-analysis': {
			summary: 'Résumé de la cause',
			strengths: 'Faits confirmés',
			recommendations: 'Pistes de correction',
			cautions: 'Risques de reproduction/régression'
		},
		'writing-draft': {
			summary: 'Brouillon final',
			strengths: 'Notes de style/sources',
			recommendations: 'Options de révision',
			cautions: 'Lacunes/hypothèses de sources'
		},
		'revision-draft': {
			summary: 'Brouillon révisé',
			strengths: 'Options de révision appliquées',
			recommendations: 'Autres options de révision',
			cautions: 'Modifications de sens/vérifications'
		}
	},
	createWorkOrder: 'Créer un ordre de travail',
	delegateEvaluation: 'Déléguer l\'évaluation',
	creating: 'Création',
	previewPrompt: 'Aperçu du prompt',
	executeWorkOrder: 'Exécuter',
	retryWorkOrder: 'Réexécuter',
	completeWorkOrder: 'Marquer comme terminé',
	executing: 'Exécution',
	cancelExecution: 'Annuler l\'exécution',
	cancellingExecution: 'Annulation',
	noFollowUpSelected: 'Aucun suivi sélectionné.',
	noEvaluationTargets: 'Aucune réponse à évaluer.',
	evaluationAlreadyDelegated: 'Un ordre de travail de délégation d\'évaluation existe déjà : {relativePath}',
	evaluationDelegated: 'Ordre de travail de délégation d\'évaluation {relativePath} créé.',
	createdFile: 'Fichier {relativePath} créé.',
	updatedFile: 'Fichier {relativePath} mis à jour.',
	deletedFile: 'Fichier {relativePath} supprimé.',
	bulkDeletedFiles: '{count} travaux supprimés.',
	executedFile: 'Fichier {relativePath} créé et ordre de travail terminé.',
	completedFile: 'Fichier {relativePath} terminé.',
	reportNotification: {
		title: 'Le rapport est prêt',
		body: 'Le rapport de résultat {title} est prêt à examiner.'
	},
	nextWorkOrders: 'Ordres de travail suivants',
	promptPreview: {
		title: 'Aperçu du prompt',
		description: 'Examinez les prompts système et utilisateur exacts avant d\'exécuter cet ordre de travail.',
		systemPrompt: 'Prompt système',
		userPrompt: 'Prompt utilisateur',
		characterCount: '{count} caractères'
	},
	priorities: {
		low: 'Basse',
		normal: 'Normale',
		high: 'Haute',
		urgent: 'Urgente'
	},
	executionStates: {
		pending: 'En attente',
		running: 'En cours',
		failed: 'Échec',
		completed: 'Terminé'
	},
	readStates: {
		read: 'Lu',
		unread: 'Non lu'
	},
	fileKinds: {
		resultReport: 'Rapport JSON',
		workOrder: 'Ordre de travail',
		proposal: 'Proposition',
		unsupported: 'Non pris en charge'
	},
	reviewDecisions: {
		approved: 'Approuver',
		needsWork: 'À retravailler',
		rollback: 'Restaurer'
	},
	evaluation: {
		title: 'Évaluer la réponse',
		action: 'Évaluer',
		mode: 'Mode d\'évaluation',
		manual: 'Évaluation manuelle',
		aiDelegated: 'Déléguer à l\'IA',
		copyPrompt: 'Copier le prompt',
		promptCopied: 'Prompt d\'évaluation copié.',
		clipboardUnavailable: 'Le presse-papiers n\'est pas disponible.',
		delegationPrompt: 'Prompt de délégation',
		sourceReport: 'Rapport source',
		workspace: 'Espace de travail',
		criteria: 'Critères',
		targets: 'Cibles',
		command: 'Commande',
		saving: 'Enregistrement',
		saved: 'Évaluation enregistrée.',
		alreadySaved: 'Cette réponse a déjà été évaluée.',
		savedAction: 'Évalué'
	},
	errors: {
		workspaceRequired: 'Le chemin de l\'espace de travail est obligatoire.',
		workspaceNotAbsolute: 'Le chemin de l\'espace de travail doit être absolu.',
		workspaceNotFound: 'Le chemin de l\'espace de travail n\'a pas été trouvé.',
		workspaceNotDirectory: 'Le chemin de l\'espace de travail doit être un dossier.',
		workspacePermissionDenied: 'Le chemin de l\'espace de travail n\'est pas accessible en écriture.',
		workspaceUnreadable: 'Le chemin de l\'espace de travail n\'a pas pu être vérifié.',
		rootInvalid: 'Le dossier de la file d\'attente de travail n\'est pas utilisable.',
		createFailed: 'Le dossier de la file d\'attente de travail n\'a pas pu être créé.',
		openFailed: 'Le dossier de la file d\'attente de travail n\'a pas pu être ouvert.',
		listFailed: 'Les fichiers de la file d\'attente de travail n\'ont pas pu être listés.',
		fileInvalid: 'Le chemin du fichier de la file d\'attente n\'est pas autorisé.',
		fileNotFound: 'Le fichier de la file d\'attente de travail n\'a pas été trouvé.',
		fileReadFailed: 'Le fichier de la file d\'attente de travail n\'a pas pu être lu.',
		fileWriteFailed: 'Le fichier de la file d\'attente de travail n\'a pas pu être écrit.',
		fileDeleteFailed: 'Le fichier de la file d\'attente de travail n\'a pas pu être supprimé.',
		fileAlreadyExists: 'Le fichier de la file d\'attente de travail existe déjà.',
		evaluationDelegationAlreadyExists:
			'Un ordre de travail de délégation d\'évaluation existe déjà pour ce rapport. Supprimez l\'ordre de travail existant avant d\'en créer un autre.',
		unavailable: 'Les dossiers de file d\'attente de travail sont disponibles dans l\'application de bureau.',
		executionNoTask: 'Il n\'y a aucune tâche à exécuter.',
		executionNoAgent: 'Sélectionnez au moins un agent d\'exécution.',
		executionVaultLocked: 'Déverrouillez d\'abord le coffre-fort de l\'environnement.',
		executionWorkOrderRunning: 'Cet ordre de travail est déjà en cours.',
		executionWorkOrderNotRunning: 'Cet ordre de travail n\'est pas en cours.',
		executionWorkOrderArchived: 'Cet ordre de travail est déjà terminé.',
		executionCancelled: 'L\'exécution de l\'ordre de travail a été annulée.',
		executionAgentNotFound: 'L\'agent sélectionné n\'a pas été trouvé.',
		executionSecretNotFound: 'La clé API liée à l\'agent n\'a pas été trouvée.',
		executionProviderUnsupported:
			'Le fournisseur de LLM n\'a pas pu être détecté. Choisissez un fournisseur pour l\'agent ou incluez DeepSeek, OpenAI ou OpenRouter dans le nom ou les tags de la clé API.',
		executionApiKeyRequired: 'La clé API est vide.',
		executionPromptRequired: 'Le prompt de travail n\'a pas pu être créé.',
		executionModelRequired: 'Le modèle n\'a pas pu être sélectionné.',
		executionRequestInvalid: 'La requête LLM était invalide.',
		executionAuthenticationFailed: 'L\'authentification LLM a échoué. Vérifiez la clé API.',
		executionRateLimited: 'La limite de requêtes LLM a été atteinte. Réessayez plus tard.',
		executionProviderRejected: 'Le fournisseur de LLM a rejeté la requête.',
		executionProviderTimeout: 'La requête vers le fournisseur de LLM a expiré. Réessayez plus tard.',
		executionProviderUnavailable: 'Le fournisseur de LLM n\'a pas pu être contacté.',
		executionResponseEmpty: 'La réponse du LLM était vide.',
		executionResponseInvalid: 'La réponse du LLM n\'a pas pu être lue en tant que rapport.',
		executionUnavailable: 'L\'exécution du travail est disponible dans l\'application de bureau.',
		executionUnknown: 'Une erreur d\'exécution de travail inconnue est survenue.',
		workBodyTooLong: 'Le corps de la tâche peut contenir au maximum {max} caractères.'
	}
} as const;
