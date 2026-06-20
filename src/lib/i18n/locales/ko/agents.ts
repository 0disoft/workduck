export const koAgentsMessages = {
		title: '에이전트',
		list: '에이전트 목록',
		details: '에이전트 세부 정보',
		registeredCount: '에이전트 {count}개',
		newAgent: '새 에이전트',
		editAgent: '에이전트 수정',
		provider: '제공업체',
		model: '모델',
		modelId: '모델 ID',
		defaultModel: '기본 모델',
		customModel: '직접 입력',
		apiKeyPlaceholder: 'API 키 선택',
		vaultLockedHint:
			'환경변수 보관함이 잠겨 있습니다. 새 에이전트를 만들기 전에 환경변수에서 잠금을 해제하세요.',
		noLlmApiKeysHint:
			'LLM 용도로 태그된 API 키가 없습니다. 환경변수에서 API 키를 추가하고 llm 태그를 붙이세요.',
		missingApiKeyHint:
			'현재 보관함에서 연결된 API 키를 찾지 못했습니다. 다른 키를 선택하거나 환경변수를 확인하세요.',
		removeConfirm: '"{name}" 에이전트를 삭제할까요?',
		providers: {
			auto: '자동',
			openrouter: 'OpenRouter',
			umans: 'Umans',
			deepseek: 'DeepSeek',
			openai: 'OpenAI'
		},
		saved: '저장했습니다.',
		removed: '삭제했습니다.',
		evaluation: {
			title: '평가',
			overviewTitle: '평가 현황',
			overviewEmpty: '등록된 에이전트가 없습니다.',
			empty: '평가 없음',
			noScore: '-',
			rankBy: '순위 기준',
			overallScore: '종합점수',
			count: '{count}건',
			reset: '평가 초기화',
			resetConfirm: '이 에이전트의 누적 평가를 초기화할까요?',
			resetSaved: '평가를 초기화했습니다.',
			resetAt: '초기화 시점: {date}',
			criteria: {
				problemUnderstanding: {
					label: '문제 이해력',
					description: '사용자의 진짜 의도, 제약, 맥락을 파악했는지 봅니다.'
				},
				logicalValidity: {
					label: '논리적 타당성',
					description: '주장과 결론 사이에 논리 비약이 없는지 봅니다.'
				},
				practicalFeasibility: {
					label: '현실성·실행 가능성',
					description: '실제 시장, 조직, 기술 조건에서 가능한지 봅니다.'
				},
				creativeInsight: {
					label: '창의성·통찰',
					description: '뻔한 조합을 넘어 새로운 관점을 제시했는지 봅니다.'
				},
				riskDetection: {
					label: '리스크 감지',
					description: '실패 가능성, 숨은 비용, 부작용을 짚었는지 봅니다.'
				}
			}
		},
		errors: {
			nameRequired: '이름을 입력하세요.',
			authRequired: 'API 키를 선택하세요.',
			nameDuplicate: '이미 있는 이름입니다.',
			notFound: '에이전트를 찾을 수 없습니다.',
			readFailed: '에이전트를 불러오지 못했습니다.',
			saveFailed: '에이전트를 저장하지 못했습니다.'
		}
	} as const;
