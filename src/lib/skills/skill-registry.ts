import { isObjectRecord } from '$lib/shared/object-record';
import { AGENT_EVALUATION_DELEGATION_INSTRUCTIONS } from '$lib/agents/agent-evaluation';

export const SKILL_REGISTRY_VERSION = 3;
export const SKILL_NAME_MAX_LENGTH = 120;
export const SKILL_DESCRIPTION_MAX_LENGTH = 420;
export const SKILL_INSTRUCTIONS_MAX_LENGTH = 8_000;
export const SKILL_OUTPUT_TYPES_MAX_COUNT = 6;
export const SKILL_OPTION_GROUPS_MAX_COUNT = 8;
export const SKILL_OPTIONS_PER_GROUP_MAX_COUNT = 30;
export const SKILL_OPTION_LABEL_MAX_LENGTH = 80;
export const SKILL_OPTION_DESCRIPTION_MAX_LENGTH = 220;
export const WORKDUCK_PROPOSAL_WRITER_SKILL_ID = 'workduck.skill.proposal-writer';
export const WORKDUCK_WRITING_ASSISTANT_SKILL_ID = 'workduck.skill.writing-assistant';
export const WORKDUCK_REVISION_ASSISTANT_SKILL_ID = 'workduck.skill.revision-assistant';
export const WORKDUCK_AGENT_RESPONSE_EVALUATOR_SKILL_ID =
	'workduck.skill.agent-response-evaluator';
export const WORKDUCK_CODE_REVIEWER_SKILL_ID = 'workduck.skill.code-reviewer';
export const WORKDUCK_COMMIT_HANDOFF_WRITER_SKILL_ID =
	'workduck.skill.commit-handoff-writer';
export const WORKDUCK_TECH_DEBT_JANITOR_SKILL_ID = 'workduck.skill.tech-debt-janitor';
export const WORKDUCK_RELEASE_NOTE_WRITER_SKILL_ID = 'workduck.skill.release-note-writer';
export const WORKDUCK_API_SCHEMA_ARCHITECT_SKILL_ID =
	'workduck.skill.api-schema-architect';

export const workduckSkillOutputTypeOptions = [
	{ id: 'writing', label: 'Writing' },
	{ id: 'revision', label: 'Revision' },
	{ id: 'work-order', label: 'Work order' },
	{ id: 'proposal', label: 'Proposal' },
	{ id: 'result-report', label: 'Result report' },
	{ id: 'agent-evaluation', label: 'Agent evaluation' }
] as const;

export type WorkduckSkillOutputType = (typeof workduckSkillOutputTypeOptions)[number]['id'];

export type SkillRegistryError =
	| 'skill-name-required'
	| 'skill-name-duplicate'
	| 'skill-output-type-required'
	| 'skill-instructions-required'
	| 'skill-not-found'
	| 'skill-registry-invalid';

export interface WorkduckSkillRecord {
	readonly id: string;
	readonly name: string;
	readonly description: string;
	readonly outputTypes: readonly WorkduckSkillOutputType[];
	readonly instructions: string;
	readonly optionGroups: readonly WorkduckSkillOptionGroup[];
	readonly createdAt: string;
	readonly updatedAt: string;
}

export type WorkduckSkillOptionSelectionMode = 'single' | 'multiple';

export interface WorkduckSkillOptionGroup {
	readonly id: string;
	readonly label: string;
	readonly description: string;
	readonly selectionMode: WorkduckSkillOptionSelectionMode;
	readonly options: readonly WorkduckSkillOption[];
}

export interface WorkduckSkillOption {
	readonly id: string;
	readonly label: string;
	readonly description: string;
}

export interface SkillRegistry {
	readonly version: typeof SKILL_REGISTRY_VERSION;
	readonly workspaceId: string;
	readonly skills: readonly WorkduckSkillRecord[];
	readonly updatedAt: string;
}

export interface SkillInput {
	readonly id?: string | null;
	readonly name: string;
	readonly description: string;
	readonly outputTypes: readonly WorkduckSkillOutputType[];
	readonly instructions: string;
	readonly optionGroups?: readonly WorkduckSkillOptionGroup[];
}

export type SkillRegistryMutationResult =
	| {
			readonly ok: true;
			readonly registry: SkillRegistry;
	  }
	| {
			readonly ok: false;
			readonly registry: SkillRegistry;
			readonly error: SkillRegistryError;
	  };

