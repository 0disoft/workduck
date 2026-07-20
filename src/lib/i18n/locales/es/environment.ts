export const esEnvironmentMessages = {
		ariaLabel: 'Variables de entorno',
		registeredCount: '{count} variables de entorno',
		vaultPassword: 'Contraseña de la bóveda',
		createVault: 'Crear bóveda',
		unlockVault: 'Desbloquear',
		lockVault: 'Bloquear',
		kind: 'Tipo',
		tags: 'Etiquetas',
		value: 'Valor',
		select: 'Seleccionar',
		filters: 'Filtros de entorno',
		kindFilter: 'Filtrar por tipo',
		tagFilter: 'Filtrar por etiqueta',
		allKinds: 'Todos los tipos',
		allTags: 'Todas las etiquetas',
		empty: 'Aún no hay variables de entorno.',
		noMatches: 'No hay variables de entorno coincidentes.',
		entries: 'Entradas de variables de entorno',
		copy: 'Copiar',
		show: 'Mostrar',
		hide: 'Ocultar',
		applyCliEnvironment: 'Aplicar env de CLI',
		applyCliEnvironmentTooltip:
			'Guarda los valores secretos como variables de entorno de usuario en texto plano. Otros procesos del mismo usuario pueden leerlos.',
		cliEnvironmentConfirm:
			'¿Guardar estos valores secretos como variables de entorno de usuario en texto plano? Otros procesos del mismo usuario pueden leerlos.',
		secretKinds: {
			'api-key': 'Clave API',
			token: 'Token',
			'ssh-key': 'Clave SSH',
			account: 'Cuenta',
			password: 'Contraseña',
			other: 'Otro'
		},
		secretTags: {
			llm: 'LLM',
			github: 'GitHub',
			gitlab: 'GitLab',
			openai: 'OpenAI',
			anthropic: 'Anthropic',
			openrouter: 'OpenRouter',
			umans: 'Umans',
			cloud: 'Cloud',
			database: 'Base de datos',
			auth: 'Autenticación',
			sync: 'Sincronización',
			deployment: 'Despliegue',
			monitoring: 'Monitoreo',
			payment: 'Pago',
			storage: 'Almacenamiento'
		},
		statuses: {
			created: 'Bóveda creada.',
			saved: 'Guardado.',
			removed: 'Eliminado.',
			copied: 'Copiado.',
			cliEnvironmentApplied: 'Se aplicaron {count} variables de entorno de la CLI.',
			cliEnvironmentAppliedWithSkipped:
				'Se aplicaron {applied} variables de entorno de la CLI. Se omitieron {skipped} entradas guardadas porque se asignan al mismo nombre de CLI o no se pueden usar como variables de CLI.'
		},
		errors: {
			vaultPasswordRequired: 'Se requiere la contraseña de la bóveda.',
			vaultPasswordTryAgain: 'Inténtelo de nuevo en {seconds} s.',
			vaultPasswordMismatch: 'La contraseña de la bóveda no coincide.',
			vaultPasswordMismatchWithAttempts:
				'La contraseña de la bóveda no coincide. Quedan {attemptsRemaining} intentos.',
			vaultUnavailable: 'La bóveda está disponible en la aplicación de escritorio.',
			vaultInvalid: 'No se pudieron leer los datos de la bóveda.',
			vaultSaveFailed: 'No se pudo guardar la bóveda.',
			vaultOperationFailed: 'Error en la operación de la bóveda.',
			clipboardUnavailable: 'El portapapeles no está disponible.',
			copyFailed: 'Error al copiar.',
			nameRequired: 'Se requiere el nombre.',
			kindRequired: 'Se requiere el tipo.',
			tagRequired: 'Se requiere la etiqueta.',
			nameDuplicate: 'El nombre ya existe.',
			valueRequired: 'Se requiere el valor.',
			notFound: 'No se encontró la entrada.',
			cliEnvironmentNoVariables:
				'No se encontraron variables de entorno compatibles con la CLI.',
			cliEnvironmentApplyFailed: 'No se pudieron aplicar las variables de entorno de la CLI.',
			cliEnvironmentUnsupported:
				'Las variables de entorno de usuario no son compatibles con este sistema operativo.',
			cliEnvironmentUnavailable: 'La aplicación de variables de entorno de la CLI está disponible en la aplicación de escritorio.'
		}
	} as const;
