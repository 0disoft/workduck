export const zhAgentsMessages = {
	title: '智能体',
	list: '智能体列表',
	details: '智能体详情',
	registeredCount: '{count} 个智能体',
	newAgent: '新建智能体',
	editAgent: '编辑智能体',
	provider: '提供商',
	model: '模型',
	modelId: '模型 ID',
	defaultModel: '默认模型',
	customModel: '自定义模型',
	apiKeyPlaceholder: '选择 API 密钥',
	vaultLockedHint: '环境保管箱已锁定。在创建新智能体之前，请先在“环境”中解锁。',
	noLlmApiKeysHint: '没有被标记为 LLM 用途的 API 密钥。请在“环境”中添加一个 API 密钥并为其添加 llm 标签。',
	missingApiKeyHint: '当前保管箱中未找到关联的 API 密钥。请选择其他密钥或检查“环境”。',
	removeConfirm: '确认移除智能体“{name}”吗？',
	providers: {
		auto: '自动',
		openrouter: 'OpenRouter',
		deepseek: 'DeepSeek',
		openai: 'OpenAI'
	},
	saved: '已保存。',
	removed: '已移除。',
	evaluation: {
		title: '评估',
		overviewTitle: '评估概览',
		overviewEmpty: '未注册智能体。',
		empty: '无评估',
		noScore: '-',
		rankBy: '排序依据',
		overallScore: '综合评分',
		count: '{count} 次评估',
		reset: '重置评估',
		resetConfirm: '确认重置此智能体累积的评估数据吗？',
		resetSaved: '评估数据已重置。',
		resetAt: '重置于：{date}',
		criteria: {
			problemUnderstanding: {
				label: '问题理解能力',
				description: '跟踪是否理解了真实意图、约束条件和上下文信息。'
			},
			logicalValidity: {
				label: '逻辑有效性',
				description: '跟踪主张和结论是否避免了缺乏支撑的跳跃。'
			},
			practicalFeasibility: {
				label: '实际可行性',
				description: '跟踪答案在真实的市场、团队和技术限制下是否可行。'
			},
			creativeInsight: {
				label: '创造性见解',
				description: '跟踪答案是否提供了有用的新角度，而非老生常谈。'
			},
			riskDetection: {
				label: '风险检测能力',
				description: '跟踪是否识别了失败模式、潜在成本和副作用。'
			}
		}
	},
	errors: {
		nameRequired: '名称为必填项。',
		authRequired: '请选择 API 密钥。',
		nameDuplicate: '名称已存在。',
		notFound: '未找到智能体。',
		readFailed: '无法读取智能体列表。',
		saveFailed: '无法保存智能体设置。'
	}
} as const;
