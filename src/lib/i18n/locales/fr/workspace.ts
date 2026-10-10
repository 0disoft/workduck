export const frWorkspaceMessages = {
	addWorkspaceInSettings: 'Ajoutez un espace de travail dans les Paramètres.',
	locked: 'Espace de travail verrouillé',
	folderUnavailable: 'Dossier d\'espace de travail indisponible',
	checkingFolder: 'Vérification du dossier d\'espace de travail...',
	path: 'Chemin',
	reconnect: 'Reconnecter',
	chooseFolder: 'Choisir le dossier de l\'espace de travail',
	firstWorkspaceTitle: 'Choisissez d\'abord un dossier pour commencer.',
	firstWorkspaceDescription: 'Choisissez un dossier, puis définissez son nom et son mot de passe. Vous pourrez préparer le dépôt Git plus tard.',
	addWorkspace: 'Ajouter un espace de travail',
	unlock: {
		submit: 'Déverrouiller',
		tryAgainIn: 'Réessayez dans {seconds} s.',
		passwordRequired: 'Le mot de passe est obligatoire.',
		passwordMismatch: 'Le mot de passe ne correspond pas.',
		passwordMismatchWithAttempts:
			'Le mot de passe ne correspond pas. {attemptsRemaining} tentatives restantes.',
		unavailable: 'Le déverrouillage est disponible dans l\'application de bureau.',
		invalidHash: 'Les données de verrouillage de l\'espace de travail n\'ont pas pu être lues.'
	},
	pathErrors: {
		pathRequired: 'Le chemin de l\'espace de travail est obligatoire.',
		pathTooLong: 'Le chemin de l\'espace de travail est trop long. Choisissez un chemin de dossier plus court.',
		pathNotAbsolute: 'Le chemin de l\'espace de travail doit être un chemin absolu de dossier.',
		pathNotFound: 'Le chemin de l\'espace de travail n\'existe pas.',
		pathNotDirectory: 'Le chemin de l\'espace de travail doit être un dossier.',
		pathPermissionDenied: 'Le chemin de l\'espace de travail n\'est pas accessible en lecture.',
		pathUnreadable: 'Le chemin de l\'espace de travail n\'a pas pu être vérifié.',
		pathValidationUnavailable: 'Le chemin de l\'espace de travail ne peut être vérifié que dans l\'application de bureau.',
		pathSelectionUnavailable: 'Le sélecteur de dossier d\'espace de travail n\'est pas disponible.',
		pathSelectionFailed: 'Le dossier d\'espace de travail n\'a pas pu être sélectionné.',
		pathDuplicate: 'Le chemin de l\'espace de travail est déjà enregistré.',
		workspaceNotFound: 'L\'espace de travail n\'a pas été trouvé.',
		registryReadFailed: 'Les paramètres de l\'espace de travail n\'ont pas pu être chargés.',
		registryConflict: 'La liste des espaces de travail a changé dans une autre fenêtre. Vérifiez la liste actuelle et réessayez.',
		registryWriteFailed: 'Les paramètres de l\'espace de travail n\'ont pas pu être enregistrés.'
	}
} as const;
