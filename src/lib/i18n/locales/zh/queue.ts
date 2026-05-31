export const zhQueueMessages = {
	list: '工作队列文件',
	detail: '工作队列详情',
	filters: '工作队列过滤器',
	contextMenu: '工作队列文件操作',
	registeredCount: '{count} 个队列文件',
	executionFilters: '执行状态过滤器',
	readFilters: '已读状态过滤器',
	filterMenu: '过滤器',
	activeFilterCount: '{count} 个启用过滤器',
	kindFilter: '类型',
	priorityFilter: '优先级',
	sort: '排序',
	allFileKinds: '所有类型',
	allPriorities: '所有优先级',
	sortOptions: {
		'created-desc': '最新',
		'created-asc': '最旧',
		'priority-desc': '最高优先级',
		'priority-asc': '最低优先级'
	},
	pendingCountLabel: '{count} 个待处理工作项',
	resultReportReview: '审查结果报告',
	workOrderView: '工单视图',
	workOrderId: '工单 ID',
	proposalView: '方案视图',
	empty: '添加报告或工单文件。',
	noMatches: '没有匹配的工作队列文件。',
	addWork: '添加工作',
	bulkDelete: '批量删除',
	includePendingDelete: '包括待执行',
	newWork: '新建工作',
	editWork: '编辑工作',
	workTitle: '工作标题',
	workType: '工作类型',
	workTypes: {
		instruction: '指令',
		directMessage: '私信',
		vote: '投票/选择'
	},
	workPriority: '优先级',
	responseLanguage: '响应语言',
	responseLanguages: {
		auto: '匹配任务语言',
		ko: '韩语',
		en: '英语',
		es: '西班牙语',
		fr: '法语',
		zh: '简体中文',
		hi: '印地语'
	},
	responseFormat: '响应格式',
	responseFormats: {
		general: '通用报告',
		'pros-cons': '优缺点分析',
		'feature-proposal': '功能方案',
		'execution-plan': '执行计划',
		'code-review': '代码审查',
		'risk-assessment': '风险评估',
		'comparison-table': '对比表格',
		'decision-memo': '决策备忘录',
		'bug-analysis': 'Bug 分析',
		'writing-draft': '撰写初稿',
		'revision-draft': '修改草稿'
	},
	revisionOptions: {
		title: '修改选项',
		description: '选中的选项将被添加到工作内容中。',
		groups: {
			purpose: '目的',
			tone: '语气',
			structure: '结构',
			format: '格式'
		},
		options: {
			clarity: '意图明确',
			concise: '删减冗长',
			persuasive: '增强说服力',
			natural: '表达自然',
			formal: '更加正式',
			casual: '更加随和',
			sharp: '更加犀利',
			warm: '更加温和',
			paragraphFlow: '改善段落衔接',
			sentenceRhythm: '调整句式节奏',
			headlineLead: '增强标题/导语',
			preserveMeaning: '保留原始意图',
			oneParagraph: '单段落',
			bulletSummary: '包含核心要点',
			markdownReady: '支持 Markdown',
			keepLength: '保持相似长度'
		}
	},
	skillOptions: {
		title: '技能选项',
		description: '选择所选技能配置的类型、语气、格式或其他选项。'
	},
	noProject: '无项目',
	noRepository: '无仓库',
	noSkill: '无技能',
	noAgent: '无智能体',
	noReference: '无参考资料',
	linkedSkill: '已关联技能',
	assignment: '执行设置',
	advancedExecution: '高级执行设置',
	internalSkills: '内部技能',
	workProjects: '关联项目',
	workRepositories: '关联仓库',
	workAgents: '执行智能体',
	workReferences: '工作参考资料',
	repositorySearchPlaceholder: '搜索仓库',
	selectionCount: '已选择 {count} 项',
	workBody: '工作内容',
	directMessageBody: '消息',
	countLabel: '{current}/{max}',
	vote: {
		question: '问题',
		options: '选项',
		optionName: '选项名称',
		optionDescription: '描述',
		addOption: '添加选项',
		removeOption: '移除选项',
		criteria: '准则',
		result: '投票结果',
		choice: '选择',
		count: '{count} 次投票',
		invalid: '{count} 个未解析响应',
		optionCount: '{count} 个选项',
		unparsed: '未解析'
	},
	structuredResponseFormats: {
		general: {
			summary: '摘要',
			strengths: '优势/依据',
			recommendations: '建议',
			cautions: '注意事项'
		},
		'pros-cons': {
			summary: '结论',
			strengths: '优点',
			recommendations: '裁决',
			cautions: '缺点'
		},
		'feature-proposal': {
			summary: '摘要',
			strengths: '依据',
			recommendations: '功能构想',
			cautions: '注意事项'
		},
		'execution-plan': {
			summary: '目标',
			strengths: '假设前提',
			recommendations: '具体步骤',
			cautions: '风险'
		},
		'code-review': {
			summary: '综合审查',
			strengths: '保留项',
			recommendations: '修复建议',
			cautions: '问题'
		},
		'risk-assessment': {
			summary: '风险结论',
			strengths: '缓解措施',
			recommendations: '应对方案',
			cautions: '核心风险'
		},
		'comparison-table': {
			summary: '对比结论',
			strengths: '准则',
			recommendations: '对比行',
			cautions: '决策要素'
		},
		'decision-memo': {
			summary: '决策',
			strengths: '依据',
			recommendations: '决策项',
			cautions: '后续检查'
		},
		'bug-analysis': {
			summary: '原因摘要',
			strengths: '确认事实',
			recommendations: '修复方向',
			cautions: '复现/退化风险'
		},
		'writing-draft': {
			summary: '完成初稿',
			strengths: '文风/来源备注',
			recommendations: '修改选项',
			cautions: '来源缺失/假设'
		},
		'revision-draft': {
			summary: '修改后草稿',
			strengths: '已应用的修改选项',
			recommendations: '进一步修改选项',
			cautions: '意图改变/检查项'
		}
	},
	createWorkOrder: '创建工单',
	delegateEvaluation: '委托评估',
	creating: '正在创建',
	previewPrompt: '预览提示词',
	executeWorkOrder: '运行',
	completeWorkOrder: '标记完成',
	executing: '正在运行',
	noFollowUpSelected: '未选择后续项。',
	noEvaluationTargets: '没有要评估的响应。',
	evaluationAlreadyDelegated: '评估委托工单已存在：{relativePath}',
	evaluationDelegated: '已创建评估委托工单 {relativePath}。',
	createdFile: '已创建 {relativePath}。',
	updatedFile: '已更新 {relativePath}。',
	deletedFile: '已删除 {relativePath}。',
	bulkDeletedFiles: '已删除 {count} 个工作。',
	executedFile: '已创建 {relativePath} 并完成了工单。',
	completedFile: '已完成 {relativePath}。',
	reportNotification: {
		title: '报告已准备好',
		body: '{title} 结果报告可以查看了。'
	},
	nextWorkOrders: '后续工单',
	promptPreview: {
		title: '提示词预览',
		description: '在运行此工单之前，审查确切的系统和用户提示词。',
		systemPrompt: '系统提示词',
		userPrompt: '用户提示词',
		characterCount: '{count} 个字符'
	},
	priorities: {
		low: '低',
		normal: '中',
		high: '高',
		urgent: '紧急'
	},
	executionStates: {
		pending: '待处理',
		completed: '已完成'
	},
	readStates: {
		read: '已读',
		unread: '未读'
	},
	fileKinds: {
		resultReport: '报告 JSON',
		workOrder: '工单',
		proposal: '方案',
		unsupported: '不支持'
	},
	reviewDecisions: {
		approved: '批准',
		needsWork: '需改进',
		rollback: '回滚'
	},
	evaluation: {
		title: '评估响应',
		action: '评估',
		mode: '评估模式',
		manual: '手动评估',
		aiDelegated: '委托给 AI',
		copyPrompt: '复制提示词',
		promptCopied: '评估提示词已复制。',
		clipboardUnavailable: '剪贴板不可用。',
		delegationPrompt: '委托提示词',
		sourceReport: '源报告',
		workspace: '工作区',
		criteria: '准则',
		targets: '目标',
		command: '命令',
		saving: '正在保存',
		saved: '评估已保存。'
	},
	errors: {
		workspaceRequired: '工作区路径为必填项。',
		workspaceNotAbsolute: '工作区路径必须是绝对路径。',
		workspaceNotFound: '未找到工作区路径。',
		workspaceNotDirectory: '工作区路径必须是一个文件夹。',
		workspacePermissionDenied: '工作区路径不可写。',
		workspaceUnreadable: '无法检查工作区路径。',
		rootInvalid: '工作队列文件夹不可用。',
		createFailed: '无法创建工作队列文件夹。',
		openFailed: '无法打开工作队列文件夹。',
		listFailed: '无法列出工作队列文件。',
		fileInvalid: '不允许的工作队列文件路径。',
		fileNotFound: '未找到工作队列文件。',
		fileReadFailed: '无法读取工作队列文件。',
		fileWriteFailed: '无法写入工作队列文件。',
		fileDeleteFailed: '无法删除工作队列文件。',
		fileAlreadyExists: '工作队列文件已存在。',
		evaluationDelegationAlreadyExists:
			'此报告已存在评估委托工单。在创建新工单之前，请先删除现有工单。',
		unavailable: '工作队列文件夹仅在桌面客户端中可用。',
		executionNoTask: '没有可运行的任务。',
		executionNoAgent: '请选择至少一个执行智能体。',
		executionVaultLocked: '请先解锁环境保管箱。',
		executionAgentNotFound: '未找到所选智能体。',
		executionSecretNotFound: '未找到绑定至该智能体的 API 密钥。',
		executionProviderUnsupported:
			'无法检测 LLM 提供商。请为智能体选择提供商，或在 API 密钥名称/标签中包含 DeepSeek, OpenAI 或 OpenRouter。',
		executionApiKeyRequired: 'API 密钥为空。',
		executionPromptRequired: '无法创建工作提示词。',
		executionModelRequired: '无法选择模型。',
		executionRequestInvalid: 'LLM 请求无效。',
		executionAuthenticationFailed: 'LLM 身份验证失败。请检查 API 密钥。',
		executionRateLimited: '已达到 LLM 频率限制。请稍后重试。',
		executionProviderRejected: 'LLM 提供商拒绝了请求。',
		executionProviderTimeout: 'LLM 提供商请求超时。请稍后重试。',
		executionProviderUnavailable: '无法连接至 LLM 提供商。',
		executionResponseEmpty: 'LLM 响应为空。',
		executionResponseInvalid: '无法将 LLM 响应读取为报告。',
		executionUnavailable: '工作执行仅在桌面客户端中可用。',
		executionUnknown: '发生未知的工单执行错误。',
		workBodyTooLong: '工作内容最长可包含 {max} 个字符。'
	}
} as const;
