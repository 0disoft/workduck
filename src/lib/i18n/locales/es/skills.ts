export const esSkillsMessages = {
	title: 'Skills',
	list: 'Lista de skills',
	details: 'Detalles de la skill',
	registeredCount: '{count} skills',
	newSkill: 'Nueva skill',
	editSkill: 'Editar skill',
	copySkill: 'Copiar',
	copyNameSuffix: 'copia',
	saved: 'Guardado.',
	removed: 'Eliminado.',
	removeReferencedWarning:
		'{name} se utiliza en {count} archivos de cola. Vuelve a hacer clic en Eliminar para borrarlo de todos modos.',
	optionGroups: {
		title: 'Opciones de trabajo',
		description: 'Configura los tipos, tonos y otras opciones que se muestran cuando se selecciona esta skill en la cola.',
		empty: 'Sin opciones de trabajo',
		addGroup: 'Añadir grupo de opciones',
		removeGroup: 'Eliminar grupo de opciones',
		groupLimit: 'Se pueden guardar hasta {max} grupos de opciones.',
		groupNameRequired: 'El grupo de opciones {index} necesita un nombre.',
		groupName: 'Nombre del grupo',
		selectionMode: 'Modo de selección',
		single: 'Elegir una',
		multiple: 'Elegir varias',
		options: 'Opciones',
		addOption: 'Añadir opción',
		removeOption: 'Eliminar opción',
		optionName: 'Nombre de la opción',
		optionDescription: 'Descripción de la opción',
		noOptions: 'Sin opciones',
		optionRequired: 'El grupo de opciones {index} necesita al menos una opción.',
		optionLimit: 'El grupo de opciones {index} puede guardar hasta {max} opciones.',
		optionNameRequired: 'La opción {optionIndex} en el grupo {groupIndex} necesita un nombre.',
		countLabel: '{current}/{max}'
	},
	outputTypes: {
		writing: 'Redacción',
		revision: 'Revisión',
		'work-order': 'Orden de trabajo',
		proposal: 'Propuesta',
		'result-report': 'Informe de resultados',
		'agent-evaluation': 'Evaluación de agentes'
	},
	seedSkills: {
		proposalWriter: {
			name: 'Redactor de propuestas',
			description:
				'Compara opciones y produce a partir de ellas una propuesta con recomendación y tareas de seguimiento.',
			instructions:
				'Devuelve un artefacto workduck.queue-proposal/v1. Compara las opciones viables, indica las ventajas y desventajas, elige una recomendación e incluye solo órdenes de trabajo de seguimiento concretas cuando sea necesario actuar.'
		},
		writingAssistant: {
			name: 'Asistente de redacción',
			description: 'Redacta o revisa textos a partir de un brief, restricciones de estilo y referencias.',
			instructions:
				'Escribe el fragmento solicitado a partir del cuerpo de la tarea y las referencias seleccionadas. Trata cualquier ID de orden de trabajo de Workduck como la etiqueta de asignación, no como evidencia adicional por sí misma. Respeta los controles explícitos de número de párrafos, oraciones por párrafo, tono, audiencia, punto de vista, idioma, formato y frases prohibidas. Si la tarea no define controles, genera un borrador pulido y conciso en el idioma de la tarea. Utiliza las referencias seleccionadas como material de origen sin inventar hechos no respaldados. Para el formato de respuesta de borrador de redacción, coloca el borrador terminado en el resumen (summary), las notas de estilo/fuente en las fortalezas (strengths), las direcciones de revisión opcionales en las recomendaciones (recommendations) y los vacíos de información o suposiciones en las advertencias (cautions).'
		},
		revisionAssistant: {
			name: 'Asistente de revisión',
			description: 'Revisa borradores según las opciones seleccionadas de propósito, tono, estructura y formato.',
			instructions:
				'Revisa el borrador proporcionado según el cuerpo de la tarea, las referencias seleccionadas y las opciones de revisión marcadas. Preserva el significado original y las afirmaciones fácticas a menos que la tarea pida explícitamente cambiarlas. Se pueden aplicar varias opciones marcadas a la vez; resuelve los conflictos manteniendo primero el significado, luego la estructura, luego el tono y por último el formato. Utiliza las referencias solo como apoyo para correcciones de hechos y no inventes hechos no respaldados. Para el formato de respuesta de borrador de revisión, coloca el texto revisado en el resumen (summary), las opciones de revisión aplicadas en las fortalezas (strengths), las ideas de revisión restantes opcionales en las recomendaciones (recommendations) y los cambios de significado, las compensaciones, los vacíos de información o los hechos a verificar en las advertencias (cautions).'
		},
		codeReviewer: {
			name: 'Revisor de código',
			description: 'Revisa código o diffs de Git para verificar la corrección, mantenibilidad, seguridad y riesgos de tiempo de ejecución.',
			instructions:
				'Revisa el código suministrado, los fragmentos de archivo o el diff de Git. Prefiere el formato de respuesta de revisión de código cuando esté disponible. Comienza con hallazgos concretos ordenados por gravedad, incluye rutas de archivo y referencias de línea cuando se proporcionen, y céntrate en defectos, regresiones, mantenibilidad, rendimiento, seguridad y riesgos específicos del framework. No elogies de forma generalizada ni reescribas código no relacionado. Si falta evidencia, indica el vacío de información en la revisión en lugar de inventar el contexto.'
		},
		commitHandoffWriter: {
			name: 'Redactor de commits e informes de entrega',
			description: 'Convierte resúmenes de cambios en mensajes de commit y notas de entrega para la continuación del trabajo.',
			instructions:
				'Analiza la lista de archivos modificados, el resumen de diff, el informe de trabajo o las notas de la tarea suministradas. Recomienda uno o más mensajes de commit sin realizar stage, commit ni push. Cuando se solicite, redacta una entrega que preserve el trabajo completado, las tareas pendientes, la evidencia de validación, los riesgos y la siguiente acción segura. No afirmes que se ejecutaron comandos a menos que la tarea proporcione esa evidencia.'
		},
		techDebtJanitor: {
			name: 'Gestor de deuda técnica',
			description: 'Planifica refactorizaciones que preserven el comportamiento para código heredado, complejo o duplicado.',
			instructions:
				'Inspecciona el código suministrado o el brief de deuda técnica y propone pasos de refactorización que preserven el comportamiento. Preserva la API pública y el comportamiento del negocio a menos que la tarea permita explícitamente el rediseño. Separa la limpieza mecánica segura de los cambios de diseño de alto riesgo, nombra las pruebas o comprobaciones necesarias antes de las ediciones y evita refactorizaciones amplias sin pasos de migración.'
		},
		releaseNoteWriter: {
			name: 'Redactor de notas de lanzamiento',
			description: 'Crea notas de lanzamiento o borradores de changelog a partir de commits, trabajo completado e informes.',
			instructions:
				'Escribe notas de lanzamiento o un changelog a partir de los commits suministrados, informes de órdenes de trabajo, lista de issues o resumen de cambios. Separa los cambios visibles para el usuario del mantenimiento interno. No inventes características publicadas, fechas, números de versión, métricas o evidencia de validación. Señala los cambios importantes, las notas de migración y las limitaciones conocidas cuando se proporcione evidencia.'
		},
		apiSchemaArchitect: {
			name: 'Arquitecto de esquemas API',
			description: 'Diseña endpoints de API, contratos de comandos, payloads y esquemas a partir de requisitos de funciones.',
			instructions:
				'Convierte el requisito de función suministrado en una propuesta de contrato de comandos o API. Define los límites de recursos o comandos, los payloads de solicitud y respuesta, los casos de error, las reglas de validación, las notas de compatibilidad y las tareas de implementación de seguimiento. Mantén los esquemas alineados con el estilo elegido y no afirmes que existe un endpoint a menos que la tarea proporciona esa evidencia.'
		},
		agentResponseEvaluator: {
			name: 'Evaluador de respuestas del agente',
			description: 'Evalúa la respuesta de un agente con la rúbrica de 1 a 9 de dos a cinco criterios.',
			instructions:
				'Evalúa la respuesta únicamente a partir de la tarea y la respuesta del agente. Califica de 1 a 9 la comprensión del problema, la validez lógica, la viabilidad práctica, la perspectiva creativa y la detección de riesgos. No premies la longitud por sí misma. Juzga las restricciones, la viabilidad, la evidencia y la gestión de riesgos. Después de elegir las puntuaciones, guárdalas en el mismo espacio de trabajo con el comando evaluate del agente de workduck. Si el agente tiene una persona vinculada, esa evaluación de la persona también se actualizará.'
		}
	},
	errors: {
		nameRequired: 'El nombre es obligatorio.',
		nameDuplicate: 'El nombre ya existe.',
		outputTypeRequired: 'El tipo de resultado es obligatorio.',
		instructionsRequired: 'Las instrucciones son obligatorias.',
		notFound: 'No se encontró la skill.',
		readFailed: 'No se pudieron leer las skills.',
		saveFailed: 'No se pudieron guardar las skills.'
	}
} as const;
