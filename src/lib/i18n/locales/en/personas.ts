export const enPersonasMessages = {
		title: 'Personas',
		list: 'Persona list',
		details: 'Persona details',
		registeredCount: '{count} personas',
		newPersona: 'New persona',
		editPersona: 'Edit persona',
		randomSpectrums: 'Random traits',
		countLabel: '{current}/{max}',
		agentAssignment: {
			label: 'Agents without persona',
			placeholder: 'Select agents',
			none: 'None',
			selectedCount: '{count} selected'
		},
		evaluation: {
			overviewEmpty: 'No personas registered.'
		},
		styles: {
			title: 'Response style',
			items: {
				responseLength: {
					label: 'Response length',
					options: {
						short: 'Short',
						standard: 'Standard',
						detailed: 'Detailed'
					}
				},
				emotionalTone: {
					label: 'Emotional tone',
					options: {
						calm: 'Calm',
						neutral: 'Neutral',
						bright: 'Bright'
					}
				},
				judgmentAttitude: {
					label: 'Judgment stance',
					options: {
						critical: 'Critical',
						balanced: 'Balanced',
						supportive: 'Supportive'
					}
				},
				confidenceLevel: {
					label: 'Confidence level',
					options: {
						cautious: 'Cautious',
						realistic: 'Realistic',
						decisive: 'Decisive'
					}
				},
				socialDistance: {
					label: 'Social distance',
					options: {
						formal: 'Formal',
						comfortable: 'Comfortable',
						friendly: 'Friendly'
					}
				}
			}
		},
		spectrums: {
			title: 'Traits',
			items: {
				developmentApproach: {
					label: 'Development approach',
					levels: {
						1: { name: 'Design-first', description: 'Fixes structure, boundaries, and data flow before implementation.' },
						2: { name: 'Design-led', description: 'Sets direction and rules before moving into implementation.' },
						3: { name: 'Balanced explorer', description: 'Alternates between small prototypes and design adjustments.' },
						4: { name: 'Experiment-led', description: 'Builds quickly and uses results to choose direction.' },
						5: { name: 'Hacker', description: 'Working code first. The code being alive matters most.' }
					}
				},
				qualityStandard: {
					label: 'Stability and quality',
					levels: {
						1: { name: 'Lab-grade', description: 'Treats validation, types, tests, and security very strictly.' },
						2: { name: 'Production-stable', description: 'Tries to maintain production-grade reliability.' },
						3: { name: 'Pragmatic tradeoff', description: 'Balances risk and speed by situation.' },
						4: { name: 'Ship-first', description: 'Prefers fixing issues in operation when needed.' },
						5: { name: 'Experimental', description: 'Prioritizes speed and attempts over the cost of failure.' }
					}
				},
				structureBias: {
					label: 'Structure bias',
					levels: {
						1: { name: 'System designer', description: 'Treats boundaries, layers, and module relationships as critical.' },
						2: { name: 'Module-oriented', description: 'Consistently considers reuse and maintainability.' },
						3: { name: 'Practical structure', description: 'Structures only as much as needed.' },
						4: { name: 'Direct builder', description: 'Prefers direct implementation over abstraction.' },
						5: { name: 'Improvised assembler', description: 'Prioritizes fast connection and results over structure.' }
					}
				},
				productivityStrategy: {
					label: 'Productivity strategy',
					levels: {
						1: { name: 'Craftsperson', description: 'Minimizes dependencies and automation to keep direct control.' },
						2: { name: 'Selective automation', description: 'Adds only necessary tools carefully.' },
						3: { name: 'Practical tooling', description: 'Uses automation when it improves productivity.' },
						4: { name: 'Automation-centered', description: 'Automates repeat work whenever possible.' },
						5: { name: 'Orchestrator', description: 'Combines tools, agents, and pipelines to operate the work.' }
					}
				},
				operationPhilosophy: {
					label: 'Operations and release',
					levels: {
						1: { name: 'Change-restrictive', description: 'Delays release when failure risk is visible.' },
						2: { name: 'Stable release', description: 'Releases after enough verification and observability.' },
						3: { name: 'Incremental operations', description: 'Ships small changes often and watches stability.' },
						4: { name: 'Fast response', description: 'Actively uses operational fixes and hotfixes.' },
						5: { name: 'Live evolution', description: 'Treats the service as something that keeps changing in real time.' }
					}
				},
				collaborationPhilosophy: {
					label: 'Collaboration context',
					levels: {
						1: { name: 'Document-contract', description: 'Collaborates through documents, rules, and contracts.' },
						2: { name: 'Explicit collaboration', description: 'Makes intent and standards as visible as possible.' },
						3: { name: 'Context sharing', description: 'Shares core context and leaves the rest autonomous.' },
						4: { name: 'Tacit collaboration', description: 'Prefers fast collaboration based on experience and judgment.' },
						5: { name: 'Autonomous agents', description: 'Gives goals and expects people and AI to judge independently.' }
					}
				}
			}
		},
		saved: 'Saved.',
		removed: 'Removed.',
		errors: {
			nameRequired: 'Name is required.',
			nameDuplicate: 'Name already exists.',
			instructionsRequired: 'Instructions are required.',
			notFound: 'Persona was not found.',
			readFailed: 'Personas could not be read.',
			saveFailed: 'Personas could not be saved.'
		}
	} as const;
