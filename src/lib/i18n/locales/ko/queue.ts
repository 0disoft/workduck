export const koQueueMessages = {
		list: '작업 대기열 목록',
		detail: '대기열 작업 상세 정보',
		filters: '작업 대기열 필터',
		contextMenu: '대기열 작업 관리 메뉴',
		registeredCount: '대기열 작업 {count}개',
		executionFilters: '실행 상태 필터',
		readFilters: '조회 상태 필터',
		filterMenu: '필터 설정',
		activeFilterCount: '적용된 필터 {count}개',
		kindFilter: '종류',
		priorityFilter: '우선순위',
		sort: '정렬',
		allFileKinds: '모든 종류',
		allPriorities: '모든 우선순위',
		sortOptions: {
			'created-desc': '최신순',
			'created-asc': '오래된순',
			'priority-desc': '높은 우선순위',
			'priority-asc': '낮은 우선순위'
		},
		pendingCountLabel: '실행 대기 작업 {count}개',
		resultReportReview: '결과 보고서 검토',
		workOrderView: '작업 지시서 보기',
		workOrderId: '작업 ID',
		proposalView: '제안서 보기',
		empty: '대기열에 등록된 작업이 없습니다. 작업 지시서나 보고서를 추가하세요.',
		noMatches: '조건에 맞는 대기열 작업이 없습니다.',
		addWork: '작업 추가',
		bulkDelete: '일괄삭제',
		includePendingDelete: '미실행 포함',
		newWork: '새 작업',
		editWork: '작업 수정',
		workTitle: '작업 제목',
		workType: '작업 유형',
		workTypes: {
			instruction: '일반 지시',
			directMessage: '직접 메시지',
			vote: '투표/선정'
		},
		workPriority: '우선순위',
		responseLanguage: '응답 언어',
		responseLanguages: {
			auto: '작업 언어에 맞춤',
			ko: '한국어',
			en: '영어',
			es: '스페인어',
			fr: '프랑스어',
			zh: '중국어(간체)',
			hi: '힌디어'
		},
		responseFormat: '응답 형식',
		responseFormats: {
			general: '일반 보고서',
			'pros-cons': '장단점 분석',
			'feature-proposal': '기능 제안서',
			'execution-plan': '실행 계획서',
			'code-review': '코드 리뷰',
			'risk-assessment': '리스크 평가서',
			'comparison-table': '비교 분석표',
			'decision-memo': '의사결정 메모',
			'bug-analysis': '결함/버그 분석서',
			'writing-draft': '원고 초안',
			'revision-draft': '퇴고본'
		},
		revisionOptions: {
			title: '퇴고 옵션',
			description: '선택한 퇴고 기준을 작업 내용에 함께 반영합니다.',
			groups: {
				purpose: '목적',
				tone: '어투',
				structure: '구조',
				format: '형식'
			},
			options: {
				clarity: '가독성 및 의미 명확화',
				concise: '간결하고 명료하게',
				persuasive: '설득력 강화',
				natural: '매끄러운 한국어 표현',
				formal: '격식체 및 비즈니스 톤',
				casual: '친근하고 편안한 톤',
				sharp: '예리하고 분석적인 톤',
				warm: '따뜻하고 정중한 어조',
				paragraphFlow: '문단 간 유기적 흐름 개선',
				sentenceRhythm: '문장 호흡 및 리듬 조율',
				headlineLead: '헤드라인 및 도입부 임팩트 강화',
				preserveMeaning: '핵심 맥락 및 원래 의미 보존',
				oneParagraph: '단일 문단 압축',
				bulletSummary: '글머리 기호(Bullet) 요약 포함',
				markdownReady: '마크다운 형식으로 정리',
				keepLength: '원문 분량 최대한 유지'
			}
		},
		skillOptions: {
			title: '스킬 옵션',
			description: '선택한 스킬에 구성된 유형, 말투, 형식 옵션을 고릅니다.'
		},
		noProject: '프로젝트 없음',
		noRepository: '저장소 없음',
		noSkill: '스킬 없음',
		noAgent: '에이전트 없음',
		noReference: '참고자료 없음',
		linkedSkill: '연결된 스킬',
		assignment: '실행 설정',
		advancedExecution: '고급 실행 설정',
		internalSkills: '내부 스킬',
		workProjects: '관련 프로젝트',
		workRepositories: '관련 저장소',
		workAgents: '작업 에이전트',
		workReferences: '작업 참고자료',
		repositorySearchPlaceholder: '저장소 검색',
		selectionCount: '{count}개 선택',
		workBody: '작업 내용',
		directMessageBody: '보낼 메시지',
		countLabel: '{current}/{max}',
		vote: {
			question: '질문',
			options: '선택지',
			optionName: '선택지 이름',
			optionDescription: '설명',
			addOption: '선택지 추가',
			removeOption: '선택지 삭제',
			criteria: '평가 기준',
			result: '투표 결과',
			choice: '선택',
			count: '{count}표',
			invalid: '해석하지 못한 응답 {count}개',
			optionCount: '{count}개 선택지',
			unparsed: '해석 실패'
		},
		structuredResponseFormats: {
			general: {
				summary: '요약',
				strengths: '장점/근거',
				recommendations: '제안',
				cautions: '주의점'
			},
			'pros-cons': {
				summary: '판단',
				strengths: '장점',
				recommendations: '결론',
				cautions: '단점'
			},
			'feature-proposal': {
				summary: '요약',
				strengths: '근거',
				recommendations: '제안 기능',
				cautions: '주의점'
			},
			'execution-plan': {
				summary: '목표',
				strengths: '전제',
				recommendations: '실행 단계',
				cautions: '위험'
			},
			'code-review': {
				summary: '총평',
				strengths: '유지할 부분',
				recommendations: '수정 제안',
				cautions: '문제'
			},
			'risk-assessment': {
				summary: '위험 결론',
				strengths: '완화 요인',
				recommendations: '대응 조치',
				cautions: '주요 위험'
			},
			'comparison-table': {
				summary: '비교 결론',
				strengths: '비교 기준',
				recommendations: '비교 결과',
				cautions: '결정 변수'
			},
			'decision-memo': {
				summary: '결정',
				strengths: '근거',
				recommendations: '결정 사항',
				cautions: '후속 확인'
			},
			'bug-analysis': {
				summary: '원인 요약',
				strengths: '확인된 사실',
				recommendations: '수정 방향',
				cautions: '재현/회귀 위험'
			},
			'writing-draft': {
				summary: '완성 원고',
				strengths: '문체/근거 메모',
				recommendations: '수정 제안',
				cautions: '출처 공백/가정'
			},
			'revision-draft': {
				summary: '퇴고본',
				strengths: '적용한 퇴고 방향',
				recommendations: '추가 수정 제안',
				cautions: '의미 변화/확인점'
			}
		},
		createWorkOrder: '작업 지시서 만들기',
		delegateEvaluation: '평가 위임',
		creating: '만드는 중',
		previewPrompt: '지시문 미리보기',
		executeWorkOrder: '실행',
		retryWorkOrder: '다시 실행',
		completeWorkOrder: '완료 처리',
		executing: '실행 중',
		noFollowUpSelected: '후속 작업이 선택되지 않았습니다.',
		noEvaluationTargets: '평가할 응답이 없습니다.',
		evaluationAlreadyDelegated: '이미 평가 위임 작업이 있습니다: {relativePath}',
		evaluationDelegated: '{relativePath} 평가 위임 작업을 만들었습니다.',
		createdFile: '{relativePath} 파일을 만들었습니다.',
		updatedFile: '{relativePath} 파일을 수정했습니다.',
		deletedFile: '{relativePath} 파일을 삭제했습니다.',
		bulkDeletedFiles: '{count}개 작업을 삭제했습니다.',
		executedFile: '{relativePath} 보고서를 만들고 작업을 완료했습니다.',
		completedFile: '{relativePath} 작업을 완료 처리했습니다.',
		reportNotification: {
			title: '보고서가 준비됐습니다',
			body: '{title} 결과 보고서를 확인할 수 있습니다.'
		},
		nextWorkOrders: '다음 작업 지시서',
		promptPreview: {
			title: '지시문 미리보기',
			description: '이 작업 지시서를 실행하기 전에 실제로 전송될 시스템 지시문과 사용자 지시문을 확인합니다.',
			systemPrompt: '시스템 지시문',
			userPrompt: '사용자 지시문',
			characterCount: '{count}자'
		},
		priorities: {
			low: '낮음',
			normal: '보통',
			high: '높음',
			urgent: '긴급'
		},
		executionStates: {
			pending: '실행 대기',
			running: '실행 중',
			failed: '실행 실패',
			completed: '실행 완료'
		},
		readStates: {
			read: '읽음',
			unread: '안 읽음'
		},
		fileKinds: {
			resultReport: '결과 보고서',
			workOrder: '작업 지시서',
			proposal: '제안서',
			unsupported: '지원하지 않음'
		},
		reviewDecisions: {
			approved: '승인',
			needsWork: '보완 필요',
			rollback: '롤백'
		},
		evaluation: {
			title: '응답 평가',
			action: '평가',
			mode: '평가 방식',
			manual: '직접 평가',
			aiDelegated: 'AI에게 위임',
			copyPrompt: '지시문 복사',
			promptCopied: '평가 지시문을 복사했습니다.',
			clipboardUnavailable: '클립보드를 사용할 수 없습니다.',
			delegationPrompt: '위임 지시문',
			sourceReport: '대상 보고서',
			workspace: '워크스페이스',
			criteria: '평가 기준',
			targets: '평가 대상',
			command: '실행 명령',
			saving: '저장 중',
			saved: '평가를 저장했습니다.',
			alreadySaved: '이미 평가한 응답입니다.',
			savedAction: '평가됨'
		},
		errors: {
			workspaceRequired: '워크스페이스 경로를 입력하세요.',
			workspaceNotAbsolute: '워크스페이스 경로는 절대 경로여야 합니다.',
			workspaceNotFound: '워크스페이스 경로를 찾을 수 없습니다.',
			workspaceNotDirectory: '워크스페이스 경로는 폴더여야 합니다.',
			workspacePermissionDenied: '워크스페이스 경로에 쓸 수 없습니다.',
			workspaceUnreadable: '워크스페이스 경로를 확인하지 못했습니다.',
			rootInvalid: '작업 대기열 폴더를 사용할 수 없습니다.',
			createFailed: '작업 대기열 폴더를 만들지 못했습니다.',
			openFailed: '작업 대기열 폴더를 열지 못했습니다.',
			listFailed: '작업 대기열 파일 목록을 불러오지 못했습니다.',
			fileInvalid: '작업 대기열 파일 경로가 허용되지 않습니다.',
			fileNotFound: '작업 대기열 파일을 찾을 수 없습니다.',
			fileReadFailed: '작업 대기열 파일을 읽지 못했습니다.',
			fileWriteFailed: '작업 대기열 파일을 쓰지 못했습니다.',
			fileDeleteFailed: '작업 대기열 파일을 삭제하지 못했습니다.',
			fileAlreadyExists: '작업 대기열 파일이 이미 있습니다.',
			evaluationDelegationAlreadyExists:
				'이 보고서의 평가 위임 작업이 이미 있습니다. 기존 작업을 삭제한 뒤 다시 만드세요.',
			unavailable: '작업 대기열 폴더 기능은 데스크톱 앱에서 사용할 수 있습니다.',
			executionNoTask: '실행할 작업이 없습니다.',
			executionNoAgent: '작업 에이전트를 선택하세요.',
			executionVaultLocked: '보안 보관함을 먼저 잠금 해제하세요.',
			executionWorkOrderRunning: '이미 실행 중인 작업입니다.',
			executionWorkOrderArchived: '이미 완료 처리된 작업입니다.',
			executionAgentNotFound: '선택한 에이전트를 찾을 수 없습니다.',
			executionSecretNotFound: '에이전트에 연결된 API 키를 찾을 수 없습니다.',
			executionProviderUnsupported: '지원하는 LLM 제공업체를 확인하지 못했습니다. API 키 이름/태그에 DeepSeek, OpenAI, OpenRouter 중 하나를 포함하세요.',
			executionApiKeyRequired: 'API 키가 비어 있습니다.',
			executionPromptRequired: '작업 지시문을 만들지 못했습니다.',
			executionModelRequired: '사용할 모델을 정하지 못했습니다.',
			executionRequestInvalid: 'LLM 요청 형식이 올바르지 않습니다.',
			executionAuthenticationFailed: 'LLM 인증에 실패했습니다. API 키를 확인하세요.',
			executionRateLimited: 'LLM 요청 한도를 초과했습니다. 잠시 후 다시 실행하세요.',
			executionProviderRejected: 'LLM 제공업체가 요청을 거부했습니다.',
			executionProviderTimeout: 'LLM 제공업체 응답 시간이 초과되었습니다. 잠시 후 다시 시도하세요.',
			executionProviderUnavailable: 'LLM 제공업체에 연결하지 못했습니다.',
			executionResponseEmpty: 'LLM 응답이 비어 있습니다.',
			executionResponseInvalid: 'LLM 응답을 보고서로 읽지 못했습니다.',
			executionUnavailable: '작업 실행은 데스크톱 앱에서 사용할 수 있습니다.',
			executionUnknown: '알 수 없는 작업 실행 오류가 발생했습니다.',
			workBodyTooLong: '작업 내용은 최대 {max}자까지 입력할 수 있습니다.'
		}
	} as const;
