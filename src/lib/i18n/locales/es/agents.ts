export const esAgentsMessages = {
	title: 'Agentes',
	list: 'Lista de agentes',
	details: 'Detalles del agente',
	registeredCount: '{count} agentes',
	newAgent: 'Nuevo agente',
	editAgent: 'Editar agente',
	provider: 'Proveedor',
	model: 'Modelo',
	modelId: 'ID del modelo',
	defaultModel: 'Modelo predeterminado',
	customModel: 'Modelo personalizado',
	apiKeyPlaceholder: 'Seleccionar una clave API',
	vaultLockedHint:
		'El almacén de entorno está bloqueado. Desbloquéalo en el Entorno antes de crear un nuevo agente.',
	noLlmApiKeysHint:
		'No hay claves API etiquetadas para su uso con LLM. Añade una clave API en el Entorno y asígnale la etiqueta llm.',
	missingApiKeyHint:
		'La clave API vinculada no se encontró en el almacén actual. Selecciona otra clave o comprueba el Entorno.',
	removeConfirm: '¿Eliminar el agente "{name}"?',
	providers: {
		auto: 'Auto',
		openrouter: 'OpenRouter',
		deepseek: 'DeepSeek',
		openai: 'OpenAI'
	},
	saved: 'Guardado.',
	removed: 'Eliminado.',
	evaluation: {
		title: 'Evaluación',
		overviewTitle: 'Resumen de evaluación',
		overviewEmpty: 'No hay agentes registrados.',
		empty: 'Sin evaluaciones',
		noScore: '-',
		rankBy: 'Ordenar por',
		overallScore: 'Puntuación general',
		count: '{count} evaluaciones',
		reset: 'Restablecer evaluaciones',
		resetConfirm: '¿Restablecer las evaluaciones acumuladas de este agente?',
		resetSaved: 'Las evaluaciones se han restablecido.',
		resetAt: 'Restablecido el: {date}',
		criteria: {
			problemUnderstanding: {
				label: 'Comprensión del problema',
				description: 'Evalúa si se comprendieron la intención real, las restricciones y el contexto.'
			},
			logicalValidity: {
				label: 'Validez lógica',
				description: 'Evalúa si las afirmaciones y conclusiones evitan saltos sin justificar.'
			},
			practicalFeasibility: {
				label: 'Viabilidad práctica',
				description: 'Evalúa si la respuesta puede funcionar bajo restricciones reales de mercado, equipo y técnicas.'
			},
			creativeInsight: {
				label: 'Perspectiva creativa',
				description: 'Evalúa si la respuesta ofrece un nuevo enfoque útil en lugar de una combinación de ideas conocidas.'
			},
			riskDetection: {
				label: 'Detección de riesgos',
				description: 'Evalúa si se identificaron los modos de fallo, los costes ocultos y los efectos secundarios.'
			}
		}
	},
	errors: {
		nameRequired: 'El nombre es obligatorio.',
		authRequired: 'Selecciona una clave API.',
		nameDuplicate: 'El nombre ya existe.',
		notFound: 'No se encontró el agente.',
		readFailed: 'No se pudieron leer los agentes.',
		saveFailed: 'No se pudieron guardar los agentes.'
	}
} as const;
