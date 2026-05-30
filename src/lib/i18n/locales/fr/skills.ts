export const frSkillsMessages = {
	title: 'Skills',
	list: 'Liste des skills',
	details: 'Détails de la skill',
	registeredCount: '{count} skills',
	newSkill: 'Nouvelle skill',
	editSkill: 'Modifier la skill',
	copySkill: 'Copier',
	copyNameSuffix: 'copie',
	saved: 'Enregistré.',
	removed: 'Supprimé.',
	removeReferencedWarning:
		'{name} est utilisé par {count} fichiers de la file d\'attente. Cliquez à nouveau sur Supprimer pour le supprimer quand même.',
	optionGroups: {
		title: 'Options de travail',
		description: 'Configurez les types, tons et autres options affichés lorsque cette skill est sélectionnée dans la file d\'attente.',
		empty: 'Aucune option de travail',
		addGroup: 'Ajouter un groupe d\'options',
		removeGroup: 'Supprimer le groupe d\'options',
		groupLimit: 'Jusqu\'à {max} groupes d\'options peuvent être enregistrés.',
		groupNameRequired: 'Le groupe d\'options {index} doit avoir un nom.',
		groupName: 'Nom du groupe',
		selectionMode: 'Mode de sélection',
		single: 'Choisir une option',
		multiple: 'Choisir plusieurs options',
		options: 'Options',
		addOption: 'Ajouter une option',
		removeOption: 'Supprimer l\'option',
		optionName: 'Nom de l\'option',
		optionDescription: 'Description de l\'option',
		noOptions: 'Aucune option',
		optionRequired: 'Le groupe d\'options {index} doit contenir au moins une option.',
		optionLimit: 'Le groupe d\'options {index} peut enregistrer jusqu\'à {max} options.',
		optionNameRequired: 'L\'option {optionIndex} du groupe {groupIndex} doit avoir un nom.',
		countLabel: '{current}/{max}'
	},
	outputTypes: {
		writing: 'Rédaction',
		revision: 'Révision',
		'work-order': 'Ordre de travail',
		proposal: 'Proposition',
		'result-report': 'Rapport de résultats',
		'agent-evaluation': 'Évaluation d\'agent'
	},
	seedSkills: {
		proposalWriter: {
			name: 'Rédacteur de propositions',
			description:
				'Compare les options et produit une proposition avec recommandation et tâches de suivi.',
			instructions:
				'Renvoie un artefact workduck.queue-proposal/v1. Compare les options viables, présente les compromis, choisit une recommandation et inclut uniquement des ordres de travail de suivi concrets si une action est nécessaire.'
		},
		writingAssistant: {
			name: 'Assistant de rédaction',
			description: 'Rédige ou révise des textes à partir d\'un brief, de contraintes de style et de références.',
			instructions:
				'Rédige le texte demandé à partir du corps de la tâche et des références sélectionnées. Traite tout ID d\'ordre de travail Workduck comme l\'étiquette d\'attribution, et non comme une preuve supplémentaire en soi. Respecte les contrôles explicites pour le nombre de paragraphes, le nombre de phrases par paragraphe, le ton, l\'audience, le point de vue, la langue, le format et les expressions interdites. Si la tâche ne définit aucun contrôle, produit un brouillon soigné et concis dans la langue de la tâche. Utilise les références sélectionnées comme matériau source sans inventer de faits non étayés. Pour le format de réponse de brouillon de rédaction, place le brouillon finalisé dans le résumé (summary), les notes de style/sources dans les points forts (strengths), les orientations de révision facultatives dans les recommandations (recommendations) et les lacunes ou hypothèses de sources dans les avertissements (cautions).'
		},
		revisionAssistant: {
			name: 'Assistant de révision',
			description: 'Révise des brouillons selon les options sélectionnées d\'objectif, de ton, de structure et de format.',
			instructions:
				'Révise le brouillon fourni selon le corps de la tâche, les références sélectionnées et les options de révision cochées. Préserve le sens original et les affirmations factuelles à moins que la tâche ne demande explicitement de les modifier. Plusieurs options cochées peuvent s\'appliquer simultanément ; résous les conflits en privilégiant d\'abord le sens, puis la structure, puis le ton et enfin le format. Utilise les références uniquement comme support pour les corrections factuelles sans inventer de faits non étayés. Pour le format de réponse de brouillon de révision, place le texte révisé dans le résumé (summary), les choix de révision appliqués dans les points forts (strengths), les idées de révision supplémentaires facultatives dans les recommandations (recommendations) et les modifications de sens, les compromis, les lacunes de sources ou les faits à vérifier dans les avertissements (cautions).'
		},
		codeReviewer: {
			name: 'Revisseur de code',
			description: 'Examine le code ou le diff Git pour vérifier la correction, la maintenabilité, la sécurité et les risques de temps d\'exécution.',
			instructions:
				'Examine le code fourni, les extraits de fichiers ou le diff Git. Privilégie le format de réponse de revue de code lorsqu\'il est disponible. Présente en priorité des conclusions concrètes classées par gravité, inclut les chemins de fichiers et les références de lignes lorsqu\'ils sont fournis, et concentre-toi sur les défauts, les régressions, la maintenabilité, les performances, la sécurité et les risques spécifiques au framework. Ne fais pas d\'éloges généraux et ne réécris pas de code non lié. Si des preuves manquent, indique la lacune de l\'examen au lieu d\'inventer du contexte.'
		},
		commitHandoffWriter: {
			name: 'Rédacteur de commits et de notes de transmission',
			description: 'Transforme les résumés de modifications en messages de commit et en notes de transmission pour la suite du travail.',
			instructions:
				'Analyse la liste des fichiers modifiés, le résumé du diff, le rapport de travail ou les notes de tâche fournis. Recommande un ou plusieurs messages de commit sans effectuer de stage, de commit ou de push. Lorsque demandé, rédige une note de transmission qui préserve le travail accompli, les tâches ouvertes, les preuves de validation, les risques et la prochaine action sécurisée. N\'affirme pas que des commandes ont été exécutées à moins que la tâche n\'en fournisse la preuve.'
		},
		techDebtJanitor: {
			name: 'Gestionnaire de dette technique',
			description: 'Planifie des refactorisations préservant le comportement pour le code hérité, complexe ou doublé.',
			instructions:
				'Examine le code fourni ou le brief de dette technique et propose des étapes de refactorisation préservant le comportement. Préserve l\'API publique et le comportement métier à moins que la tâche ne permette explicitement une refonte. Sépare le nettoyage mécanique sûr des changements de conception risqués, indique les tests ou vérifications nécessaires avant les modifications et évite les réécritures globales sans étapes de migration.'
		},
		releaseNoteWriter: {
			name: 'Rédacteur de notes de mise à jour',
			description: 'Crée des notes de mise à jour ou des brouillons de changelog à partir des commits, des travaux terminés et des rapports.',
			instructions:
				'Rédige des notes de mise à jour ou un changelog à partir des commits fournis, des rapports d\'ordres de travail, de la liste des tickets ou du résumé des modifications. Sépare les changements visibles pour l\'utilisateur de la maintenance interne. N\'invente pas de fonctionnalités déployées, de dates, de numéros de version, de métriques ou de preuves de validation. Signale les changements disruptifs, les notes de migration et les limites connues lorsque des preuves sont fournies.'
		},
		apiSchemaArchitect: {
			name: 'Architecte de schéma d\'API',
			description: 'Conçoit des endpoints d\'API, des contrats de commandes, des payloads et des schémas à partir des exigences des fonctionnalités.',
			instructions:
				'Transforme l\'exigence de fonctionnalité fournie en une proposition d\'API ou de contrat de commande. Définit les limites des ressources ou des commandes, les payloads de requête et de réponse, les cas d\'erreur, les règles de validation, les notes de compatibilité et les tâches d\'implémentation de suivi. Garde les schémas alignés avec le style choisi et n\'affirme pas qu\'un endpoint existe à moins que la tâche n\'en fournisse la preuve.'
		},
		agentResponseEvaluator: {
			name: 'Évaluateur de réponses d\'agent',
			description: 'Évalue la réponse d\'un agent à l\'aide de la grille de 1 à 9 basée sur cinq critères.',
			instructions:
				'Évalue la réponse uniquement à partir de la tâche et de la réponse de l\'agent. Attribue une note de 1 à 9 pour la compréhension du problème, la validité logique, la faisabilité pratique, la perspicacité créative et la détection des risques. Ne valorise pas la longueur en soi. Juge les contraintes, le caractère actionnable, les preuves et la gestion des risques. Après avoir choisi les scores, enregistre-les dans le même espace de travail à l\'aide de la commande workduck agent evaluate. Si l\'agent a un persona lié, cette évaluation de persona est également mise à jour.'
		}
	},
	errors: {
		nameRequired: 'Le nom est obligatoire.',
		nameDuplicate: 'Le nom existe déjà.',
		outputTypeRequired: 'Le type de résultat est obligatoire.',
		instructionsRequired: 'Les instructions sont obligatoires.',
		notFound: 'La skill n\'a pas été trouvée.',
		readFailed: 'Les skills n\'ont pas pu être lues.',
		saveFailed: 'Les skills n\'ont pas pu être enregistrées.'
	}
} as const;
