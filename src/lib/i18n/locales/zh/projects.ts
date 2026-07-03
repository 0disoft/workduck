export const zhProjectsMessages = {
	newProject: '新建项目',
	newGroup: '新建分组',
	newRepository: '新建仓库',
	registeredCount: '{count} 个根项目',
	filters: {
		pullNeeded: '需拉取',
		pushNeeded: '需推送',
		commitNeeded: '需提交',
		searchLabel: '仓库名称或标签过滤器',
		searchPlaceholder: '名称或标签'
	},
	kinds: {
		project: '项目',
		group: '分组'
	},
	counts: {
		group: '分组',
		groups: '分组',
		repo: '仓库',
		repos: '仓库'
	},
	lastRepositoryOperation: '最近操作：{timestamp}',
	repository: {
		uncommittedChanges: '未提交的修改',
		queueCommitWorkOrder: '添加提交任务',
		commitWorkOrderQueued: '已添加提交任务：{relativePath}',
		githubCredentialSaved: 'GitHub 凭据已保存。'
	},
	operations: {
		running: {
			clone: '正在克隆仓库',
			init: '正在初始化 Git 仓库',
			fetch: '正在获取仓库修改',
			pull: '正在拉取仓库',
			push: '正在推送仓库',
			publish: '正在发布仓库'
		},
		done: {
			clone: '仓库克隆成功。',
			init: '仓库初始化成功。',
			fetch: '仓库获取成功。',
			pull: '仓库拉取成功。',
			push: '仓库推送成功。',
			publish: '仓库发布成功。'
		},
		failed: {
			clone: '克隆失败。',
			init: '初始化失败。',
			fetch: '获取失败。',
			pull: '拉取失败。',
			push: '推送失败。',
			publish: '发布失败.'
		},
		buttonRunning: {
			clone: '正在克隆',
			init: '初始化',
			fetch: '正在获取',
			pull: '正在拉取',
			push: '正在推送',
			publish: '正在发布'
		},
		buttonIdle: {
			clone: '克隆',
			init: 'Git 初始化',
			fetch: '获取',
			pull: '拉取',
			push: '推送',
			publish: '发布'
		}
	},
	detailsDialog: {
		title: '编辑项目',
		name: '名称',
		path: '路径',
		saving: '正在保存',
		save: '保存',
		cancel: '取消',
		saved: '项目详情已保存。'
	},
	deleteDialog: {
		titles: {
			project: '移除项目',
			group: '移除分组',
			repository: '移除仓库'
		},
		text: '将 {name} 从 Workduck 中移除？',
		textWithAffected:
			'将 {name} 从 Workduck 中移除？这也将从项目列表中移除 {affected}。',
		affectedGroups: '{count} 个子分组',
		affectedGroup: '{count} 个子分组',
		affectedRepositories: '{count} 个仓库',
		affectedRepository: '{count} 个仓库',
		localProjectFolder: '同时删除此项目本地文件夹',
		localGroupFolder: '同时删除此分组本地文件夹',
		localRepositoryFolder: '同时删除此仓库本地文件夹',
		localFolderUnavailable:
			'本地文件夹删除仅适用于此工作区下的文件夹。',
		localRepositoryFolderUnavailable:
			'本地文件夹删除仅适用于此工作区下的仓库文件夹。',
		repositoryRemoved: '仓库已移除。',
		repositoryAndFolderRemoved: '仓库及本地文件夹已移除。',
		projectRemoved: '项目已移除。',
		projectAndFolderRemoved: '项目及本地文件夹已移除。',
		groupRemoved: '分组已移除。',
		groupAndFolderRemoved: '分组及本地文件夹已移除。',
		cancel: '取消',
		remove: '移除',
		removing: '正在移除'
	},
	contextMenu: {
		openFolder: '打开文件夹',
		editDetails: '编辑名称与路径',
		editDescription: '编辑描述',
		githubCredential: 'GitHub 凭据',
		remoteUrl: '远程 URL',
		editTags: '编辑标签',
		delete: '删除',
		clone: '克隆',
		initializeGit: '初始化 Git',
		publish: '发布',
		applySsealed: '应用 ssealed',
		openTerminal: '打开终端',
		installDependencies: '打开依赖安装终端',
		updateDependencies: '打开依赖更新终端',
		startDevServer: '打开开发服务器终端',
		build: '打开构建终端',
		preview: '打开预览终端'
	},
	repositoryTasks: {
		terminalOpened: 'Terminal opened.',
		commandTerminalOpened: '已使用以下命令打开终端：{command}。仓库卡片将根据执行结果更新。',
		installDependenciesTerminalOpened: '已打开依赖安装命令终端。仓库卡片将根据执行结果更新。',
		updateDependenciesTerminalOpened: '已打开依赖更新命令终端。仓库卡片将根据执行结果更新。',
		startDevServerTerminalOpened: '已打开开发服务器命令终端。仓库卡片将根据执行结果更新。',
		buildTerminalOpened: '已打开构建命令终端。仓库卡片将根据执行结果更新。',
		previewTerminalOpened: '已打开预览命令终端。仓库卡片将根据执行结果更新。',
		taskRunning: '{task} 正在运行。',
		taskSucceeded: '{task} 成功。',
		taskStopped: '{task} 已停止。',
		taskFailed: '{task} 失败。',
		taskFailedWithExitCode: '{task} 失败。退出码：{exitCode}。',
		tasks: {
			openTerminal: '终端',
			installDependencies: '安装依赖',
			updateDependencies: '更新依赖',
			startDevServer: '开发服务器',
			build: '构建',
			preview: '预览'
		}
	},
	errors: {
		'project-github-credential-required': '请选择 GitHub 凭据。',
		'project-github-credential-vault-locked':
			'请先解锁环境以使用所选 GitHub 凭据。',
		'project-github-credential-missing': '未找到所选 GitHub 凭据。',
		'project-github-credential-invalid': '所选 GitHub 凭据必须是 GitHub Token。',
		'project-name-required': '名称为必填项。',
		'project-name-duplicate': '此处的项目名称已存在。',
		'project-parent-not-found': '未找到父项目。',
		'project-parent-invalid': '分组只能添加至项目之下。',
		'project-node-not-found': '未找到项目。',
		'project-path-required': '项目路径为必填项。',
		'project-path-duplicate': '项目路径已注册。',
		'project-tags-too-many': '标签过多。请移除一些后重试。',
		'project-tag-too-long': '标签过长。请缩短后重试。',
		'project-repository-target-invalid': '仓库只能链接至分组。',
		'project-repository-not-found': '未找到仓库链接。',
		'project-folder-workspace-required': '工作区路径为必填项。',
		'project-folder-workspace-not-absolute': '工作区路径必须是绝对路径。',
		'project-folder-workspace-not-found': '未找到工作区路径。',
		'project-folder-workspace-not-directory': '工作区路径必须是一个文件夹。',
		'project-folder-workspace-permission-denied': '工作区路径不可写。',
		'project-folder-workspace-unreadable': '无法检查工作区路径。',
		'project-folder-root-invalid': '项目文件夹不可用。',
		'project-folder-parent-required': '父文件夹不可用。',
		'project-folder-parent-invalid': '父文件夹不可用。',
		'project-folder-parent-not-found': '父文件夹不可用。',
		'project-folder-path-required': '项目文件夹路径为必填项。',
		'project-folder-path-invalid': '项目文件夹路径不可用。',
		'project-folder-name-required': '名称为必填项。',
		'project-folder-name-invalid': '该名称不能用作文件夹名称。',
		'project-folder-conflict': '文件夹路径不可用。',
		'project-folder-create-failed': '无法创建文件夹。',
		'project-folder-ssealed-scaffold-failed': '无法创建 ssealed 脚手架。',
		'project-folder-open-path-required': '文件夹路径为必填项。',
		'project-folder-open-path-not-absolute':
			'文件夹路径必须是绝对路径。',
		'project-folder-open-path-not-found': '未找到文件夹路径。',
		'project-folder-open-path-not-directory': '文件夹路径必须是一个文件夹。',
		'project-folder-open-path-permission-denied': '无法打开文件夹路径。',
		'project-folder-repository-path-outside-workspace':
			'仓库文件夹必须位于当前工作区内。',
		'project-folder-open-failed': '无法打开文件夹。',
		'project-folder-delete-path-required': '文件夹路径为必填项。',
		'project-folder-delete-path-not-absolute': '文件夹路径必须是绝对路径。',
		'project-folder-delete-path-not-found': '未找到文件夹路径。',
		'project-folder-delete-path-not-directory': '文件夹路径必须是一个文件夹。',
		'project-folder-delete-path-outside-workspace':
			'在此处只能删除此工作区项目文件夹之下的文件夹。',
		'project-folder-delete-path-permission-denied': '无法删除文件夹路径。',
		'project-folder-delete-failed': '无法删除文件夹。',
		'project-folder-unavailable': '项目文件夹仅在桌面客户端中可用。',
		'project-repository-name-required': '仓库名称为必填项。',
		'project-repository-source-required': '仓库文件夹或 URL 为必填项。',
		'project-repository-path-required': '仓库路径为必填项。',
		'project-repository-path-outside-workspace':
			'仓库路径必须位于当前工作区之内。',
		'project-repository-path-duplicate': '仓库路径已链接。',
		'project-repository-remote-url-invalid': '仓库 URL 不可用。',
		'project-repository-remote-url-duplicate': '仓库 URL 已注册。',
		'project-repository-clone-unavailable': '仓库克隆仅在桌面客户端中可用。',
		'project-repository-workspace-required': '工作区路径不可用。',
		'project-repository-workspace-not-absolute': '工作区路径不可用。',
		'project-repository-workspace-not-found': '工作区路径不可用。',
		'project-repository-workspace-not-directory': '工作区路径不可用。',
		'project-repository-workspace-permission-denied': '工作区路径不可用。',
		'project-repository-workspace-unreadable': '工作区路径不可用。',
		'project-repository-group-path-required': '仓库分组文件夹不可用。',
		'project-repository-group-path-invalid': '仓库分组文件夹不可用。',
		'project-repository-group-path-not-found': '仓库分组文件夹不可用。',
		'project-repository-group-path-not-directory': '仓库分组文件夹不可用。',
		'project-repository-name-invalid': '仓库名称不能用作文件夹名称。',
		'project-repository-remote-url-required': '仓库 URL 为必填项。',
		'project-repository-clone-target-exists': '克隆目标文件夹已存在。',
		'project-repository-clone-command-unavailable': '未找到 Git 命令。',
		'project-repository-clone-command-timed-out': '仓库克隆超时。',
		'project-repository-clone-path-too-long':
			'仓库克隆触发了 Windows 路径长度限制。请使用更短的项目路径，或在 Windows 和 Git 中启用长路径。',
		'project-repository-clone-token-invalid':
			'GitHub Token 无效或已过期。请在环境变量中更新 GitHub PAT。',
		'project-repository-clone-permission-denied':
			'GitHub Token 无仓库访问权限。请检查仓库选择及内容读取权限。',
		'project-repository-clone-repository-not-found':
			'未找到仓库。对于私有仓库，如果 Token 无访问权限，GitHub 可能会显示此错误。',
		'project-repository-clone-organization-restricted':
			'GitHub 组织访问受限。请为 Token 授权该组织访问权限或配置 SSO。',
		'project-repository-clone-access-denied':
			'仓库访问被 GitHub 拒绝。请检查 URL、Token 权限及组织策略。',
		'project-repository-clone-auth-required':
			'克隆仓库需要 Git 身份验证。请为此项目选择 GitHub 凭据。',
		'project-repository-clone-failed':
			'仓库克隆失败。请检查 URL、网络及 Git 凭据。',
		'project-repository-git-path-required': '仓库路径为必填项。',
		'project-repository-git-path-not-absolute': '仓库路径必须是绝对路径。',
		'project-repository-git-path-not-found': '未找到仓库路径。',
		'project-repository-git-path-not-directory': '仓库路径必须是一个文件夹。',
		'project-repository-git-path-permission-denied': '仓库路径不可读。',
		'project-repository-git-path-unreadable': '无法检查仓库路径。',
		'project-repository-git-command-unavailable': '未找到 Git 命令。',
		'project-repository-git-command-failed':
			'Git 命令失败。请检查仓库路径与 Git 安装。',
		'project-repository-git-command-timed-out': 'Git 命令超时。',
		'project-repository-git-not-repository': '仓库文件夹尚未初始化 Git。',
		'project-repository-git-init-failed': '无法初始化 Git 仓库。',
		'project-repository-git-remote-missing': '未配置 Git 远程仓库。',
		'project-repository-git-push-auth-required': 'Git 推送（push）需要身份验证。',
		'project-repository-git-push-empty': '仓库内没有要推送的提交。',
		'project-repository-git-push-failed':
			'Git 推送失败。请检查远程仓库 URL、分支、网络以及凭据。',
		'project-repository-git-fetch-auth-required': 'Git 获取（fetch）需要身份验证。',
		'project-repository-git-fetch-failed':
			'Git 获取失败。请检查远程仓库 URL、网络以及凭据。',
		'project-repository-git-pull-auth-required': 'Git 拉取（pull）需要身份验证。',
		'project-repository-git-pull-conflict':
			'Git 拉取已被中止，因为此分支有本地未提交的修改或冲突。请提交、暂存或放弃本地修改，然后重试拉取。',
		'project-repository-git-pull-failed':
			'Git 拉取失败。请检查远程仓库 URL、分支、网络以及凭据。',
		'project-repository-github-repo-name-required': 'GitHub 仓库名称为必填项。',
		'project-repository-github-repo-name-invalid': 'GitHub 仓库名称不可用。',
		'project-repository-github-commit-message-required': '提交消息为必填项。',
		'project-repository-github-commit-message-invalid': '提交消息不可用。',
		'project-repository-github-visibility-invalid': 'GitHub 可见性设置不可用。',
		'project-repository-github-cli-unavailable': '未找到 GitHub CLI。',
		'project-repository-github-auth-required': 'GitHub CLI 需要进行身份验证。',
		'project-repository-github-remote-exists': 'Git 远程源（origin）已存在。',
		'project-repository-github-empty': '仓库内没有要发布的提交。',
		'project-repository-github-commit-identity-missing':
			'未配置 Git 提交者姓名或电子邮箱。',
		'project-repository-github-commit-index-locked':
			'Git 索引（index）已被另一个进程锁定。',
		'project-repository-github-commit-hook-failed':
			'初始提交被 Git Hook 拦截。',
		'project-repository-github-commit-failed': '无法创建初始提交。',
		'project-repository-github-create-failed':
			'无法创建 GitHub 仓库。请检查 GitHub 身份验证与仓库名称。',
		'project-repository-task-unavailable': '仓库任务仅在桌面客户端中可用。',
		'project-repository-task-workspace-required': '工作区路径不可用。',
		'project-repository-task-workspace-not-absolute': '工作区路径不可用。',
		'project-repository-task-workspace-not-found': '工作区路径不可用。',
		'project-repository-task-workspace-not-directory': '工作区路径不可用。',
		'project-repository-task-workspace-unreadable': '工作区路径不可用。',
		'project-repository-task-path-required': '仓库路径不可用。',
		'project-repository-task-path-not-absolute': '仓库路径不可用。',
		'project-repository-task-path-not-found': '仓库路径不可用。',
		'project-repository-task-path-not-directory': '仓库路径不可用。',
		'project-repository-task-path-outside-workspace':
			'仓库路径必须位于当前工作区之内。',
		'project-repository-task-path-unreadable': '仓库路径不可用。',
		'project-repository-task-invalid': '仓库任务不可用。',
		'project-repository-task-command-unavailable':
			'未找到此仓库的对应命令。',
		'project-repository-task-terminal-unavailable': '未找到支持的终端。',
		'project-repository-task-terminal-unsupported-platform':
			'仓库终端任务目前仅在 Windows 上受支持。',
		'project-repository-task-launch-failed': '无法打开命令终端。',
		'project-repository-task-record-write-failed':
			'无法保存仓库任务记录。',
		'project-repository-task-record-read-failed':
			'无法加载仓库任务记录。',
		'project-registry-read-failed': '无法加载项目。',
		'project-registry-version-unsupported':
			'项目数据采用更新的格式。请在更新 Workduck 后重新打开项目。',
		'project-registry-write-failed': '无法保存项目。',
		'project-repository-operation-read-failed':
			'无法加载仓库操作记录。',
		'project-repository-operation-write-failed':
			'无法保存仓库操作记录。'
	}
} as const;
