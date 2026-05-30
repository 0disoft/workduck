export const zhProcessesMessages = {
	title: '进程',
	list: '进程列表',
	details: '进程详情',
	registeredCount: '{count} 个运行中的进程',
	pid: 'PID',
	kind: '类型',
	command: '命令',
	ports: '监听端口',
	memory: '内存',
	forceKill: '强制终止',
	forceKillConfirm: '确认强制终止 {name} 吗？',
	empty: '无正在运行的开发进程。',
	refreshed: '已刷新。',
	killSucceeded: '进程已终止。',
	errors: {
		unavailable: '进程检测功能仅在桌面客户端中可用。',
		readFailed: '无法读取进程列表。',
		killDenied: 'Workduck 无法终止此进程。',
		killFailed: '无法终止该进程。'
	}
} as const;
