export const koSkillsMessages = {
		title: '스킬',
		list: '스킬 목록',
		details: '스킬 세부 정보',
		registeredCount: '스킬 {count}개',
		newSkill: '새 스킬',
		editSkill: '스킬 수정',
		copySkill: '복사',
		copyNameSuffix: '복사본',
		saved: '저장했습니다.',
		removed: '삭제했습니다.',
		removeReferencedWarning:
			'{name} 스킬은 작업 파일 {count}개에서 사용 중입니다. 한 번 더 삭제를 누르면 그래도 삭제합니다.',
		optionGroups: {
			title: '작업 옵션',
			description: '이 스킬을 작업 대기열에서 선택할 때 고를 유형, 말투, 형식 옵션을 구성합니다.',
			empty: '작업 옵션 없음',
			addGroup: '옵션 그룹 추가',
			removeGroup: '옵션 그룹 삭제',
			groupLimit: '옵션 그룹은 최대 {max}개까지 저장할 수 있습니다.',
			groupNameRequired: '옵션 그룹 {index}에 이름이 필요합니다.',
			groupName: '그룹 이름',
			selectionMode: '선택 방식',
			single: '하나만 선택',
			multiple: '여러 개 선택',
			options: '선택지',
			addOption: '선택지 추가',
			removeOption: '선택지 삭제',
			optionName: '선택지 이름',
			optionDescription: '선택지 설명',
			noOptions: '선택지 없음',
			optionRequired: '옵션 그룹 {index}에는 선택지가 하나 이상 필요합니다.',
			optionLimit: '옵션 그룹 {index}에는 선택지를 최대 {max}개까지 저장할 수 있습니다.',
			optionNameRequired: '그룹 {groupIndex}의 선택지 {optionIndex}에 이름이 필요합니다.',
			countLabel: '{current}/{max}'
		},
		outputTypes: {
			writing: '글쓰기',
			revision: '퇴고',
			'work-order': '작업 지시서',
			proposal: '제안서',
			'result-report': '결과 보고서',
			'agent-evaluation': '에이전트 평가'
		},
		seedSkills: {
			proposalWriter: {
				name: '제안서 작성기',
				description: '대안들을 비교 분석하여 최적의 추천안과 후속 실행 과제를 포함한 제안서를 작성합니다.',
				instructions:
					'workduck.queue-proposal/v1 규격의 제안서 산출물을 반환합니다. 실현 가능한 대안들을 비교하고, 각 대안의 상충 관계(Trade-off)와 절충점을 명확히 분석하며, 최적의 추천안을 도출한 뒤 필요한 경우에만 구체적인 후속 작업 지시서를 포함합니다.'
			},
			writingAssistant: {
				name: '글쓰기 도우미',
				description: '작업 요구사항, 문체 조건, 참고자료를 바탕으로 초안이나 수정본을 작성합니다.',
				instructions:
					'작업 본문과 선택된 참고자료를 바탕으로 요청한 문서를 작성합니다. Workduck 작업 ID가 주어지면 그것을 현재 작업의 식별자로만 보고, 그 자체를 추가 근거로 취급하지 않습니다. 문단 수, 문단당 문장 수, 어투, 독자, 시점, 언어, 형식, 금지 표현 같은 명시 조건을 우선합니다. 별도 조건이 없으면 작업 언어로 간결하고 완성도 있는 초안을 작성합니다. 선택된 참고자료는 사실 근거로 사용하되, 없는 사실을 지어내지 않습니다. writing-draft 응답 형식에서는 summary에 완성 원고를 넣고, strengths에는 문체와 근거 메모, recommendations에는 선택적 수정 방향, cautions에는 출처 공백이나 가정을 넣습니다.'
			},
			revisionAssistant: {
				name: '퇴고 도우미',
				description: '선택한 목적, 어조, 구조, 형식 조건에 맞추어 원고를 다듬습니다.',
				instructions:
					'작업 본문, 선택된 참고자료, 체크된 퇴고 옵션에 맞춰 제공된 초안을 정교하게 퇴고합니다. 사용자가 명시적으로 바꾸라고 하지 않은 원래 의미와 사실관계는 보존합니다. 여러 옵션이 동시에 선택될 수 있으므로 충돌할 때는 의미 보존, 구조, 어투, 형식 순서로 우선합니다. 참고자료는 사실 보강과 확인에만 사용하고, 없는 사실을 지어내지 않습니다. revision-draft 응답 형식에서는 summary에 퇴고본 전체를 넣고, strengths에는 적용한 퇴고 방향, recommendations에는 남은 추가 수정 선택지, cautions에는 의미 변화 가능성, 절충점, 출처 공백, 확인할 사실을 넣습니다.'
			},
			codeReviewer: {
				name: '코드 리뷰어',
				description: '코드나 Git diff를 정밀 검토하여 동작, 가독성, 보안성 및 런타임 부작용을 점검합니다.',
				instructions:
					'제공된 코드, 파일 일부, Git diff를 기술적으로 분석합니다. 가능하면 code-review 응답 형식을 사용합니다. 구체적인 발견 사항을 심각도 순으로 명확히 제시하고, 파일 경로와 줄 번호가 제공된 경우 정확히 매핑하여 기재합니다. 결함, 회귀, 유지보수성, 성능, 보안, 프레임워크 경계 리스크에 집중합니다. 근거 없는 칭찬이나 관련 없는 코드 재작성은 하지 않습니다. 근거가 부족하면 추측하지 말고 리뷰 한계를 정직하게 밝힙니다.'
			},
			commitHandoffWriter: {
				name: '커밋·인계 작성기',
				description: '변경 사항을 바탕으로 커밋 메시지와 다음 작업자를 위한 인계 문서를 작성합니다.',
				instructions:
					'제공된 변경 파일 목록, diff 요약, 작업 보고서, 작업 메모를 분석합니다. 스테이징, 커밋, 푸시를 직접 수행하지 않고, 컨벤션에 부합하는 하나 이상의 커밋 메시지를 추천합니다. 요청이 있으면 완료한 작업, 남은 작업, 검증 근거, 리스크, 다음 안전한 작업을 보존하는 인계 문서를 작성합니다. 작업에 포함되지 않은 명령 실행이나 검증은 수행한 것처럼 기술하지 않습니다.'
			},
			techDebtJanitor: {
				name: '기술 부채 정리 도우미',
				description: '레거시 코드, 복잡한 흐름, 중복 로직을 동작 보존 리팩토링 계획으로 체계적으로 정리합니다.',
				instructions:
					'제공된 코드나 기술 부채 설명을 검토하고 동작 보존 리팩토링 단계를 논리적으로 제안합니다. 사용자가 명시적으로 재설계를 허용하지 않는 한 공개 API와 비즈니스 동작을 안정적으로 보존합니다. 안전한 기계적 정리와 위험한 설계 변경을 분리하고, 수정 전 필요한 테스트나 검증을 명시합니다. 구체적인 점진적 마이그레이션 로드맵이 없는 대규모 빅뱅식 재작성은 제안하지 않습니다.'
			},
			releaseNoteWriter: {
				name: '릴리즈 노트 작성기',
				description: '커밋 이력, 완료 과제, 보고서를 기반으로 릴리즈 노트 및 변경 이력 초안을 작성합니다.',
				instructions:
					'제공된 커밋, 작업 보고서, 이슈 목록, 변경 요약을 바탕으로 구조적인 릴리즈 노트 및 변경 이력을 작성합니다. 사용자 관점의 변화 요소와 시스템 내부 백엔드 유지보수 작업을 명확히 분리합니다. 출시된 기능, 날짜, 버전, 지표, 검증 근거를 임의로 조작하거나 과장하지 않습니다. 근거가 제공된 경우 브레이킹 체인지, 마이그레이션 안내, 알려진 기술적 제한 사항을 함께 기재합니다.'
			},
			apiSchemaArchitect: {
				name: 'API 스키마 설계자',
				description: '기능적 요구사항을 분석하여 API 엔드포인트, 명령 계약, 페이로드 명세 및 스키마 설계를 수행합니다.',
				instructions:
					'제공된 기능 요구사항을 API 또는 커맨드 계약 제안으로 정리합니다. 리소스 또는 명령 경계, 요청/응답 페이로드, 오류 설계, 검증 규칙, 호환성 보장 계획, 후속 구현 단계를 상세화합니다. 선택한 설계 스타일과 스키마 형식을 일관되게 유지하고, 실제 확인되지 않은 엔드포인트가 이미 존재한다고 가정하지 않습니다.'
			},
			agentResponseEvaluator: {
				name: '에이전트 응답 평가기',
				description: '에이전트 응답의 정확성, 현실성, 논리성 등 5개 핵심 기준을 바탕으로 평가 및 정량 평가표를 산출합니다.',
				instructions:
					'제공된 작업 지시와 에이전트 응답 내용만을 객관적 근거로 삼아 문제 이해력, 논리적 타당성, 현실성·실행 가능성, 창의성·통찰, 리스크 감지 요소를 각각 1~9점 척도로 평가합니다. 단순 텍스트 길이나 유창성에는 점수를 부여하지 말아야 하며, 현실적 예산과 제약사항, 위험 감지, 명확한 판단 근거가 존재하는지를 봅니다. 점수를 판정한 뒤 workduck agent evaluate 명령을 실행하여 동일 워크스페이스의 에이전트 평가 누적값에 안전하게 반영합니다. 에이전트에 페르소나가 연결되어 있으면 해당 페르소나 평가에도 함께 연동되어 갱신됩니다.'
			}
		},
		errors: {
			nameRequired: '이름을 입력하세요.',
			nameDuplicate: '이미 있는 이름입니다.',
			outputTypeRequired: '산출물 유형을 선택하세요.',
			instructionsRequired: '지시문을 입력하세요.',
			notFound: '스킬을 찾을 수 없습니다.',
			readFailed: '스킬을 불러오지 못했습니다.',
			saveFailed: '스킬을 저장하지 못했습니다.'
		}
	} as const;
