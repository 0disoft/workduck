export const koPersonasMessages = {
		title: '페르소나',
		list: '페르소나 목록',
		details: '페르소나 세부 정보',
		registeredCount: '페르소나 {count}개',
		newPersona: '새 페르소나',
		editPersona: '페르소나 수정',
		randomSpectrums: '특성 무작위 설정',
		countLabel: '{current}/{max}',
		agentAssignment: {
			label: '페르소나 미지정 에이전트',
			placeholder: '에이전트 선택',
			none: '없음',
			selectedCount: '{count}개 선택'
		},
		evaluation: {
			overviewEmpty: '등록된 페르소나가 없습니다.'
		},
		styles: {
			title: '응답 방식',
			items: {
				responseLength: {
					label: '응답 길이',
					options: {
						short: '짧음',
						standard: '표준',
						detailed: '상세'
					}
				},
				emotionalTone: {
					label: '대화 어조',
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
					label: '대화 격식',
					options: {
						formal: '공식적',
						comfortable: '편안함',
						friendly: '친근함'
					}
				}
			}
		},
		spectrums: {
			title: '특성',
			items: {
				developmentApproach: {
					label: '개발 추진 방식',
					levels: {
						1: { name: '사전 설계형', description: '구현 전에 구조, 경계, 데이터 흐름을 먼저 고정합니다.' },
						2: { name: '설계 중심형', description: '큰 방향과 규칙을 먼저 잡고 구현으로 들어갑니다.' },
						3: { name: '균형 탐색형', description: '작은 프로토타입과 설계를 반복하며 조정합니다.' },
						4: { name: '실험 주도형', description: '빠르게 만들어 보고 결과로 방향을 정합니다.' },
						5: { name: '신속 구현형', description: '동작하는 결과물을 가장 중요하게 봅니다.' }
					}
				},
				qualityStandard: {
					label: '안정성·품질 기준',
					levels: {
						1: { name: '무결성 지향형', description: '검증, 타입, 테스트, 보안 기준을 매우 엄격하게 적용합니다.' },
						2: { name: '운영 안정형', description: '실서비스 기준의 안정성을 유지하려 합니다.' },
						3: { name: '현실 타협형', description: '위험과 속도를 상황에 따라 조절합니다.' },
						4: { name: '출시 우선형', description: '문제는 운영 중 고치는 편을 선호합니다.' },
						5: { name: '속도 우선형', description: '실패 비용보다 속도와 시도를 우선합니다.' }
					}
				},
				structureBias: {
					label: '구조화 성향',
					levels: {
						1: { name: '시스템 설계형', description: '경계, 계층, 모듈 관계를 매우 중요하게 봅니다.' },
						2: { name: '모듈 선호형', description: '재사용성과 유지보수를 꾸준히 고려합니다.' },
						3: { name: '실용 구조형', description: '필요한 만큼만 구조화합니다.' },
						4: { name: '단순 구현형', description: '추상화보다 직접 구현을 선호합니다.' },
						5: { name: '신속 조립형', description: '정형화된 설계보다 빠른 연결과 가시적인 결과를 우선합니다.' }
					}
				},
				productivityStrategy: {
					label: '생산성 전략',
					levels: {
						1: { name: '장인적 통제형', description: '외부 의존성과 자동화를 최소화하고 직접 통제합니다.' },
						2: { name: '절제 자동화형', description: '필요한 도구만 신중히 도입합니다.' },
						3: { name: '실용 도구형', description: '생산성을 위해 적절히 자동화를 활용합니다.' },
						4: { name: '자동화 중심형', description: '반복 작업은 가능한 모두 자동화하려 합니다.' },
						5: { name: '오케스트레이터형', description: '여러 도구, 에이전트, 파이프라인을 조합해 운영합니다.' }
					}
				},
				operationPhilosophy: {
					label: '운영·배포 철학',
					levels: {
						1: { name: '안정 극대화형', description: '장애 가능성이 보이면 배포를 미루고 안정성을 먼저 확인합니다.' },
						2: { name: '안정 배포형', description: '검증과 관측을 충분히 확보한 뒤 배포합니다.' },
						3: { name: '점진 운영형', description: '작은 변경을 자주 배포하며 안정성을 봅니다.' },
						4: { name: '빠른 대응형', description: '운영 중 수정과 긴급 수정을 적극 활용합니다.' },
						5: { name: '실시간 진화형', description: '서비스는 계속 바뀌는 생물처럼 운영된다고 봅니다.' }
					}
				},
				collaborationPhilosophy: {
					label: '협업·컨텍스트 철학',
					levels: {
						1: { name: '문서 계약형', description: '문서, 규칙, 계약을 기준으로 협업합니다.' },
						2: { name: '명시 협업형', description: '의도와 기준을 최대한 드러내려 합니다.' },
						3: { name: '상황 공유형', description: '핵심 맥락만 공유하고 나머지는 자율에 맡깁니다.' },
						4: { name: '암묵 협업형', description: '경험과 감각 기반의 빠른 협업을 선호합니다.' },
						5: { name: '자율 에이전트형', description: '목표만 주고 사람과 AI가 스스로 판단하길 원합니다.' }
					}
				}
			}
		},
		saved: '저장했습니다.',
		removed: '삭제했습니다.',
		errors: {
			nameRequired: '이름을 입력하세요.',
			nameDuplicate: '이미 있는 이름입니다.',
			instructionsRequired: '지시문을 입력하세요.',
			notFound: '페르소나를 찾을 수 없습니다.',
			readFailed: '페르소나를 불러오지 못했습니다.',
			saveFailed: '페르소나를 저장하지 못했습니다.'
		}
	} as const;