const DEFAULT_SKILLS = [
	{
		id: WORKDUCK_PROPOSAL_WRITER_SKILL_ID,
		name: 'Proposal writer',
		description: 'Compare options and produce a proposal with recommendation and follow-up work.',
		outputTypes: ['proposal'],
		instructions:
			'Return a workduck.queue-proposal/v1 artifact. Compare viable options, state tradeoffs, choose one recommendation, and include only concrete follow-up work orders when action is needed.',
		optionGroups: [
			{
				id: 'proposal-mode',
				label: '제안 방식',
				description: '제안서에서 가장 중요하게 부각할 관점을 설정합니다.',
				selectionMode: 'single',
				options: [
					{ id: 'quick-recommendation', label: '결론 우선 제안', description: '핵심 권장안과 결론을 두괄식으로 배치합니다.' },
					{ id: 'option-comparison', label: '대안 비교 분석', description: '각 선택지의 장단점과 상충 관계를 대조합니다.' },
					{ id: 'execution-plan', label: '실행 로드맵', description: '추천안 채택 이후의 단계별 조치와 작업 흐름을 기술합니다.' },
					{ id: 'risk-first', label: '리스크 최우선', description: '잠재적 실패 가능성과 구체적인 완화 대책을 먼저 진단합니다.' }
				]
			},
			{
				id: 'proposal-criteria',
				label: '판단 기준',
				description: '추천안을 선정할 때 우선 반영할 가치와 의사결정 기준을 정의합니다.',
				selectionMode: 'multiple',
				options: [
					{ id: 'speed', label: '신속성', description: '일정 단축과 빠른 마일스톤 완료 가능성을 우선합니다.' },
					{ id: 'quality', label: '품질', description: '결과물의 완성도와 향후 유지보수 편의성을 극대화합니다.' },
					{ id: 'cost', label: '비용', description: '시간, 비용, 그리고 장기적인 운영 리소스를 종합적으로 고려합니다.' },
					{ id: 'risk', label: '안정성', description: '되돌리기 어려운 실패 요인을 분석하여 리스크 발생 가능성을 낮춥니다.' },
					{ id: 'scalability', label: '확장성', description: '규모나 부하가 증가해도 지속 가능한 구조인지 정밀하게 검토합니다.' }
				]
			},
			{
				id: 'proposal-output',
				label: '산출 방식',
				description: '제안서의 최종 구성 형식과 표현 방식을 선택합니다.',
				selectionMode: 'multiple',
				options: [
					{ id: 'brief', label: '핵심 요약형', description: '주요 결론과 권장 사항 위주로 한눈에 읽히도록 압축하여 기술합니다.' },
					{ id: 'detailed', label: '상세 서술형', description: '의사결정에 필요한 기술적 근거와 세부적인 예외 처리안을 풍부하게 포함합니다.' },
					{ id: 'include-work-orders', label: '후속 작업 포함', description: '제안 실현을 위해 즉시 등록 가능한 후속 작업 대기열(Work Order)을 구체적으로 생성합니다.' },
					{ id: 'decision-table', label: '비교표 제공', description: '주요 대안을 항목별 테이블 구조로 명확히 정리하여 제공합니다.' }
				]
			}
		]
	},
	{
		id: WORKDUCK_WRITING_ASSISTANT_SKILL_ID,
		name: 'Writing assistant',
		description: 'Draft or revise writing from a brief, style constraints, and selected references.',
		outputTypes: ['writing'],
		instructions:
			'Write the requested piece from the task body and selected references. Treat any Workduck work-order ID as the assignment label, not as extra evidence by itself. Obey explicit controls for paragraph count, sentences per paragraph, tone, audience, point of view, language, format, and forbidden phrases. If the task gives no controls, produce a polished concise draft in the task language. Use selected references as source material without inventing unsupported facts. For writing-draft response format, put the finished draft in summary, put style/source notes in strengths, put optional revision directions in recommendations, and put source gaps or assumptions in cautions.',
		optionGroups: [
			{
				id: 'writing-kind',
				label: '글 유형',
				description: '작성할 글의 장르나 목적을 정의합니다.',
				selectionMode: 'single',
				options: [
					{ id: 'column', label: '칼럼', description: '작성자의 깊이 있는 관점과 다각도적 해석이 중심이 되는 글을 작성합니다.' },
					{ id: 'critique', label: '비판문', description: '예리한 통찰을 바탕으로 문제점과 반론을 날카롭게 짚어내는 글을 작성합니다.' },
					{ id: 'explainer', label: '설명글', description: '어려운 지식이나 흐름을 독자가 알기 쉽도록 명쾌하게 풀어내는 글을 작성합니다.' },
					{ id: 'essay', label: '에세이', description: '개인적인 감각과 진솔한 사유가 녹아 있는 정감 어린 글을 작성합니다.' },
					{ id: 'fiction', label: '소설', description: '구체적인 장면 묘사, 인물 설정, 극적 서사가 담긴 문학적 글을 작성합니다.' },
					{ id: 'proposal', label: '제안문', description: '구체적인 선택지와 합리적인 실행 계획을 제시하여 독자를 설득하는 글을 작성합니다.' },
					{ id: 'report', label: '보고서', description: '객관적 사실, 논리적 근거, 최종 결론을 체계적으로 서술하는 공식적인 글을 작성합니다.' },
					{ id: 'review', label: '리뷰', description: '대상의 완성도와 가치를 평가하고 주관적 인상을 조화롭게 정리하여 독자에게 제공합니다.' }
				]
			},
			{
				id: 'writing-purpose',
				label: '작성 목적',
				description: '글을 통해 독자에게 전달하고자 하는 핵심 목표를 지정합니다.',
				selectionMode: 'single',
				options: [
					{ id: 'inform', label: '정보 전달', description: '새로운 사실이나 유용한 배경 맥락을 독자에게 충실히 알려줍니다.' },
					{ id: 'persuade', label: '설득', description: '확실한 논거를 바탕으로 독자가 특정 판단을 내리거나 행동하도록 이끌어줍니다.' },
					{ id: 'question', label: '문제 제기', description: '통념처럼 당연시되던 전제를 뒤흔들며 새로운 질문을 환기합니다.' },
					{ id: 'reflect', label: '사유 확장', description: '단순 정보 전달을 넘어 독자가 오랫동안 곱씹으며 생각해 볼 거리를 제공합니다.' },
					{ id: 'summarize', label: '요약', description: '복잡하고 방대한 내용을 논리 정연하고 콤팩트하게 압축하여 핵심만 빠르게 보여줍니다.' }
				]
			},
			{
				id: 'tone',
				label: '말투',
				description: '문장의 태도와 감정적 온도를 세밀하게 조정합니다.',
				selectionMode: 'single',
				options: [
					{ id: 'plain', label: '담백하게', description: '불필요한 과장이나 감정을 덜어내고 객관적이며 또렷하게 기술합니다.' },
					{ id: 'sharp', label: '날카롭게', description: '예리한 비판과 단호한 가치 판단이 또렷하게 드러나도록 강조합니다.' },
					{ id: 'friendly', label: '친근하게', description: '독자에게 편안하게 다가가는 쉽고 부드러운 일상 대화 형태의 어조를 취합니다.' },
					{ id: 'formal', label: '격식 있게', description: '비즈니스나 공식 보고서에 어울리는 예의 바르고 격식 있는 종결 문체를 사용합니다.' },
					{ id: 'literary', label: '문학적으로', description: '시적이고 감성적인 이미지 묘사와 유려한 문맥적 리듬감을 극대화합니다.' },
					{ id: 'provocative', label: '도발적으로', description: '파격적인 화두를 던져 독자의 흥미와 호기심을 강력하게 사로잡는 어투를 구사합니다.' },
					{ id: 'analytical', label: '분석적으로', description: '수치적 근거와 논리적 구조를 차분하고 일목요연하게 조명합니다.' }
				]
			},
			{
				id: 'audience',
				label: '독자층',
				description: '최종적으로 글을 읽고 활용하게 될 핵심 독자를 설정합니다.',
				selectionMode: 'single',
				options: [
					{ id: 'general', label: '일반 독자', description: '특정 분야의 깊은 전문 지식이 없더라도 누구나 직관적으로 쉽게 이해할 수 있는 어휘를 사용합니다.' },
					{ id: 'beginner', label: '초보자', description: '기본 개념이나 배경 정보부터 친절하게 차근차근 짚어가며 풀이합니다.' },
					{ id: 'expert', label: '전문가', description: '도메인 특화 용어나 업계 맥락을 생략하거나 자연스럽게 융합하여 속도감 있게 전개합니다.' },
					{ id: 'decision-maker', label: '의사결정자', description: '중언부언을 배제하고 핵심 결론과 이를 입증하는 핵심 근거 위주로 간결하게 구성합니다.' },
					{ id: 'internal-team', label: '내부 구성원', description: '공통적인 협업 배경과 프로젝트 맥락을 깊이 이해하고 있는 팀원을 대상으로 서술합니다.' }
				]
			},
			{
				id: 'viewpoint',
				label: '관점 및 시점',
				description: '글이 대상을 관찰하고 서술을 이끌어 나가는 논리적 관점을 설정합니다.',
				selectionMode: 'single',
				options: [
					{ id: 'neutral', label: '중립적 시각', description: '주관적 선호나 편향 없이 설명과 객관적 균형을 최우선으로 견지합니다.' },
					{ id: 'supportive', label: '찬성 및 긍정', description: '주요 대상의 강점과 긍정적인 파급 효과를 핵심 논지로 전개합니다.' },
					{ id: 'opposing', label: '반대 및 비판', description: '우려되는 리스크, 개선할 점, 혹은 약점을 냉철한 비판적 논지로 다룹니다.' },
					{ id: 'balanced', label: '양면적 비교', description: '대립되는 여러 상반된 관점을 편견 없이 평등하게 조명하여 시야를 넓힙니다.' },
					{ id: 'first-person', label: '1인칭 주인공', description: '필자 고유의 구체적인 경험, 내적 성찰, 주관적인 직관을 전면에 앞세웁니다.' },
					{ id: 'third-person', label: '3인칭 관찰자', description: '적절한 논리적 거리를 유지한 채 대상을 완전히 객관적인 외부 시각에서 서술합니다.' }
				]
			},
			{
				id: 'structure',
				label: '원고 구성',
				description: '작성할 원고의 핵심 뼈대 구조를 선택합니다.',
				selectionMode: 'single',
				options: [
					{ id: 'one-paragraph', label: '단일 문단', description: '분절 없이 하나의 완성된 문단 덩어리로 콤팩트하게 작성합니다.' },
					{ id: 'three-paragraphs', label: '3문단 요약형', description: '도입부, 핵심 전개부, 그리고 매끄러운 종결부를 갖춘 3단 구성으로 완성합니다.' },
					{ id: 'title-body', label: '제목 및 본문', description: '눈길을 끄는 강력한 메인 타이틀을 포함하여 원고 전체를 유기적으로 구성합니다.' },
					{ id: 'intro-body-closing', label: '기승전결', description: '전통적이면서도 가장 자연스럽고 설득력 높은 단계별 논리 흐름을 따릅니다.' },
					{ id: 'bullets', label: '개조식 요점 포함', description: '독자가 긴 텍스트를 읽다 지치지 않도록, 중간에 가독성이 높은 핵심 불릿(bullet) 목록을 융합합니다.' },
					{ id: 'qa', label: '문답식(Q&A)', description: '가상의 예상 질문과 이에 대한 유용한 해결책 중심의 답변 형식으로 친절하게 교차 배치합니다.' }
				]
			},
			{
				id: 'length-rhythm',
				label: '분량 및 호흡',
				description: '글의 전반적인 길이나 문단 내부의 밀집도를 설정합니다.',
				selectionMode: 'single',
				options: [
					{ id: 'short', label: '빠른 호흡', description: '불필요한 수식어를 대폭 압축하여 핵심 정보만 빠르게 파악하도록 서술합니다.' },
					{ id: 'standard', label: '균형 잡힌 호흡', description: '읽기 편하고 어색하지 않은 보통의 길이를 고르게 배분합니다.' },
					{ id: 'detailed', label: '상세하고 풍부하게', description: '복잡한 배경 근거와 디테일한 맥락까지 충분한 깊이감으로 다루어 높은 신뢰도를 확보합니다.' },
					{ id: 'two-sentences', label: '문단당 2문장형', description: '호흡이 극도로 경쾌하게 이어지도록 문단당 단 2문장 내외로 나누어 전개합니다.' },
					{ id: 'four-sentences', label: '문단당 4문장형', description: '풍성한 이해를 돕기 위해 한 문단 안에서 하나의 단절 없는 아이디어를 정교하게 피력합니다.' }
				]
			},
			{
				id: 'writing-guardrails',
				label: '주의 가이드라인',
				description: '원고를 집필하는 과정에서 어기지 말아야 할 철칙을 지정합니다.',
				selectionMode: 'multiple',
				options: [
					{ id: 'no-unsupported-claims', label: '임의 단정 금지', description: '제시된 참고자료나 근거 밖의 어설픈 추론 사실을 상상하여 날조하지 않습니다.' },
					{ id: 'no-hype', label: '과도한 미사여구 금지', description: '신뢰감을 저해할 수 있는 현란한 선동형 형용사나 부풀리기 마케팅 표현을 엄격히 통제합니다.' },
					{ id: 'avoid-cliche', label: '상투적 표현 회피', description: '인터넷에 널리 퍼진 뻔한 클리셰나 천편일률적인 상투성 멘트를 완전히 배제합니다.' },
					{ id: 'explain-jargon', label: '쉬운 언어로 번역', description: '난해한 학술 용어나 도메인 특화 약어를 독자가 쉽게 풀이해서 소화하도록 돕습니다.' },
					{ id: 'keep-quotes-short', label: '인용구 간결화', description: '참고자료를 그대로 긁어 붙이는 비효율을 방지하고 꼭 필요한 부분만 핵심으로 요약 인용합니다.' }
				]
			}
		]
	},
	{
		id: WORKDUCK_REVISION_ASSISTANT_SKILL_ID,
		name: 'Revision assistant',
		description: 'Revise a draft by selected style, structure, and format goals.',
		outputTypes: ['revision'],
		instructions:
			'Revise the provided draft according to the task body, selected references, and checked revision options. Preserve the original meaning and factual claims unless the task explicitly asks to change them. Multiple checked options can apply at once; resolve conflicts by keeping meaning first, then structure, then tone, then format. Use references only as support for factual fixes and do not invent unsupported facts. For revision-draft response format, put the revised text in summary, put the applied revision choices in strengths, put optional remaining revision ideas in recommendations, and put meaning changes, tradeoffs, source gaps, or facts to verify in cautions.',
		optionGroups: [
			{
				id: 'revision-purpose',
				label: '퇴고 핵심 목적',
				description: '문장 교정 시 가장 역점적으로 개선할 품질 기준을 설정합니다.',
				selectionMode: 'multiple',
				options: [
					{ id: 'clarity', label: '의미의 명확성 극대화', description: '모호하고 중의적으로 해석될 여지가 있는 문구를 찾아 직관적인 표현으로 수정합니다.' },
					{ id: 'concise', label: '군더더기 없는 문맥', description: '의미 없이 반복되거나 지나치게 늘어지는 장황한 어휘들을 걷어내고 압축합니다.' },
					{ id: 'logic', label: '인과적 논리 구조', description: '원인이 되는 논거와 최종 도출되는 결론 사이의 흐름을 톱니바퀴처럼 조밀하게 보강합니다.' },
					{ id: 'persuasive', label: '설득력 배가', description: '독자가 고개를 끄덕일 수밖에 없도록 강렬한 핵심 주장과 그에 걸맞은 탄탄한 입증 자료를 매칭합니다.' },
					{ id: 'natural', label: '자연스러운 한국어', description: '영어식 직역투, 일본식 번역어, 피동형 표현 등을 한국어 고유의 자연스러운 어법과 호흡으로 전면 교정합니다.' },
					{ id: 'fact-alignment', label: '엄격한 사실 정합성', description: '제공된 참고 문서나 레퍼런스 데이터와 어긋나는 모든 전제 및 문맥 오류를 꼼꼼하게 교정합니다.' }
				]
			},
			{
				id: 'revision-intensity',
				label: '퇴고 강도',
				description: '원고의 기존 구조를 얼마만큼 큰 범주로 변경하여 다시 쓸지 깊이를 설정합니다.',
				selectionMode: 'single',
				options: [
					{ id: 'light', label: '기본 교정 (가볍게)', description: '원문의 서사와 골조를 고스란히 둔 채, 사소한 맞춤법과 비문 위주로만 조율합니다.' },
					{ id: 'medium', label: '부분 개선 (중간)', description: '가독성을 방해하는 일부 문장 구조를 깨부수고 자연스러운 단락 흐름으로 재배치합니다.' },
					{ id: 'heavy', label: '전면 리라이팅 (강하게)', description: '원작자의 기본 의도는 온전히 계승하되, 더욱 수준 높은 명품 어휘와 문장력으로 원고를 통째로 다시 집필합니다.' },
					{ id: 'surgical', label: '정밀 최소 변경 (미세 교정)', description: '원고가 손상되지 않도록 고도의 주의를 기울여, 오직 오류가 있는 핵심 문맥만 외과수술하듯 정밀 수정합니다.' }
				]
			},
			{
				id: 'revision-tone',
				label: '어조 변경',
				description: '퇴고 과정에서 원고가 발산하게 될 최종적인 분위기와 톤을 지정합니다.',
				selectionMode: 'multiple',
				options: [
					{ id: 'formal', label: '공식적이고 품격 있게', description: '격식 있는 대외 문서나 대기업 보고서, 혹은 공식적인 보도자료 양식의 높은 품격을 갖춥니다.' },
					{ id: 'casual', label: '편안하고 위트 있게', description: '독자가 심리적 거부감을 느끼지 않도록 편안하고 친근한 일상의 스토리텔링 스타일을 적용합니다.' },
					{ id: 'sharp', label: '주관이 선명하고 날카롭게', description: '어설프게 타협하는 톤을 버리고, 주요 논쟁 이슈에 대한 날카로운 비판 의식을 또렷하게 유지합니다.' },
					{ id: 'warm', label: '배려가 깃든 부드러움', description: '어조의 불필요한 공격성이나 고압적 느낌을 정화하여 독자와 깊이 공감하고 위로하는 따뜻한 온도를 부여합니다.' },
					{ id: 'dry', label: '감정 배제와 객관화', description: '주관적 형용사를 완벽히 거세하고, 철저히 통계와 팩트, 그리고 3인칭 서술 중심의 건조한 어조로 가둡니다.' },
					{ id: 'literary', label: '리듬감이 살아 있는 감성', description: '문장에 유려한 은유와 리듬감을 가미하여 독자에게 한 편의 문학 작품을 감상하는 듯한 사유의 깊이를 선물합니다.' }
				]
			},
			{
				id: 'revision-structure',
				label: '레이아웃 및 거시 구조',
				description: '글의 전반적인 아키텍처와 흐름을 구성하는 방식을 지정합니다.',
				selectionMode: 'multiple',
				options: [
					{ id: 'reorder-paragraphs', label: '문단 지능적 재배치', description: '논리의 기승전결이 어색해지는 지점을 탐지하여 가장 흡입력 있고 물 흐르듯 유기적인 순서로 단락을 바꿉니다.' },
					{ id: 'add-headings', label: '소제목 및 구조화 추가', description: '방대한 글도 한눈에 직관적으로 독해할 수 있도록 핵심 맥락에 소제목(#) 레이블을 부착합니다.' },
					{ id: 'strong-opening', label: '서두 장악 (도입 강화)', description: '이탈하는 독자를 사로잡을 수 있도록 글의 포문을 매력적인 의문이나 강력한 문구로 개편합니다.' },
					{ id: 'strong-ending', label: '깊은 여운 (결론 강화)', description: '미진했던 뒷부분의 논지를 강하게 매듭짓고, 오랫동안 잔상이 남는 설득력 높은 결말을 다집니다.' },
					{ id: 'split-long-paragraphs', label: '시각적 피로 감소 (문단 분할)', description: '모바일이나 좁은 디스플레이 환경에서 지나치게 길어 숨이 막히는 거대 단락을 적정 비율로 슬기롭게 쪼갭니다.' }
				]
			},
			{
				id: 'revision-sentence',
				label: '미시 문장 교정',
				description: '문장 단위의 아주 정교한 디테일을 보완하는 기능입니다.',
				selectionMode: 'multiple',
				options: [
					{ id: 'shorten-sentences', label: '간결한 단문 중심', description: '여러 문맥이 과도하게 얽힌 만연체 장문을 간결하게 쪼개어 가독성을 큰 폭으로 상향합니다.' },
					{ id: 'smooth-transitions', label: '매끄러운 접착 (연결어 정리)', description: '문맥의 갑작스러운 건너뛰기를 부드럽게 방지하기 위해 문장 사이사이에 천연 접착제 같은 적절한 접속 조사를 녹여냅니다.' },
					{ id: 'remove-repetition', label: '동일 용어 반복 배제', description: '한 화면 안에 같은 조사가 겹치거나 지루한 특정 명사가 연속해서 등장하는 어색한 중복을 고상한 동의어로 순화합니다.' },
					{ id: 'vary-rhythm', label: '호흡의 다이내믹한 조율', description: '리드미컬한 독서를 위해 짧은 단문과 유기적인 복문을 세련되게 엮어 호흡의 리듬감을 창출합니다.' },
					{ id: 'fix-translationese', label: '번역투 완벽 소거', description: '"~에 대한", "~에 의해", "가지는 것" 같은 대표적인 외래 번역식 피동 투를 자연스러운 주어-목적어 관계의 능동 문맥으로 환원합니다.' }
				]
			},
			{
				id: 'revision-evidence',
				label: '근거 신뢰도 제고',
				description: '인용되는 팩트와 참고 자료의 정보 소유권을 정의하고 무결성을 가다듬습니다.',
				selectionMode: 'multiple',
				options: [
					{ id: 'mark-unsupported', label: '미검증 사실 격리', description: '전달받은 리소스에서 참과 거짓 여부를 최종 검증할 수 없는 미지 주장이 있다면 cautions(주의 사항) 영역으로 분리하여 정직하게 경고합니다.' },
					{ id: 'align-references', label: '참고 자료 100% 매칭', description: '임의로 과장하거나 비틀어 전달한 서술을 찾아 원본 제공 레퍼런스의 있는 그대로의 고유 명세와 완벽히 동기화합니다.' },
					{ id: 'separate-opinion', label: '의견과 팩트 분리', description: '작성자의 주관적인 편향이나 의견(Opinion)을 객관적으로 실존하는 사실(Fact)과 무리하게 융합하지 않고 문맥적으로 격리합니다.' },
					{ id: 'no-new-claims', label: '자가 발전 금지', description: '퇴고의 명분을 앞세워, 원고나 레퍼런스 밖의 완전히 새로운 소설 같은 주장을 멋대로 생성하여 보강하지 않습니다.' }
				]
			},
			{
				id: 'revision-format',
				label: '출력 형식 최적화',
				description: '원고가 렌더링되거나 저장되는 포맷과 부가 정보 구성 방식을 정합니다.',
				selectionMode: 'multiple',
				options: [
					{ id: 'one-paragraph', label: '단일 단락화', description: '여러 문단으로 지저분하게 나뉜 글들을 유기적인 흐름의 매끄러운 원패러그래프로 우아하게 병합합니다.' },
					{ id: 'bullet-summary', label: '핵심 요약 3줄 불릿 제공', description: '바쁜 사용자를 위하여 수정된 최종 원고 상단에 단 세 줄의 정제된 핵심 팩트 요약 요점 목록을 탑재합니다.' },
					{ id: 'markdown-ready', label: '완성형 마크다운 포맷', description: '가독성을 향상시키는 마크다운 문법(#, **, -, > 등)을 적재적소에 정밀하게 준용하여 즉시 퍼블리싱 가능한 형태로 출력합니다.' },
					{ id: 'before-after-notes', label: '퇴고 내역 리포트 첨부', description: '수정 과정에서 가해진 주요 교정 영역 및 그에 대입한 수사학적 rationale를 짧은 요약 메타 노트로 상세히 알려줍니다.' },
					{ id: 'keep-length', label: '정보 밀도 유지', description: '퇴고가 다이어트로 오인되어 꼭 남겨야 할 귀중한 디테일 요소나 예시들마저 잘려 나가지 않도록 두께감을 유지합니다.' }
				]
			},
			{
				id: 'revision-preserve',
				label: '보존 절대 영역',
				description: '퇴고 칼날 속에서도 훼손하지 않고 기필코 원형을 유지해야 할 보호 핵심 요소들을 잠금 처리합니다.',
				selectionMode: 'multiple',
				options: [
					{ id: 'meaning', label: '원천적 논지 및 팩트', description: '문장 구조나 외형적 형식이 어떠한 수준으로 비약하더라도 원작자의 고유한 생각이나 진실 관계를 0.01%도 훼손하지 않습니다.' },
					{ id: 'voice', label: '작성자 고유의 페르소나', description: '인공지능의 기계적 냄새가 묻지 않도록 원글 작성자가 지녔던 미세한 문체나 고유한 목소리의 결을 다정하게 감싸 안고 살립니다.' },
					{ id: 'key-phrases', label: '시그니처 용어 보존', description: '원문에서 의도적이고 핵심적으로 사용한 대표적 시그니처 멘트나 전문 keyphrase들을 고집스럽게 사수합니다.' },
					{ id: 'length', label: '오리지널 분량감 보전', description: '글의 골격과 전달량이 쪼그라들거나 지나치게 과도해지는 왜곡을 차단하고 기존 분량의 균형점을 준수합니다.' },
					{ id: 'structure', label: '기존 핵심 흐름 사수', description: '특별한 요청이 없는 한, 단락의 본래 흐름과 문맥적 기저 구조를 변경하지 않고 내실만 견고히 채웁니다.' }
				]
			}
		]
	},
	{
		id: WORKDUCK_CODE_REVIEWER_SKILL_ID,
		name: 'Code reviewer',
		description: 'Review code or Git diff for correctness, maintainability, security, and runtime risks.',
		outputTypes: ['result-report'],
		instructions:
			'Review the supplied code, file excerpts, or Git diff. Prefer the code-review response format when available. Lead with concrete findings ordered by severity, include file paths and line references when provided, and focus on defects, regressions, maintainability, performance, security, and framework-specific risks. Do not praise broadly or rewrite unrelated code. If evidence is missing, state the review gap instead of inventing context.',
		optionGroups: [
			{
				id: 'review-focus',
				label: '리뷰 관점',
				description: '코드 리뷰에서 우선 확인할 영역을 선택합니다.',
				selectionMode: 'multiple',
				options: [
					{ id: 'correctness', label: '동작 정확성', description: '버그, 회귀, 엣지 케이스를 우선 점검합니다.' },
					{ id: 'readability', label: '가독성 및 구조', description: '네이밍, 함수 분리, 흐름, 중복을 검토합니다.' },
					{ id: 'performance', label: '성능 및 자원', description: '불필요한 반복, 메모리 사용량, 잠재적 병목 지점을 진단합니다.' },
					{ id: 'security', label: '보안 및 입력 검증', description: 'API 키 등 민감 정보 노출, 입력값 검증 누락, 권한 경계를 점검합니다.' },
					{ id: 'svelte-tauri', label: 'Svelte/Tauri 경계', description: 'Svelte 5 상태, SSR, Tauri IPC, Rust 블로킹 위험을 확인합니다.' }
				]
			},
			{
				id: 'review-strictness',
				label: '리뷰 강도',
				description: '리뷰의 엄격성과 요약 깊이를 지정합니다.',
				selectionMode: 'single',
				options: [
					{ id: 'strict', label: '엄격하게', description: '작은 결함과 설계 위험까지 놓치지 않고 지적합니다.' },
					{ id: 'balanced', label: '균형 있게', description: '위험과 개선안을 실무 우선순위에 맞춰 정리합니다.' },
					{ id: 'kind', label: '부드럽게', description: '성장과 협업 관점에서 대안을 함께 제시합니다.' },
					{ id: 'top-three', label: '핵심 3개', description: '가장 중요한 문제 세 가지 중심으로 압축합니다.' }
				]
			}
		]
	},
	{
		id: WORKDUCK_COMMIT_HANDOFF_WRITER_SKILL_ID,
		name: 'Commit and handoff writer',
		description: 'Turn change summaries into commit messages and continuation handoff notes.',
		outputTypes: ['result-report', 'work-order'],
		instructions:
			'Analyze the supplied changed-file list, diff summary, work report, or task notes. Recommend one or more commit messages without staging, committing, or pushing. When requested, write a handoff that preserves completed work, open tasks, validation evidence, risks, and the next safe action. Do not claim commands were run unless the task supplies that evidence.',
		optionGroups: [
			{
				id: 'commit-style',
				label: '커밋 스타일',
				description: '추천할 커밋 메시지 형식을 선택합니다.',
				selectionMode: 'single',
				options: [
					{ id: 'conventional', label: 'Conventional Commits', description: 'feat, fix, refactor 같은 표준 접두사를 사용합니다.' },
					{ id: 'plain', label: '간결한 한 줄형', description: '팀 내부 기록에 맞는 짧은 명령형 제목을 작성합니다.' },
					{ id: 'narrative', label: '맥락 서술형', description: '변경 이유와 배경을 본문에 함께 정리합니다.' }
				]
			},
			{
				id: 'handoff-depth',
				label: '인계 깊이',
				description: '다음 작업자가 받을 문서의 깊이를 선택합니다.',
				selectionMode: 'single',
				options: [
					{ id: 'milestone', label: '마일스톤 요약', description: '완료된 핵심 진척 사항과 수정된 파일 목록을 간결하게 요약합니다.' },
					{ id: 'checklist', label: '체크리스트 상세형', description: '진행 상태, TODO, 검증, 예외 대책을 함께 남깁니다.' },
					{ id: 'release-ready', label: '릴리즈 준비형', description: '릴리즈 전 확인할 위험과 누락 검증을 강조합니다.' }
				]
			}
		]
	},
	{
		id: WORKDUCK_TECH_DEBT_JANITOR_SKILL_ID,
		name: 'Tech-debt janitor',
		description: 'Plan behavior-preserving refactors for legacy, tangled, or duplicated code.',
		outputTypes: ['proposal', 'work-order'],
		instructions:
			'Inspect the supplied code or technical-debt brief and propose behavior-preserving refactoring steps. Preserve public API and business behavior unless the task explicitly allows redesign. Separate safe mechanical cleanup from risky design changes, name tests or checks needed before edits, and avoid broad rewrites without migration steps.',
		optionGroups: [
			{
				id: 'refactor-target',
				label: '리팩토링 대상',
				description: '정리하려는 기술 부채 유형을 선택합니다.',
				selectionMode: 'multiple',
				options: [
					{ id: 'svelte-runes', label: 'Svelte 5 Runes 정리', description: '상태, 파생값, 효과의 소유권을 분리합니다.' },
					{ id: 'composition', label: '상속 대신 합성', description: '클래스 상속 구조의 강한 결합을 낮추고 역할 기반 객체 합성을 제안합니다.' },
					{ id: 'deduplicate', label: '중복 로직 모듈화', description: '반복되는 규칙과 유틸리티를 안전하게 추출합니다.' },
					{ id: 'async-errors', label: '비동기 오류 처리', description: '실패 전파, 복구, 사용자 메시지 경계를 정리합니다.' },
					{ id: 'module-boundary', label: '모듈 경계 정리', description: '책임이 섞인 파일과 계층 침범을 분리합니다.' }
				]
			},
			{
				id: 'behavior-preservation',
				label: '동작 보존 강도',
				description: '기존 기능 명세 및 동작을 얼마나 엄격하게 유지할지 결정합니다.',
				selectionMode: 'single',
				options: [
					{ id: 'strict-interface', label: '인터페이스 엄격 보존', description: '외부 API와 호출 방식을 그대로 둔 내부 정리만 제안합니다.' },
					{ id: 'safe-migration', label: '단계적 마이그레이션', description: '호환 레이어를 두고 새 구조로 천천히 옮기는 방식을 제안합니다.' },
					{ id: 'api-redesign', label: 'API 재설계 허용', description: '장기 확장성을 위해 시그니처 개선안까지 포함합니다.' }
				]
			}
		]
	},
	{
		id: WORKDUCK_RELEASE_NOTE_WRITER_SKILL_ID,
		name: 'Release note writer',
		description: 'Create release notes or changelog drafts from commits, completed work, and reports.',
		outputTypes: ['writing', 'result-report'],
		instructions:
			'Write release notes or a changelog from the supplied commits, work-order reports, issue list, or change summary. Separate user-visible changes from internal maintenance. Do not invent shipped features, dates, version numbers, metrics, or validation evidence. Call out breaking changes, migration notes, and known limitations when evidence is provided.',
		optionGroups: [
			{
				id: 'release-audience',
				label: '독자 관점',
				description: '릴리즈 문서를 읽을 대상을 선택합니다.',
				selectionMode: 'single',
				options: [
					{ id: 'end-user', label: '최종 사용자용', description: '기능의 효용과 사용 흐름을 쉬운 말로 설명합니다.' },
					{ id: 'developer', label: '개발팀/파트너용', description: 'API 변경, 버그 수정, 마이그레이션 정보를 강조합니다.' },
					{ id: 'business', label: '비즈니스 공유용', description: '릴리즈 가치와 제품 하이라이트를 중심으로 요약합니다.' }
				]
			},
			{
				id: 'release-structure',
				label: '분류 방식',
				description: '릴리즈 노트의 구성 방식을 선택합니다.',
				selectionMode: 'single',
				options: [
					{ id: 'keep-a-changelog', label: '카테고리 그룹형', description: 'Added, Changed, Fixed 같은 범주로 정리합니다.' },
					{ id: 'highlights', label: '하이라이트형', description: '주요 변화와 사용 가치를 앞세워 설명합니다.' },
					{ id: 'migration-first', label: '마이그레이션 우선', description: '호환성, 설정 변경, 주의사항을 먼저 안내합니다.' }
				]
			}
		]
	},
	{
		id: WORKDUCK_API_SCHEMA_ARCHITECT_SKILL_ID,
		name: 'API schema architect',
		description: 'Design API endpoints, command contracts, payloads, and schemas from feature requirements.',
		outputTypes: ['proposal', 'work-order'],
		instructions:
			'Turn the supplied feature requirement into an API or command contract proposal. Define resource or command boundaries, request and response payloads, error cases, validation rules, compatibility notes, and follow-up implementation tasks. Keep schemas aligned with the chosen style and do not claim an endpoint exists unless the task provides that evidence.',
		optionGroups: [
			{
				id: 'api-style',
				label: '설계 스타일',
				description: '요구사항에 맞는 API 또는 커맨드 형태를 선택합니다.',
				selectionMode: 'single',
				options: [
					{ id: 'rest', label: 'RESTful API', description: 'HTTP 메서드와 리소스 경로 중심으로 설계합니다.' },
					{ id: 'tauri-command', label: 'Tauri IPC Command', description: '데스크톱 앱의 명령/응답 경계를 중심으로 설계합니다.' },
					{ id: 'rpc', label: 'RPC / JSON-RPC', description: '명시적 메서드 호출과 낮은 호출 오버헤드를 우선합니다.' },
					{ id: 'event-contract', label: '이벤트/큐 계약', description: '비동기 작업과 재시도 가능한 메시지 경계를 설계합니다.' }
				]
			},
			{
				id: 'schema-output',
				label: '스키마 형식',
				description: 'API 설계와 함께 산출할 명세 형식을 선택합니다.',
				selectionMode: 'multiple',
				options: [
					{ id: 'typescript-types', label: 'TypeScript 타입', description: '인터페이스, 유니언, 타입 가드 초안을 포함합니다.' },
					{ id: 'openapi', label: 'OpenAPI v3', description: 'Swagger 계열 도구로 옮길 수 있는 구조를 제안합니다.' },
					{ id: 'json-schema', label: 'JSON Schema', description: '런타임 검증에 사용할 스키마 구조를 작성합니다.' },
					{ id: 'error-envelope', label: '오류 응답 계약', description: '에러 코드, 메시지, 복구 가능성을 함께 정의합니다.' }
				]
			}
		]
	},
	{
		id: WORKDUCK_AGENT_RESPONSE_EVALUATOR_SKILL_ID,
		name: 'Agent response evaluator',
		description: 'Rate an agent response with the five-criterion 1-9 rubric.',
		outputTypes: ['agent-evaluation'],
		instructions: AGENT_EVALUATION_DELEGATION_INSTRUCTIONS,
		optionGroups: []
	}
] as const satisfies readonly Omit<WorkduckSkillRecord, 'createdAt' | 'updatedAt'>[];

