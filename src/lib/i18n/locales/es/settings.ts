export const esSettingsMessages = {
	title: 'Ajustes',
	pageTitle: 'Ajustes - Workduck',
	sections: 'Secciones de ajustes',
	tabs: {
		appearance: 'Apariencia',
		workspaces: 'Espacios de trabajo',
		sync: 'Sincronización',
		system: 'Sistema'
	},
	appearance: {
		section: 'Apariencia',
		language: 'Idioma',
		interfaceFontSize: 'Tamaño de fuente de la interfaz',
		loadError: 'No se pudieron cargar los ajustes de apariencia.',
		saveError: 'No se pudieron guardar los ajustes de apariencia.'
	},
	workspaces: {
		noWorkspaces: 'Sin espacios de trabajo.',
		status: 'Estado del espacio de trabajo',
		active: 'Activo',
		locked: 'Bloqueado',
		switch: 'Cambiar',
		lock: 'Bloquear',
		reconnect: 'Reconectar',
		repository: {
			section: 'Repositorio del espacio de trabajo',
			useAsRepository: 'Usar este espacio de trabajo como repositorio',
			prepare: 'Preparar repositorio',
			publish: 'Publicar',
			prepareTitle: 'Preparar repositorio del espacio de trabajo',
			publishTitle: 'Publicar repositorio del espacio de trabajo',
			githubRepository: 'Repositorio de GitHub',
			commitMessage: 'Mensaje de commit',
			visibility: 'Visibilidad en GitHub',
			private: 'Privado',
			public: 'Público',
			initializeGit: 'Inicializar repositorio Git',
			installMustflow: 'Instalar mustflow',
			installGitignore: 'Instalar .gitignore de Workduck',
			gitReady: 'Git listo',
			remoteReady: 'Remoto listo',
			commitNeeded: 'Requiere commit',
			queueCommitWorkOrder: 'Añadir tarea de commit',
			updateDependencies: 'Actualizar deps',
			pullNeeded: 'Traer {count}',
			pushNeeded: 'Enviar {count}',
			setupComplete: 'Repositorio del espacio de trabajo listo.',
			setupPartial: 'Espacio de trabajo añadido, pero falló la configuración del repositorio.',
			setupFailed: 'Falló la configuración del repositorio.',
			publishComplete: 'Repositorio del espacio de trabajo publicado.',
			commitWorkOrderQueued: 'Añadida tarea de commit: {relativePath}',
			dependencyUpdateTerminalOpened:
				'Se abrió una terminal con el comando de actualización de dependencias del espacio de trabajo.',
			fetchComplete: 'Cambios remotos consultados.',
			pullComplete: 'Cambios remotos traídos.',
			pushComplete: 'Cambios locales enviados.'
		},
		removeTitle: 'Eliminar espacio de trabajo',
		removeDescription: '¿Eliminar {name}? Los archivos locales no se borrarán.',
		errors: {
			nameRequired: 'El nombre del espacio de trabajo es obligatorio.',
			passwordRequired: 'La contraseña del espacio de trabajo es obligatoria.',
			passwordTooShort: 'La contraseña del espacio de trabajo debe tener al menos {minLength} caracteres.',
			passwordProtectFailed: 'No se pudo proteger la contraseña del espacio de trabajo.',
			passwordInvalidHash: 'No se pudieron leer los datos de bloqueo del espacio de trabajo.',
			passwordUnavailable: 'La contraseña del espacio de trabajo solo se puede proteger en la aplicación de escritorio.',
			passwordHashInvalid: 'No se pudieron guardar los datos de bloqueo del espacio de trabajo.',
			repositoryChoiceRequired: 'Elige si este espacio de trabajo debe ser un repositorio.',
			repositoryWorkspaceRequired: 'La carpeta del espacio de trabajo es obligatoria.',
			repositoryWorkspaceNotAbsolute: 'La ruta del espacio de trabajo debe ser absoluta.',
			repositoryWorkspaceNotFound: 'No se encontró la carpeta del espacio de trabajo.',
			repositoryWorkspaceNotDirectory: 'La ruta del espacio de trabajo debe ser una carpeta.',
			repositoryWorkspacePermissionDenied: 'Acceso denegado a la carpeta del espacio de trabajo.',
			repositoryWorkspaceUnreadable: 'No se pudo leer la carpeta del espacio de trabajo.',
			repositoryLayoutInvalid: 'La estructura de archivos del espacio de trabajo existente no es utilizable.',
			repositoryCreateFailed: 'No se pudieron crear los archivos del repositorio del espacio de trabajo.',
			repositoryGitUnavailable: 'Git no está disponible.',
			repositoryGitTimedOut: 'La inicialización de Git agotó el tiempo de espera.',
			repositoryGitInitFailed: 'No se pudo inicializar el repositorio Git.',
			repositoryMustflowUnavailable: 'El comando mustflow no está disponible.',
			repositoryMustflowTimedOut: 'La instalación de mustflow agotó el tiempo de espera.',
			repositoryMustflowFailed: 'Fallo en la instalación de mustflow.',
			repositoryMustflowPackageFailed: 'No se pudieron preparar los metadatos del paquete mustflow.',
			repositoryAgentInstructionsFailed: 'No se pudieron preparar las instrucciones de trabajo para agentes.',
			repositoryGitignoreFailed: 'No se pudo preparar el archivo .gitignore.',
			repositoryUnavailable: 'La configuración del repositorio del espacio de trabajo está disponible en la aplicación de escritorio.',
			repositoryGitPathRequired: 'La ruta del repositorio es obligatoria.',
			repositoryGitPathNotAbsolute: 'La ruta del repositorio debe ser absoluta.',
			repositoryGitPathNotFound: 'No se encontró la carpeta del repositorio.',
			repositoryGitPathNotDirectory: 'La ruta del repositorio debe ser una carpeta.',
			repositoryGitPathPermissionDenied: 'Acceso denegado a la carpeta del repositorio.',
			repositoryGitPathUnreadable: 'No se pudo comprobar la carpeta del repositorio.',
			repositoryGitCommandUnavailable: 'No se encontró el comando Git.',
			repositoryGitCommandFailed: 'Fallo en el comando Git.',
			repositoryGitCommandTimedOut: 'El comando Git agotó el tiempo de espera.',
			repositoryGitNotRepository: 'La carpeta no está inicializada para Git.',
			repositoryGitRemoteMissing: 'El remoto de Git no está configurado.',
			repositoryGitPushAuthRequired:
				'Git push requiere autenticación. Configura las credenciales de Git del sistema o añade un token de GitHub en el almacén de entorno.',
			repositoryGitPushEmpty: 'El repositorio no tiene commits para enviar.',
			repositoryGitPushFailed: 'Fallo al enviar (push) en Git.',
			repositoryGitFetchAuthRequired:
				'Git fetch requiere autenticación. Configura las credenciales de Git del sistema o añade un token de GitHub en el almacén de entorno.',
			repositoryGitFetchFailed: 'Fallo al consultar (fetch) en Git.',
			repositoryGitPullAuthRequired:
				'Git pull requiere autenticación. Configura las credenciales de Git del sistema o añade un token de GitHub en el almacén de entorno.',
			repositoryGitPullConflict:
				'Git pull se detuvo porque este checkout tiene cambios locales o conflictos. Haz commit, stash o descarta los cambios locales, y vuelve a traer (pull) los cambios.',
			repositoryGitPullFailed: 'Fallo al traer (pull) en Git.',
			repositoryGithubNameRequired: 'El nombre del repositorio de GitHub es obligatorio.',
			repositoryGithubNameInvalid: 'El nombre del repositorio de GitHub no es utilizable.',
			repositoryGithubCommitMessageRequired: 'El mensaje de commit es obligatorio.',
			repositoryGithubCommitMessageInvalid: 'El mensaje de commit no es utilizable.',
			repositoryGithubVisibilityInvalid: 'La visibilidad de GitHub no es utilizable.',
			repositoryGithubCliUnavailable: 'No se encontró la CLI de GitHub.',
			repositoryGithubAuthRequired: 'Se requiere autenticación en GitHub.',
			repositoryGithubRemoteExists: 'El origen remoto ya está configurado.',
			repositoryGithubEmpty: 'El repositorio no tiene commits para publicar.',
			repositoryGithubCommitIdentityMissing: 'El nombre o correo del autor de Git no está configurado.',
			repositoryGithubCommitIndexLocked: 'El índice de Git está bloqueado por otro proceso.',
			repositoryGithubCommitHookFailed: 'El commit inicial fue bloqueado por un hook de Git.',
			repositoryGithubCommitFailed: 'No se pudo crear el commit inicial.',
			repositoryGithubCreateFailed: 'No se pudo crear el repositorio de GitHub.'
		},
		tooltips: {
			unlock: 'Introduce la contraseña de este espacio de trabajo para habilitarlo en este dispositivo.',
			prepareRepository:
				'Prepara Git, mustflow y el .gitignore de Workduck en este espacio de trabajo.',
			publishRepository: 'Publica este repositorio de espacio de trabajo en GitHub por primera vez.',
			fetchRepository: 'Comprueba los cambios remotos para este repositorio de espacio de trabajo.',
			pullRepository: 'Trae los cambios remotos del espacio de trabajo a esta carpeta.',
			pushRepository: 'Envía los cambios locales del espacio de trabajo al repositorio remoto.',
			queueCommitWorkOrder: 'Añade la limpieza de cambios no confirmados a la cola de trabajo.',
			updateDependencies:
				'Abre una terminal para actualizar dependencias en la carpeta del espacio de trabajo.',
			reconnect: 'Elige una carpeta local de nuevo si este espacio de trabajo se sincronizó desde otro dispositivo.',
			switch: 'Establece este espacio de trabajo como el área de trabajo actual.',
			lock: 'Bloquea este espacio de trabajo de nuevo hasta que se introduzca su contraseña.',
			remove: 'Elimina este espacio de trabajo de Workduck. Los archivos locales no se borrarán.'
		}
	},
	sync: {
		section: 'Sincronización',
		encryptedData: 'Datos cifrados',
		noFolder: 'Sin carpeta',
		checking: 'Comprobando',
		noRepository: 'Sin repositorio',
		unavailable: 'No disponible',
		noBranch: 'Sin rama',
		commitNeeded: 'Requiere commit',
		queueCommitWorkOrder: 'Añadir tarea de commit',
		tooltips: {
			folder: 'Elige la carpeta que almacena el archivo de sincronización.',
			fetch: 'Comprueba el repositorio de sincronización remoto.',
			pull: 'Trae los cambios del archivo de sincronización remota a esta carpeta.',
			push: 'Confirma y sube este archivo de sincronización.',
			queueCommitWorkOrder: 'Añade la limpieza de cambios no confirmados del repositorio de sincronización a la cola de trabajo.',
			export:
				'Cifra el espacio de trabajo actual y los datos del proyecto en el área de texto inferior. Úsalo para copiar datos de sincronización manualmente sin un archivo.',
			import:
				'Aplica los datos cifrados pegados en el área de texto inferior. Los datos deben haber sido exportados con la misma contraseña.',
			save:
				'Cifra el espacio de trabajo actual y los datos del proyecto, luego escríbelos en el archivo de la carpeta de sincronización seleccionada. Úsalo antes de un Git push.',
			load:
				'Lee el archivo cifrado de la carpeta de sincronización seleccionada y aplícalo a esta aplicación. Úsalo después de un Git pull.'
		},
		confirmations: {
			exportData: {
				title: 'Confirmar exportación de datos cifrados',
				body:
					'El área de texto de datos cifrados se reemplazará con una nueva exportación de esta aplicación.',
				inputLabel: 'Escribe la frase exacta que se muestra a continuación para continuar.',
				confirmTextLabel: 'Frase exacta',
				confirmText: 'Exportar datos cifrados',
				actionLabel: 'Exportar'
			},
			importData: {
				title: 'Confirmar importación de datos cifrados',
				body:
					'Los datos cifrados en el área de texto reemplazarán los datos del proyecto y espacio de trabajo de esta aplicación.',
				inputLabel: 'Escribe la frase exacta que se muestra a continuación para continuar.',
				confirmTextLabel: 'Frase exacta',
				confirmText: 'Importar datos cifrados',
				actionLabel: 'Importar'
			},
			saveFile: {
				title: 'Confirmar guardado del archivo de sincronización',
				body:
					'El archivo {fileName} en {folderPath} se sobrescribirá con los datos cifrados de esta aplicación.',
				inputLabel: 'Escribe la frase exacta que se muestra a continuación para continuar.',
				confirmTextLabel: 'Frase exacta',
				confirmText: 'Guardar archivo de sincronización',
				actionLabel: 'Guardar'
			},
			loadFile: {
				title: 'Confirmar carga del archivo de sincronización',
				body:
					'El archivo {fileName} en {folderPath} se cargará en los datos del proyecto y espacio de trabajo de esta aplicación.',
				inputLabel: 'Escribe la frase exacta que se muestra a continuación para continuar.',
				confirmTextLabel: 'Frase exacta',
				confirmText: 'Cargar archivo de sincronización',
				actionLabel: 'Cargar'
			},
			pullGit: {
				title: 'Confirmar Git pull',
				body:
					'Git pull aplicará los cambios remotos en {folderPath}. Cargar los datos después puede cambiar los datos de esta aplicación.',
				inputLabel: 'Escribe la frase exacta que se muestra a continuación para continuar.',
				confirmTextLabel: 'Frase exacta',
				confirmText: 'Git pull',
				actionLabel: 'Traer'
			},
			pushGit: {
				title: 'Confirmar Git push',
				body:
					'El archivo de sincronización {fileName} en {folderPath} se confirmará si es necesario y se enviará al repositorio remoto.',
				inputLabel: 'Escribe la frase exacta que se muestra a continuación para continuar.',
				confirmTextLabel: 'Frase exacta',
				confirmText: 'Git push',
				actionLabel: 'Enviar'
			}
		},
		statuses: {
			exported: 'Exportado.',
			imported: 'Importado.',
			saved: 'Guardado {fileName}.',
			loaded: 'Cargado {fileName}.',
			fetched: 'Cambios remotos consultados.',
			pulled: 'Cambios remotos traídos. Usa "Cargar" para aplicarlos.',
			pushed: 'Cambios remotos enviados.',
			committedAndPushed: 'Confirmado y enviado.',
			commitWorkOrderQueued: 'Añadida tarea de commit: {relativePath}'
		},
		operations: {
			fetchLabel: 'Consultando sincronización',
			pullLabel: 'Trayendo sincronización',
			pushLabel: 'Enviando sincronización',
			fetchDetail: 'Comprobando cambios remotos.',
			pullDetail: 'Actualizando la carpeta de sincronización.',
			pushDetail: 'Subiendo el archivo de sincronización.'
		},
		errors: {
			gitActionInvalid: 'La acción Git no es válida.',
			passwordRequired: 'La contraseña es obligatoria.',
			folderRequired: 'La carpeta es obligatoria.',
			folderNotAbsolute: 'La ruta de la carpeta debe ser absoluta.',
			folderNotFound: 'No se encontró la carpeta.',
			folderNotDirectory: 'La ruta debe ser una carpeta.',
			folderPermissionDenied: 'Acceso denegado a la carpeta.',
			fileNameRequired: 'El archivo de sincronización es obligatorio.',
			fileNameInvalid: 'El nombre del archivo de sincronización no es válido.',
			contentRequired: 'Los datos cifrados son obligatorios.',
			fileNotFound: 'No se encontró el archivo de sincronización.',
			fileTooLarge: 'El archivo de sincronización es demasiado grande.',
			fileTargetInvalid: 'La ruta del archivo de sincronización no es utilizable.',
			fileReadFailed: 'No se pudo leer el archivo de sincronización.',
			fileWriteFailed: 'No se pudo guardar el archivo de sincronización.',
			fileUnavailable: 'Los archivos de sincronización están disponibles en la aplicación de escritorio.',
			gitNotRepository: 'La carpeta no es un repositorio Git.',
			gitRemoteMissing: 'El remoto de Git no está configurado.',
			gitBranchMissing: 'No se encontró la rama de Git.',
			gitUnavailable: 'Git no está disponible.',
			gitTimedOut: 'El comando Git agotó el tiempo de espera.',
			gitAuthRequired:
				'Se requiere autenticación en Git. Configura las credenciales de Git del sistema o añade un token de GitHub en el almacén de entorno.',
			gitIdentityRequired: 'El nombre o correo del usuario de Git no está configurado.',
			gitRemoteHasChanges: 'El remoto tiene cambios. Trae (pull) los cambios primero.',
			gitFastForwardRequired: 'Pull requiere una fusión (merge) manual.',
			gitTrustRequired: 'Se debe configurar la confianza en el repositorio Git.',
			gitCommandFailed: 'Fallo en el comando Git.',
			gitReadFailed: 'No se pudo leer el repositorio Git.',
			gitSyncUnavailable: 'La sincronización de Git está disponible en la aplicación de escritorio.',
			envelopeInvalid: 'Los datos cifrados no son válidos.',
			encryptedDataDamaged: 'Los datos cifrados están dañados.',
			exportFailed: 'Fallo al exportar.',
			passwordMismatch: 'La contraseña no coincide.',
			workspaceDataInvalid: 'Los datos del espacio de trabajo no son válidos.',
			projectReadFailed: 'No se pudieron cargar los metadatos del proyecto.',
			projectWriteFailed: 'No se pudieron guardar los metadatos del proyecto.',
			encryptionUnavailable: 'El cifrado de sincronización está disponible en la aplicación de escritorio.',
			settingsSaveFailed: 'No se pudieron guardar los ajustes de sincronización.'
		}
	},
	system: {
		section: 'Sistema',
		startOnSignIn: 'Iniciar al iniciar Windows',
		showTrayIcon: 'Mostrar icono en la bandeja',
		minimizeToTray: 'Minimizar a la bandeja',
		workspaceIdleLock: 'Bloquear por inactividad',
		workspaceIdleLockNever: 'Nunca',
		workspaceIdleLockMinutes: '{minutes} minutos',
		loadError: 'No se pudieron cargar los ajustes del sistema.',
		saveError: 'No se pudieron guardar los ajustes del sistema.',
		autostartUnavailable: 'El inicio automático está disponible en la aplicación de escritorio.',
		autostartReadFailed: 'No se pudo cargar el estado de inicio automático.',
		autostartSaveFailed: 'No se pudo guardar la configuración de inicio automático.'
	}
} as const;
