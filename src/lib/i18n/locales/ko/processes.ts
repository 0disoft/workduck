export const koProcessesMessages = {
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
	} as const;