const DEFAULT_SKILL_TIMESTAMP = '2026-05-16T00:00:00.000Z';

export function createEmptySkillRegistry(workspaceId: string, now = new Date()): SkillRegistry {
	return {
		version: SKILL_REGISTRY_VERSION,
		workspaceId,
		skills: getDefaultSkills(),
		updatedAt: now.toISOString()
	};
}

export function getDefaultSkills(): readonly WorkduckSkillRecord[] {
	return DEFAULT_SKILLS.map((skill) => ({
		...skill,
		createdAt: DEFAULT_SKILL_TIMESTAMP,
		updatedAt: DEFAULT_SKILL_TIMESTAMP
	}));
}

export function getAllSkills(registry: SkillRegistry): readonly WorkduckSkillRecord[] {
	return normalizeSkillRegistry(registry, registry.workspaceId).skills;
}

export function isDefaultSkillRecord(skill: WorkduckSkillRecord) {
	const defaultSkill = DEFAULT_SKILLS.find((candidate) => candidate.id === skill.id);

	if (defaultSkill === undefined) {
		return false;
	}

	if (skill.createdAt === DEFAULT_SKILL_TIMESTAMP && skill.updatedAt === DEFAULT_SKILL_TIMESTAMP) {
		return true;
	}

	return (
		defaultSkill.name === skill.name &&
		defaultSkill.description === skill.description &&
		defaultSkill.instructions === skill.instructions &&
		defaultSkill.outputTypes.length === skill.outputTypes.length &&
		defaultSkill.outputTypes.every((outputType, index) => skill.outputTypes[index] === outputType) &&
		skillOptionGroupsAreEqual(defaultSkill.optionGroups, skill.optionGroups)
	);
}

