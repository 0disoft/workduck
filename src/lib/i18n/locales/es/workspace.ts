export const esWorkspaceMessages = {
		addWorkspaceInSettings: 'Añada un espacio de trabajo en Configuración.',
		locked: 'Espacio de trabajo bloqueado',
		folderUnavailable: 'Carpeta del espacio de trabajo no disponible',
		checkingFolder: 'Comprobando la carpeta del espacio de trabajo...',
		path: 'Ruta',
		reconnect: 'Reconectar',
		chooseFolder: 'Elegir carpeta del espacio de trabajo',
		unlock: {
			submit: 'Desbloquear',
			tryAgainIn: 'Inténtelo de nuevo en {seconds} s.',
			passwordRequired: 'Se requiere contraseña.',
			passwordMismatch: 'La contraseña no coincide.',
			passwordMismatchWithAttempts:
				'La contraseña no coincide. Quedan {attemptsRemaining} intentos.',
			unavailable: 'El desbloqueo está disponible en la aplicación de escritorio.',
			invalidHash: 'No se pudieron leer los datos de bloqueo del espacio de trabajo.'
		},
		pathErrors: {
			pathRequired: 'Se requiere la ruta del espacio de trabajo.',
			pathNotAbsolute: 'La ruta del espacio de trabajo debe ser una ruta de carpeta absoluta.',
			pathNotFound: 'La ruta del espacio de trabajo no existe.',
			pathNotDirectory: 'La ruta del espacio de trabajo debe ser una carpeta.',
			pathPermissionDenied: 'La ruta del espacio de trabajo no se puede leer.',
			pathUnreadable: 'No se pudo verificar la ruta del espacio de trabajo.',
			pathValidationUnavailable: 'La ruta del espacio de trabajo solo se puede verificar en la aplicación de escritorio.',
			pathSelectionUnavailable: 'El selector de carpeta del espacio de trabajo no está disponible.',
			pathSelectionFailed: 'No se pudo seleccionar la carpeta del espacio de trabajo.',
			pathDuplicate: 'La ruta del espacio de trabajo ya está registrada.',
			workspaceNotFound: 'No se encontró el espacio de trabajo.',
			registryReadFailed: 'No se pudo cargar la configuración del espacio de trabajo.',
			registryWriteFailed: 'No se pudo guardar la configuración del espacio de trabajo.'
		}
	} as const;
