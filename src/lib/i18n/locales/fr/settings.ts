export const frSettingsMessages = {
	title: 'Paramètres',
	pageTitle: 'Paramètres - Workduck',
	sections: 'Sections de paramètres',
	tabs: {
		appearance: 'Apparence',
		workspaces: 'Espaces de travail',
		sync: 'Sincronisation',
		system: 'Système'
	},
	appearance: {
		section: 'Apparence',
		language: 'Langue',
		interfaceFontSize: 'Taille de police de l\'interface',
		loadError: 'Les paramètres d\'apparence n\'ont pas pu être chargés.',
		saveError: 'Les paramètres d\'apparence n\'ont pas pu être enregistrés.'
	},
	workspaces: {
		noWorkspaces: 'Aucun espace de travail.',
		status: 'Statut de l\'espace de travail',
		active: 'Actif',
		locked: 'Verrouillé',
		switch: 'Basculer',
		lock: 'Verrouiller',
		reconnect: 'Reconnecter',
		repository: {
			section: 'Dépôt de l\'espace de travail',
			useAsRepository: 'Utiliser cet espace de travail comme dépôt',
			prepare: 'Préparer le dépôt',
			publish: 'Publier',
			prepareTitle: 'Préparer le dépôt de l\'espace de travail',
			publishTitle: 'Publier le dépôt de l\'espace de travail',
			githubRepository: 'Dépôt GitHub',
			commitMessage: 'Message de commit',
			visibility: 'Visibilité GitHub',
			private: 'Privé',
			public: 'Public',
			initializeGit: 'Initialiser le dépôt Git',
			installMustflow: 'Installer mustflow',
			installGitignore: 'Installer le .gitignore de Workduck',
			gitReady: 'Git prêt',
			remoteReady: 'Distant prêt',
			commitNeeded: 'Commit requis',
			queueCommitWorkOrder: 'Ajouter tâche de commit',
			updateDependencies: 'Mettre à jour deps',
			pullNeeded: 'Pull requis ({count})',
			pushNeeded: 'Push requis ({count})',
			setupComplete: 'Le dépôt de l\'espace de travail est prêt.',
			setupPartial: 'L\'espace de travail a été ajouté, mais la configuration du dépôt a échoué.',
			setupFailed: 'Échec de la configuration du dépôt.',
			publishComplete: 'Le dépôt de l\'espace de travail a été publié.',
			commitWorkOrderQueued: 'Tâche de commit ajoutée : {relativePath}',
			dependencyUpdateTerminalOpened:
				'Terminal ouvert avec la commande de mise à jour des dépendances de l\'espace de travail.',
			fetchComplete: 'Récupéré.',
			pullComplete: 'Mis à jour (pull).',
			pushComplete: 'Envoyé (push).'
		},
		removeTitle: 'Supprimer l\'espace de travail',
		removeDescription: 'Supprimer {name} ? Les fichiers locaux ne seront pas supprimés.',
		errors: {
			nameRequired: 'Le nom de l\'espace de travail est obligatoire.',
			passwordRequired: 'Le mot de passe de l\'espace de travail est obligatoire.',
			passwordTooShort: 'Le mot de passe de l\'espace de travail doit faire au moins {minLength} caractères.',
			passwordProtectFailed: 'Le mot de passe de l\'espace de travail n\'a pas pu être protégé.',
			passwordInvalidHash: 'Les données de verrouillage de l\'espace de travail n\'ont pas pu être lues.',
			passwordUnavailable: 'Le mot de passe de l\'espace de travail peut uniquement être protégé dans l\'application de bureau.',
			passwordHashInvalid: 'Les données de verrouillage de l\'espace de travail n\'ont pas pu être enregistrées.',
			repositoryChoiceRequired: 'Choisissez si cet espace de travail doit être un dépôt.',
			repositoryWorkspaceRequired: 'Le dossier de l\'espace de travail est obligatoire.',
			repositoryWorkspaceNotAbsolute: 'Le chemin de l\'espace de travail doit être absolu.',
			repositoryWorkspaceNotFound: 'Le dossier de l\'espace de travail n\'a pas été trouvé.',
			repositoryWorkspaceNotDirectory: 'Le chemin de l\'espace de travail doit être un dossier.',
			repositoryWorkspacePermissionDenied: 'L\'accès au dossier de l\'espace de travail a été refusé.',
			repositoryWorkspaceUnreadable: 'Le dossier de l\'espace de travail n\'a pas pu être lu.',
			repositoryLayoutInvalid: 'La structure de fichiers existante de l\'espace de travail n\'est pas utilisable.',
			repositoryCreateFailed: 'Les fichiers du dépôt de l\'espace de travail n\'ont pas pu être créés.',
			repositoryGitUnavailable: 'Git n\'est pas disponible.',
			repositoryGitTimedOut: 'L\'initialisation de Git a expiré.',
			repositoryGitInitFailed: 'Le dépôt Git n\'a pas pu être initialisé.',
			repositoryMustflowUnavailable: 'La commande mustflow n\'est pas disponible.',
			repositoryMustflowTimedOut: 'L\'installation de mustflow a expiré.',
			repositoryMustflowFailed: 'L\'installation de mustflow a échoué.',
			repositoryMustflowPackageFailed: 'Les metadonnées du paquet mustflow n\'ont pas pu être préparées.',
			repositoryAgentInstructionsFailed: 'Les consignes de travail des agents n\'ont pas pu être préparées.',
			repositoryGitignoreFailed: 'Le .gitignore n\'a pas pu être préparé.',
			repositoryUnavailable: 'La configuration du dépôt de l\'espace de travail est disponible dans l\'application de bureau.',
			repositoryGitPathRequired: 'Le chemin du dépôt est obligatoire.',
			repositoryGitPathNotAbsolute: 'Le chemin du dépôt doit être absolu.',
			repositoryGitPathNotFound: 'Le dossier du dépôt n\'a pas été trouvé.',
			repositoryGitPathNotDirectory: 'Le chemin du dépôt doit être un dossier.',
			repositoryGitPathPermissionDenied: 'L\'accès au dossier du dépôt a été refusé.',
			repositoryGitPathUnreadable: 'Le dossier du dépôt n\'a pas pu être vérifié.',
			repositoryGitCommandUnavailable: 'La commande Git n\'a pas été trouvée.',
			repositoryGitCommandFailed: 'La commande Git a échoué.',
			repositoryGitCommandTimedOut: 'La commande Git a expiré.',
			repositoryGitNotRepository: 'Le dossier n\'est pas initialisé pour Git.',
			repositoryGitRemoteMissing: 'Le distant Git n\'est pas configuré.',
			repositoryGitPushAuthRequired:
				'Git push requiert une authentification. Configurez vos identifiants Git système ou ajoutez un jeton GitHub dans le coffre-fort de l\'Environnement.',
			repositoryGitPushEmpty: 'Le dépôt n\'a pas de commits à envoyer.',
			repositoryGitPushFailed: 'L\'envoi Git push a échoué.',
			repositoryGitFetchAuthRequired:
				'Git fetch requiert une authentification. Configurez vos identifiants Git système ou ajoutez un jeton GitHub dans le coffre-fort de l\'Environnement.',
			repositoryGitFetchFailed: 'Git fetch a échoué.',
			repositoryGitPullAuthRequired:
				'Git pull requiert une authentification. Configurez vos identifiants Git système ou ajoutez un jeton GitHub dans le coffre-fort de l\'Environnement.',
			repositoryGitPullConflict:
				'Git pull a été interrompu car ce checkout contient des modifications locales ou des conflits. Validez (commit), remisez (stash) ou écartez les modifications locales, puis effectuez le pull à nouveau.',
			repositoryGitPullFailed: 'Git pull a échoué.',
			repositoryGithubNameRequired: 'Le nom du dépôt GitHub est obligatoire.',
			repositoryGithubNameInvalid: 'Le nom du dépôt GitHub n\'est pas utilisable.',
			repositoryGithubCommitMessageRequired: 'Le message de commit est obligatoire.',
			repositoryGithubCommitMessageInvalid: 'Le message de commit n\'est pas utilisable.',
			repositoryGithubVisibilityInvalid: 'La visibilité GitHub n\'est pas utilisable.',
			repositoryGithubCliUnavailable: 'La CLI de GitHub n\'a pas été trouvée.',
			repositoryGithubAuthRequired: 'L\'authentification GitHub est obligatoire.',
			repositoryGithubRemoteExists: 'L\'origine distante (remote origin) est déjà configurée.',
			repositoryGithubEmpty: 'Le dépôt n\'a pas de commits à publier.',
			repositoryGithubCommitIdentityMissing: 'Le nom ou l\'e-mail de l\'auteur Git n\'est pas configuré.',
			repositoryGithubCommitIndexLocked: 'L\'index de Git est verrouillé par un autre processus.',
			repositoryGithubCommitHookFailed: 'Le commit initial a été bloqué par un hook de Git.',
			repositoryGithubCommitFailed: 'Le commit initial n\'a pas pu être créé.',
			repositoryGithubCreateFailed: 'Le dépôt GitHub n\'a pas pu être créé.'
		},
		tooltips: {
			unlock: 'Entrez le mot de passe de cet espace de travail pour le rendre disponible sur cet appareil.',
			prepareRepository:
				'Préparez Git, mustflow et le .gitignore de Workduck dans cet espace de travail.',
			publishRepository: 'Publiez ce dépôt d\'espace de travail sur GitHub pour la première fois.',
			fetchRepository: 'Vérifiez les modifications distantes pour ce dépôt d\'espace de travail.',
			pullRepository: 'Tirez les modifications de l\'espace de travail distant dans ce dossier.',
			pushRepository: 'Envoyez les modifications de l\'espace de travail local vers le dépôt distant.',
			queueCommitWorkOrder: 'Ajoutez le nettoyage des modifications non validées à la file d\'attente de travail.',
			updateDependencies:
				'Ouvrir un terminal pour mettre à jour les dépendances dans le dossier de l\'espace de travail.',
			reconnect: 'Choisissez à nouveau un dossier local si cet espace de travail a été synchronisé depuis un autre appareil.',
			switch: 'Définissez cet espace de travail comme zone de travail active.',
			lock: 'Verrouillez à nouveau cet espace de travail jusqu\'à la saisie de son mot de passe.',
			remove: 'Supprimez cet espace de travail de Workduck. Les fichiers locaux ne seront pas supprimés.'
		}
	},
	sync: {
		section: 'Sincronisation',
		encryptedData: 'Données chiffrées',
		noFolder: 'Aucun dossier',
		checking: 'Vérification',
		noRepository: 'Aucun dépôt',
		unavailable: 'Indisponible',
		noBranch: 'Aucune branche',
		commitNeeded: 'Commit requis',
		queueCommitWorkOrder: 'Ajouter tâche de commit',
		primaryActions: 'Actions de synchronisation',
		send: 'Envoyer',
		receive: 'Recevoir',
		checkStatus: 'Vérifier l’état',
		advancedGit: 'Git avancé',
		manualCopy: 'Copie manuelle',
		primaryHelp:
			'Envoyer enregistre les données de cet appareil dans le fichier de synchronisation et les envoie quand Git est prêt. Recevoir met le dossier à jour quand c’est possible, puis applique le fichier de synchronisation.',
		tooltips: {
			folder: 'Choisissez le dossier qui stocke le fichier de synchronisation.',
			send: 'Chiffrez les données de cet appareil, enregistrez-les dans le fichier de synchronisation et envoyez-les quand Git est prêt.',
			receive: 'Mettez à jour le dossier de synchronisation quand Git est prêt, puis appliquez le fichier à cette app.',
			checkStatus: 'Vérifiez le dossier de synchronisation sélectionné et l’état Git.',
			fetch: 'Vérifiez le dépôt de synchronisation distant.',
			pull: 'Importez les modifications distantes du fichier de synchronisation dans ce dossier.',
			push: 'Validez (commit) et téléchargez ce fichier de synchronisation.',
			queueCommitWorkOrder: 'Ajoutez le nettoyage des modifications non validées du dépôt de synchronisation à la file d\'attente de travail.',
			export:
				'Chiffrez l\'espace de travail actuel et les données du projet dans la zone de texte ci-dessous. Utilisez cette option pour copier manuellement les données de synchronisation sans fichier.',
			import:
				'Appliquez les données chiffrées collées dans la zone de texte ci-dessous. Les données doivent avoir été exportées avec le même mot de passe.',
			save:
				'Chiffrez l\'espace de travail actuel et les données du projet, puis écrivez-les dans le fichier du dossier de synchronisation sélectionné. Utilisez cette option avant Git push.',
			load:
				'Lisez le fichier chiffré du dossier de synchronisation sélectionné et appliquez-le à cette application. Utilisez cette option après Git pull.'
		},
		confirmations: {
			sendSync: {
				title: 'Confirmer l’envoi de la synchronisation',
				body:
					'Les données de cette app remplaceront {fileName} dans {folderPath}, puis seront envoyées si le dossier a un distant Git.',
				inputLabel: 'Saisissez la phrase exacte ci-dessous pour continuer.',
				confirmTextLabel: 'Phrase exacte',
				confirmText: 'Envoyer les données de synchronisation',
				actionLabel: 'Envoyer'
			},
			receiveSync: {
				title: 'Confirmer la réception de la synchronisation',
				body:
					'Le fichier de synchronisation {fileName} dans {folderPath} remplacera les données d’espace de travail et de projet de cette app.',
				inputLabel: 'Saisissez la phrase exacte ci-dessous pour continuer.',
				confirmTextLabel: 'Phrase exacte',
				confirmText: 'Recevoir les données de synchronisation',
				actionLabel: 'Recevoir'
			},
			exportData: {
				title: 'Confirmer l\'exportation des données chiffrées',
				body:
					'La zone de texte des données chiffrées sera remplacée par un nouvel export de cette application.',
				inputLabel: 'Saisissez la phrase exacte ci-dessous pour continuer.',
				confirmTextLabel: 'Phrase exacte',
				confirmText: 'Exporter les données chiffrées',
				actionLabel: 'Exporter'
			},
			importData: {
				title: 'Confirmer l\'importation des données chiffrées',
				body:
					'Les données chiffrées dans la zone de texte remplaceront les données d\'espace de travail et de projet de cette application.',
				inputLabel: 'Saisissez la phrase exacte ci-dessous pour continuer.',
				confirmTextLabel: 'Phrase exacte',
				confirmText: 'Importer les données chiffrées',
				actionLabel: 'Importer'
			},
			saveFile: {
				title: 'Confirmer l\'enregistrement du fichier de synchro',
				body:
					'Le fichier {fileName} dans {folderPath} sera écrasé par les données chiffrées de cette application.',
				inputLabel: 'Saisissez la phrase exacte ci-dessous pour continuer.',
				confirmTextLabel: 'Phrase exacte',
				confirmText: 'Enregistrer le fichier de synchro',
				actionLabel: 'Enregistrer'
			},
			loadFile: {
				title: 'Confirmer le chargement du fichier de synchro',
				body:
					'Le fichier {fileName} dans {folderPath} sera chargé dans les données d\'espace de travail et de projet de cette application.',
				inputLabel: 'Saisissez la phrase exacte ci-dessous pour continuer.',
				confirmTextLabel: 'Phrase exacte',
				confirmText: 'Charger le fichier de synchro',
				actionLabel: 'Charger'
			},
			pullGit: {
				title: 'Confirmer Git pull',
				body:
					'Git pull appliquera les modifications distantes sur {folderPath}. Le chargement ultérieur peut modifier les données de cette application.',
				inputLabel: 'Saisissez la phrase exacte ci-dessous pour continuer.',
				confirmTextLabel: 'Phrase exacte',
				confirmText: 'Git pull',
				actionLabel: 'Tirer'
			},
			pushGit: {
				title: 'Confirmer Git push',
				body:
					'Le fichier de synchronisation {fileName} dans {folderPath} sera validé (commit) si nécessaire et envoyé vers le dépôt distant.',
				inputLabel: 'Saisissez la phrase exacte ci-dessous pour continuer.',
				confirmTextLabel: 'Phrase exacte',
				confirmText: 'Git push',
				actionLabel: 'Envoyer'
			}
		},
		statuses: {
			exported: 'Exporté.',
			imported: 'Importé.',
			saved: '{fileName} enregistré.',
			loaded: '{fileName} chargé.',
			sent: 'Envoyé.',
			sentLocal: '{fileName} enregistré. L’envoi Git n’est pas encore prêt.',
			received: 'Reçu.',
			checked: 'État de synchronisation vérifié.',
			checkedNoRepository: 'Dossier de synchronisation vérifié. Aucun dépôt Git trouvé.',
			fetched: 'Récupéré (fetched).',
			pulled: 'Mis à jour (pulled). Utilisez "Charger" pour appliquer.',
			pushed: 'Envoyé (pushed).',
			committedAndPushed: 'Validé et envoyé.',
			commitWorkOrderQueued: 'Tâche de commit ajoutée : {relativePath}'
		},
		operations: {
			fetchLabel: 'Récupération de la synchronisation',
			pullLabel: 'Téléchargement de la synchronisation',
			pushLabel: 'Envoi de la synchronisation',
			fetchDetail: 'Vérification des modifications distantes.',
			pullDetail: 'Mise à jour du dossier de synchronisation.',
			pushDetail: 'Envoi du fichier de synchronisation.'
		},
		errors: {
			gitActionInvalid: 'L\'action Git n\'est pas valide.',
			passwordRequired: 'Le mot de passe est obligatoire.',
			folderRequired: 'Le dossier est obligatoire.',
			folderNotAbsolute: 'Le chemin du dossier doit être absolu.',
			folderNotFound: 'Le dossier n\'a pas été trouvé.',
			folderNotDirectory: 'Le chemin doit correspondre à un dossier.',
			folderPermissionDenied: 'L\'accès au dossier a été refusé.',
			fileNameRequired: 'Le fichier de synchronisation est obligatoire.',
			fileNameInvalid: 'Le nom du fichier de synchronisation n\'est pas valide.',
			contentRequired: 'Les données chiffrées sont obligatoires.',
			fileNotFound: 'Le fichier de synchronisation n\'a pas été trouvé.',
			fileTooLarge: 'Le fichier de synchronisation est trop volumineux.',
			fileTargetInvalid: 'Le chemin du fichier de synchronisation n\'est pas utilisable.',
			fileReadFailed: 'Le fichier de synchronisation n\'a pas pu être lu.',
			fileWriteFailed: 'Le fichier de synchronisation n\'a pas pu être écrit.',
			fileUnavailable: 'Les fichiers de synchronisation sont disponibles dans l\'application de bureau.',
			gitNotRepository: 'Le dossier n\'est pas un dépôt Git.',
			gitRemoteMissing: 'Le distant Git n\'est pas configuré.',
			gitBranchMissing: 'La branche Git n\'a pas été trouvée.',
			gitUnavailable: 'Git n\'est pas disponible.',
			gitTimedOut: 'La commande Git a expiré.',
			gitAuthRequired:
				'L\'authentification Git est requise. Configurez vos identifiants Git système ou ajoutez un jeton GitHub dans le coffre-fort de l\'Environnement.',
			gitIdentityRequired: 'Le nom ou l\'e-mail de l\'utilisateur Git n\'est pas configuré.',
			gitRemoteHasChanges: 'Le distant contient des modifications. Effectuez un pull d\'abord.',
			gitFastForwardRequired: 'Pull requiert une fusion manuelle.',
			gitTrustRequired: 'La confiance dans le dépôt Git doit être configurée.',
			gitCommandFailed: 'La commande Git a échoué.',
			gitReadFailed: 'Le dépôt Git n\'a pas pu être lu.',
			gitSyncUnavailable: 'La synchronisation Git est disponible dans l\'application de bureau.',
			envelopeInvalid: 'Les données chiffrées ne sont pas valides.',
			encryptedDataDamaged: 'Les données chiffrées sont endommagées.',
			exportFailed: 'L\'exportation a échoué.',
			passwordMismatch: 'Le mot de passe ne correspond pas.',
			workspaceDataInvalid: 'Les données de l\'espace de travail ne sont pas valides.',
			projectReadFailed: 'Les métadonnées du projet n\'ont pas pu être chargées.',
			projectWriteFailed: 'Les métadonnées du projet n\'ont pas pu être enregistrées.',
			encryptionUnavailable: 'Le chiffrement de synchronisation est disponible dans l\'application de bureau.',
			settingsSaveFailed: 'Les paramètres de synchronisation n\'ont pas pu être enregistrés.'
		}
	},
	system: {
		section: 'Système',
		startOnSignIn: 'Lancer au démarrage de Windows',
		showTrayIcon: 'Afficher l\'icône de la barre des tâches',
		minimizeToTray: 'Minimiser dans la barre des tâches',
		workspaceIdleLock: 'Verrouiller après inactivité',
		workspaceIdleLockNever: 'Jamais',
		workspaceIdleLockMinutes: '{minutes} minutes',
		loadError: 'Les paramètres système n\'ont pas pu être chargés.',
		saveError: 'Les paramètres système n\'ont pas pu être enregistrés.',
		autostartUnavailable: 'Le démarrage automatique est disponible dans l\'application de bureau.',
		autostartReadFailed: 'Le statut de démarrage automatique n\'a pas pu être chargé.',
		autostartSaveFailed: 'Le paramètre de démarrage automatique n\'a pas pu être enregistré.'
	}
} as const;