export function parseSkillRegistry(serializedRegistry: string, workspaceId: string) {
	try {
		return normalizeSkillRegistry(JSON.parse(serializedRegistry), workspaceId);
	} catch {
		return null;
	}
}

export function serializeSkillRegistry(registry: SkillRegistry) {
	return JSON.stringify(normalizeSkillRegistry(registry, registry.workspaceId) ?? registry);
}

export function upsertSkill(
	registry: SkillRegistry,
	input: SkillInput,
	now = new Date()
): SkillRegistryMutationResult {
	const normalizedRegistry = normalizeSkillRegistry(registry, registry.workspaceId) ?? registry;
	const skillId = normalizeRecordId(input.id ?? null);
	const name = normalizeSkillName(input.name);
	const description = normalizeSkillDescription(input.description);
	const outputTypes = normalizeSkillOutputTypes(input.outputTypes);
	const instructions = normalizeSkillInstructions(input.instructions);
	const optionGroups = normalizeSkillOptionGroups(input.optionGroups ?? []);

	if (name.length === 0) {
		return { ok: false, registry: normalizedRegistry, error: 'skill-name-required' };
	}

	if (outputTypes.length === 0) {
		return { ok: false, registry: normalizedRegistry, error: 'skill-output-type-required' };
	}

	if (instructions.length === 0) {
		return { ok: false, registry: normalizedRegistry, error: 'skill-instructions-required' };
	}

	const matchingSkill = normalizedRegistry.skills.find((skill) => skill.id === skillId);
	const nameKey = createSkillNameKey(name);
	const nameAlreadyExists = normalizedRegistry.skills.some(
		(skill) => skill.id !== skillId && createSkillNameKey(skill.name) === nameKey
	);

	if (nameAlreadyExists) {
		return { ok: false, registry: normalizedRegistry, error: 'skill-name-duplicate' };
	}

	if (skillId !== null && matchingSkill === undefined) {
		return { ok: false, registry: normalizedRegistry, error: 'skill-not-found' };
	}

	const timestamp = now.toISOString();
	const nextSkill = {
		id: skillId ?? createSkillId(),
		name,
		description,
		outputTypes,
		instructions,
		optionGroups,
		createdAt: matchingSkill?.createdAt ?? timestamp,
		updatedAt: timestamp
	} satisfies WorkduckSkillRecord;
	const skills =
		matchingSkill === undefined
			? [...normalizedRegistry.skills, nextSkill]
			: normalizedRegistry.skills.map((skill) =>
					skill.id === nextSkill.id ? nextSkill : skill
				);

	return {
		ok: true,
		registry: {
			...normalizedRegistry,
			skills: sortSkills(skills),
			updatedAt: timestamp
		}
	};
}

