export const frProjectsMessages = {
	newProject: 'Nouveau projet',
	newGroup: 'Nouveau groupe',
	newRepository: 'Nouveau dépôt',
	registeredCount: '{count} projets racines',
	filters: {
		pullNeeded: 'Pull requis',
		pushNeeded: 'Push requis',
		commitNeeded: 'Commit requis',
		searchLabel: 'Filtre par nom de dépôt ou tag',
		searchPlaceholder: 'nom ou tag'
	},
	kinds: {
		project: 'Projet',
		group: 'Groupe'
	},
	counts: {
		group: 'groupe',
		groups: 'groupes',
		repo: 'dépôt',
		repos: 'dépôts'
	},
	lastRepositoryOperation: 'Dernière action : {timestamp}',
	repository: {
		uncommittedChanges: 'Modifications non validées (uncommitted)',
		queueCommitWorkOrder: 'Ajouter tâche de commit',
		commitWorkOrderQueued: 'Tâche de commit ajoutée : {relativePath}',
		githubCredentialSaved: 'Identifiant GitHub enregistré.'
	},
	operations: {
		running: {
			clone: 'Clonage du dépôt',
			init: 'Initialisation du dépôt Git',
			fetch: 'Récupération du dépôt',
			pull: 'Mise à jour (pull) du dépôt',
			push: 'Envoi (push) du dépôt',
			publish: 'Publication du dépôt'
		},
		done: {
			clone: 'Dépôt cloné.',
			init: 'Dépôt initialisé.',
			fetch: 'Dépôt récupéré.',
			pull: 'Dépôt mis à jour (pull).',
			push: 'Dépôt envoyé (push).',
			publish: 'Dépôt publié.'
		},
		failed: {
			clone: 'Échec du clonage.',
			init: 'Échec de l\'initialisation.',
			fetch: 'Échec de la récupération (fetch).',
			pull: 'Échec de la mise à jour (pull).',
			push: 'Échec de l\'envoi (push).',
			publish: 'Échec de la publication.'
		},
		buttonRunning: {
			clone: 'Clonage en cours',
			init: 'Initialisation',
			fetch: 'Récupération',
			pull: 'Mise à jour',
			push: 'Envoi',
			publish: 'Publication'
		},
		buttonIdle: {
			clone: 'Cloner',
			init: 'Git Init',
			fetch: 'Fetch',
			pull: 'Pull',
			push: 'Push',
			publish: 'Publier'
		}
	},
	detailsDialog: {
		title: 'Modifier le projet',
		name: 'Nom',
		path: 'Chemin',
		saving: 'Enregistrement',
		save: 'Enregistrer',
		cancel: 'Annuler',
		saved: 'Détails du projet enregistrés.'
	},
	deleteDialog: {
		titles: {
			project: 'Supprimer le projet',
			group: 'Supprimer le groupe',
			repository: 'Supprimer le dépôt'
		},
		text: 'Supprimer {name} de Workduck ?',
		textWithAffected:
			'Supprimer {name} de Workduck ? Cela supprimera également {affected} de la liste des projets.',
		affectedGroups: '{count} groupes enfants',
		affectedGroup: '{count} groupe enfant',
		affectedRepositories: '{count} dépôts',
		affectedRepository: '{count} dépôt',
		localProjectFolder: 'Supprimer également ce dossier de projet',
		localGroupFolder: 'Supprimer également ce dossier de groupe',
		localRepositoryFolder: 'Supprimer également ce dossier de dépôt',
		localFolderUnavailable:
			'La suppression de dossier local est uniquement disponible pour les dossiers situés sous cet espace de travail.',
		localRepositoryFolderUnavailable:
			'La suppression de dossier local est uniquement disponible pour les dossiers de dépôts situés sous cet espace de travail.',
		repositoryRemoved: 'Dépôt supprimé.',
		repositoryAndFolderRemoved: 'Dépôt et dossier local supprimés.',
		projectRemoved: 'Projet supprimé.',
		projectAndFolderRemoved: 'Projet et dossier local supprimés.',
		groupRemoved: 'Groupe supprimé.',
		groupAndFolderRemoved: 'Groupe et dossier local supprimés.',
		cancel: 'Annuler',
		remove: 'Supprimer',
		removing: 'Suppression'
	},
	contextMenu: {
		openFolder: 'Ouvrir le dossier',
		editDetails: 'Modifier le nom et le chemin',
		editDescription: 'Modifier la description',
		githubCredential: 'Identifiant GitHub',
		remoteUrl: 'URL distante',
		editTags: 'Modifier les tags',
		delete: 'Supprimer',
		clone: 'Cloner',
		initializeGit: 'Initialize Git',
		publish: 'Publier',
		applySsealed: 'Appliquer ssealed',
		openTerminal: 'Ouvrir le terminal',
		installDependencies: 'Ouvrir le terminal d\'installation des dépendances',
		updateDependencies: 'Ouvrir le terminal de mise à jour des dépendances',
		startDevServer: 'Ouvrir le terminal du serveur de développement',
		build: 'Ouvrir le terminal de build',
		preview: 'Ouvrir le terminal de prévisualisation'
	},
	repositoryTasks: {
		terminalOpened: 'Terminal ouvert.',
		commandTerminalOpened: 'Terminal ouvert avec cette commande : {command}. La carte du dépôt sera mise à jour avec le résultat.',
		installDependenciesTerminalOpened: 'Terminal ouvert avec la commande d\'installation des dépendances. La carte du dépôt sera mise à jour avec le résultat.',
		updateDependenciesTerminalOpened: 'Terminal ouvert avec la commande de mise à jour des dépendances. La carte du dépôt sera mise à jour avec le résultat.',
		startDevServerTerminalOpened: 'Terminal ouvert avec la commande du serveur de développement. La carte du dépôt sera mise à jour avec le résultat.',
		buildTerminalOpened: 'Terminal ouvert avec la commande de build. La carte du dépôt sera mise à jour avec le résultat.',
		previewTerminalOpened: 'Terminal ouvert avec la commande de prévisualisation. La carte du dépôt sera mise à jour avec le résultat.',
		taskRunning: '{task} en cours.',
		taskSucceeded: '{task} réussi.',
		taskStopped: '{task} arrêté.',
		taskFailed: '{task} échoué.',
		taskFailedWithExitCode: '{task} échoué. Code de sortie : {exitCode}.',
		tasks: {
			openTerminal: 'Terminal',
			installDependencies: 'Installation des dépendances',
			updateDependencies: 'Mise à jour des dépendances',
			startDevServer: 'Serveur de dev',
			build: 'Build',
			preview: 'Prévisualisation'
		}
	},
	errors: {
		'project-github-credential-required': 'Sélectionnez un identifiant GitHub.',
		'project-github-credential-vault-locked':
			'Déverrouillez l\'environnement pour utiliser l\'identifiant GitHub sélectionné.',
		'project-github-credential-missing': 'L\'identifiant GitHub sélectionné n\'a pas été trouvé.',
		'project-github-credential-invalid': 'L\'identifiant GitHub sélectionné doit être un jeton GitHub.',
		'project-name-required': 'Le nom est obligatoire.',
		'project-name-duplicate': 'Le nom existe déjà à cet endroit.',
		'project-parent-not-found': 'Le projet parent n\'a pas été trouvé.',
		'project-parent-invalid': 'Les groupes ne peuvent être ajoutés que sous un projet.',
		'project-node-not-found': 'Le projet n\'a pas été trouvé.',
		'project-path-required': 'Le chemin du projet est obligatoire.',
		'project-path-duplicate': 'Le chemin du projet est déjà enregistré.',
		'project-tags-too-many': 'Trop de tags. Supprimez-en quelques-uns et réessayez.',
		'project-tag-too-long': 'Les tags sont trop longs. Raccourcissez-les et réessayez.',
		'project-repository-target-invalid': 'Les dépôts ne peuvent être liés qu\'à des groupes.',
		'project-repository-not-found': 'Le lien vers le dépôt n\'a pas été trouvé.',
		'project-folder-workspace-required': 'Le chemin de l\'espace de travail est obligatoire.',
		'project-folder-workspace-not-absolute': 'Le chemin de l\'espace de travail doit être absolu.',
		'project-folder-workspace-not-found': 'Le chemin de l\'espace de travail n\'a pas été trouvé.',
		'project-folder-workspace-not-directory': 'Le chemin de l\'espace de travail doit être un dossier.',
		'project-folder-workspace-permission-denied': 'Le chemin de l\'espace de travail n\'est pas accessible en écriture.',
		'project-folder-workspace-unreadable': 'Le chemin de l\'espace de travail n\'a pas pu être vérifié.',
		'project-folder-root-invalid': 'Le dossier des projets n\'est pas utilisable.',
		'project-folder-parent-required': 'Le dossier parent n\'est pas utilisable.',
		'project-folder-parent-invalid': 'Le dossier parent n\'est pas utilisable.',
		'project-folder-parent-not-found': 'Le dossier parent n\'est pas utilisable.',
		'project-folder-path-required': 'Le chemin du dossier de projet est obligatoire.',
		'project-folder-path-invalid': 'Le chemin du dossier de projet n\'est pas utilisable.',
		'project-folder-name-required': 'Le nom est obligatoire.',
		'project-folder-name-invalid': 'Le nom ne peut pas être utilisé comme dossier.',
		'project-folder-conflict': 'Le chemin du dossier n\'est pas utilisable.',
		'project-folder-create-failed': 'Le dossier n\'a pas pu être créé.',
		'project-folder-ssealed-scaffold-failed': 'Le scaffold ssealed n\'a pas pu être créé.',
		'project-folder-open-path-required': 'Le chemin du dossier est obligatoire.',
		'project-folder-open-path-not-absolute': 'Le chemin du dossier doit être absolu.',
		'project-folder-open-path-not-found': 'Le dossier n\'a pas été trouvé.',
		'project-folder-open-path-not-directory': 'Le chemin du dossier doit être un dossier.',
		'project-folder-open-path-permission-denied': 'Le dossier n\'a pas pu être ouvert.',
		'project-folder-repository-path-outside-workspace':
			'Le dossier du dépôt doit rester dans l\'espace de travail actuel.',
		'project-folder-open-failed': 'Le dossier n\'a pas pu être ouvert.',
		'project-folder-delete-path-required': 'Le chemin du dossier est obligatoire.',
		'project-folder-delete-path-not-absolute': 'Le chemin du dossier doit être absolu.',
		'project-folder-delete-path-not-found': 'Le dossier n\'a pas été trouvé.',
		'project-folder-delete-path-not-directory': 'Le chemin du dossier doit être un dossier.',
		'project-folder-delete-path-outside-workspace':
			'Seuls les dossiers situés sous le dossier de projets de cet espace de travail peuvent être supprimés ici.',
		'project-folder-delete-path-permission-denied': 'Le dossier n\'a pas pu être supprimé.',
		'project-folder-delete-failed': 'Le dossier n\'a pas pu être supprimé.',
		'project-folder-unavailable': 'Les dossiers de projet sont disponibles dans l\'application de bureau.',
		'project-repository-name-required': 'Le nom du dépôt est obligatoire.',
		'project-repository-source-required': 'Le dossier ou l\'URL du dépôt est obligatoire.',
		'project-repository-path-required': 'Le chemin du dépôt est obligatoire.',
		'project-repository-path-outside-workspace':
			'Le chemin du dépôt doit rester à l\'intérieur de l\'espace de travail actuel.',
		'project-repository-path-duplicate': 'Le chemin du dépôt est déjà lié.',
		'project-repository-remote-url-invalid': 'L\'URL du dépôt n\'est pas utilisable.',
		'project-repository-remote-url-duplicate': 'L\'URL du dépôt est déjà enregistrée.',
		'project-repository-clone-unavailable': 'Le clonage de dépôt est disponible dans l\'application de bureau.',
		'project-repository-workspace-required': 'Le chemin de l\'espace de travail n\'est pas utilisable.',
		'project-repository-workspace-not-absolute': 'Le chemin de l\'espace de travail n\'est pas utilisable.',
		'project-repository-workspace-not-found': 'Le chemin de l\'espace de travail n\'est pas utilisable.',
		'project-repository-workspace-not-directory': 'Le chemin de l\'espace de travail n\'est pas utilisable.',
		'project-repository-workspace-permission-denied': 'Le chemin de l\'espace de travail n\'est pas utilisable.',
		'project-repository-workspace-unreadable': 'Le chemin de l\'espace de travail n\'est pas utilisable.',
		'project-repository-group-path-required': 'Le dossier de groupe de dépôts n\'est pas utilisable.',
		'project-repository-group-path-invalid': 'Le dossier de groupe de dépôts n\'est pas utilisable.',
		'project-repository-group-path-not-found': 'Le dossier de groupe de dépôts n\'est pas utilisable.',
		'project-repository-group-path-not-directory': 'Le dossier de groupe de dépôts n\'est pas utilisable.',
		'project-repository-name-invalid': 'Le nom du dépôt ne peut pas être utilisé comme dossier.',
		'project-repository-remote-url-required': 'L\'URL du dépôt est obligatoire.',
		'project-repository-clone-target-exists': 'Le dossier cible pour le clonage existe déjà.',
		'project-repository-clone-command-unavailable': 'La commande Git n\'a pas été trouvée.',
		'project-repository-clone-command-timed-out': 'Le clonage du dépôt a expiré.',
		'project-repository-clone-path-too-long':
			'Le clonage a atteint la limite de longueur de chemin Windows. Utilisez un chemin de projet plus court ou activez les chemins longs dans Windows et Git.',
		'project-repository-clone-token-invalid':
			'Le jeton GitHub est invalide ou expiré. Mettez à jour le GitHub PAT dans les variables d\'environnement.',
		'project-repository-clone-permission-denied':
			'Le jeton GitHub n\'a pas accès au dépôt. Vérifiez la sélection du dépôt et les droits de lecture du contenu.',
		'project-repository-clone-repository-not-found':
			'Le dépôt n\'a pas été trouvé. Pour les dépôts privés, GitHub peut afficher ce message lorsque le jeton n\'a pas d\'accès.',
		'project-repository-clone-organization-restricted':
			'L\'accès de l\'organisation GitHub est restreint. Autorisez le jeton pour l\'organisation ou l\'authentification SSO.',
		'project-repository-clone-access-denied':
			'L\'accès au dépôt a été refusé par GitHub. Vérifiez l\'URL, l\'accès du jeton et la politique de l\'organisation.',
		'project-repository-clone-auth-required':
			'Le clonage de dépôt requiert une authentification Git. Sélectionnez un identifiant GitHub pour ce projet.',
		'project-repository-clone-failed':
			'Échec du clonage du dépôt. Vérifiez l\'URL, le réseau et les identifiants Git.',
		'project-repository-git-path-required': 'Le chemin du dépôt est obligatoire.',
		'project-repository-git-path-not-absolute': 'Le chemin du dépôt doit être absolu.',
		'project-repository-git-path-not-found': 'Le chemin du dépôt n\'a pas été trouvé.',
		'project-repository-git-path-not-directory': 'Le chemin du dépôt doit être un dossier.',
		'project-repository-git-path-permission-denied': 'Le chemin du dépôt n\'est pas accessible en lecture.',
		'project-repository-git-path-unreadable': 'Le chemin du dépôt n\'a pas pu être vérifié.',
		'project-repository-git-command-unavailable': 'La commande Git n\'a pas été trouvée.',
		'project-repository-git-command-failed':
			'La commande Git a échoué. Vérifiez le chemin du dépôt et l\'installation de Git.',
		'project-repository-git-command-timed-out': 'La commande Git a expiré.',
		'project-repository-git-not-repository': 'Le dossier du dépôt n\'est pas initialisé pour Git.',
		'project-repository-git-init-failed': 'Le dépôt Git n\'a pas pu être initialisé.',
		'project-repository-git-remote-missing': 'Le distant (remote) de Git n\'est pas configuré.',
		'project-repository-git-push-auth-required': 'L\'envoi Git push requiert une authentification.',
		'project-repository-git-push-empty': 'Le dépôt n\'a pas de commits à envoyer.',
		'project-repository-git-push-failed':
			'Git push a échoué. Vérifiez l\'URL distante, la branche, le réseau et les identifiants.',
		'project-repository-git-fetch-auth-required': 'Git fetch requiert une authentification.',
		'project-repository-git-fetch-failed':
			'Git fetch a échoué. Vérifiez l\'URL distante, le réseau et les identifiants.',
		'project-repository-git-pull-auth-required': 'Git pull requiert une authentification.',
		'project-repository-git-pull-conflict':
			'Git pull a été interrompu car ce checkout contient des modifications locales ou des conflits. Faites un commit, un stash ou écartez les modifications locales, puis effectuez le pull à nouveau.',
		'project-repository-git-pull-failed':
			'Git pull a échoué. Vérifiez l\'URL distante, la branche, le réseau et les identifiants.',
		'project-repository-github-repo-name-required': 'Le nom du dépôt GitHub est obligatoire.',
		'project-repository-github-repo-name-invalid': 'Le nom du dépôt GitHub n\'est pas utilisable.',
		'project-repository-github-commit-message-required': 'Le message de commit est obligatoire.',
		'project-repository-github-commit-message-invalid': 'Le message de commit n\'est pas utilisable.',
		'project-repository-github-visibility-invalid': 'La visibilité de GitHub n\'est pas utilisable.',
		'project-repository-github-cli-unavailable': 'La CLI de GitHub n\'a pas été trouvée.',
		'project-repository-github-auth-required': 'La CLI de GitHub requiert une authentification.',
		'project-repository-github-remote-exists': 'L\'origine distante Git (remote origin) existe déjà.',
		'project-repository-github-empty': 'Le dépôt n\'a pas de commits à publier.',
		'project-repository-github-commit-identity-missing':
			'Le nom ou l\'e-mail de l\'auteur Git n\'est pas configuré.',
		'project-repository-github-commit-index-locked':
			'L\'index de Git est verrouillé par un autre processus.',
		'project-repository-github-commit-hook-failed':
			'Le commit initial a été bloqué par un hook de Git.',
		'project-repository-github-commit-failed': 'Le commit initial n\'a pas pu être créé.',
		'project-repository-github-create-failed':
			'Le dépôt GitHub n\'a pas pu être créé. Vérifiez l\'authentification GitHub et le nom du dépôt.',
		'project-repository-task-unavailable': 'Les tâches de dépôt sont disponibles dans l\'application de bureau.',
		'project-repository-task-workspace-required': 'Le chemin de l\'espace de travail n\'est pas utilisable.',
		'project-repository-task-workspace-not-absolute': 'Le chemin de l\'espace de travail n\'est pas utilisable.',
		'project-repository-task-workspace-not-found': 'Le chemin de l\'espace de travail n\'est pas utilisable.',
		'project-repository-task-workspace-not-directory': 'Le chemin de l\'espace de travail n\'est pas utilisable.',
		'project-repository-task-workspace-unreadable': 'Le chemin de l\'espace de travail n\'est pas utilisable.',
		'project-repository-task-path-required': 'Le chemin du dépôt n\'est pas utilisable.',
		'project-repository-task-path-not-absolute': 'Le chemin du dépôt n\'est pas utilisable.',
		'project-repository-task-path-not-found': 'Le chemin du dépôt n\'est pas utilisable.',
		'project-repository-task-path-not-directory': 'Le chemin du dépôt n\'est pas utilisable.',
		'project-repository-task-path-outside-workspace':
			'Le chemin du dépôt doit rester à l\'intérieur de l\'espace de travail actuel.',
		'project-repository-task-path-unreadable': 'Le chemin du dépôt n\'est pas utilisable.',
		'project-repository-task-invalid': 'La tâche du dépôt n\'est pas utilisable.',
		'project-repository-task-command-unavailable':
			'Aucune commande correspondante n\'a été trouvée pour ce dépôt.',
		'project-repository-task-terminal-unavailable': 'Aucun terminal pris en charge n\'a été trouvé.',
		'project-repository-task-terminal-unsupported-platform':
			'Les tâches de terminal de dépôt sont actuellement prises en charge uniquement sur Windows.',
		'project-repository-task-launch-failed': 'Le terminal de commande n\'a pas pu être ouvert.',
		'project-repository-task-record-write-failed':
			'L\'enregistrement de la tâche de dépôt n\'a pas pu être sauvegardé.',
		'project-repository-task-record-read-failed':
			'Les enregistrements des tâches de dépôt n\'ont pas pu être chargés.',
		'project-registry-read-failed': 'Les projets n\'ont pas pu être chargés.',
		'project-registry-version-unsupported':
			'Les données du projet utilisent un format plus récent. Mettez à jour Workduck avant d\'ouvrir à nouveau les projets.',
		'project-registry-write-failed': 'Les projets n\'ont pas pu être sauvegardés.',
		'project-repository-operation-read-failed':
			'Les enregistrements d\'opérations du dépôt n\'ont pas pu être chargés.',
		'project-repository-operation-write-failed':
			'L\'enregistrement d\'opération du dépôt n\'a pas pu être sauvegardé.'
	}
} as const;
