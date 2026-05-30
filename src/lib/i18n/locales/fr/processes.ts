export const frProcessesMessages = {
	title: 'Processus',
	list: 'Liste des processus',
	details: 'Détails du processus',
	registeredCount: '{count} processus en cours d\'exécution',
	pid: 'PID',
	kind: 'Type',
	command: 'Commande',
	ports: 'Ports d\'écoute',
	memory: 'Mémoire',
	forceKill: 'Forcer l\'arrêt',
	forceKillConfirm: 'Forcer l\'arrêt de {name} ?',
	empty: 'Aucun processus de développement n\'est en cours d\'exécution.',
	refreshed: 'Actualisé.',
	killSucceeded: 'Processus arrêté.',
	errors: {
		unavailable: 'L\'inspection des processus est disponible dans l\'application de bureau.',
		readFailed: 'Les processus n\'ont pas pu être lus.',
		killDenied: 'Workduck ne peut pas arrêter ce processus.',
		killFailed: 'Le processus n\'a pas pu être arrêté.'
	}
} as const;
