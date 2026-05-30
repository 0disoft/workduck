export const zhSkillsMessages = {
	title: '技能',
	list: '技能列表',
	details: '技能详情',
	registeredCount: '{count} 个技能',
	newSkill: '新建技能',
	editSkill: '编辑技能',
	copySkill: '复制',
	copyNameSuffix: '副本',
	saved: '已保存。',
	removed: '已移除。',
	removeReferencedWarning:
		'{name} 正被 {count} 个队列文件使用。再次点击“移除”将强制删除。',
	optionGroups: {
		title: '工作选项',
		description: '配置在队列中选择此技能时显示的选项类型、语气和其他选项。',
		empty: '无工作选项',
		addGroup: '添加选项组',
		removeGroup: '移除选项组',
		groupLimit: '最多可保存 {max} 个选项组。',
		groupNameRequired: '选项组 {index} 需要名称。',
		groupName: '组名称',
		selectionMode: '选择模式',
		single: '单选',
		multiple: '多选',
		options: '选项',
		addOption: '添加选项',
		removeOption: '移除选项',
		optionName: '选项名称',
		optionDescription: '选项描述',
		noOptions: '无选项',
		optionRequired: '选项组 {index} 至少需要一个选项。',
		optionLimit: '选项组 {index} 最多可保存 {max} 个选项。',
		optionNameRequired: '选项组 {groupIndex} 中的选项 {optionIndex} 需要名称。',
		countLabel: '{current}/{max}'
	},
	outputTypes: {
		writing: '写作',
		revision: '修改润色',
		'work-order': '工单',
		proposal: '方案',
		'result-report': '结果报告',
		'agent-evaluation': '智能体评估'
	},
	seedSkills: {
		proposalWriter: {
			name: '方案撰写助手',
			description:
				'比较不同选项，并拟定包含建议和后续工作的方案。',
			instructions:
				'返回 workduck.queue-proposal/v1 交付物。对比可行选项，陈述权衡得失，选择一项建议，且在需要采取行动时仅包含具体的后续工单。'
		},
		writingAssistant: {
			name: '写作助手',
			description: '根据简报、风格约束和参考资料起草或修改文章。',
			instructions:
				'根据任务主体和所选参考资料撰写所要求的文章。将任何 Workduck 工单 ID 视为任务标签，而非额外的证据本身。遵守关于段落数量、每段句子数、语气、受众、视角、语言、格式和禁用词汇的明确控制。如果任务没有给出控制要求，则使用任务语言起草一份精美简练的草稿。将所选参考资料用作源材料，切勿虚构无支撑的事实。对于写作草稿的响应格式，请将完成的草稿放入 summary（概要）中，将风格/来源说明放入 strengths（优势）中，将可选的修改方向放入 recommendations（建议）中，将来源缺失或假设放入 cautions（警示）中。'
		},
		revisionAssistant: {
			name: '修改润色助手',
			description: '根据所选的用途、语气、结构和格式选项修改草稿。',
			instructions:
				'根据任务主体、所选参考资料以及勾选的修改选项修改提供的草稿。除非任务明确要求修改，否则保留原始含义和事实陈述。多个勾选的选项可以同时适用；如果存在冲突，请按照含义优先、其次结构、再次语气、最后格式的顺序进行协调。参考资料仅用作事实修复的支持，切勿虚构无支撑的事实。对于修改草稿的响应格式，请将修改后的文本放入 summary（概要）中，将应用的修改选择放入 strengths（优势）中，将可选的剩余修改想法放入 recommendations（建议）中，将含义变更、权衡取舍、来源缺失或待验证的事实放入 cautions（警示）中。'
		},
		codeReviewer: {
			name: '代码评审助手',
			description: '评审代码或 Git 差异（diff），检查其正确性、可维护性、安全性和运行期风险。',
			instructions:
				'评审提供的代码、文件摘录或 Git 差异（diff）。在可用时首选代码评审响应格式。首先陈述按严重程度排序的具体发现，在提供时包含文件路径和行号引用，并专注于缺陷、回归、可维护性、性能、安全性和框架特有风险。不要进行宽泛的赞扬或重写无关的代码。如果缺失证据，陈述评审缺失之处，切勿虚构上下文。'
		},
		commitHandoffWriter: {
			name: '提交与交接撰写助手',
			description: '将变更摘要转化为提交消息和后续交接说明。',
			instructions:
				'分析提供的已变更文件列表、差异（diff）摘要、工作报告或任务说明。推荐一条或多条提交消息，无需进行暂存（stage）、提交（commit）或推送（push）。在要求时，撰写一份保留已完成工作、待办任务、验证证据、风险和下一步安全行动的交接说明。除非任务提供了相应证据，否则不要声称运行了某些命令。'
		},
		techDebtJanitor: {
			name: '技术债管理员',
			description: '为遗留、混乱或重复的代码规划保留行为的重构步骤。',
			instructions:
				'检查提供的代码或技术债简报，并提出保留行为的重构步骤。除非任务明确允许重新设计，否则保留公共 API 和业务行为。将安全的机械性清理与高风险的设计变更区分开来，指明编辑前所需的测试或检查，并避免在没有迁移步骤的情况下进行大范围重写。'
		},
		releaseNoteWriter: {
			name: '发布说明撰写助手',
			description: '根据提交、已完成的工作和报告起草发布说明或变更日志。',
			instructions:
				'根据提供的提交、工单报告、问题列表或变更摘要撰写发布说明或变更日志。将用户可见的变更与内部维护区分开来。切勿虚构交付的功能、日期、版本号、指标或验证证据。在提供证据时，标明破坏性变更、迁移说明和已知限制。'
		},
		apiSchemaArchitect: {
			name: 'API 架构设计师',
			description: '根据功能需求设计 API 端点、命令行/工单契约、负载（payload）和模式（schema）。',
			instructions:
				'将提供功能的需求转化为 API 或命令契约方案。定义资源或命令边界、请求和响应负载、错误情况、验证规则、兼容性说明以及后续实现任务。保持模式与所选风格一致，除非任务提供了相应证据，否则不要声称端点已存在。'
		},
		agentResponseEvaluator: {
			name: '智能体响应评估员',
			description: '使用五项标准、1-9 分的评分细则来评估智能体的响应。',
			instructions:
				'仅根据任务和智能体回答来评估响应。对问题理解、逻辑有效性、实际可行性、创造性见解和风险检测进行 1 到 9 分的评分。不要仅因篇幅长短而给予奖励。评判约束条件、可执行性、证据和风险处理。在选择评分后，使用 workduck agent evaluate 命令将其保存到同一个工作区中。如果该智能体绑定了人设，那个人设的评估也会同步更新。'
		}
	},
	errors: {
		nameRequired: '名称为必填项。',
		nameDuplicate: '名称已存在。',
		outputTypeRequired: '输出类型为必填项。',
		instructionsRequired: '技能指令为必填项。',
		notFound: '未找到技能。',
		readFailed: '无法读取技能列表。',
		saveFailed: '无法保存技能设置。'
	}
} as const;
