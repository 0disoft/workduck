export const esQueueMessages = {
		list: 'Cola de trabajo',
		detail: 'Detalle de la tarea',
		filters: 'Filtros de la cola',
		contextMenu: 'Acciones de la tarea',
		registeredCount: '{count} tareas en cola',
		executionFilters: 'Filtros de ejecución',
		readFilters: 'Filtros de lectura',
		filterMenu: 'Filtros',
		activeFilterCount: '{count} filtros activos',
		kindFilter: 'Tipo',
		priorityFilter: 'Prioridad',
		sort: 'Ordenar',
		allFileKinds: 'Todos los tipos',
		allPriorities: 'Todas las prioridades',
		sortOptions: {
			'created-desc': 'Más recientes',
			'created-asc': 'Más antiguos',
			'priority-desc': 'Mayor prioridad',
			'priority-asc': 'Menor prioridad'
		},
		pendingCountLabel: '{count} tareas pendientes',
		resultReportReview: 'Revisión del informe',
		workOrderView: 'Ver orden de trabajo',
		workOrderId: 'ID de la tarea',
		proposalView: 'Ver propuesta',
		empty: 'Añada un informe o una orden de trabajo.',
		noMatches: 'No hay tareas coincidentes en la cola.',
		addWork: 'Añadir tarea',
		bulkDelete: 'Eliminar en lote',
		includePendingDelete: 'Incluir pendientes',
		newWork: 'Nueva tarea',
		editWork: 'Editar tarea',
		workTitle: 'Título de la tarea',
		workType: 'Tipo de tarea',
		workTypes: {
			instruction: 'Instrucción',
			directMessage: 'Mensaje directo',
			vote: 'Votación/selección'
		},
		workPriority: 'Prioridad',
		responseLanguage: 'Idioma de respuesta',
		responseLanguages: {
			auto: 'Mismo idioma que la tarea',
			ko: 'Coreano',
			en: 'Inglés',
			es: 'Español',
			fr: 'Francés',
			zh: 'Chino simplificado',
			hi: 'Hindi'
		},
		responseFormat: 'Formato de respuesta',
		responseFormats: {
			general: 'Informe general',
			'pros-cons': 'Pros y contras',
			'feature-proposal': 'Propuesta de funcionalidad',
			'execution-plan': 'Plan de ejecución',
			'code-review': 'Revisión de código',
			'risk-assessment': 'Evaluación de riesgos',
			'comparison-table': 'Tabla comparativa',
			'decision-memo': 'Memo de decisión',
			'bug-analysis': 'Análisis de errores',
			'writing-draft': 'Borrador de texto',
			'revision-draft': 'Borrador de revisión'
		},
		revisionOptions: {
			title: 'Opciones de revisión',
			description: 'Las opciones seleccionadas se añadirán al cuerpo de la tarea.',
			groups: {
				purpose: 'Propósito',
				tone: 'Tono',
				structure: 'Estructura',
				format: 'Formato'
			},
			options: {
				clarity: 'Claridad de significado',
				concise: 'Reducir redundancias',
				persuasive: 'Aumentar persuasión',
 natural: 'Expresión natural',
				formal: 'Más formal',
				casual: 'Más casual',
				sharp: 'Tono analítico',
				warm: 'Tono cercano',
				paragraphFlow: 'Mejorar flujo entre párrafos',
				sentenceRhythm: 'Ajustar ritmo de las oraciones',
				headlineLead: 'Fortalecer título/introducción',
				preserveMeaning: 'Preservar significado original',
				oneParagraph: 'Un solo párrafo',
				bulletSummary: 'Incluir puntos clave',
				markdownReady: 'Formato Markdown directo',
				keepLength: 'Mantener longitud similar'
			}
		},
		skillOptions: {
			title: 'Opciones de skill',
			description: 'Seleccione las opciones de tipo, tono o formato configuradas por las skills.'
		},
		noProject: 'Sin proyecto',
		noRepository: 'Sin repositorio',
		noSkill: 'Sin skill',
		noAgent: 'Sin agente',
		noReference: 'Sin referencia',
		linkedSkill: 'Skill vinculada',
		assignment: 'Configuración de ejecución',
		advancedExecution: 'Configuración avanzada',
		internalSkills: 'Skills internas',
		workProjects: 'Proyectos relacionados',
		workRepositories: 'Repositorios relacionados',
		workAgents: 'Agentes de la tarea',
		workReferences: 'Referencias de la tarea',
		repositorySearchPlaceholder: 'Buscar repositorios',
		selectionCount: '{count} seleccionados',
		workBody: 'Cuerpo de la tarea',
		directMessageBody: 'Mensaje',
		countLabel: '{current}/{max}',
		vote: {
			question: 'Pregunta',
			options: 'Opciones',
			optionName: 'Nombre de la opción',
			optionDescription: 'Descripción',
			addOption: 'Añadir opción',
			removeOption: 'Eliminar opción',
			criteria: 'Criterios',
			result: 'Resultado de la votación',
			choice: 'Elección',
			count: '{count} votos',
			invalid: '{count} respuestas no procesadas',
			optionCount: '{count} opciones',
			unparsed: 'Sin procesar'
		},
		structuredResponseFormats: {
			general: {
				summary: 'Resumen',
				strengths: 'Fortalezas/Evidencia',
				recommendations: 'Recomendaciones',
				cautions: 'Precauciones'
			},
			'pros-cons': {
				summary: 'Veredicto',
				strengths: 'Pros',
				recommendations: 'Juicio',
				cautions: 'Contras'
			},
			'feature-proposal': {
				summary: 'Resumen',
				strengths: 'Evidencia',
				recommendations: 'Funcionalidades propuestas',
				cautions: 'Precauciones'
			},
			'execution-plan': {
				summary: 'Objetivo',
				strengths: 'Supuestos',
				recommendations: 'Pasos',
				cautions: 'Riesgos'
			},
			'code-review': {
				summary: 'Revisión general',
				strengths: 'Mantener',
				recommendations: 'Correcciones',
				cautions: 'Problemas'
			},
			'risk-assessment': {
				summary: 'Veredicto de riesgo',
				strengths: 'Mitigaciones',
				recommendations: 'Respuestas',
				cautions: 'Riesgos clave'
			},
			'comparison-table': {
				summary: 'Veredicto comparativo',
				strengths: 'Criterios',
				recommendations: 'Filas comparativas',
				cautions: 'Factores de decisión'
			},
			'decision-memo': {
				summary: 'Decisión',
				strengths: 'Justificación',
				recommendations: 'Puntos decididos',
				cautions: 'Verificaciones de seguimiento'
			},
			'bug-analysis': {
				summary: 'Causa del error',
				strengths: 'Hechos confirmados',
				recommendations: 'Dirección de corrección',
				cautions: 'Riesgos de reproducción/regresión'
			},
			'writing-draft': {
				summary: 'Borrador terminado',
				strengths: 'Notas de estilo/fuente',
				recommendations: 'Opciones de revisión',
				cautions: 'Vacíos de información/supuestos'
			},
			'revision-draft': {
				summary: 'Borrador revisado',
				strengths: 'Opciones de revisión aplicadas',
				recommendations: 'Opciones de revisión adicionales',
				cautions: 'Cambios de significado/verificaciones'
			}
		},
		createWorkOrder: 'Crear orden de trabajo',
		delegateEvaluation: 'Delegar evaluación',
		creating: 'Creando',
		previewPrompt: 'Vista previa del prompt',
		executeWorkOrder: 'Ejecutar',
		completeWorkOrder: 'Marcar como completada',
		executing: 'Ejecutando',
		noFollowUpSelected: 'No se ha seleccionado ninguna tarea posterior.',
		noEvaluationTargets: 'No hay respuestas para evaluar.',
		evaluationAlreadyDelegated: 'Ya existe una orden de delegación de evaluación: {relativePath}',
		evaluationDelegated: 'Se ha creado la orden de delegación de evaluación {relativePath}.',
		createdFile: 'Se ha creado {relativePath}.',
		updatedFile: 'Se ha actualizado {relativePath}.',
		deletedFile: 'Se ha eliminado {relativePath}.',
		bulkDeletedFiles: 'Se han eliminado {count} tareas.',
		executedFile: 'Se ha creado {relativePath} y completado la orden de trabajo.',
		completedFile: 'Se ha completado {relativePath}.',
		reportNotification: {
			title: 'El informe está listo',
			body: 'El informe de resultados {title} está listo para revisar.'
		},
		nextWorkOrders: 'Siguientes órdenes de trabajo',
		promptPreview: {
			title: 'Vista previa del prompt',
			description: 'Revise los prompts del sistema y de usuario exactos antes de ejecutar la orden de trabajo.',
			systemPrompt: 'Prompt del sistema',
			userPrompt: 'Prompt de usuario',
			characterCount: '{count} caracteres'
		},
		priorities: {
			low: 'Baja',
			normal: 'Normal',
			high: 'Alta',
			urgent: 'Urgente'
		},
		executionStates: {
			pending: 'Pendiente',
			completed: 'Completada'
		},
		readStates: {
			read: 'Leída',
			unread: 'No leída'
		},
		fileKinds: {
			resultReport: 'Informe JSON',
			workOrder: 'Orden de trabajo',
			proposal: 'Propuesta',
			unsupported: 'No compatible'
		},
		reviewDecisions: {
			approved: 'Aprobar',
			needsWork: 'Requiere ajustes',
			rollback: 'Deshacer'
		},
		evaluation: {
			title: 'Evaluar respuesta',
			action: 'Evaluar',
			mode: 'Modo de evaluación',
			manual: 'Evaluación manual',
			aiDelegated: 'Delegar a IA',
			copyPrompt: 'Copiar prompt',
			promptCopied: 'Prompt de evaluación copiado.',
			clipboardUnavailable: 'El portapapeles no está disponible.',
			delegationPrompt: 'Prompt de delegación',
			sourceReport: 'Informe de origen',
			workspace: 'Espacio de trabajo',
			criteria: 'Criterios',
			targets: 'Objetivos',
			command: 'Comando',
			saving: 'Guardando',
			saved: 'Evaluación guardada.'
		},
		errors: {
			workspaceRequired: 'Se requiere la ruta del espacio de trabajo.',
			workspaceNotAbsolute: 'La ruta del espacio de trabajo debe ser absoluta.',
			workspaceNotFound: 'No se encontró la ruta del espacio de trabajo.',
			workspaceNotDirectory: 'La ruta del espacio de trabajo debe ser una carpeta.',
			workspacePermissionDenied: 'La ruta del espacio de trabajo no tiene permisos de escritura.',
			workspaceUnreadable: 'No se pudo verificar la ruta del espacio de trabajo.',
			rootInvalid: 'La carpeta de la cola de trabajo no se puede usar.',
			createFailed: 'No se pudo crear la carpeta de la cola de trabajo.',
			openFailed: 'No se pudo abrir la carpeta de la cola de trabajo.',
			listFailed: 'No se pudieron enumerar los archivos de la cola de trabajo.',
			fileInvalid: 'La ruta del archivo de la cola de trabajo no está permitida.',
			fileNotFound: 'No se encontró el archivo de la cola de trabajo.',
			fileReadFailed: 'No se pudo leer el archivo de la cola de trabajo.',
			fileWriteFailed: 'No se pudo escribir el archivo de la cola de trabajo.',
			fileDeleteFailed: 'No se pudo eliminar el archivo de la cola de trabajo.',
			fileAlreadyExists: 'El archivo de la cola de trabajo ya existe.',
			evaluationDelegationAlreadyExists:
				'Ya existe una orden de delegación de evaluación para este informe. Elimine la orden existente antes de crear otra.',
			unavailable: 'Las carpetas de la cola de trabajo están disponibles en la aplicación de escritorio.',
			executionNoTask: 'No hay ninguna tarea para ejecutar.',
			executionNoAgent: 'Seleccione al menos un agente de trabajo.',
			executionVaultLocked: 'Desbloquee la bóveda de entorno primero.',
			executionAgentNotFound: 'No se encontró el agente seleccionado.',
			executionSecretNotFound: 'No se encontró la clave API vinculada al agente.',
			executionProviderUnsupported:
				'No se pudo detectar el proveedor de LLM. Elija un proveedor en el agente o incluya DeepSeek, OpenAI o OpenRouter en el nombre o etiqueta de la clave API.',
			executionApiKeyRequired: 'La clave API está vacía.',
			executionPromptRequired: 'No se pudo crear el prompt de la tarea.',
			executionModelRequired: 'No se pudo seleccionar el modelo.',
			executionRequestInvalid: 'La solicitud de LLM no es válida.',
			executionAuthenticationFailed: 'Error de autenticación de LLM. Verifique la clave API.',
			executionRateLimited: 'Se alcanzó el límite de solicitudes de LLM. Inténtelo de nuevo más tarde.',
			executionProviderRejected: 'El proveedor de LLM rechazó la solicitud.',
			executionProviderTimeout: 'El proveedor de LLM agotó el tiempo de espera. Inténtelo de nuevo más tarde.',
			executionProviderUnavailable: 'No se pudo conectar con el proveedor de LLM.',
			executionResponseEmpty: 'La respuesta de LLM estaba vacía.',
			executionResponseInvalid: 'La respuesta de LLM no se pudo leer como informe.',
			executionUnavailable: 'La ejecución de tareas está disponible en la aplicación de escritorio.',
			executionUnknown: 'Ocurrió un error desconocido al ejecutar la tarea.',
			workBodyTooLong: 'El cuerpo de la tarea puede tener como máximo {max} caracteres.'
		}
	} as const;
