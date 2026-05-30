export const zhPersonasMessages = {
	title: '人设',
	list: '人设列表',
	details: '人设详情',
	registeredCount: '{count} 个人设',
	newPersona: '新建人设',
	editPersona: '编辑人设',
	randomSpectrums: '随机特质',
	countLabel: '{current}/{max}',
	agentAssignment: {
		label: '未绑定人设的智能体',
		placeholder: '选择智能体',
		none: '无',
		selectedCount: '已选择 {count} 个'
	},
	evaluation: {
		overviewEmpty: '未注册人设。'
	},
	styles: {
		title: '回复风格',
		items: {
			responseLength: {
				label: '回复长度',
				options: {
					short: '简短',
					standard: '标准',
					detailed: '详细'
				}
			},
			emotionalTone: {
				label: '情感基调',
				options: {
					calm: '沉稳',
					neutral: '中性',
					bright: '明快'
				}
			},
			judgmentAttitude: {
				label: '评判立场',
				options: {
					critical: '批判性',
					balanced: '中立客观',
					supportive: '支持性'
				}
			},
			confidenceLevel: {
				label: '自信度',
				options: {
					cautious: '谨慎',
					realistic: '务实',
					decisive: '果断'
				}
			},
			socialDistance: {
				label: '社交距离',
				options: {
					formal: '正式',
					comfortable: '轻松',
					friendly: '友好'
				}
			}
		}
	},
	spectrums: {
		title: '认知特质',
		items: {
			developmentApproach: {
				label: '开发模式',
				levels: {
					1: { name: '设计先行', description: '在实现之前明确结构、边界和数据流。' },
					2: { name: '设计引导', description: '在投入开发之前确立方向和规则。' },
					3: { name: '均衡探索', description: '在构建小型原型与调整设计之间交替进行。' },
					4: { name: '实验主导', description: '快速构建并利用结果来选择方向。' },
					5: { name: '极客骇客', description: '可用代码至上。让代码跑起来最重要。' }
				}
			},
			qualityStandard: {
				label: '稳定性与质量',
				levels: {
					1: { name: '实验室级', description: '极其严格地对待验证、类型、测试和安全性。' },
					2: { name: '生产稳定', description: '努力维持生产级的可靠性。' },
					3: { name: '务实权衡', description: '根据具体情况权衡风险与速度。' },
					4: { name: '发布优先', description: '倾向于在运行过程中根据需要修复问题。' },
					5: { name: '实验探索', description: '将速度和尝试置于失败成本之上。' }
				}
			},
			structureBias: {
				label: '结构倾向',
				levels: {
					1: { name: '系统设计师', description: '将边界、层级和模块关系视为关键。' },
					2: { name: '模块导向', description: '始终如一地考虑复用性和可维护性。' },
					3: { name: '实用结构', description: '仅进行必要限度的结构化设计。' },
					4: { name: '直接构建者', description: '更喜欢直接实现，而非抽象封装。' },
					5: { name: '即兴组装者', description: '将快速连接和结果置于结构之上。' }
				}
			},
			productivityStrategy: {
				label: '生产力策略',
				levels: {
					1: { name: '手艺人', description: '尽量减少依赖和自动化，以保持直接控制。' },
					2: { name: '选择性自动化', description: '谨慎地只添加必要的工具。' },
					3: { name: '实用工具化', description: '当自动化能提高生产力时使用它。' },
					4: { name: '自动化中心', description: '尽可能地将重复性工作自动化。' },
					5: { name: '协调编排者', description: '结合工具、智能体和流水线来运营工作。' }
				}
			},
			operationPhilosophy: {
				label: '运营与发布',
				levels: {
					1: { name: '限制变更', description: '当发现失败风险时延迟发布。' },
					2: { name: '稳定发布', description: '经过充分的验证和可观测性后再进行发布。' },
					3: { name: '渐进运营', description: '频繁交付微小变更并监测稳定性。' },
					4: { name: '快速响应', description: '积极采用运行期修复和热补丁。' },
					5: { name: '动态演进', description: '将服务视为处于实时持续变化中的状态。' }
				}
			},
			collaborationPhilosophy: {
				label: '协作环境',
				levels: {
					1: { name: '文档契约', description: '通过文档、规则和契约进行协作。' },
					2: { name: '显式协作', description: '尽可能清晰地显现意图和标准。' },
					3: { name: '上下文共享', description: '共享核心上下文，其余部分保持自主。' },
					4: { name: '默契协作', description: '更喜欢基于经验和判断的快速协作。' },
					5: { name: '自主智能体', description: '只赋予目标，期望人员和 AI 独立做出判断。' }
				}
			}
		}
	},
	saved: '已保存。',
	removed: '已移除。',
	errors: {
		nameRequired: '名称为必填项。',
		nameDuplicate: '名称已存在。',
		instructionsRequired: '人设指令为必填项。',
		notFound: '未找到人设。',
		readFailed: '无法读取人设列表。',
		saveFailed: '无法保存人设设置。'
	}
} as const;
