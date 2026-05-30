export const frPersonasMessages = {
	title: 'Personas',
	list: 'Liste des personas',
	details: 'Détails du persona',
	registeredCount: '{count} personas',
	newPersona: 'Nouveau persona',
	editPersona: 'Modifier le persona',
	randomSpectrums: 'Traits aléatoires',
	countLabel: '{current}/{max}',
	agentAssignment: {
		label: 'Agents sans persona',
		placeholder: 'Sélectionnez des agents',
		none: 'Aucun',
		selectedCount: '{count} sélectionnés'
	},
	evaluation: {
		overviewEmpty: 'Aucun persona enregistré.'
	},
	styles: {
		title: 'Style de réponse',
		items: {
			responseLength: {
				label: 'Longueur de la réponse',
				options: {
					short: 'Courte',
					standard: 'Standard',
					detailed: 'Détaillée'
				}
			},
			emotionalTone: {
				label: 'Ton émotionnel',
				options: {
					calm: 'Calme',
					neutral: 'Neutre',
					bright: 'Enjoué'
				}
			},
			judgmentAttitude: {
				label: 'Position de jugement',
				options: {
					critical: 'Critique',
					balanced: 'Équilibrée',
					supportive: 'Bienveillante'
				}
			},
			confidenceLevel: {
				label: 'Niveau de confiance',
				options: {
					cautious: 'Prudent',
					realistic: 'Réaliste',
					decisive: 'Résolu'
				}
			},
			socialDistance: {
				label: 'Distance sociale',
				options: {
					formal: 'Formelle',
					comfortable: 'Décontractée',
					friendly: 'Amicale'
				}
			}
		}
	},
	spectrums: {
		title: 'Traits',
		items: {
			developmentApproach: {
				label: 'Approche de développement',
				levels: {
					1: { name: 'Conception d\'abord', description: 'Fixe la structure, les limites et le flux de données avant d\'implémenter.' },
					2: { name: 'Guidé par la conception', description: 'Définit la direction et les règles avant de passer à l\'implémentation.' },
					3: { name: 'Explorateur équilibré', description: 'Alterne entre petits prototypes et ajustements de conception.' },
					4: { name: 'Guidé par l\'expérimentation', description: 'Construit rapidement et s\'appuie sur les résultats pour s\'orienter.' },
					5: { name: 'Hacker', description: 'Du code fonctionnel d\'abord. Le fait que le code tourne est le plus important.' }
				}
			},
			qualityStandard: {
				label: 'Stabilité et qualité',
				levels: {
					1: { name: 'Qualité labo', description: 'Applique très strictement la validation, le typage, les tests et la sécurité.' },
					2: { name: 'Stable pour la prod', description: 'S\'efforce de maintenir une fiabilité de niveau production.' },
					3: { name: 'Compromis pragmatique', description: 'Équilibre le risque et la rapidité selon les situations.' },
					4: { name: 'Lancer d\'abord', description: 'Préfère corriger les problèmes en cours d\'exploitation si nécessaire.' },
					5: { name: 'Expérimental', description: 'Priorise la vitesse et les essais au détriment du coût des défaillances.' }
				}
			},
			structureBias: {
				label: 'Préférence de structure',
				levels: {
					1: { name: 'Concepteur système', description: 'Considère les limites, les couches et les relations entre modules comme critiques.' },
					2: { name: 'Orienté module', description: 'Prend constamment en compte la réutilisabilité et la maintenabilité.' },
					3: { name: 'Structure pratique', description: 'Structure uniquement ce qui est nécessaire.' },
					4: { name: 'Développeur direct', description: 'Préfère l\'implémentation directe à l\'abstraction.' },
					5: { name: 'Assembleur improvisé', description: 'Priorise les connexions rapides et les résultats sur la structure.' }
				}
			},
			productivityStrategy: {
				label: 'Stratégie de productivité',
				levels: {
					1: { name: 'Artisan', description: 'Minimise les dépendances et l\'automatisation pour garder un contrôle direct.' },
					2: { name: 'Automatisation sélective', description: 'Ajoute soigneusement uniquement les outils nécessaires.' },
					3: { name: 'Outillage pratique', description: 'Utilise l\'automatisation lorsqu\'elle améliore la productivité.' },
					4: { name: 'Centré automatisation', description: 'Automatise les tâches répétitives dès que possible.' },
					5: { name: 'Orchestrateur', description: 'Combine des outils, des agents et des pipelines pour piloter le travail.' }
				}
			},
			operationPhilosophy: {
				label: 'Opérations et lancements',
				levels: {
					1: { name: 'Strict sur le changement', description: 'Retarde le lancement si un risque de défaillance est visible.' },
					2: { name: 'Lancement stable', description: 'Lance après suffisamment de vérification et d\'observabilité.' },
					3: { name: 'Opérations incrémentales', description: 'Déploie souvent de petites modifications et surveille la stabilité.' },
					4: { name: 'Réponse rapide', description: 'Utilise activement les correctifs en cours d\'exploitation et les hotfixes.' },
					5: { name: 'Évolution en direct', description: 'Traite le service comme une entité en constante évolution en temps réel.' }
				}
			},
			collaborationPhilosophy: {
				label: 'Contexte de collaboration',
				levels: {
					1: { name: 'Contrat documenté', description: 'Collabore via des documents, des règles et des contrats.' },
					2: { name: 'Collaboration explicite', description: 'Rend l\'intention et les normes aussi visibles que possible.' },
					3: { name: 'Partage de contexte', description: 'Partage le contexte principal et laisse le reste autonome.' },
					4: { name: 'Collaboration tacite', description: 'Préfère une collaboration rapide basée sur l\'expérience et le jugement.' },
					5: { name: 'Agents autonomes', description: 'Définit des objectifs et s\'attend à ce que l\'humain et l\'IA jugent de façon autonome.' }
				}
			}
		}
	},
	saved: 'Enregistré.',
	removed: 'Supprimé.',
	errors: {
		nameRequired: 'Le nom est obligatoire.',
		nameDuplicate: 'Le nom existe déjà.',
		instructionsRequired: 'Les instructions sont obligatoires.',
		notFound: 'Le persona n\'a pas été trouvé.',
		readFailed: 'Les personas n\'ont pas pu être lus.',
		saveFailed: 'Les personas n\'ont pas pu être enregistrés.'
	}
} as const;
