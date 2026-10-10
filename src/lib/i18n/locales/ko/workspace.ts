export const koWorkspaceMessages = {
		addWorkspaceInSettings: '설정에서 워크스페이스를 추가하세요.',
		locked: '워크스페이스 잠김',
		folderUnavailable: '워크스페이스 폴더를 사용할 수 없음',
		checkingFolder: '워크스페이스 폴더를 확인하는 중...',
		path: '경로',
		reconnect: '다시 연결',
		chooseFolder: '워크스페이스 폴더 선택',
		firstWorkspaceTitle: '작업할 폴더부터 골라보세요.',
		firstWorkspaceDescription: '폴더를 고른 뒤 이름과 암호를 설정하세요. Git 저장소 준비는 나중에도 할 수 있어요.',
		addWorkspace: '워크스페이스 추가',
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
			pathTooLong: '워크스페이스 경로가 너무 깁니다. 더 짧은 폴더 경로를 선택하세요.',
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
	} as const;