export function removeSkill(
	registry: SkillRegistry,
	skillId: string,
	now = new Date()
): SkillRegistryMutationResult {
	const normalizedRegistry = normalizeSkillRegistry(registry, registry.workspaceId) ?? registry;

	if (!normalizedRegistry.skills.some((skill) => skill.id === skillId)) {
		return { ok: false, registry: normalizedRegistry, error: 'skill-not-found' };
	}

	return {
		ok: true,
		registry: {
			...normalizedRegistry,
			skills: normalizedRegistry.skills.filter((skill) => skill.id !== skillId),
			updatedAt: now.toISOString()
		}
	};
}

export function normalizeSkillIds(value: unknown): string[] {
	if (!Array.isArray(value)) {
		return [];
	}

	const skillIds: string[] = [];

	for (const item of value) {
		const skillId = normalizeRecordId(item);

		if (skillId === null || skillIds.includes(skillId)) {
			continue;
		}

		skillIds.push(skillId);
	}

	return skillIds;
}

function normalizeSkillRegistry(value: unknown, workspaceId: string): SkillRegistry {
	if (!isObjectRecord(value) || !isSupportedSkillRegistryVersion(value.version)) {
		return createEmptySkillRegistry(workspaceId);
	}

	if (typeof value.workspaceId !== 'string' || value.workspaceId !== workspaceId) {
		return createEmptySkillRegistry(workspaceId);
	}

	const rawSkills = [
		...getDefaultSkillsForRegistryVersion(value.version),
		...(Array.isArray(value.skills) ? value.skills : [])
	];
	const seenSkillIds = new Set<string>();
	const seenSkillNames = new Set<string>();
	const skills: WorkduckSkillRecord[] = [];

	for (const rawSkill of rawSkills) {
		const skill = parseSkillRecord(rawSkill);

		if (skill === null) {
			continue;
		}

		const skillNameKey = createSkillNameKey(skill.name);

		if (seenSkillIds.has(skill.id) || seenSkillNames.has(skillNameKey)) {
			continue;
		}

		seenSkillIds.add(skill.id);
		seenSkillNames.add(skillNameKey);
		skills.push(skill);
	}

	return {
		version: SKILL_REGISTRY_VERSION,
		workspaceId,
		skills: sortSkills(skills),
		updatedAt: readTrimmedString(value.updatedAt)
	};
}

