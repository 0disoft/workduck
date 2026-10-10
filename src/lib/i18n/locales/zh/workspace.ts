export const zhWorkspaceMessages = {
	addWorkspaceInSettings: '请在“设置”中添加工作区。',
	locked: '工作区已锁定',
	folderUnavailable: '工作区文件夹不可用',
	checkingFolder: '正在检查工作区文件夹...',
	path: '路径',
	reconnect: '重新连接',
	chooseFolder: '选择工作区文件夹',
	firstWorkspaceTitle: '先从选择一个文件夹开始。',
	firstWorkspaceDescription: '先选择文件夹，再设置名称和密码。Git 仓库可以以后再准备。',
	addWorkspace: '添加工作区',
	unlock: {
		submit: '解锁',
		tryAgainIn: '请在 {seconds} 秒后重试。',
		passwordRequired: '密码为必填项。',
		passwordMismatch: '密码不匹配。',
		passwordMismatchWithAttempts:
			'密码不匹配。还剩 {attemptsRemaining} 次尝试机会。',
		unavailable: '解锁功能仅在桌面客户端中可用。',
		invalidHash: '无法读取工作区锁定数据。'
	},
	pathErrors: {
		pathRequired: '工作区路径为必填项。',
		pathTooLong: '工作区路径过长。请选择较短的文件夹路径。',
		pathNotAbsolute: '工作区路径必须是绝对文件夹路径。',
		pathNotFound: '工作区路径不存在。',
		pathNotDirectory: '工作区路径必须是一个文件夹。',
		pathPermissionDenied: '工作区路径不可读。',
		pathUnreadable: '无法检查工作区路径。',
		pathValidationUnavailable: '工作区路径检查仅在桌面客户端中可用。',
		pathSelectionUnavailable: '工作区文件夹选择器不可用。',
		pathSelectionFailed: '无法选择工作区文件夹。',
		pathDuplicate: '该工作区路径已注册。',
		workspaceNotFound: '未找到工作区。',
		registryReadFailed: '无法加载工作区设置。',
		registryConflict: '其他窗口已更改工作区列表。请查看最新列表后重试。',
		registryWriteFailed: '无法保存工作区设置。'
	}
} as const;
