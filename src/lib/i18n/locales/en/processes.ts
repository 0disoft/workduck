export const enProcessesMessages = {
		title: 'Processes',
		list: 'Process list',
		details: 'Process details',
		registeredCount: '{count} running processes',
		pid: 'PID',
		kind: 'Type',
		command: 'Command',
		ports: 'Listening ports',
		memory: 'Memory',
		forceKill: 'Force kill',
		forceKillConfirm: 'Force kill {name}?',
		empty: 'No development processes are running.',
		refreshed: 'Refreshed.',
		killSucceeded: 'Process killed.',
		errors: {
			unavailable: 'Process inspection is available in the desktop app.',
			readFailed: 'Processes could not be read.',
			killDenied: 'Workduck cannot kill this process.',
			killFailed: 'Process could not be killed.'
		}
	} as const;
