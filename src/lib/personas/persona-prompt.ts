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
		label: '응답 길이',
		options: {
			short: '짧음',
			standard: '표준',
			detailed: '상세'
		}
	},
	emotionalTone: {
		label: '감정 톤',
		options: {
			calm: '차분',
			neutral: '중립',
			bright: '밝음'
		}
	},
	judgmentAttitude: {
		label: '판단 태도',
		options: {
			critical: '비판적',
			balanced: '균형',
			supportive: '지지적'
		}
	},
	confidenceLevel: {
		label: '확신 수준',
		options: {
			cautious: '신중',
			realistic: '현실적',
			decisive: '단정적'
		}
	},
	socialDistance: {
		label: '사회적 거리감',
		options: {
			formal: '공식적',
			comfortable: '편안함',
			friendly: '친근함'
		}
	}
};

const personaSpectrumPromptDescriptors: Record<PersonaSpectrumId, PersonaSpectrumPromptDescriptor> = {
	developmentApproach: {
		label: '개발 추진 방식',
		levels: {
			1: '사전 설계형 - 구현 전에 구조, 경계, 데이터 흐름을 먼저 고정합니다.',
			2: '설계 중심형 - 큰 방향과 규칙을 먼저 잡고 구현으로 들어갑니다.',
			3: '균형 탐색형 - 작은 프로토타입과 설계를 반복하며 조정합니다.',
			4: '실험 주도형 - 빠르게 만들어 보고 결과로 방향을 정합니다.',
			5: '해커형 - 동작 우선. 코드가 살아 움직이는 것을 가장 중요하게 봅니다.'
		}
	},
	qualityStandard: {
		label: '안정성·품질 기준',
		levels: {
			1: '연구실 수준 - 검증, 타입, 테스트, 보안을 매우 엄격하게 봅니다.',
			2: '운영 안정형 - 실서비스 기준의 안정성을 유지하려 합니다.',
			3: '현실 타협형 - 위험과 속도를 상황에 따라 조절합니다.',
			4: '출시 우선형 - 문제는 운영 중 고치는 편을 선호합니다.',
			5: '실험체형 - 실패 비용보다 속도와 시도를 우선합니다.'
		}
	},
	structureBias: {
		label: '구조화 성향',
		levels: {
			1: '시스템 설계형 - 경계, 계층, 모듈 관계를 매우 중요하게 봅니다.',
			2: '모듈 선호형 - 재사용성과 유지보수를 꾸준히 고려합니다.',
			3: '실용 구조형 - 필요한 만큼만 구조화합니다.',
			4: '단순 구현형 - 추상화보다 직접 구현을 선호합니다.',
			5: '즉흥 조립형 - 구조보다 빠른 연결과 결과를 우선합니다.'
		}
	},
	productivityStrategy: {
		label: '생산성 전략',
		levels: {
			1: '수공예 장인형 - 의존성과 자동화를 최소화하고 직접 통제합니다.',
			2: '절제 자동화형 - 필요한 도구만 신중히 도입합니다.',
			3: '실용 도구형 - 생산성을 위해 적절히 자동화를 활용합니다.',
			4: '자동화 중심형 - 반복 작업은 가능한 모두 자동화하려 합니다.',
			5: '오케스트레이터형 - 여러 도구, 에이전트, 파이프라인을 조합해 운영합니다.'
		}
	},
	operationPhilosophy: {
		label: '운영·배포 철학',
		levels: {
			1: '변경 억제형 - 장애 가능성이 있으면 배포를 미룹니다.',
			2: '안정 배포형 - 검증과 관측을 충분히 확보한 뒤 배포합니다.',
			3: '점진 운영형 - 작은 변경을 자주 배포하며 안정성을 봅니다.',
			4: '빠른 대응형 - 운영 중 수정과 긴급 수정을 적극 활용합니다.',
			5: '실시간 진화형 - 서비스는 계속 바뀌는 대상으로 봅니다.'
		}
	},
	collaborationPhilosophy: {
		label: '협업·컨텍스트 철학',
		levels: {
			1: '문서 계약형 - 문서, 규칙, 계약을 기준으로 협업합니다.',
			2: '명시 협업형 - 의도와 기준을 최대한 드러내려 합니다.',
			3: '상황 공유형 - 핵심 맥락만 공유하고 나머지는 자율에 맡깁니다.',
			4: '암묵 협업형 - 경험과 감각 기반의 빠른 협업을 선호합니다.',
			5: '자율 에이전트형 - 목표만 주고 사람과 AI가 스스로 판단하길 원합니다.'
		}
	}
};

export function formatPersonaPromptBlock(persona: PersonaRecord) {
	const blocks = [`페르소나 이름: ${persona.name}`];

	if (persona.description.length > 0) {
		blocks.push(`페르소나 설명: ${persona.description}`);
	}

	blocks.push('', '응답 방식:', ...formatPersonaStyles(persona));
	blocks.push('', '작업 성향:', ...formatPersonaSpectrums(persona));

	if (persona.instructions.length > 0) {
		blocks.push('', '페르소나 지시문:', persona.instructions);
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
