export const esProcessesMessages = {
	title: 'Procesos',
	list: 'Lista de procesos',
	details: 'Detalles del proceso',
	registeredCount: '{count} procesos en ejecución',
	pid: 'PID',
	kind: 'Tipo',
	command: 'Comando',
	ports: 'Puertos de escucha',
	memory: 'Memoria',
	forceKill: 'Forzar detención',
	forceKillConfirm: '¿Forzar la detención de {name}?',
	empty: 'No hay procesos de desarrollo en ejecución.',
	refreshed: 'Actualizado.',
	killSucceeded: 'Proceso finalizado.',
	errors: {
		unavailable: 'La inspección de procesos está disponible en la aplicación de escritorio.',
		readFailed: 'No se pudieron leer los procesos.',
		killDenied: 'Workduck no puede finalizar este proceso.',
		killFailed: 'No se pudo finalizar el proceso.'
	}
} as const;