function isSupportedSkillRegistryVersion(
	version: unknown
): version is 1 | 2 | typeof SKILL_REGISTRY_VERSION {
	return version === 1 || version === 2 || version === SKILL_REGISTRY_VERSION;
}

function getDefaultSkillsForRegistryVersion(
	version: 1 | 2 | typeof SKILL_REGISTRY_VERSION
): readonly WorkduckSkillRecord[] {
	if (version === 1) {
		return getDefaultSkills();
	}

	if (version === 2) {
		return getDefaultSkills().filter(isWorkflowDefaultSkill);
	}

	return [];
}

function isWorkflowDefaultSkill(skill: WorkduckSkillRecord) {
	return (
		skill.id === WORKDUCK_CODE_REVIEWER_SKILL_ID ||
		skill.id === WORKDUCK_COMMIT_HANDOFF_WRITER_SKILL_ID ||
		skill.id === WORKDUCK_TECH_DEBT_JANITOR_SKILL_ID ||
		skill.id === WORKDUCK_RELEASE_NOTE_WRITER_SKILL_ID ||
		skill.id === WORKDUCK_API_SCHEMA_ARCHITECT_SKILL_ID
	);
}

function parseSkillRecord(value: unknown): WorkduckSkillRecord | null {
	if (!isObjectRecord(value)) {
		return null;
	}

	const id = normalizeRecordId(value.id);
	const name = normalizeSkillName(readTrimmedString(value.name));
	const description = normalizeSkillDescription(readTrimmedString(value.description));
	const outputTypes = normalizeSkillOutputTypes(value.outputTypes);
	const instructions = normalizeSkillInstructions(readRawString(value.instructions));
	const optionGroups = Array.isArray(value.optionGroups)
		? normalizeSkillOptionGroups(value.optionGroups)
		: getDefaultSkillOptionGroups(id);
	const createdAt = readTrimmedString(value.createdAt);
	const updatedAt = readTrimmedString(value.updatedAt);

	if (id === null || name.length === 0 || outputTypes.length === 0 || instructions.length === 0) {
		return null;
	}

	return {
		id,
		name,
		description,
		outputTypes,
		instructions,
		optionGroups,
		createdAt: createdAt.length === 0 ? updatedAt : createdAt,
		updatedAt: updatedAt.length === 0 ? createdAt : updatedAt
	};
}

