import {
	personaSpectrumDefinitions,
	personaStyleDefinitions,
	type PersonaRecord,
	type PersonaSpectrumId,
	type PersonaSpectrumLevel,
	type PersonaStyleId
} from './persona-registry';

type PersonaStylePromptDescriptor = {
	readonly label: string;
	readonly options: Readonly<Record<string, string>>;
};

type PersonaSpectrumPromptDescriptor = {
	readonly label: string;
	readonly levels: Readonly<Record<PersonaSpectrumLevel, string>>;
};

const personaStylePromptDescriptors: Record<PersonaStyleId, PersonaStylePromptDescriptor> = {
	responseLength: {
		label: 'Response length',
		options: {
			short: 'Prefer concise answers.',
			standard: 'Prefer balanced-length answers.',
			detailed: 'Prefer detailed answers when useful.'
		}
	},
	emotionalTone: {
		label: 'Tone',
		options: {
			calm: 'Keep the tone calm.',
			neutral: 'Keep the tone neutral.',
			bright: 'Keep the tone upbeat.'
		}
	},
	judgmentAttitude: {
		label: 'Judgment style',
		options: {
			critical: 'Be critical and point out weaknesses.',
			balanced: 'Balance strengths, weaknesses, and tradeoffs.',
			supportive: 'Be supportive while staying accurate.'
		}
	},
	confidenceLevel: {
		label: 'Confidence style',
		options: {
			cautious: 'State uncertainty carefully.',
			realistic: 'Use realistic confidence.',
			decisive: 'Be decisive when evidence is enough.'
		}
	},
	socialDistance: {
		label: 'Social distance',
		options: {
			formal: 'Use a formal style.',
			comfortable: 'Use a comfortable style.',
			friendly: 'Use a friendly style.'
		}
	}
};

const personaSpectrumPromptDescriptors: Record<PersonaSpectrumId, PersonaSpectrumPromptDescriptor> = {
	developmentApproach: {
		label: 'Development approach',
		levels: {
			1: 'Prefer fixing structure, boundaries, and data flow before implementation.',
			2: 'Prefer setting direction and rules before implementation.',
			3: 'Prefer iterating between small prototypes and design.',
			4: 'Prefer quick experiments and decisions from observed results.',
			5: 'Prefer working behavior first and refine structure later.'
		}
	},
	qualityStandard: {
		label: 'Stability and quality',
		levels: {
			1: 'Treat validation, types, tests, and security very strictly.',
			2: 'Prioritize production-grade stability.',
			3: 'Balance risk and speed according to the situation.',
			4: 'Prefer shipping first and fixing issues during operation when acceptable.',
			5: 'Prioritize speed and experimentation when failure cost is acceptable.'
		}
	},
	structureBias: {
		label: 'Structure preference',
		levels: {
			1: 'Treat boundaries, layers, and module relationships as critical.',
			2: 'Consistently consider reuse and maintainability.',
			3: 'Add structure only where it clearly helps.',
			4: 'Prefer direct implementation over abstraction.',
			5: 'Prioritize fast connection and visible results over structure.'
		}
	},
	productivityStrategy: {
		label: 'Productivity strategy',
		levels: {
			1: 'Minimize dependencies and automation; keep direct control.',
			2: 'Introduce only necessary tools carefully.',
			3: 'Use automation pragmatically for productivity.',
			4: 'Automate repetitive work wherever practical.',
			5: 'Combine multiple tools, agents, and pipelines as an operator.'
		}
	},
	operationPhilosophy: {
		label: 'Operations and deployment',
		levels: {
			1: 'Delay changes when failure risk is unclear.',
			2: 'Deploy after sufficient validation and observability.',
			3: 'Prefer small frequent changes and monitor stability.',
			4: 'Use operational fixes and urgent patches actively when needed.',
			5: 'Treat services as systems that evolve continuously.'
		}
	},
	collaborationPhilosophy: {
		label: 'Collaboration and context',
		levels: {
			1: 'Use documents, rules, and contracts as collaboration anchors.',
			2: 'Make intent and standards explicit.',
			3: 'Share core context and leave room for autonomy.',
			4: 'Prefer fast collaboration based on experience and judgment.',
			5: 'Give goals and let people or AI agents decide execution details.'
		}
	}
};

export function formatPersonaPromptBlock(persona: PersonaRecord) {
	const blocks = ['Response preferences:'];

	if (persona.description.length > 0) {
		blocks.push(`- Additional description: ${persona.description}`);
	}

	blocks.push(...formatPersonaStyles(persona));
	blocks.push('', 'Work preferences:', ...formatPersonaSpectrums(persona));

	if (persona.instructions.length > 0) {
		blocks.push('', 'Additional persona instructions:', persona.instructions);
	}

	return blocks.join('\n');
}

function formatPersonaStyles(persona: PersonaRecord) {
	return personaStyleDefinitions.map((definition) => {
		const descriptor = personaStylePromptDescriptors[definition.id];
		const option = persona.styles[definition.id];

		return `- ${descriptor.label}: ${descriptor.options[option] ?? option}`;
	});
}

function formatPersonaSpectrums(persona: PersonaRecord) {
	return personaSpectrumDefinitions.map((definition) => {
		const descriptor = personaSpectrumPromptDescriptors[definition.id];
		const level = persona.spectrums[definition.id];

		return `- ${descriptor.label}: ${descriptor.levels[level]}`;
	});
}
