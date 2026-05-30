export const esPersonasMessages = {
	title: 'Personas',
	list: 'Lista de personas',
	details: 'Detalles de la persona',
	registeredCount: '{count} personas',
	newPersona: 'Nueva persona',
	editPersona: 'Editar persona',
	randomSpectrums: 'Rasgos aleatorios',
	countLabel: '{current}/{max}',
	agentAssignment: {
		label: 'Agentes sin persona',
		placeholder: 'Seleccionar agentes',
		none: 'Ninguno',
		selectedCount: '{count} seleccionados'
	},
	evaluation: {
		overviewEmpty: 'No hay personas registradas.'
	},
	styles: {
		title: 'Estilo de respuesta',
		items: {
			responseLength: {
				label: 'Longitud de la respuesta',
				options: {
					short: 'Corta',
					standard: 'Estándar',
					detailed: 'Detallada'
				}
			},
			emotionalTone: {
				label: 'Tono emocional',
				options: {
					calm: 'Calmado',
					neutral: 'Neutro',
					bright: 'Alegre'
				}
			},
			judgmentAttitude: {
				label: 'Postura de juicio',
				options: {
					critical: 'Crítica',
					balanced: 'Equilibrada',
					supportive: 'Comprensiva'
				}
			},
			confidenceLevel: {
				label: 'Nivel de confianza',
				options: {
					cautious: 'Cauteloso',
					realistic: 'Realista',
					decisive: 'Decidido'
				}
			},
			socialDistance: {
				label: 'Distancia social',
				options: {
					formal: 'Formal',
					comfortable: 'Cómodo',
					friendly: 'Amigable'
				}
			}
		}
	},
	spectrums: {
		title: 'Rasgos',
		items: {
			developmentApproach: {
				label: 'Enfoque de desarrollo',
				levels: {
					1: { name: 'Diseño primero (Design-first)', description: 'Define la estructura, los límites y el flujo de datos antes de la implementación.' },
					2: { name: 'Guiado por diseño', description: 'Establece la dirección y las reglas antes de pasar a la implementación.' },
					3: { name: 'Explorador equilibrado', description: 'Alterna entre pequeños prototipos y ajustes de diseño.' },
					4: { name: 'Guiado por experimentación', description: 'Construye rápidamente y utiliza los resultados para elegir la dirección.' },
					5: { name: 'Hacker', description: 'Código funcional primero. Lo más importante es que el código funcione.' }
				}
			},
			qualityStandard: {
				label: 'Estabilidad y calidad',
				levels: {
					1: { name: 'Nivel laboratorio', description: 'Aplica de forma muy estricta la validación, los tipos, las pruebas y la seguridad.' },
					2: { name: 'Estable para producción', description: 'Intenta mantener la fiabilidad a nivel de producción.' },
					3: { name: 'Compromiso pragmático', description: 'Equilibra el riesgo y la velocidad según la situación.' },
					4: { name: 'Lanzar primero', description: 'Prefiere solucionar los problemas en caliente cuando sea necesario.' },
					5: { name: 'Experimental', description: 'Prioriza la velocidad y los intentos por encima del coste de los fallos.' }
				}
			},
			structureBias: {
				label: 'Preferencia de estructura',
				levels: {
					1: { name: 'Diseñador de sistemas', description: 'Considera críticos los límites, las capas y las relaciones entre módulos.' },
					2: { name: 'Orientado a módulos', description: 'Considera constantemente la reutilización y el mantenimiento.' },
					3: { name: 'Estructura práctica', description: 'Estructura solo lo necesario.' },
					4: { name: 'Constructor directo', description: 'Prefiere la implementación directa en lugar de la abstracción.' },
					5: { name: 'Ensamblador improvisado', description: 'Prioriza la conexión rápida y los resultados sobre la estructura.' }
				}
			},
			productivityStrategy: {
				label: 'Estrategia de productividad',
				levels: {
					1: { name: 'Artesano', description: 'Minimiza las dependencias y la automatización para mantener el control directo.' },
					2: { name: 'Automatización selectiva', description: 'Añade con cuidado solo las herramientas necesarias.' },
					3: { name: 'Herramientas prácticas', description: 'Utiliza la automatización cuando mejora la productividad.' },
					4: { name: 'Centrado en automatización', description: 'Automatiza el trabajo repetitivo siempre que sea posible.' },
					5: { name: 'Orquestador', description: 'Combina herramientas, agentes y pipelines para gestionar el trabajo.' }
				}
			},
			operationPhilosophy: {
				label: 'Operaciones y lanzamientos',
				levels: {
					1: { name: 'Restrictivo al cambio', description: 'Retrasa el lanzamiento si se detecta riesgo de fallo.' },
					2: { name: 'Lanzamiento estable', description: 'Lanza después de suficiente verificación y observabilidad.' },
					3: { name: 'Operaciones incrementales', description: 'Publica pequeños cambios con frecuencia y vigila la estabilidad.' },
					4: { name: 'Respuesta rápida', description: 'Utiliza activamente parches en caliente y correcciones operativas.' },
					5: { name: 'Evolución en vivo', description: 'Trata el servicio como algo que cambia constantemente en tiempo real.' }
				}
			},
			collaborationPhilosophy: {
				label: 'Contexto de colaboración',
				levels: {
					1: { name: 'Acuerdo documentado', description: 'Colabora mediante documentos, reglas y contratos.' },
					2: { name: 'Colaboración explícita', description: 'Hace que la intención y los estándares sean lo más visibles posible.' },
					3: { name: 'Compartición de contexto', description: 'Comparte el contexto principal y deja el resto de forma autónoma.' },
					4: { name: 'Colaboración tácita', description: 'Prefiere una colaboración rápida basada en la experiencia y el juicio.' },
					5: { name: 'Agentes autónomos', description: 'Establece objetivos y espera que las personas y la IA juzguen de forma independiente.' }
				}
			}
		}
	},
	saved: 'Guardado.',
	removed: 'Eliminado.',
	errors: {
		nameRequired: 'El nombre es obligatorio.',
		nameDuplicate: 'El nombre ya existe.',
		instructionsRequired: 'Las instrucciones son obligatorias.',
		notFound: 'No se encontró la persona.',
		readFailed: 'No se pudieron leer las personas.',
		saveFailed: 'No se pudieron guardar las personas.'
	}
} as const;
