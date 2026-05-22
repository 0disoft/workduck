import type { WorkduckMessages } from '../workduck-message-contract';

export const koMessages = {
	common: {
		add: '추가',
		save: '저장',
		cancel: '취소',
		edit: '수정',
		remove: '삭제',
		refresh: '새로 고침',
		name: '이름',
		title: '제목',
		none: '없음',
		fetch: 'Fetch',
		pull: 'Pull',
		push: 'Push',
		export: '내보내기',
		import: '가져오기',
		load: '불러오기',
		folder: '폴더',
		file: '파일',
		password: '암호',
		repository: '저장소',
		reference: '참고자료',
		branch: '브랜치',
		apiKey: 'API 키',
		skills: '스킬',
		output: '출력',
		description: '설명',
		instructions: '지시문',
		agent: '에이전트',
		persona: '페르소나',
		skill: '스킬',
		terminal: '터미널',
		builtIn: '기본 제공',
		noApiKey: 'API 키 없음',
		linkedApiKey: '연결된 API 키',
		missingApiKey: '찾을 수 없는 API 키',
		noPersona: '페르소나 없음',
		linkedPersona: '연결된 페르소나',
		missingPersona: '찾을 수 없는 페르소나',
		all: '전체',
		read: '읽음',
		unread: '안 읽음',
		checking: '확인 중',
		create: '만들기',
		files: '파일',
		checks: '검증',
		risks: '위험',
		comment: '의견',
		source: '출처',
		question: '질문',
		summary: '요약',
		recommended: '추천',
		strengths: '강점',
		recommendation: '추천안',
		yes: '예',
		no: '아니오'
	},
	navigation: {
		projects: '프로젝트',
		queue: '작업 대기열',
		references: '참고자료',
		agents: '에이전트',
		personas: '페르소나',
		skills: '스킬',
		terminals: '터미널',
		processes: '프로세스',
		environment: '환경변수',
		settings: '설정',
		noWorkspace: '워크스페이스 없음',
		unlockActiveWorkspace: '현재 워크스페이스 잠금을 해제하세요.',
		addWorkspaceFirst: '설정에서 워크스페이스를 먼저 추가하세요.',
		waitForOperation: '현재 작업이 끝날 때까지 기다리세요.',
		primary: '기본 메뉴',
		settingsArea: '설정',
		resizeSidebar: '사이드바 너비 조절'
	},
	workspace: {
		addWorkspaceInSettings: '설정에서 워크스페이스를 추가하세요.',
		locked: '워크스페이스 잠김',
		folderUnavailable: '워크스페이스 폴더를 사용할 수 없음',
		path: '경로',
		reconnect: '다시 연결',
		chooseFolder: '워크스페이스 폴더 선택',
		unlock: {
			submit: '잠금 해제',
			tryAgainIn: '{seconds}초 뒤에 다시 시도하세요.',
			passwordRequired: '암호를 입력하세요.',
			passwordMismatch: '암호가 일치하지 않습니다.',
			passwordMismatchWithAttempts:
				'암호가 일치하지 않습니다. {attemptsRemaining}번 더 시도할 수 있습니다.',
			unavailable: '잠금 해제는 데스크톱 앱에서 사용할 수 있습니다.',
			invalidHash: '워크스페이스 잠금 정보를 읽지 못했습니다.'
		},
		pathErrors: {
			pathRequired: '워크스페이스 경로를 입력하세요.',
			pathNotAbsolute: '워크스페이스 경로는 절대 폴더 경로여야 합니다.',
			pathNotFound: '워크스페이스 경로가 없습니다.',
			pathNotDirectory: '워크스페이스 경로는 폴더여야 합니다.',
			pathPermissionDenied: '워크스페이스 경로를 읽을 수 없습니다.',
			pathUnreadable: '워크스페이스 경로를 확인하지 못했습니다.',
			pathValidationUnavailable: '워크스페이스 경로 확인은 데스크톱 앱에서만 사용할 수 있습니다.',
			pathSelectionUnavailable: '워크스페이스 폴더 선택기를 사용할 수 없습니다.',
			pathSelectionFailed: '워크스페이스 폴더를 선택하지 못했습니다.',
			pathDuplicate: '이미 등록된 워크스페이스 경로입니다.',
			workspaceNotFound: '워크스페이스를 찾을 수 없습니다.',
			registryReadFailed: '워크스페이스 설정을 불러오지 못했습니다.',
			registryWriteFailed: '워크스페이스 설정을 저장하지 못했습니다.'
		}
	},
	queue: {
		list: '작업 대기열 파일',
		detail: '작업 대기열 세부 정보',
		filters: '작업 대기열 필터',
		contextMenu: '작업 대기열 파일 메뉴',
		registeredCount: '대기열 파일 {count}개',
		executionFilters: '실행 상태 필터',
		readFilters: '읽음 상태 필터',
		pendingCountLabel: '실행 대기 작업 {count}개',
		resultReportReview: '결과 보고서 검토',
		workOrderView: '작업 지시서 보기',
		workOrderId: '작업 ID',
		proposalView: '제안서 보기',
		empty: '보고서나 작업 지시서 파일을 추가하세요.',
		noMatches: '조건에 맞는 작업 대기열 파일이 없습니다.',
		addWork: '작업 추가',
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
			en: 'English'
		},
		noProject: '프로젝트 없음',
		noSkill: '스킬 없음',
		noAgent: '에이전트 없음',
		noReference: '참고자료 없음',
		linkedSkill: '연결된 스킬',
		assignment: '실행 설정',
		advancedExecution: '고급 실행 설정',
		internalSkills: '내부 스킬',
		workProjects: '관련 프로젝트',
		workAgents: '작업 에이전트',
		workReferences: '작업 참고자료',
		selectionCount: '{count}개 선택',
		workBody: '작업 내용',
		directMessageBody: '보낼 메시지',
		vote: {
			question: '질문',
			options: '선택지',
			optionCountInput: '선택지 개수',
			optionName: '선택지 이름',
			optionDescription: '설명',
			criteria: '평가 기준',
			result: '투표 결과',
			choice: '선택',
			count: '{count}표',
			invalid: '해석하지 못한 응답 {count}개',
			optionCount: '{count}개 선택지',
			unparsed: '해석 실패'
		},
		createWorkOrder: '작업 지시서 만들기',
		delegateEvaluation: '평가 위임',
		creating: '만드는 중',
		executeWorkOrder: '실행',
		executing: '실행 중',
		noFollowUpSelected: '후속 작업이 선택되지 않았습니다.',
		noEvaluationTargets: '평가할 응답이 없습니다.',
		evaluationAlreadyDelegated: '이미 평가 위임 작업이 있습니다: {relativePath}',
		evaluationDelegated: '{relativePath} 평가 위임 작업을 만들었습니다.',
		createdFile: '{relativePath} 파일을 만들었습니다.',
		updatedFile: '{relativePath} 파일을 수정했습니다.',
		deletedFile: '{relativePath} 파일을 삭제했습니다.',
		executedFile: '{relativePath} 보고서를 만들고 작업을 완료했습니다.',
		nextWorkOrders: '다음 작업 지시서',
		priorities: {
			low: '낮음',
			normal: '보통',
			high: '높음',
			urgent: '긴급'
		},
		executionStates: {
			pending: '실행 대기',
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
			saved: '평가를 저장했습니다.'
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
			executionAgentNotFound: '선택한 에이전트를 찾을 수 없습니다.',
			executionSecretNotFound: '에이전트에 연결된 API 키를 찾을 수 없습니다.',
			executionProviderUnsupported: '지원하는 LLM 제공업체를 확인하지 못했습니다. 에이전트의 제공업체를 선택하거나 API 키 이름/태그에 DeepSeek, OpenAI, OpenRouter 중 하나를 포함하세요.',
			executionApiKeyRequired: 'API 키가 비어 있습니다.',
			executionPromptRequired: '작업 지시문을 만들지 못했습니다.',
			executionModelRequired: '사용할 모델을 정하지 못했습니다.',
			executionRequestInvalid: 'LLM 요청 형식이 올바르지 않습니다.',
			executionAuthenticationFailed: 'LLM 인증에 실패했습니다. API 키를 확인하세요.',
			executionRateLimited: 'LLM 요청 한도를 초과했습니다. 잠시 후 다시 실행하세요.',
			executionProviderRejected: 'LLM 제공업체가 요청을 거부했습니다.',
			executionProviderUnavailable: 'LLM 제공업체에 연결하지 못했습니다.',
			executionResponseInvalid: 'LLM 응답을 보고서로 읽지 못했습니다.',
			executionUnavailable: '작업 실행은 데스크톱 앱에서 사용할 수 있습니다.'
		}
	},
	environment: {
		ariaLabel: '환경변수',
		registeredCount: '환경변수 {count}개',
		vaultPassword: '보안 보관함 암호',
		createVault: '보안 보관함 만들기',
		unlockVault: '잠금 해제',
		lockVault: '잠금',
		kind: '종류',
		tags: '태그',
		value: '값',
		select: '선택',
		filters: '환경변수 필터',
		kindFilter: '종류 필터',
		tagFilter: '태그 필터',
		allKinds: '모든 종류',
		allTags: '모든 태그',
		empty: '환경변수가 없습니다.',
		noMatches: '조건에 맞는 환경변수가 없습니다.',
		entries: '환경변수 항목',
		copy: '복사',
		show: '보기',
		hide: '숨기기',
		applyCliEnvironment: 'CLI 환경 적용',
		applyCliEnvironmentTooltip:
			'OpenRouter, OpenAI, DeepSeek API 키를 사용자 환경변수로 저장합니다.',
		secretKinds: {
			'api-key': 'API 키',
			token: '토큰',
			'ssh-key': 'SSH 키',
			account: '계정',
			password: '암호',
			other: '기타'
		},
		secretTags: {
			llm: 'LLM',
			github: 'GitHub',
			gitlab: 'GitLab',
			openai: 'OpenAI',
			anthropic: 'Anthropic',
			openrouter: 'OpenRouter',
			cloud: '클라우드',
			database: '데이터베이스',
			auth: '인증',
			sync: '동기화',
			deployment: '배포',
			monitoring: '모니터링',
			payment: '결제',
			storage: '저장소'
		},
		statuses: {
			created: '보안 보관함을 만들었습니다.',
			saved: '저장했습니다.',
			removed: '삭제했습니다.',
			copied: '복사했습니다.',
			cliEnvironmentApplied: 'CLI 환경변수 {count}개를 적용했습니다.'
		},
		errors: {
			vaultPasswordRequired: '보안 보관함 암호를 입력하세요.',
			vaultPasswordTryAgain: '{seconds}초 뒤에 다시 시도하세요.',
			vaultPasswordMismatch: '보안 보관함 암호가 일치하지 않습니다.',
			vaultPasswordMismatchWithAttempts:
				'보안 보관함 암호가 일치하지 않습니다. {attemptsRemaining}번 더 시도할 수 있습니다.',
			vaultUnavailable: '보안 보관함은 데스크톱 앱에서 사용할 수 있습니다.',
			vaultInvalid: '보안 보관함 데이터를 읽지 못했습니다.',
			vaultSaveFailed: '보안 보관함을 저장하지 못했습니다.',
			vaultOperationFailed: '보안 보관함 작업이 실패했습니다.',
			clipboardUnavailable: '클립보드를 사용할 수 없습니다.',
			copyFailed: '복사하지 못했습니다.',
			nameRequired: '이름을 입력하세요.',
			kindRequired: '종류를 선택하세요.',
			tagRequired: '태그를 선택하세요.',
			nameDuplicate: '이미 있는 이름입니다.',
			valueRequired: '값을 입력하세요.',
			notFound: '항목을 찾을 수 없습니다.',
			cliEnvironmentNoVariables:
				'OpenRouter, OpenAI, DeepSeek API 키 환경변수가 없습니다.',
			cliEnvironmentApplyFailed: 'CLI 환경변수를 적용하지 못했습니다.',
			cliEnvironmentUnsupported: '이 운영체제에서는 사용자 환경변수 적용을 지원하지 않습니다.',
			cliEnvironmentUnavailable: 'CLI 환경 적용은 데스크톱 앱에서 사용할 수 있습니다.'
		}
	},
	projects: {
		newProject: '새 프로젝트',
		newGroup: '새 그룹',
		newRepository: '새 저장소',
		registeredCount: '루트 프로젝트 {count}개',
		filters: {
			pullNeeded: 'Pull 필요',
			pushNeeded: 'Push 필요',
			tagPlaceholder: '태그'
		},
		kinds: {
			project: '프로젝트',
			group: '그룹'
		},
		counts: {
			group: '그룹',
			groups: '그룹',
			repo: '저장소',
			repos: '저장소'
		},
		lastRepositoryOperation: '마지막 작업: {timestamp}',
		contextMenu: {
			openFolder: '폴더 열기',
			editDescription: '설명 수정',
			githubCredential: 'GitHub 인증',
			editTags: '태그 수정',
			delete: '삭제',
			clone: 'Clone',
			initializeGit: 'Git 초기화',
			publish: '게시',
			openTerminal: '터미널 열기',
			installDependencies: '의존성 설치 터미널 열기',
			updateDependencies: '의존성 업데이트 터미널 열기',
			startDevServer: '개발 서버 터미널 열기',
			build: '빌드 터미널 열기'
		},
		repositoryTasks: {
			terminalOpened: '터미널을 열었습니다.',
			commandTerminalOpened: '명령이 입력된 터미널을 열었습니다: {command}. 완료 여부는 터미널에서 확인하세요.',
			installDependenciesTerminalOpened: '의존성 설치 명령이 입력된 터미널을 열었습니다. 완료 여부는 터미널에서 확인하세요.',
			updateDependenciesTerminalOpened: '의존성 업데이트 명령이 입력된 터미널을 열었습니다. 완료 여부는 터미널에서 확인하세요.',
			startDevServerTerminalOpened: '개발 서버 명령이 입력된 터미널을 열었습니다. 실행 여부는 터미널에서 확인하세요.',
			buildTerminalOpened: '빌드 명령이 입력된 터미널을 열었습니다. 완료 여부는 터미널에서 확인하세요.'
		},
		errors: {
			'project-github-credential-vault-locked':
				'선택한 GitHub 인증을 사용하려면 환경변수 잠금을 해제하세요.',
			'project-github-credential-missing': '선택한 GitHub 인증을 찾을 수 없습니다.',
			'project-github-credential-invalid': '선택한 GitHub 인증은 GitHub 토큰이어야 합니다.',
			'project-name-required': '이름을 입력하세요.',
			'project-name-duplicate': '이 위치에 같은 이름이 이미 있습니다.',
			'project-parent-not-found': '상위 프로젝트를 찾을 수 없습니다.',
			'project-parent-invalid': '그룹은 프로젝트 아래에만 추가할 수 있습니다.',
			'project-node-not-found': '프로젝트를 찾을 수 없습니다.',
			'project-path-required': '프로젝트 경로가 필요합니다.',
			'project-path-duplicate': '이미 등록된 프로젝트 경로입니다.',
			'project-repository-target-invalid': '저장소는 그룹에만 연결할 수 있습니다.',
			'project-repository-not-found': '저장소 연결을 찾을 수 없습니다.',
			'project-folder-workspace-required': '워크스페이스 경로가 필요합니다.',
			'project-folder-workspace-not-absolute': '워크스페이스 경로는 절대 경로여야 합니다.',
			'project-folder-workspace-not-found': '워크스페이스 경로를 찾을 수 없습니다.',
			'project-folder-workspace-not-directory': '워크스페이스 경로는 폴더여야 합니다.',
			'project-folder-workspace-permission-denied': '워크스페이스 경로에 쓸 수 없습니다.',
			'project-folder-workspace-unreadable': '워크스페이스 경로를 확인하지 못했습니다.',
			'project-folder-root-invalid': '프로젝트 폴더를 사용할 수 없습니다.',
			'project-folder-parent-required': '상위 폴더를 사용할 수 없습니다.',
			'project-folder-parent-invalid': '상위 폴더를 사용할 수 없습니다.',
			'project-folder-parent-not-found': '상위 폴더를 사용할 수 없습니다.',
			'project-folder-path-required': '프로젝트 폴더 경로가 필요합니다.',
			'project-folder-path-invalid': '프로젝트 폴더 경로를 사용할 수 없습니다.',
			'project-folder-name-required': '이름을 입력하세요.',
			'project-folder-name-invalid': '폴더 이름으로 사용할 수 없는 이름입니다.',
			'project-folder-conflict': '폴더 경로를 사용할 수 없습니다.',
			'project-folder-create-failed': '폴더를 만들지 못했습니다.',
			'project-folder-open-path-required': '폴더 경로가 필요합니다.',
			'project-folder-open-path-not-absolute': '폴더 경로는 절대 경로여야 합니다.',
			'project-folder-open-path-not-found': '폴더 경로를 찾을 수 없습니다.',
			'project-folder-open-path-not-directory': '폴더 경로는 폴더여야 합니다.',
			'project-folder-open-path-permission-denied': '폴더를 열 수 없습니다.',
			'project-folder-open-failed': '폴더를 열지 못했습니다.',
			'project-folder-delete-path-required': '폴더 경로가 필요합니다.',
			'project-folder-delete-path-not-absolute': '폴더 경로는 절대 경로여야 합니다.',
			'project-folder-delete-path-not-found': '폴더 경로를 찾을 수 없습니다.',
			'project-folder-delete-path-not-directory': '폴더 경로는 폴더여야 합니다.',
			'project-folder-delete-path-outside-workspace':
				'현재 워크스페이스의 projects 폴더 안에 있는 폴더만 여기서 삭제할 수 있습니다.',
			'project-folder-delete-path-permission-denied': '폴더를 삭제할 수 없습니다.',
			'project-folder-delete-failed': '폴더를 삭제하지 못했습니다.',
			'project-folder-unavailable': '프로젝트 폴더 기능은 데스크톱 앱에서 사용할 수 있습니다.',
			'project-repository-name-required': '저장소 이름을 입력하세요.',
			'project-repository-source-required': '저장소 폴더나 URL이 필요합니다.',
			'project-repository-path-required': '저장소 경로가 필요합니다.',
			'project-repository-path-outside-workspace':
				'저장소 경로는 현재 워크스페이스 안에 있어야 합니다.',
			'project-repository-path-duplicate': '이미 연결된 저장소 경로입니다.',
			'project-repository-remote-url-invalid': '저장소 URL을 사용할 수 없습니다.',
			'project-repository-remote-url-duplicate': '이미 등록된 저장소 URL입니다.',
			'project-repository-clone-unavailable':
				'저장소 Clone 기능은 데스크톱 앱에서 사용할 수 있습니다.',
			'project-repository-workspace-required': '워크스페이스 경로를 사용할 수 없습니다.',
			'project-repository-workspace-not-absolute': '워크스페이스 경로를 사용할 수 없습니다.',
			'project-repository-workspace-not-found': '워크스페이스 경로를 사용할 수 없습니다.',
			'project-repository-workspace-not-directory': '워크스페이스 경로를 사용할 수 없습니다.',
			'project-repository-workspace-permission-denied': '워크스페이스 경로를 사용할 수 없습니다.',
			'project-repository-workspace-unreadable': '워크스페이스 경로를 사용할 수 없습니다.',
			'project-repository-group-path-required': '저장소 그룹 폴더를 사용할 수 없습니다.',
			'project-repository-group-path-invalid': '저장소 그룹 폴더를 사용할 수 없습니다.',
			'project-repository-group-path-not-found': '저장소 그룹 폴더를 사용할 수 없습니다.',
			'project-repository-group-path-not-directory': '저장소 그룹 폴더를 사용할 수 없습니다.',
			'project-repository-name-invalid': '폴더 이름으로 사용할 수 없는 저장소 이름입니다.',
			'project-repository-remote-url-required': '저장소 URL이 필요합니다.',
			'project-repository-clone-target-exists': 'Clone 대상 폴더가 이미 있습니다.',
			'project-repository-clone-command-unavailable': 'Git 명령을 찾을 수 없습니다.',
			'project-repository-clone-command-timed-out': '저장소 Clone 시간이 초과되었습니다.',
			'project-repository-clone-token-invalid':
				'GitHub 토큰이 올바르지 않거나 만료되었습니다. 환경변수의 GitHub PAT를 갱신하세요.',
			'project-repository-clone-permission-denied':
				'GitHub 토큰에 저장소 접근 권한이 없습니다. 저장소 선택과 Contents 읽기 권한을 확인하세요.',
			'project-repository-clone-repository-not-found':
				'저장소를 찾을 수 없습니다. 비공개 저장소는 토큰 접근 권한이 없을 때도 이렇게 보일 수 있습니다.',
			'project-repository-clone-organization-restricted':
				'GitHub 조직 접근이 제한되어 있습니다. 해당 조직이나 SSO에서 토큰을 승인하세요.',
			'project-repository-clone-access-denied':
				'GitHub가 저장소 접근을 거부했습니다. URL, 토큰 권한, 조직 정책을 확인하세요.',
			'project-repository-clone-auth-required':
				'저장소 Clone에는 Git 인증이 필요합니다. 이 프로젝트에 GitHub 인증을 선택하세요.',
			'project-repository-clone-failed':
				'저장소 Clone에 실패했습니다. URL, 네트워크, Git 인증을 확인하세요.',
			'project-repository-git-path-required': '저장소 경로가 필요합니다.',
			'project-repository-git-path-not-absolute': '저장소 경로는 절대 경로여야 합니다.',
			'project-repository-git-path-not-found': '저장소 경로를 찾을 수 없습니다.',
			'project-repository-git-path-not-directory': '저장소 경로는 폴더여야 합니다.',
			'project-repository-git-path-permission-denied': '저장소 경로를 읽을 수 없습니다.',
			'project-repository-git-path-unreadable': '저장소 경로를 확인하지 못했습니다.',
			'project-repository-git-command-unavailable': 'Git 명령을 찾을 수 없습니다.',
			'project-repository-git-command-failed':
				'Git 명령이 실패했습니다. 저장소 경로와 Git 설치 상태를 확인하세요.',
			'project-repository-git-command-timed-out': 'Git 명령 시간이 초과되었습니다.',
			'project-repository-git-not-repository': '저장소 폴더가 Git 저장소로 초기화되지 않았습니다.',
			'project-repository-git-init-failed': 'Git 저장소를 초기화하지 못했습니다.',
			'project-repository-git-remote-missing': 'Git 원격 저장소가 설정되지 않았습니다.',
			'project-repository-git-push-auth-required': 'Git push에는 인증이 필요합니다.',
			'project-repository-git-push-empty': 'Push할 커밋이 없습니다.',
			'project-repository-git-push-failed':
				'Git push에 실패했습니다. 원격 URL, 브랜치, 네트워크, 인증을 확인하세요.',
			'project-repository-git-fetch-auth-required': 'Git fetch에는 인증이 필요합니다.',
			'project-repository-git-fetch-failed':
				'Git fetch에 실패했습니다. 원격 URL, 네트워크, 인증을 확인하세요.',
			'project-repository-git-pull-auth-required': 'Git pull에는 인증이 필요합니다.',
			'project-repository-git-pull-conflict':
				'이 체크아웃에 로컬 수정 또는 충돌이 있어서 Git pull을 중단했습니다. 필요한 변경을 커밋하거나 스태시하거나 버린 뒤 다시 Pull 하세요.',
			'project-repository-git-pull-failed':
				'Git pull에 실패했습니다. 원격 URL, 브랜치, 네트워크, 인증을 확인하세요.',
			'project-repository-github-repo-name-required': 'GitHub 저장소 이름을 입력하세요.',
			'project-repository-github-repo-name-invalid': 'GitHub 저장소 이름을 사용할 수 없습니다.',
			'project-repository-github-commit-message-required': '커밋 메시지를 입력하세요.',
			'project-repository-github-commit-message-invalid': '커밋 메시지를 사용할 수 없습니다.',
			'project-repository-github-visibility-invalid': 'GitHub 공개 범위를 사용할 수 없습니다.',
			'project-repository-github-cli-unavailable': 'GitHub CLI를 찾을 수 없습니다.',
			'project-repository-github-auth-required': 'GitHub CLI 인증이 필요합니다.',
			'project-repository-github-remote-exists': 'Git 원격 origin이 이미 설정되어 있습니다.',
			'project-repository-github-empty': '게시할 커밋이 없습니다.',
			'project-repository-github-commit-identity-missing':
				'Git 작성자 이름이나 이메일이 설정되지 않았습니다.',
			'project-repository-github-commit-index-locked':
				'다른 프로세스가 Git 인덱스를 사용 중입니다.',
			'project-repository-github-commit-hook-failed': 'Git 훅이 첫 커밋을 막았습니다.',
			'project-repository-github-commit-failed': '첫 커밋을 만들지 못했습니다.',
			'project-repository-github-create-failed':
				'GitHub 저장소를 만들지 못했습니다. GitHub CLI 인증과 저장소 이름을 확인하세요.',
			'project-repository-task-unavailable':
				'저장소 작업은 데스크톱 앱에서 사용할 수 있습니다.',
			'project-repository-task-workspace-required': '워크스페이스 경로를 사용할 수 없습니다.',
			'project-repository-task-workspace-not-absolute': '워크스페이스 경로를 사용할 수 없습니다.',
			'project-repository-task-workspace-not-found': '워크스페이스 경로를 사용할 수 없습니다.',
			'project-repository-task-workspace-not-directory': '워크스페이스 경로를 사용할 수 없습니다.',
			'project-repository-task-workspace-unreadable': '워크스페이스 경로를 사용할 수 없습니다.',
			'project-repository-task-path-required': '저장소 경로를 사용할 수 없습니다.',
			'project-repository-task-path-not-absolute': '저장소 경로를 사용할 수 없습니다.',
			'project-repository-task-path-not-found': '저장소 경로를 사용할 수 없습니다.',
			'project-repository-task-path-not-directory': '저장소 경로를 사용할 수 없습니다.',
			'project-repository-task-path-outside-workspace':
				'저장소 경로는 현재 워크스페이스 안에 있어야 합니다.',
			'project-repository-task-path-unreadable': '저장소 경로를 사용할 수 없습니다.',
			'project-repository-task-invalid': '저장소 작업을 사용할 수 없습니다.',
			'project-repository-task-command-unavailable':
				'이 저장소에 맞는 명령을 찾을 수 없습니다.',
			'project-repository-task-terminal-unavailable': '지원하는 터미널을 찾을 수 없습니다.',
			'project-repository-task-launch-failed': '명령 터미널을 열지 못했습니다.',
			'project-registry-read-failed': '프로젝트를 불러오지 못했습니다.',
			'project-registry-write-failed': '프로젝트를 저장하지 못했습니다.',
			'project-repository-operation-read-failed':
				'저장소 작업 기록을 불러오지 못했습니다.',
			'project-repository-operation-write-failed':
				'저장소 작업 기록을 저장하지 못했습니다.'
		}
	},
	references: {
		title: '참고자료',
		list: '참고자료 목록',
		details: '참고자료 세부 정보',
		registeredCount: '참고자료 {count}개',
		newReference: '새 참고자료',
		editReference: '참고자료 수정',
		sourceUrl: '참고 URL',
		tags: '태그',
		relatedProjects: '연관 프로젝트',
		noProject: '프로젝트 없음',
		projectSelectionCount: '{count}개 프로젝트 선택',
		content: '내용',
		saved: '저장했습니다.',
		removed: '삭제했습니다.',
		errors: {
			titleRequired: '제목을 입력하세요.',
			bodyOrSourceRequired: '참고 URL이나 내용을 입력하세요.',
			sourceUrlInvalid: '참고 URL은 http:// 또는 https://로 시작해야 합니다.',
			titleDuplicate: '이미 있는 제목입니다.',
			notFound: '참고자료를 찾을 수 없습니다.',
			readFailed: '참고자료를 불러오지 못했습니다.',
			saveFailed: '참고자료를 저장하지 못했습니다.'
		}
	},
	settings: {
		title: '설정',
		pageTitle: '설정 - Workduck',
		sections: '설정 섹션',
		tabs: {
			appearance: '화면',
			workspaces: '워크스페이스',
			sync: '동기화',
			advanced: '고급',
			system: '시스템'
		},
		appearance: {
			section: '화면',
			language: '언어',
			interfaceFontSize: '인터페이스 글꼴 크기',
			loadError: '화면 설정을 불러오지 못했습니다.',
			saveError: '화면 설정을 저장하지 못했습니다.'
		},
		workspaces: {
			noWorkspaces: '워크스페이스가 없습니다.',
			status: '워크스페이스 상태',
			active: '활성',
			locked: '잠김',
			switch: '전환',
			lock: '잠금',
			reconnect: '다시 연결',
			repository: {
				section: '워크스페이스 저장소',
				useAsRepository: '이 워크스페이스를 저장소로 사용',
				prepare: '저장소 준비',
				publish: '게시',
				prepareTitle: '워크스페이스 저장소 준비',
				publishTitle: '워크스페이스 저장소 게시',
				githubRepository: 'GitHub 저장소',
				commitMessage: '커밋 메시지',
				visibility: 'GitHub 공개 범위',
				private: '비공개',
				public: '공개',
				initializeGit: 'Git 저장소 초기화',
				installMustflow: 'mustflow 설치',
				installGitignore: 'Workduck .gitignore 설치',
				gitReady: 'Git 준비됨',
				remoteReady: '원격 연결됨',
				pullNeeded: 'Pull 필요 {count}',
				pushNeeded: 'Push 필요 {count}',
				setupComplete: '워크스페이스 저장소를 준비했습니다.',
				setupPartial: '워크스페이스는 추가했지만 저장소 준비에 실패했습니다.',
				setupFailed: '저장소 준비에 실패했습니다.',
				publishComplete: '워크스페이스 저장소를 게시했습니다.',
				fetchComplete: 'Fetch 완료.',
				pullComplete: 'Pull 완료.',
				pushComplete: 'Push 완료.'
			},
			removeTitle: '워크스페이스 삭제',
			removeDescription: '{name} 워크스페이스를 삭제할까요? 로컬 파일은 삭제하지 않습니다.',
			errors: {
				nameRequired: '워크스페이스 이름을 입력하세요.',
				passwordRequired: '워크스페이스 암호를 입력하세요.',
				passwordTooShort: '워크스페이스 암호는 최소 {minLength}자여야 합니다.',
				passwordProtectFailed: '워크스페이스 암호를 보호하지 못했습니다.',
				passwordInvalidHash: '워크스페이스 잠금 정보를 읽지 못했습니다.',
				passwordUnavailable: '워크스페이스 암호 보호는 데스크톱 앱에서만 사용할 수 있습니다.',
				passwordHashInvalid: '워크스페이스 잠금 정보를 저장하지 못했습니다.',
				repositoryChoiceRequired: '워크스페이스 저장소 사용 여부를 선택하세요.',
				repositoryWorkspaceRequired: '워크스페이스 폴더를 선택하세요.',
				repositoryWorkspaceNotAbsolute: '워크스페이스 경로는 절대 경로여야 합니다.',
				repositoryWorkspaceNotFound: '워크스페이스 폴더를 찾을 수 없습니다.',
				repositoryWorkspaceNotDirectory: '워크스페이스 경로는 폴더여야 합니다.',
				repositoryWorkspacePermissionDenied: '워크스페이스 폴더 접근이 거부되었습니다.',
				repositoryWorkspaceUnreadable: '워크스페이스 폴더를 읽지 못했습니다.',
				repositoryLayoutInvalid: '워크스페이스 안의 기존 파일 구조를 사용할 수 없습니다.',
				repositoryCreateFailed: '워크스페이스 저장소 파일을 만들지 못했습니다.',
				repositoryGitUnavailable: 'Git을 사용할 수 없습니다.',
				repositoryGitTimedOut: 'Git 초기화 시간이 초과되었습니다.',
				repositoryGitInitFailed: 'Git 저장소를 초기화하지 못했습니다.',
				repositoryMustflowUnavailable: 'mustflow 명령을 사용할 수 없습니다.',
				repositoryMustflowTimedOut: 'mustflow 설치 시간이 초과되었습니다.',
				repositoryMustflowFailed: 'mustflow 설치에 실패했습니다.',
				repositoryMustflowPackageFailed: 'mustflow 패키지 설정 파일을 만들지 못했습니다.',
				repositoryGitignoreFailed: '.gitignore 파일을 준비하지 못했습니다.',
				repositoryUnavailable: '워크스페이스 저장소 준비는 데스크톱 앱에서 사용할 수 있습니다.',
				repositoryGitPathRequired: '저장소 경로가 필요합니다.',
				repositoryGitPathNotAbsolute: '저장소 경로는 절대 경로여야 합니다.',
				repositoryGitPathNotFound: '저장소 폴더를 찾을 수 없습니다.',
				repositoryGitPathNotDirectory: '저장소 경로는 폴더여야 합니다.',
				repositoryGitPathPermissionDenied: '저장소 폴더 접근이 거부되었습니다.',
				repositoryGitPathUnreadable: '저장소 폴더를 확인하지 못했습니다.',
				repositoryGitCommandUnavailable: 'Git 명령을 찾을 수 없습니다.',
				repositoryGitCommandFailed: 'Git 명령이 실패했습니다.',
				repositoryGitCommandTimedOut: 'Git 명령 시간이 초과되었습니다.',
				repositoryGitNotRepository: 'Git 저장소로 초기화되지 않았습니다.',
				repositoryGitRemoteMissing: '원격 저장소가 설정되지 않았습니다.',
				repositoryGitPushAuthRequired:
					'Git push에는 인증이 필요합니다. 시스템 Git 인증을 설정하거나 보안 보관함에 GitHub 토큰을 추가하세요.',
				repositoryGitPushEmpty: 'Push할 커밋이 없습니다.',
				repositoryGitPushFailed: 'Git push에 실패했습니다.',
				repositoryGitFetchAuthRequired:
					'Git fetch에는 인증이 필요합니다. 시스템 Git 인증을 설정하거나 보안 보관함에 GitHub 토큰을 추가하세요.',
				repositoryGitFetchFailed: 'Git fetch에 실패했습니다.',
				repositoryGitPullAuthRequired:
					'Git pull에는 인증이 필요합니다. 시스템 Git 인증을 설정하거나 보안 보관함에 GitHub 토큰을 추가하세요.',
				repositoryGitPullConflict:
					'이 체크아웃에 로컬 수정 또는 충돌이 있어서 Git pull을 중단했습니다. 필요한 변경을 커밋하거나 스태시하거나 버린 뒤 다시 Pull 하세요.',
				repositoryGitPullFailed: 'Git pull에 실패했습니다.',
				repositoryGithubNameRequired: 'GitHub 저장소 이름을 입력하세요.',
				repositoryGithubNameInvalid: 'GitHub 저장소 이름을 사용할 수 없습니다.',
				repositoryGithubCommitMessageRequired: '커밋 메시지를 입력하세요.',
				repositoryGithubCommitMessageInvalid: '커밋 메시지를 사용할 수 없습니다.',
				repositoryGithubVisibilityInvalid: 'GitHub 공개 범위를 사용할 수 없습니다.',
				repositoryGithubCliUnavailable: 'GitHub CLI를 찾을 수 없습니다.',
				repositoryGithubAuthRequired: 'GitHub 인증이 필요합니다.',
				repositoryGithubRemoteExists: '원격 origin이 이미 설정되어 있습니다.',
				repositoryGithubEmpty: '게시할 커밋이 없습니다.',
				repositoryGithubCommitIdentityMissing: 'Git 작성자 이름이나 이메일이 설정되지 않았습니다.',
				repositoryGithubCommitIndexLocked: '다른 프로세스가 Git 인덱스를 사용 중입니다.',
				repositoryGithubCommitHookFailed: 'Git 훅이 첫 커밋을 막았습니다.',
				repositoryGithubCommitFailed: '첫 커밋을 만들지 못했습니다.',
				repositoryGithubCreateFailed: 'GitHub 저장소를 만들지 못했습니다.'
			},
			tooltips: {
				unlock: '이 기기에서 사용할 수 있도록 워크스페이스 암호를 입력합니다.',
				prepareRepository: 'Git, mustflow, Workduck .gitignore를 이 워크스페이스에 준비합니다.',
				publishRepository: '이 워크스페이스 저장소를 GitHub에 처음 게시합니다.',
				fetchRepository: '워크스페이스 저장소에서 Git fetch를 실행합니다.',
				pullRepository: '워크스페이스 저장소에서 Git pull을 실행합니다.',
				pushRepository: '워크스페이스 저장소에서 Git push를 실행합니다.',
				reconnect: '다른 기기에서 동기화한 워크스페이스라면 로컬 폴더를 다시 선택합니다.',
				switch: '이 워크스페이스를 현재 작업 공간으로 전환합니다.',
				lock: '암호를 다시 입력하기 전까지 이 워크스페이스를 잠급니다.',
				remove: 'Workduck에서 이 워크스페이스를 삭제합니다. 로컬 파일은 삭제하지 않습니다.'
			}
		},
		sync: {
			section: '동기화',
			encryptedData: '암호화된 데이터',
			noFolder: '폴더 없음',
			checking: '확인 중',
			noRepository: '저장소 없음',
			unavailable: '사용할 수 없음',
			noBranch: '브랜치 없음',
			tooltips: {
				folder: '동기화 파일을 저장할 폴더를 선택합니다.',
				fetch: '동기화 저장소에서 Git fetch를 실행합니다.',
				pull: '동기화 저장소에서 Git pull을 실행합니다.',
				push: '동기화 파일을 커밋하고 Git push를 실행합니다.',
				export:
					'현재 워크스페이스와 프로젝트 정보를 암호로 암호화해 아래 데이터 영역에 표시합니다. 파일 없이 직접 복사해 옮길 때 사용합니다.',
				import:
					'아래 데이터 영역에 붙여넣은 암호화 데이터를 현재 앱에 적용합니다. 같은 암호로 내보낸 데이터만 가져올 수 있습니다.',
				save:
					'현재 워크스페이스와 프로젝트 정보를 암호화한 뒤 선택한 동기화 폴더의 파일로 저장합니다. Git push 전에 사용합니다.',
				load:
					'선택한 동기화 폴더의 암호화 파일을 읽어 현재 앱에 적용합니다. Git pull 후 최신 데이터를 반영할 때 사용합니다.'
			},
			confirmations: {
				exportData: {
					title: '암호화 데이터 내보내기 확인',
					body:
						'아래 암호화된 데이터 영역의 기존 내용이 현재 앱 데이터로 새로 만든 내보내기 결과로 바뀝니다.',
					inputLabel: '계속하려면 아래에 표시된 문구를 정확히 입력하세요.',
					confirmTextLabel: '정확히 입력할 문구',
					confirmText: '암호화 데이터 내보내기',
					actionLabel: '내보내기'
				},
				importData: {
					title: '암호화 데이터 가져오기 확인',
					body:
						'아래 암호화된 데이터 영역의 내용이 현재 앱의 워크스페이스와 프로젝트 데이터를 바꿉니다.',
					inputLabel: '계속하려면 아래에 표시된 문구를 정확히 입력하세요.',
					confirmTextLabel: '정확히 입력할 문구',
					confirmText: '암호화 데이터 가져오기',
					actionLabel: '가져오기'
				},
				saveFile: {
					title: '동기화 파일 저장 확인',
					body:
						'{folderPath} 폴더의 {fileName} 파일을 현재 앱 데이터로 암호화해 덮어씁니다.',
					inputLabel: '계속하려면 아래에 표시된 문구를 정확히 입력하세요.',
					confirmTextLabel: '정확히 입력할 문구',
					confirmText: '동기화 파일 저장',
					actionLabel: '저장'
				},
				loadFile: {
					title: '동기화 파일 불러오기 확인',
					body:
						'{folderPath} 폴더의 {fileName} 파일을 읽어 현재 앱의 워크스페이스와 프로젝트 데이터에 적용합니다.',
					inputLabel: '계속하려면 아래에 표시된 문구를 정확히 입력하세요.',
					confirmTextLabel: '정확히 입력할 문구',
					confirmText: '동기화 파일 불러오기',
					actionLabel: '불러오기'
				},
				pullGit: {
					title: 'Git pull 확인',
					body:
						'Git pull로 원격 변경 사항을 {folderPath} 폴더에 적용합니다. 이후 불러오기를 실행하면 현재 앱 데이터가 바뀔 수 있습니다.',
					inputLabel: '계속하려면 아래에 표시된 문구를 정확히 입력하세요.',
					confirmTextLabel: '정확히 입력할 문구',
					confirmText: 'Git pull',
					actionLabel: 'Pull'
				},
				pushGit: {
					title: 'Git push 확인',
					body:
						'{folderPath} 폴더의 {fileName} 파일을 필요하면 커밋한 뒤 원격 저장소로 Git push합니다.',
					inputLabel: '계속하려면 아래에 표시된 문구를 정확히 입력하세요.',
					confirmTextLabel: '정확히 입력할 문구',
					confirmText: 'Git push',
					actionLabel: 'Push'
				}
			},
			statuses: {
				exported: '내보냈습니다.',
				imported: '가져왔습니다.',
				saved: '{fileName} 파일을 저장했습니다.',
				loaded: '{fileName} 파일을 불러왔습니다.',
				fetched: 'Fetch 완료.',
				pulled: 'Pull 완료. 적용하려면 불러오기를 사용하세요.',
				pushed: 'Push 완료.',
				committedAndPushed: '커밋하고 push했습니다.'
			},
			operations: {
				fetchLabel: 'Fetch 중',
				pullLabel: 'Pull 중',
				pushLabel: 'Push 중',
				fetchDetail: '원격 변경 사항을 확인하고 있습니다.',
				pullDetail: '동기화 폴더를 업데이트하고 있습니다.',
				pushDetail: '동기화 파일을 push하고 있습니다.'
			},
			errors: {
				gitActionInvalid: 'Git 작업이 올바르지 않습니다.',
				passwordRequired: '암호를 입력하세요.',
				folderRequired: '폴더를 선택하세요.',
				folderNotAbsolute: '폴더 경로는 절대 경로여야 합니다.',
				folderNotFound: '폴더를 찾을 수 없습니다.',
				folderNotDirectory: '경로는 폴더여야 합니다.',
				folderPermissionDenied: '폴더 접근이 거부되었습니다.',
				fileNameRequired: '동기화 파일 이름을 입력하세요.',
				fileNameInvalid: '동기화 파일 이름이 올바르지 않습니다.',
				contentRequired: '암호화된 데이터를 입력하세요.',
				fileNotFound: '동기화 파일을 찾을 수 없습니다.',
				fileTooLarge: '동기화 파일이 너무 큽니다.',
				fileTargetInvalid: '동기화 파일 경로를 사용할 수 없습니다.',
				fileReadFailed: '동기화 파일을 읽지 못했습니다.',
				fileWriteFailed: '동기화 파일을 저장하지 못했습니다.',
				fileUnavailable: '동기화 파일 기능은 데스크톱 앱에서 사용할 수 있습니다.',
				gitNotRepository: '폴더가 Git 저장소가 아닙니다.',
				gitRemoteMissing: 'Git 원격 저장소가 설정되어 있지 않습니다.',
				gitBranchMissing: 'Git 브랜치를 찾을 수 없습니다.',
				gitUnavailable: 'Git을 사용할 수 없습니다.',
				gitTimedOut: 'Git 명령 시간이 초과되었습니다.',
				gitAuthRequired:
					'Git 인증이 필요합니다. 시스템 Git 인증을 설정하거나 보안 보관함에 GitHub 토큰을 추가하세요.',
				gitIdentityRequired: 'Git 사용자 이름이나 이메일이 설정되어 있지 않습니다.',
				gitRemoteHasChanges: '원격 저장소에 변경 사항이 있습니다. 먼저 Pull 하세요.',
				gitFastForwardRequired: '수동 병합이 필요합니다.',
				gitTrustRequired: 'Git 저장소 신뢰 설정이 필요합니다.',
				gitCommandFailed: 'Git 명령이 실패했습니다.',
				gitReadFailed: 'Git 저장소를 읽지 못했습니다.',
				gitSyncUnavailable: 'Git 동기화는 데스크톱 앱에서 사용할 수 있습니다.',
				envelopeInvalid: '암호화된 데이터가 올바르지 않습니다.',
				encryptedDataDamaged: '암호화된 데이터가 손상되었습니다.',
				exportFailed: '내보내기에 실패했습니다.',
				passwordMismatch: '암호가 일치하지 않습니다.',
				workspaceDataInvalid: '워크스페이스 데이터가 올바르지 않습니다.',
				projectReadFailed: '프로젝트 메타정보를 불러오지 못했습니다.',
				projectWriteFailed: '프로젝트 메타정보를 저장하지 못했습니다.',
				encryptionUnavailable: '동기화 암호화는 데스크톱 앱에서 사용할 수 있습니다.',
				settingsSaveFailed: '동기화 설정을 저장하지 못했습니다.'
			}
		},
		system: {
			section: '시스템',
			startOnSignIn: 'Windows 로그인 시 시작',
			showTrayIcon: '트레이 아이콘 표시',
			minimizeToTray: '트레이로 최소화',
			workspaceIdleLock: '조작 없을 때 잠금',
			workspaceIdleLockNever: '잠그지 않음',
			workspaceIdleLockMinutes: '{minutes}분',
			loadError: '시스템 설정을 불러오지 못했습니다.',
			saveError: '시스템 설정을 저장하지 못했습니다.',
			autostartUnavailable: '자동 시작은 데스크톱 앱에서 사용할 수 있습니다.',
			autostartReadFailed: '자동 시작 상태를 불러오지 못했습니다.',
			autostartSaveFailed: '자동 시작 설정을 저장하지 못했습니다.'
		}
	},
	agents: {
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
		providers: {
			auto: '자동',
			openrouter: 'OpenRouter',
			deepseek: 'DeepSeek',
			openai: 'OpenAI'
		},
		saved: '저장했습니다.',
		removed: '삭제했습니다.',
		evaluation: {
			title: '평가',
			empty: '평가 없음',
			noScore: '-',
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
	},
	personas: {
		title: '페르소나',
		list: '페르소나 목록',
		details: '페르소나 세부 정보',
		registeredCount: '페르소나 {count}개',
		newPersona: '새 페르소나',
		editPersona: '페르소나 수정',
		randomSpectrums: '랜덤 특성',
		agentAssignment: {
			label: '페르소나 없는 에이전트',
			placeholder: '에이전트 선택',
			none: '없음',
			selectedCount: '{count}개 선택'
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
						5: { name: '해커형', description: '동작 우선. 코드가 살아 움직이는 것을 가장 중요하게 봅니다.' }
					}
				},
				qualityStandard: {
					label: '안정성·품질 기준',
					levels: {
						1: { name: '연구실 수준', description: '검증, 타입, 테스트, 보안을 매우 엄격하게 봅니다.' },
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
						5: { name: '즉흥 조립형', description: '구조보다 빠른 연결과 결과를 우선합니다.' }
					}
				},
				productivityStrategy: {
					label: '생산성 전략',
					levels: {
						1: { name: '수공예 장인형', description: '의존성과 자동화를 최소화하고 직접 통제합니다.' },
						2: { name: '절제 자동화형', description: '필요한 도구만 신중히 도입합니다.' },
						3: { name: '실용 도구형', description: '생산성을 위해 적절히 자동화를 활용합니다.' },
						4: { name: '자동화 중심형', description: '반복 작업은 가능한 모두 자동화하려 합니다.' },
						5: { name: '오케스트레이터형', description: '여러 도구, 에이전트, 파이프라인을 조합해 운영합니다.' }
					}
				},
				operationPhilosophy: {
					label: '운영·배포 철학',
					levels: {
						1: { name: '변경 억제형', description: '장애 가능성이 있으면 배포를 미룹니다.' },
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
	},
	skills: {
		title: '스킬',
		list: '스킬 목록',
		details: '스킬 세부 정보',
		registeredCount: '스킬 {count}개',
		newSkill: '새 스킬',
		editSkill: '스킬 수정',
		copySkill: '복사해서 수정',
		copyNameSuffix: '복사본',
		saved: '저장했습니다.',
		removed: '삭제했습니다.',
		outputTypes: {
			'work-order': '작업 지시서',
			proposal: '제안서',
			'result-report': '결과 보고서',
			'agent-evaluation': '에이전트 평가'
		},
		builtIn: {
			proposalWriter: {
				name: '제안서 작성기',
				description: '선택지를 비교하고 추천안과 후속 작업을 포함한 제안서를 만듭니다.',
				instructions:
					'workduck.queue-proposal/v1 산출물을 반환합니다. 가능한 선택지를 비교하고, 절충점을 밝히고, 하나의 추천안을 고른 뒤 필요한 경우에만 구체적인 후속 작업 지시서를 포함합니다.'
			},
			agentResponseEvaluator: {
				name: '에이전트 응답 평가기',
				description: '에이전트 응답을 5개 기준의 1~9점 평가표로 채점합니다.',
				instructions:
					'작업 지시와 에이전트 응답만 근거로 문제 이해력, 논리적 타당성, 현실성·실행 가능성, 창의성·통찰, 리스크 감지를 각각 1~9점으로 평가합니다. 길이 자체에는 점수를 주지 말고, 실제 제약과 실행 가능성, 위험 감지, 판단 근거를 봅니다. 점수를 정한 뒤 workduck agent evaluate 명령으로 같은 워크스페이스의 에이전트 평가 누적값에 저장합니다.'
			}
		},
		errors: {
			nameRequired: '이름을 입력하세요.',
			nameDuplicate: '이미 있는 이름입니다.',
			outputTypeRequired: '산출물 유형을 선택하세요.',
			instructionsRequired: '지시문을 입력하세요.',
			notFound: '스킬을 찾을 수 없습니다.',
			builtInReadonly: '기본 제공 스킬은 변경할 수 없습니다.',
			readFailed: '스킬을 불러오지 못했습니다.',
			saveFailed: '스킬을 저장하지 못했습니다.'
		}
	},
	terminals: {
		title: '터미널',
		list: '터미널 목록',
		details: '터미널 세부 정보',
		registeredCount: '터미널 {count}개',
		newTerminal: '새 터미널',
		editTerminal: '터미널 수정',
		defaultSessionName: '터미널',
		kind: '종류',
		command: '명령',
		status: '상태',
		screen: '터미널 화면',
		connected: '연결됨',
		notConnected: '연결되지 않음',
		connect: '연결',
		disconnect: '연결 끊기',
		send: '전송',
		inputPlaceholder: '명령 입력',
		missingTerminal: '찾을 수 없는 터미널',
		noAvailableTerminal: '사용 가능한 터미널 없음',
		saved: '저장했습니다.',
		removed: '삭제했습니다.',
		errors: {
			nameRequired: '이름을 입력하세요.',
			nameDuplicate: '이미 있는 이름입니다.',
			kindRequired: '터미널 종류를 선택하세요.',
			notFound: '터미널을 찾을 수 없습니다.',
			readFailed: '터미널을 불러오지 못했습니다.',
			saveFailed: '터미널을 저장하지 못했습니다.',
			catalogUnavailable: '터미널 감지는 데스크톱 앱에서 사용할 수 있습니다.',
			catalogReadFailed: '터미널 종류를 확인하지 못했습니다.',
			sessionUnavailable: '터미널 연결은 데스크톱 앱에서 사용할 수 있습니다.',
			sessionStartFailed: '터미널을 시작하지 못했습니다.',
			sessionReadFailed: '터미널 출력을 읽지 못했습니다.',
			sessionWriteFailed: '터미널에 입력하지 못했습니다.',
			sessionStopFailed: '터미널 연결을 끊지 못했습니다.'
		}
	},
	processes: {
		title: '프로세스',
		list: '프로세스 목록',
		details: '프로세스 세부 정보',
		registeredCount: '실행 중인 프로세스 {count}개',
		pid: 'PID',
		kind: '종류',
		command: '명령',
		ports: '열린 포트',
		memory: '메모리',
		forceKill: '강제 종료',
		forceKillConfirm: '{name} 프로세스를 강제로 종료할까요?',
		empty: '실행 중인 개발 프로세스가 없습니다.',
		refreshed: '새로 고침했습니다.',
		killSucceeded: '프로세스를 종료했습니다.',
		errors: {
			unavailable: '프로세스 확인은 데스크톱 앱에서 사용할 수 있습니다.',
			readFailed: '프로세스 목록을 불러오지 못했습니다.',
			killDenied: '이 프로세스는 Workduck에서 종료할 수 없습니다.',
			killFailed: '프로세스를 종료하지 못했습니다.'
		}
	}
} as const satisfies WorkduckMessages;