function getDefaultSkillOptionGroups(skillId: string | null) {
	const defaultSkill =
		skillId === null ? undefined : DEFAULT_SKILLS.find((candidate) => candidate.id === skillId);

	return defaultSkill === undefined ? [] : normalizeSkillOptionGroups(defaultSkill.optionGroups);
}

function normalizeSkillOptionGroups(value: unknown): WorkduckSkillOptionGroup[] {
	if (!Array.isArray(value)) {
		return [];
	}

	const optionGroups: WorkduckSkillOptionGroup[] = [];
	const seenGroupIds = new Set<string>();

	for (const item of value) {
		if (!isObjectRecord(item)) {
			continue;
		}

		const label = normalizeSkillOptionLabel(readTrimmedString(item.label));
		const id = normalizeRecordId(item.id) ?? createOptionRecordId(label);
		const description = normalizeSkillOptionDescription(readTrimmedString(item.description));
		const selectionMode = item.selectionMode === 'multiple' ? 'multiple' : 'single';
		const options = normalizeSkillOptions(item.options);

		if (id === null || label.length === 0 || options.length === 0 || seenGroupIds.has(id)) {
			continue;
		}

		seenGroupIds.add(id);
		optionGroups.push({ id, label, description, selectionMode, options });

		if (optionGroups.length >= SKILL_OPTION_GROUPS_MAX_COUNT) {
			break;
		}
	}

	return optionGroups;
}

