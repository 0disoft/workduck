export const koProjectsMessages = {
		newProject: '새 프로젝트',
		newGroup: '새 그룹',
		newRepository: '새 저장소',
		registeredCount: '루트 프로젝트 {count}개',
		filters: {
			pullNeeded: 'Pull 필요',
			pushNeeded: 'Push 필요',
			commitNeeded: '커밋 필요',
			searchLabel: '저장소 이름 또는 태그 필터',
			searchPlaceholder: '이름 또는 태그'
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
		repository: {
			uncommittedChanges: '커밋되지 않은 변경 있음',
			queueCommitWorkOrder: '커밋 작업 추가',
			commitWorkOrderQueued: '커밋 작업을 추가했습니다: {relativePath}'
		},
		operations: {
			running: {
				clone: '저장소 Clone 중',
				init: 'Git 저장소 초기화 중',
				fetch: '저장소 Fetch 중',
				pull: '저장소 Pull 중',
				push: '저장소 Push 중',
				publish: '저장소 게시 중'
			},
			done: {
				clone: '저장소를 Clone했습니다.',
				init: '저장소를 초기화했습니다.',
				fetch: '저장소를 Fetch했습니다.',
				pull: '저장소를 Pull했습니다.',
				push: '저장소를 Push했습니다.',
				publish: '저장소를 게시했습니다.'
			},
			failed: {
				clone: 'Clone에 실패했습니다.',
				init: '초기화에 실패했습니다.',
				fetch: 'Fetch에 실패했습니다.',
				pull: 'Pull에 실패했습니다.',
				push: 'Push에 실패했습니다.',
				publish: '게시하지 못했습니다.'
			},
			buttonRunning: {
				clone: 'Clone 중',
				init: '초기화 중',
				fetch: 'Fetch 중',
				pull: 'Pull 중',
				push: 'Push 중',
				publish: '게시 중'
			},
			buttonIdle: {
				clone: 'Clone',
				init: 'Git 초기화',
				fetch: 'Fetch',
				pull: 'Pull',
				push: 'Push',
				publish: '게시'
			}
		},
		detailsDialog: {
			title: '프로젝트 수정',
			name: '이름',
			path: '경로',
			saving: '저장 중',
			save: '저장',
			cancel: '취소',
			saved: '프로젝트 정보를 저장했습니다.'
		},
		deleteDialog: {
			titles: {
				project: '프로젝트 삭제',
				group: '그룹 삭제',
				repository: '저장소 삭제'
			},
			text: '{name}을(를) Workduck에서 삭제할까요?',
			textWithAffected:
				'{name}을(를) Workduck에서 삭제할까요? 프로젝트 목록에서 {affected}도 함께 제거됩니다.',
			affectedGroups: '하위 그룹 {count}개',
			affectedGroup: '하위 그룹 {count}개',
			affectedRepositories: '저장소 {count}개',
			affectedRepository: '저장소 {count}개',
			localProjectFolder: '이 프로젝트 폴더도 삭제',
			localGroupFolder: '이 그룹 폴더도 삭제',
			localRepositoryFolder: '이 저장소 폴더도 삭제',
			localFolderUnavailable:
				'로컬 폴더 삭제는 현재 워크스페이스 안의 폴더에만 사용할 수 있습니다.',
			localRepositoryFolderUnavailable:
				'로컬 폴더 삭제는 현재 워크스페이스 안의 저장소 폴더에만 사용할 수 있습니다.',
			repositoryRemoved: '저장소를 삭제했습니다.',
			repositoryAndFolderRemoved: '저장소와 로컬 폴더를 삭제했습니다.',
			projectRemoved: '프로젝트를 삭제했습니다.',
			projectAndFolderRemoved: '프로젝트와 로컬 폴더를 삭제했습니다.',
			groupRemoved: '그룹을 삭제했습니다.',
			groupAndFolderRemoved: '그룹과 로컬 폴더를 삭제했습니다.',
			cancel: '취소',
			remove: '삭제',
			removing: '삭제 중'
		},
		contextMenu: {
			openFolder: '폴더 열기',
			editDetails: '이름과 경로 수정',
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
			build: '빌드 터미널 열기',
			preview: '프리뷰 터미널 열기'
		},
		repositoryTasks: {
			terminalOpened: '터미널을 열었습니다.',
			commandTerminalOpened: '명령이 입력된 터미널을 열었습니다: {command}. 결과는 저장소 카드에 갱신됩니다.',
			installDependenciesTerminalOpened: '의존성 설치 명령이 입력된 터미널을 열었습니다. 결과는 저장소 카드에 갱신됩니다.',
			updateDependenciesTerminalOpened: '의존성 업데이트 명령이 입력된 터미널을 열었습니다. 결과는 저장소 카드에 갱신됩니다.',
			startDevServerTerminalOpened: '개발 서버 명령이 입력된 터미널을 열었습니다. 결과는 저장소 카드에 갱신됩니다.',
			buildTerminalOpened: '빌드 명령이 입력된 터미널을 열었습니다. 결과는 저장소 카드에 갱신됩니다.',
			previewTerminalOpened: '프리뷰 명령이 입력된 터미널을 열었습니다. 결과는 저장소 카드에 갱신됩니다.',
			taskRunning: '{task} 실행 중.',
			taskSucceeded: '{task} 성공.',
			taskStopped: '{task} 중지됨.',
			taskFailed: '{task} 실패.',
			taskFailedWithExitCode: '{task} 실패. 종료 코드: {exitCode}.',
			tasks: {
				openTerminal: '터미널',
				installDependencies: '의존성 설치',
				updateDependencies: '의존성 업데이트',
				startDevServer: '개발 서버',
				build: '빌드',
				preview: '프리뷰'
			}
		},
		errors: {
			'project-github-credential-required': 'GitHub 인증을 선택하세요.',
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
			'project-tags-too-many': '태그가 너무 많습니다. 일부 태그를 줄인 뒤 다시 시도하세요.',
			'project-tag-too-long': '태그가 너무 깁니다. 태그를 짧게 줄인 뒤 다시 시도하세요.',
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
			'project-repository-clone-path-too-long':
				'Windows 경로 길이 제한 때문에 Clone에 실패했습니다. 더 짧은 프로젝트 경로를 사용하거나 Windows와 Git의 긴 경로 지원을 켜세요.',
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
				'GitHub 저장소를 만들지 못했습니다. GitHub 인증과 저장소 이름을 확인하세요.',
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
			'project-repository-task-terminal-unsupported-platform':
				'저장소 터미널 작업은 현재 Windows에서만 지원됩니다.',
			'project-repository-task-launch-failed': '명령 터미널을 열지 못했습니다.',
			'project-repository-task-record-write-failed': '저장소 작업 기록을 저장하지 못했습니다.',
			'project-repository-task-record-read-failed': '저장소 작업 기록을 읽지 못했습니다.',
			'project-registry-read-failed': '프로젝트를 불러오지 못했습니다.',
			'project-registry-version-unsupported':
				'프로젝트 데이터가 현재 앱보다 새 포맷입니다. Workduck을 업데이트한 뒤 다시 열어주세요.',
			'project-registry-write-failed': '프로젝트를 저장하지 못했습니다.',
			'project-repository-operation-read-failed':
				'저장소 작업 기록을 불러오지 못했습니다.',
			'project-repository-operation-write-failed':
				'저장소 작업 기록을 저장하지 못했습니다.'
		}
	} as const;
