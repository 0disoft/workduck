export const esProjectsMessages = {
		newProject: 'Nuevo proyecto',
		newGroup: 'Nuevo grupo',
		newRepository: 'Nuevo repositorio',
		registeredCount: '{count} proyectos raíz',
		filters: {
			pullNeeded: 'Requiere pull',
			pushNeeded: 'Requiere push',
			commitNeeded: 'Requiere commit',
			searchLabel: 'Filtro por nombre de repositorio o etiqueta',
			searchPlaceholder: 'nombre o etiqueta'
		},
		kinds: {
			project: 'Proyecto',
			group: 'Grupo'
		},
		counts: {
			group: 'grupo',
			groups: 'grupos',
			repo: 'repositorio',
			repos: 'repositorios'
		},
		lastRepositoryOperation: 'Última acción: {timestamp}',
		repository: {
			uncommittedChanges: 'Cambios sin confirmar',
			queueCommitWorkOrder: 'Añadir tarea de commit',
			commitWorkOrderQueued: 'Tarea de commit añadida: {relativePath}',
			githubCredentialSaved: 'Credencial de GitHub guardada.'
		},
		operations: {
			running: {
				clone: 'Clonando repositorio',
				init: 'Inicializando repositorio Git',
				fetch: 'Obteniendo repositorio',
				pull: 'Haciendo pull en el repositorio',
				push: 'Haciendo push en el repositorio',
				publish: 'Publicando repositorio'
			},
			done: {
				clone: 'Repositorio clonado.',
				init: 'Repositorio inicializado.',
				fetch: 'Repositorio obtenido.',
				pull: 'Haciendo pull completado.',
				push: 'Haciendo push completado.',
				publish: 'Repositorio publicado.'
			},
			failed: {
				clone: 'Error al clonar.',
				init: 'Error al inicializar.',
				fetch: 'Error al obtener.',
				pull: 'Error al hacer pull.',
				push: 'Error al hacer push.',
				publish: 'Error al publicar.'
			},
			buttonRunning: {
				clone: 'Clonando',
				init: 'Inicializando',
				fetch: 'Obteniendo',
				pull: 'Haciendo pull',
				push: 'Haciendo push',
				publish: 'Publicando'
			},
			buttonIdle: {
				clone: 'Clonar',
				init: 'Git Init',
				fetch: 'Fetch',
				pull: 'Pull',
				push: 'Push',
				publish: 'Publicar'
			}
		},
		detailsDialog: {
			title: 'Editar proyecto',
			name: 'Nombre',
			path: 'Ruta',
			saving: 'Guardando',
			save: 'Guardar',
			cancel: 'Cancelar',
			saved: 'Detalles del proyecto guardados.'
		},
		deleteDialog: {
			titles: {
				project: 'Eliminar proyecto',
				group: 'Eliminar grupo',
				repository: 'Eliminar repositorio'
			},
			text: '¿Eliminar {name} de Workduck?',
			textWithAffected:
				'¿Eliminar {name} de Workduck? Esto también eliminará {affected} de la lista de proyectos.',
			affectedGroups: '{count} grupos secundarios',
			affectedGroup: '{count} grupo secundario',
			affectedRepositories: '{count} repositorios',
			affectedRepository: '{count} repositorio',
			localProjectFolder: 'Eliminar también esta carpeta de proyecto',
			localGroupFolder: 'Eliminar también esta carpeta de grupo',
			localRepositoryFolder: 'Eliminar también esta carpeta de repositorio',
			localFolderUnavailable:
				'La eliminación de carpetas locales solo está disponible para carpetas dentro de este espacio de trabajo.',
			localRepositoryFolderUnavailable:
				'La eliminación de carpetas locales solo está disponible para carpetas de repositorios dentro de este espacio de trabajo.',
			repositoryRemoved: 'Repositorio eliminado.',
			repositoryAndFolderRemoved: 'Repositorio y carpeta local eliminados.',
			projectRemoved: 'Proyecto eliminado.',
			projectAndFolderRemoved: 'Proyecto y carpeta local eliminados.',
			groupRemoved: 'Grupo eliminado.',
			groupAndFolderRemoved: 'Grupo y carpeta local eliminados.',
			cancel: 'Cancelar',
			remove: 'Eliminar',
			removing: 'Eliminando'
		},
		contextMenu: {
			openFolder: 'Abrir carpeta',
			editDetails: 'Editar nombre y ruta',
			editDescription: 'Editar descripción',
			githubCredential: 'Credencial de GitHub',
			remoteUrl: 'URL remota',
			editTags: 'Editar etiquetas',
			delete: 'Eliminar',
			clone: 'Clonar',
			initializeGit: 'Inicializar Git',
			publish: 'Publicar',
			applySsealed: 'Aplicar ssealed',
			openTerminal: 'Abrir terminal',
			installDependencies: 'Abrir terminal de instalación de dependencias',
			updateDependencies: 'Abrir terminal de actualización de dependencias',
			startDevServer: 'Abrir terminal del servidor de desarrollo',
			build: 'Abrir terminal de compilación',
			preview: 'Abrir terminal de vista previa'
		},
		repositoryTasks: {
			terminalOpened: 'Terminal abierta.',
			commandTerminalOpened: 'Se abrió una terminal con el comando: {command}. La tarjeta de repositorio se actualizará con el resultado.',
			installDependenciesTerminalOpened: 'Se abrió una terminal con el comando de instalación de dependencias. La tarjeta de repositorio se actualizará con el resultado.',
			updateDependenciesTerminalOpened: 'Se abrió una terminal con el comando de actualización de dependencias. La tarjeta de repositorio se actualizará con el resultado.',
			startDevServerTerminalOpened: 'Se abrió una terminal con el comando del servidor de desarrollo. La tarjeta de repositorio se actualizará con el resultado.',
			buildTerminalOpened: 'Se abrió una terminal con el comando de compilación. La tarjeta de repositorio se actualizará con el resultado.',
			previewTerminalOpened: 'Se abrió una terminal con el comando de vista previa. La tarjeta de repositorio se actualizará con el resultado.',
			taskRunning: '{task} en ejecución.',
			taskSucceeded: '{task} completada con éxito.',
			taskStopped: '{task} detenida.',
			taskFailed: 'Error en {task}.',
			taskFailedWithExitCode: 'Error en {task}. Código de salida: {exitCode}.',
			tasks: {
				openTerminal: 'Terminal',
				installDependencies: 'Instalación de dependencias',
				updateDependencies: 'Actualización de dependencias',
				startDevServer: 'Servidor de desarrollo',
				build: 'Compilación',
				preview: 'Vista previa'
			}
		},
		errors: {
			'project-github-credential-required': 'Seleccione una credencial de GitHub.',
			'project-github-credential-vault-locked':
				'Desbloquee el entorno para usar la credencial de GitHub seleccionada.',
			'project-github-credential-missing': 'No se encontró la credencial de GitHub seleccionada.',
			'project-github-credential-invalid': 'La credencial de GitHub seleccionada debe ser un token de GitHub.',
			'project-name-required': 'Se requiere el nombre.',
			'project-name-duplicate': 'El nombre ya existe aquí.',
			'project-parent-not-found': 'No se encontró el proyecto principal.',
			'project-parent-invalid': 'Los grupos solo se pueden añadir bajo un proyecto.',
			'project-node-not-found': 'No se encontró el proyecto.',
			'project-path-required': 'Se requiere la ruta del proyecto.',
			'project-path-duplicate': 'La ruta del proyecto ya está registrada.',
			'project-tags-too-many': 'Demasiadas etiquetas. Elimine algunas e inténtelo de nuevo.',
			'project-tag-too-long': 'Las etiquetas son demasiado largas. Acórtelas e inténtelo de nuevo.',
			'project-repository-target-invalid': 'Los repositorios solo se pueden vincular a grupos.',
			'project-repository-not-found': 'No se encontró el enlace del repositorio.',
			'project-folder-workspace-required': 'Se requiere la ruta del espacio de trabajo.',
			'project-folder-workspace-not-absolute': 'La ruta del espacio de trabajo debe ser absoluta.',
			'project-folder-workspace-not-found': 'No se encontró la ruta del espacio de trabajo.',
			'project-folder-workspace-not-directory': 'La ruta del espacio de trabajo debe ser una carpeta.',
			'project-folder-workspace-permission-denied': 'La ruta del espacio de trabajo no tiene permisos de escritura.',
			'project-folder-workspace-unreadable': 'No se pudo verificar la ruta del espacio de trabajo.',
			'project-folder-root-invalid': 'La carpeta de proyectos no se puede usar.',
			'project-folder-parent-required': 'La carpeta principal no se puede usar.',
			'project-folder-parent-invalid': 'La carpeta principal no se puede usar.',
			'project-folder-parent-not-found': 'La carpeta principal no se puede usar.',
			'project-folder-path-required': 'Se requiere la ruta de la carpeta de proyectos.',
			'project-folder-path-invalid': 'La ruta de la carpeta de proyectos no se puede usar.',
			'project-folder-name-required': 'Se requiere el nombre.',
			'project-folder-name-invalid': 'El nombre no se puede usar como carpeta.',
			'project-folder-conflict': 'La ruta de la carpeta no se puede usar.',
			'project-folder-create-failed': 'No se pudo crear la carpeta.',
			'project-folder-ssealed-scaffold-failed': 'No se pudo crear el scaffold de ssealed.',
			'project-folder-open-path-required': 'Se requiere la ruta de la carpeta.',
			'project-folder-open-path-not-absolute': 'La ruta de la carpeta debe ser absoluta.',
			'project-folder-open-path-not-found': 'No se encontró la ruta de la carpeta.',
			'project-folder-open-path-not-directory': 'La ruta de la carpeta debe ser una carpeta.',
			'project-folder-open-path-permission-denied': 'No se pudo abrir la ruta de la carpeta.',
			'project-folder-repository-path-outside-workspace':
				'La carpeta del repositorio debe estar dentro del workspace actual.',
			'project-folder-open-failed': 'No se pudo abrir la carpeta.',
			'project-folder-delete-path-required': 'Se requiere la ruta de la carpeta.',
			'project-folder-delete-path-not-absolute': 'La ruta de la carpeta debe ser absoluta.',
			'project-folder-delete-path-not-found': 'No se encontró la ruta de la carpeta.',
			'project-folder-delete-path-not-directory': 'La ruta de la carpeta debe ser una carpeta.',
			'project-folder-delete-path-outside-workspace':
				'Solo se pueden eliminar carpetas que estén bajo la carpeta de proyectos de este espacio de trabajo.',
			'project-folder-delete-path-permission-denied': 'No se pudo eliminar la carpeta.',
			'project-folder-delete-failed': 'No se pudo eliminar la carpeta.',
			'project-folder-unavailable': 'Las carpetas de proyecto están disponibles en la aplicación de escritorio.',
			'project-repository-name-required': 'Se requiere el nombre del repositorio.',
			'project-repository-source-required': 'Se requiere la carpeta o URL del repositorio.',
			'project-repository-path-required': 'Se requiere la ruta del repositorio.',
			'project-repository-path-outside-workspace':
				'La ruta del repositorio debe estar dentro del espacio de trabajo actual.',
			'project-repository-path-duplicate': 'La ruta del repositorio ya está vinculada.',
			'project-repository-remote-url-invalid': 'La URL del repositorio no se puede usar.',
			'project-repository-remote-url-duplicate': 'La URL del repositorio ya está registrada.',
			'project-repository-clone-unavailable': 'La clonación de repositorios está disponible en la aplicación de escritorio.',
			'project-repository-workspace-required': 'La ruta del espacio de trabajo no se puede usar.',
			'project-repository-workspace-not-absolute': 'La ruta del espacio de trabajo no se puede usar.',
			'project-repository-workspace-not-found': 'La ruta del espacio de trabajo no se puede usar.',
			'project-repository-workspace-not-directory': 'La ruta del espacio de trabajo no se puede usar.',
			'project-repository-workspace-permission-denied': 'La ruta del espacio de trabajo no se puede usar.',
			'project-repository-workspace-unreadable': 'La ruta del espacio de trabajo no se puede usar.',
			'project-repository-group-path-required': 'La carpeta del grupo del repositorio no se puede usar.',
			'project-repository-group-path-invalid': 'La carpeta del grupo del repositorio no se puede usar.',
			'project-repository-group-path-not-found': 'La carpeta del grupo del repositorio no se puede usar.',
			'project-repository-group-path-not-directory': 'La carpeta del grupo del repositorio no se puede usar.',
			'project-repository-name-invalid': 'El nombre del repositorio no se puede usar como carpeta.',
			'project-repository-remote-url-required': 'Se requiere la URL del repositorio.',
			'project-repository-clone-target-exists': 'La carpeta de destino de la clonación ya existe.',
			'project-repository-clone-command-unavailable': 'No se encontró el comando Git.',
			'project-repository-clone-command-timed-out': 'La clonación del repositorio agotó el tiempo de espera.',
			'project-repository-clone-path-too-long':
				'La clonación alcanzó el límite de longitud de rutas de Windows. Usa una ruta de proyecto más corta o activa rutas largas en Windows y Git.',
			'project-repository-clone-token-invalid':
				'El token de GitHub no es válido o ha expirado. Actualice el PAT de GitHub en las variables de entorno.',
			'project-repository-clone-permission-denied':
				'El token de GitHub no tiene acceso al repositorio. Verifique la selección de repositorios y los permisos de lectura de contenidos.',
			'project-repository-clone-repository-not-found':
				'No se encontró el repositorio. Para repositorios privados, GitHub puede mostrar esto cuando el token no tiene acceso.',
			'project-repository-clone-organization-restricted':
				'El acceso a la organización de GitHub está restringido. Autorice el token para la organización o SSO.',
			'project-repository-clone-access-denied':
				'GitHub denegó el acceso al repositorio. Verifique la URL, el acceso del token y la política de la organización.',
			'project-repository-clone-auth-required':
				'La clonación del repositorio requiere autenticación de Git. Seleccione una credencial de GitHub para este proyecto.',
			'project-repository-clone-failed':
				'Error al clonar el repositorio. Verifique la URL, la red y las credenciales de Git.',
			'project-repository-git-path-required': 'Se requiere la ruta del repositorio.',
			'project-repository-git-path-not-absolute': 'La ruta del repositorio debe ser absoluta.',
			'project-repository-git-path-not-found': 'No se encontró la ruta del repositorio.',
			'project-repository-git-path-not-directory': 'La ruta del repositorio debe ser una carpeta.',
			'project-repository-git-path-permission-denied': 'La ruta del repositorio no se puede leer.',
			'project-repository-git-path-unreadable': 'No se pudo verificar la ruta del repositorio.',
			'project-repository-git-command-unavailable': 'No se encontró el comando Git.',
			'project-repository-git-command-failed':
				'Error en el comando Git. Verifique la ruta del repositorio y la instalación de Git.',
			'project-repository-git-command-timed-out': 'El comando Git agotó el tiempo de espera.',
			'project-repository-git-not-repository': 'La carpeta del repositorio no está inicializada con Git.',
			'project-repository-git-init-failed': 'No se pudo inicializar el repositorio Git.',
			'project-repository-git-remote-missing': 'El origen remoto de Git no está configurado.',
			'project-repository-git-push-auth-required': 'Git push requiere autenticación.',
			'project-repository-git-push-empty': 'El repositorio no tiene commits para hacer push.',
			'project-repository-git-push-failed':
				'Error al hacer Git push. Verifique la URL remota, la rama, la red y las credenciales.',
			'project-repository-git-fetch-auth-required': 'Git fetch requiere autenticación.',
			'project-repository-git-fetch-failed':
				'Error al hacer Git fetch. Verifique la URL remota, la red y las credenciales.',
			'project-repository-git-pull-auth-required': 'Git pull requiere autenticación.',
			'project-repository-git-pull-conflict':
				'Se detuvo Git pull debido a cambios locales o conflictos. Confirme, guarde en stash o descarte los cambios locales y vuelva a intentarlo.',
			'project-repository-git-pull-failed':
				'Error al hacer Git pull. Verifique la URL remota, la rama, la red y las credenciales.',
			'project-repository-github-repo-name-required': 'Se requiere el nombre del repositorio de GitHub.',
			'project-repository-github-repo-name-invalid': 'El nombre del repositorio de GitHub no se puede usar.',
			'project-repository-github-commit-message-required': 'Se requiere el mensaje de commit.',
			'project-repository-github-commit-message-invalid': 'El mensaje de commit no se puede usar.',
			'project-repository-github-visibility-invalid': 'La visibilidad de GitHub no se puede usar.',
			'project-repository-github-cli-unavailable': 'No se encontró la CLI de GitHub.',
			'project-repository-github-auth-required': 'La CLI de GitHub requiere autenticación.',
			'project-repository-github-remote-exists': 'El origen remoto de Git ya existe.',
			'project-repository-github-empty': 'El repositorio no tiene commits para publicar.',
			'project-repository-github-commit-identity-missing':
				'El nombre o correo del autor de Git no está configurado.',
			'project-repository-github-commit-index-locked':
				'El índice de Git está bloqueado por otro proceso.',
			'project-repository-github-commit-hook-failed':
				'El commit inicial fue bloqueado por un hook de Git.',
			'project-repository-github-commit-failed': 'No se pudo crear el commit inicial.',
			'project-repository-github-create-failed':
				'No se pudo crear el repositorio de GitHub. Verifique la autenticación de GitHub y el nombre del repositorio.',
			'project-repository-task-unavailable': 'Las tareas de repositorio están disponibles en la aplicación de escritorio.',
			'project-repository-task-workspace-required': 'La ruta del espacio de trabajo no se puede usar.',
			'project-repository-task-workspace-not-absolute': 'La ruta del espacio de trabajo no se puede usar.',
			'project-repository-task-workspace-not-found': 'La ruta del espacio de trabajo no se puede usar.',
			'project-repository-task-workspace-not-directory': 'La ruta del espacio de trabajo no se puede usar.',
			'project-repository-task-workspace-unreadable': 'La ruta del espacio de trabajo no se puede usar.',
			'project-repository-task-path-required': 'La ruta del repositorio no se puede usar.',
			'project-repository-task-path-not-absolute': 'La ruta del repositorio no se puede usar.',
			'project-repository-task-path-not-found': 'La ruta del repositorio no se puede usar.',
			'project-repository-task-path-not-directory': 'La ruta del repositorio no se puede usar.',
			'project-repository-task-path-outside-workspace':
				'La ruta del repositorio debe estar dentro del espacio de trabajo actual.',
			'project-repository-task-path-unreadable': 'La ruta del repositorio no se puede usar.',
			'project-repository-task-invalid': 'La tarea del repositorio no se puede usar.',
			'project-repository-task-command-unavailable':
				'No se encontró ningún comando coincidente para este repositorio.',
			'project-repository-task-terminal-unavailable': 'No se encontró una terminal compatible.',
			'project-repository-task-terminal-unsupported-platform':
				'Las tareas de terminal de repositorio actualmente solo son compatibles con Windows.',
			'project-repository-task-launch-failed': 'No se pudo abrir la terminal de comandos.',
			'project-repository-task-record-write-failed':
				'No se pudo guardar el registro de la tarea de repositorio.',
			'project-repository-task-record-read-failed':
				'No se pudieron cargar los registros de las tareas de repositorio.',
			'project-registry-read-failed': 'No se pudieron cargar los proyectos.',
			'project-registry-version-unsupported':
				'Los datos del proyecto usan un formato más nuevo. Actualice Workduck antes de abrir proyectos de nuevo.',
			'project-registry-write-failed': 'No se pudieron guardar los proyectos.',
			'project-repository-operation-read-failed':
				'No se pudieron cargar los registros de operaciones de repositorio.',
			'project-repository-operation-write-failed':
				'No se pudo guardar el registro de operación de repositorio.'
		}
	} as const;