function normalizeSkillOptions(value: unknown): WorkduckSkillOption[] {
	if (!Array.isArray(value)) {
		return [];
	}

	const options: WorkduckSkillOption[] = [];
	const seenOptionIds = new Set<string>();

	for (const item of value) {
		if (!isObjectRecord(item)) {
			continue;
		}

		const label = normalizeSkillOptionLabel(readTrimmedString(item.label));
		const id = normalizeRecordId(item.id) ?? createOptionRecordId(label);
		const description = normalizeSkillOptionDescription(readTrimmedString(item.description));

		if (id === null || label.length === 0 || seenOptionIds.has(id)) {
			continue;
		}

		seenOptionIds.add(id);
		options.push({ id, label, description });

		if (options.length >= SKILL_OPTIONS_PER_GROUP_MAX_COUNT) {
			break;
		}
	}

	return options;
}

function skillOptionGroupsAreEqual(
	leftGroups: readonly WorkduckSkillOptionGroup[],
	rightGroups: readonly WorkduckSkillOptionGroup[]
) {
	return (
		leftGroups.length === rightGroups.length &&
		leftGroups.every((leftGroup, groupIndex) => {
			const rightGroup = rightGroups[groupIndex];

			return (
				rightGroup !== undefined &&
				leftGroup.id === rightGroup.id &&
				leftGroup.label === rightGroup.label &&
				leftGroup.description === rightGroup.description &&
				leftGroup.selectionMode === rightGroup.selectionMode &&
				leftGroup.options.length === rightGroup.options.length &&
				leftGroup.options.every((leftOption, optionIndex) => {
					const rightOption = rightGroup.options[optionIndex];

					return (
						rightOption !== undefined &&
						leftOption.id === rightOption.id &&
						leftOption.label === rightOption.label &&
						leftOption.description === rightOption.description
					);
				})
			);
		})
	);
}

function normalizeSkillOutputTypes(value: unknown): WorkduckSkillOutputType[] {
	if (!Array.isArray(value)) {
		return [];
	}

	const allowedTypes = new Set(workduckSkillOutputTypeOptions.map((option) => option.id));
	const outputTypes: WorkduckSkillOutputType[] = [];

	for (const item of value) {
		if (typeof item !== 'string' || !allowedTypes.has(item as WorkduckSkillOutputType)) {
			continue;
		}

		const outputType = item as WorkduckSkillOutputType;

		if (!outputTypes.includes(outputType)) {
			outputTypes.push(outputType);
		}

		if (outputTypes.length >= SKILL_OUTPUT_TYPES_MAX_COUNT) {
			break;
		}
	}

	return outputTypes;
}

function sortSkills(skills: readonly WorkduckSkillRecord[]) {
	return [...skills].sort((left, right) =>
		left.name.localeCompare(right.name, undefined, { numeric: true, sensitivity: 'base' })
	);
}

function normalizeSkillName(value: string) {
	return value.trim().replace(/\s+/g, ' ').slice(0, SKILL_NAME_MAX_LENGTH);
}

function normalizeSkillDescription(value: string) {
	return value.trim().replace(/\s+/g, ' ').slice(0, SKILL_DESCRIPTION_MAX_LENGTH);
}

function normalizeSkillInstructions(value: string) {
	return value.trim().slice(0, SKILL_INSTRUCTIONS_MAX_LENGTH);
}

function normalizeSkillOptionLabel(value: string) {
	return value.trim().replace(/\s+/g, ' ').slice(0, SKILL_OPTION_LABEL_MAX_LENGTH);
}

function normalizeSkillOptionDescription(value: string) {
	return value.trim().replace(/\s+/g, ' ').slice(0, SKILL_OPTION_DESCRIPTION_MAX_LENGTH);
}

function normalizeRecordId(value: unknown) {
	const id = readTrimmedString(value);

	return id.length === 0 ? null : id;
}

function createSkillId() {
	if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
		return crypto.randomUUID();
	}

	return `skill-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function createOptionRecordId(label: string) {
	const baseId = label
		.trim()
		.toLocaleLowerCase()
		.replace(/[^0-9a-z가-힣]+/gu, '-')
		.replace(/^-+|-+$/gu, '')
		.slice(0, 48);

	return baseId.length === 0 ? null : baseId;
}

function createSkillNameKey(name: string) {
	return normalizeSkillName(name).toLocaleLowerCase('en-US');
}

function readRawString(value: unknown) {
	return typeof value === 'string' ? value : '';
}

function readTrimmedString(value: unknown) {
	return typeof value === 'string' ? value.trim() : '';
}
