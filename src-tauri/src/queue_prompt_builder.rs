use serde_json::Value;

use crate::{
    queue_execution::{
        AgentExecutionRun, AgentPromptMode, AgentPromptPlan, PersonaRecord, QueueReportLanguage,
        QueueVoteSpec, QueueWorkOrderTask, ReferenceRecord, SkillRecord,
    },
    queue_result_report::{explicit_report_language, has_hangul},
};
pub(crate) struct QueuePromptLabels {
    task_title: &'static str,
    priority: &'static str,
    response_language: &'static str,
    task_body: &'static str,
    selected_skill_instructions: &'static str,
    selected_references: &'static str,
    response_language_ko: &'static str,
    response_language_en: &'static str,
    response_language_es: &'static str,
    response_language_fr: &'static str,
    response_language_zh: &'static str,
    response_language_hi: &'static str,
    response_language_auto: &'static str,
}

pub fn create_agent_prompt_plan(task: &QueueWorkOrderTask) -> AgentPromptPlan {
    AgentPromptPlan {
        mode: if task.kind.as_deref() == Some("direct-message") {
            AgentPromptMode::DirectMessage {
                message: task.body.trim().to_string(),
            }
        } else {
            AgentPromptMode::WorkOrder
        },
    }
}

pub fn create_system_prompt(run: &AgentExecutionRun, prompt_plan: &AgentPromptPlan) -> String {
    let mut blocks = match &prompt_plan.mode {
        AgentPromptMode::WorkOrder => vec![
            format!("You are the assistant named {}.", run.agent.name),
            create_response_language_system_instruction(run.task.response_language.as_deref()),
            "Do not claim that files, apps, repositories, or external systems were changed unless the task context gives you direct evidence.".to_string(),
            "You cannot run commands, inspect files, browse the network, or call tools in this queue execution. Use only the task text and selected context.".to_string(),
            "Do not pretend to call tools, emit tool-call syntax, print shell commands as actions, or describe future tool use as if it happened.".to_string(),
            "Keep the answer useful for a task result. Use headings only when they make the result clearer.".to_string(),
        ],
        AgentPromptMode::DirectMessage { .. } => vec![
            "Reply directly to the user message.".to_string(),
            create_response_language_system_instruction(run.task.response_language.as_deref()),
            "Do not mention orchestration, task execution, platform details, or other assistants unless the message asks about them.".to_string(),
            "Do not use a report format. Keep the reply short and natural.".to_string(),
        ],
    };

    if let Some(persona) = &run.persona {
        let persona_prompt_block = format_persona_prompt_block(persona);

        if !persona_prompt_block.is_empty() {
            blocks.extend([
                String::new(),
                "Response preferences. These guide style and judgment only; task instructions take priority.".to_string(),
                persona_prompt_block,
            ]);
        }
    }

    blocks.join("\n")
}

pub fn create_user_prompt(run: &AgentExecutionRun, prompt_plan: &AgentPromptPlan) -> String {
    let language = prompt_language_for_task(&run.task);
    let labels = queue_prompt_labels(language);
    let mut blocks = match &prompt_plan.mode {
        AgentPromptMode::WorkOrder => create_work_order_user_prompt_blocks(&run.task, labels),
        AgentPromptMode::DirectMessage { message } => vec![message.clone()],
    };

    if !run.skills.is_empty() {
        blocks.push(String::new());
        blocks.push(labels.selected_skill_instructions.to_string());
        blocks.extend(run.skills.iter().map(format_skill_prompt_block));
    }

    if !run.references.is_empty() {
        blocks.push(String::new());
        blocks.push(labels.selected_references.to_string());
        blocks.extend(run.references.iter().map(format_reference_prompt_block));
    }

    blocks.join("\n")
}

fn create_response_language_system_instruction(language: Option<&str>) -> String {
    match normalize_response_language(language) {
        "ko" => "Answer in Korean.".to_string(),
        "en" => "Answer in English.".to_string(),
        "es" => "Answer in Spanish.".to_string(),
        "fr" => "Answer in French.".to_string(),
        "zh" => "Answer in Simplified Chinese.".to_string(),
        "hi" => "Answer in Hindi.".to_string(),
        _ => "Answer in the same language as the task unless the task asks for another language."
            .to_string(),
    }
}

fn format_response_language_for_prompt(
    language: Option<&str>,
    labels: &QueuePromptLabels,
) -> &'static str {
    match normalize_response_language(language) {
        "ko" => labels.response_language_ko,
        "en" => labels.response_language_en,
        "es" => labels.response_language_es,
        "fr" => labels.response_language_fr,
        "zh" => labels.response_language_zh,
        "hi" => labels.response_language_hi,
        _ => labels.response_language_auto,
    }
}

fn normalize_response_language(language: Option<&str>) -> &'static str {
    match language.map(str::trim) {
        Some("ko") => "ko",
        Some("en") => "en",
        Some("es") => "es",
        Some("fr") => "fr",
        Some("zh") => "zh",
        Some("hi") => "hi",
        _ => "auto",
    }
}

pub(crate) fn create_work_order_user_prompt_blocks(
    task: &QueueWorkOrderTask,
    labels: &QueuePromptLabels,
) -> Vec<String> {
    let language = prompt_language_for_task(task);
    let mut blocks = vec![
        format!("{}: {}", labels.task_title, task.title),
        format!(
            "{}: {}",
            labels.priority,
            task.priority.as_deref().unwrap_or("normal")
        ),
        format!(
            "{}: {}",
            labels.response_language,
            format_response_language_for_prompt(task.response_language.as_deref(), labels)
        ),
        String::new(),
        format!("{}:", labels.task_body),
        task.body.clone(),
    ];

    if task.kind.as_deref() == Some("vote") {
        if let Some(vote) = &task.vote {
            blocks.push(String::new());
            blocks.push(create_vote_task_prompt(vote, language));
        }
    } else {
        blocks.push(String::new());
        blocks.push(create_work_order_response_format_prompt(task, language));
    }

    blocks
}

fn create_work_order_response_format_prompt(
    task: &QueueWorkOrderTask,
    language: QueueReportLanguage,
) -> String {
    let response_format = normalize_response_format(task.response_format.as_deref());

    if response_format == "writing-draft" {
        return create_writing_draft_response_format_prompt(language);
    }

    if response_format == "revision-draft" {
        return create_revision_draft_response_format_prompt(language);
    }

    match language {
        QueueReportLanguage::Ko => {
            let (format_label, strengths_label, recommendations_label, cautions_label) =
                response_format_labels_ko(response_format);

            [
                "응답 형식:".to_string(),
                format!("형식: {format_label}"),
                "마크다운이나 설명 문장을 붙이지 말고 JSON 객체 하나만 반환하세요.".to_string(),
                format!(
                    r#"{{"summary":"핵심 결론 한 문장","strengths":["{strengths_label}"],"recommendations":["{recommendations_label}"],"cautions":["{cautions_label}"]}}"#
                ),
                "규칙:".to_string(),
                "- summary는 비워두지 마세요.".to_string(),
                "- strengths, recommendations, cautions는 각각 1~5개의 짧은 항목으로 작성하세요."
                    .to_string(),
                "- 해당 항목이 없으면 빈 배열을 사용하세요.".to_string(),
                "- 사용자가 요청한 응답 언어를 유지하세요.".to_string(),
                "- 증거가 제공되지 않은 확인은 수행한 것처럼 말하지 말고, 해당 한계를 summary나 cautions 안에 적으세요.".to_string(),
                "- 응답은 JSON 객체 하나로 시작하고 끝나야 합니다. 첫 문자는 여는 중괄호(`{`), 마지막 문자는 닫는 중괄호(`}`)여야 합니다.".to_string(),
                "- 응답 형식 위반: 마크다운 제목, 글머리표 목록, JSON 코드블록 표식(세 개의 백틱 뒤에 json), 설명문, 셸 명령, `cat ...`, `rg ...`, `<tool_call>`, `<tool_calls_section>`, `functions.Bash` 같은 토큰.".to_string(),
                "- 위반 예시는 절대 출력하지 말고, JSON 문자열 값 안에도 도구 호출 토큰을 넣지 마세요.".to_string(),
            ]
            .join("\n")
        }
        QueueReportLanguage::En => {
            let (format_label, strengths_label, recommendations_label, cautions_label) =
                response_format_labels_en(response_format);

            [
                "Response format:".to_string(),
                format!("Format: {format_label}"),
                "Return exactly one JSON object. Do not wrap it in Markdown or add prose outside it."
                    .to_string(),
                format!(
                    r#"{{"summary":"One-sentence conclusion","strengths":["{strengths_label}"],"recommendations":["{recommendations_label}"],"cautions":["{cautions_label}"]}}"#
                ),
                "Rules:".to_string(),
                "- Keep summary non-empty.".to_string(),
                "- Keep strengths, recommendations, and cautions to 1-5 short items each."
                    .to_string(),
                "- Use an empty array when a section has no items.".to_string(),
                "- Use the requested response language.".to_string(),
                "- If evidence was not provided, do not claim you checked it; put that limitation inside summary or cautions.".to_string(),
                "- The response must start and end as one JSON object: first character `{`, last character `}`. Do not add text before or after it.".to_string(),
                "- Format violations: Markdown headings, bullet lists, JSON code-fence markers (three backticks followed by json), explanatory prose, shell commands, `cat ...`, `rg ...`, `<tool_call>`, `<tool_calls_section>`, or `functions.Bash` tokens.".to_string(),
                "- Never output those violation examples, and do not put tool-call tokens inside JSON string values.".to_string(),
            ]
            .join("\n")
        }
    }
}

fn normalize_response_format(value: Option<&str>) -> &'static str {
    match value {
        Some("pros-cons") => "pros-cons",
        Some("feature-proposal") => "feature-proposal",
        Some("execution-plan") => "execution-plan",
        Some("code-review") => "code-review",
        Some("risk-assessment") => "risk-assessment",
        Some("comparison-table") => "comparison-table",
        Some("decision-memo") => "decision-memo",
        Some("bug-analysis") => "bug-analysis",
        Some("writing-draft") => "writing-draft",
        Some("revision-draft") => "revision-draft",
        _ => "general",
    }
}

fn create_writing_draft_response_format_prompt(language: QueueReportLanguage) -> String {
    match language {
        QueueReportLanguage::Ko => [
            "응답 형식:".to_string(),
            "형식: 글쓰기 초안".to_string(),
            "마크다운이나 설명 문장을 붙이지 말고 JSON 객체 하나만 반환하세요.".to_string(),
            r#"{"summary":"완성 원고 전체","strengths":["문체 또는 참고자료 사용 메모"],"recommendations":["선택적 수정 제안"],"cautions":["출처 공백 또는 가정"]}"#.to_string(),
            "규칙:".to_string(),
            "- summary에는 한 문장 요약이 아니라 사용자가 바로 복사해 쓸 수 있는 완성 원고를 넣으세요.".to_string(),
            "- 작업에서 문단 수, 문단당 문장 수, 어투, 독자, 시점, 언어, 형식, 금지 표현을 지정하면 그대로 따르세요.".to_string(),
            "- 참고자료가 제공되면 그 내용만 사실 근거로 사용하고, 없는 사실을 꾸며내지 마세요.".to_string(),
            "- strengths에는 문체 선택, 참고자료 반영 방식, 중요한 근거를 1~5개로 적으세요.".to_string(),
            "- recommendations에는 더 강하게/짧게/부드럽게 고칠 수 있는 선택지를 0~5개로 적으세요.".to_string(),
            "- cautions에는 출처 공백, 확인이 필요한 사실, 추정한 조건을 적고 없으면 빈 배열을 사용하세요.".to_string(),
            "- 응답은 JSON 객체 하나로 시작하고 끝나야 합니다. 첫 문자는 여는 중괄호(`{`), 마지막 문자는 닫는 중괄호(`}`)여야 합니다.".to_string(),
        ]
        .join("\n"),
        QueueReportLanguage::En => [
            "Response format:".to_string(),
            "Format: Writing draft".to_string(),
            "Return exactly one JSON object. Do not wrap it in Markdown or add prose outside it."
                .to_string(),
            r#"{"summary":"Finished draft","strengths":["Style or source note"],"recommendations":["Optional revision option"],"cautions":["Source gap or assumption"]}"#.to_string(),
            "Rules:".to_string(),
            "- Put the finished draft in summary, not a one-sentence abstract.".to_string(),
            "- Obey requested paragraph count, sentences per paragraph, tone, audience, point of view, language, format, and forbidden phrases.".to_string(),
            "- If references are provided, use only them as factual support and do not invent unsupported facts.".to_string(),
            "- Put 1-5 notes about style choices, reference usage, or key evidence in strengths.".to_string(),
            "- Put 0-5 optional revision options in recommendations.".to_string(),
            "- Put source gaps, facts to verify, or assumptions in cautions, or use an empty array when none apply.".to_string(),
            "- The response must start and end as one JSON object: first character `{`, last character `}`. Do not add text before or after it.".to_string(),
        ]
        .join("\n"),
    }
}

fn create_revision_draft_response_format_prompt(language: QueueReportLanguage) -> String {
    match language {
        QueueReportLanguage::Ko => [
            "응답 형식:".to_string(),
            "형식: 퇴고본".to_string(),
            "마크다운이나 설명 문장을 붙이지 말고 JSON 객체 하나만 반환하세요.".to_string(),
            r#"{"summary":"퇴고한 글 전체","strengths":["적용한 퇴고 방향"],"recommendations":["추가 수정 제안"],"cautions":["의미 변화 또는 확인점"]}"#.to_string(),
            "규칙:".to_string(),
            "- summary에는 한 문장 요약이 아니라 사용자가 바로 복사해 쓸 수 있는 퇴고본 전체를 넣으세요.".to_string(),
            "- 작업 본문에 선택된 퇴고 옵션이 있으면 그 옵션을 함께 적용하되, 서로 충돌하면 원래 의미 보존을 우선하세요.".to_string(),
            "- 참고자료가 제공되면 사실 확인과 보강에만 사용하고, 없는 사실을 꾸며내지 마세요.".to_string(),
            "- strengths에는 실제로 적용한 목적, 어투, 구조, 형식 수정 방향을 1~5개로 적으세요.".to_string(),
            "- recommendations에는 더 과감하게 바꿀 수 있는 추가 퇴고 선택지를 0~5개로 적으세요.".to_string(),
            "- cautions에는 의미가 달라질 수 있는 부분, 확인이 필요한 사실, 선택한 어투의 부작용을 적고 없으면 빈 배열을 사용하세요.".to_string(),
            "- 응답은 JSON 객체 하나로 시작하고 끝나야 합니다. 첫 문자는 여는 중괄호(`{`), 마지막 문자는 닫는 중괄호(`}`)여야 합니다.".to_string(),
        ]
        .join("\n"),
        QueueReportLanguage::En => [
            "Response format:".to_string(),
            "Format: Revision draft".to_string(),
            "Return exactly one JSON object. Do not wrap it in Markdown or add prose outside it."
                .to_string(),
            r#"{"summary":"Revised text","strengths":["Applied revision choice"],"recommendations":["Further revision option"],"cautions":["Meaning change or check"]}"#.to_string(),
            "Rules:".to_string(),
            "- Put the full revised text in summary, not a one-sentence abstract.".to_string(),
            "- Apply the checked revision options from the task body; when options conflict, preserve the original meaning first.".to_string(),
            "- If references are provided, use them only for factual checks or support and do not invent unsupported facts.".to_string(),
            "- Put 1-5 notes about applied purpose, tone, structure, or format changes in strengths.".to_string(),
            "- Put 0-5 optional further revision directions in recommendations.".to_string(),
            "- Put possible meaning changes, facts to verify, or tone tradeoffs in cautions, or use an empty array when none apply.".to_string(),
            "- The response must start and end as one JSON object: first character `{`, last character `}`. Do not add text before or after it.".to_string(),
        ]
        .join("\n"),
    }
}

fn response_format_labels_ko(
    format: &str,
) -> (&'static str, &'static str, &'static str, &'static str) {
    match format {
        "pros-cons" => (
            "장단점 분석",
            "장점 또는 찬성 근거",
            "판단 또는 권고",
            "단점 또는 반대 근거",
        ),
        "feature-proposal" => (
            "기능 제안",
            "기능 가치 또는 근거",
            "도입할 기능",
            "주의점 또는 제외할 범위",
        ),
        "execution-plan" => (
            "실행 계획",
            "성공 조건 또는 전제",
            "실행 단계",
            "위험 또는 확인할 항목",
        ),
        "code-review" => (
            "코드 리뷰",
            "좋은 점 또는 유지할 부분",
            "수정 제안",
            "문제점 또는 회귀 위험",
        ),
        "risk-assessment" => (
            "리스크 평가",
            "완화 요인 또는 안전한 조건",
            "대응 조치",
            "주요 위험 또는 실패 조건",
        ),
        "comparison-table" => (
            "비교표",
            "비교 기준",
            "비교 결과 또는 선택안",
            "결정 변수 또는 주의점",
        ),
        "decision-memo" => (
            "의사결정 메모",
            "결정 근거",
            "결정 사항 또는 다음 행동",
            "후속 확인 또는 되돌릴 조건",
        ),
        "bug-analysis" => (
            "버그 분석",
            "확인된 사실",
            "수정 방향",
            "재현 조건 또는 회귀 위험",
        ),
        "writing-draft" => (
            "글쓰기 초안",
            "문체 또는 참고자료 메모",
            "수정 제안",
            "출처 공백 또는 가정",
        ),
        "revision-draft" => (
            "퇴고본",
            "적용한 퇴고 방향",
            "추가 수정 제안",
            "의미 변화 또는 확인점",
        ),
        _ => (
            "일반 보고",
            "장점 또는 판단 근거",
            "제안 또는 다음 행동",
            "주의점, 리스크, 확인할 항목",
        ),
    }
}

fn response_format_labels_en(
    format: &str,
) -> (&'static str, &'static str, &'static str, &'static str) {
    match format {
        "pros-cons" => (
            "Pros and cons",
            "Pro or supporting reason",
            "Decision or recommendation",
            "Con or opposing reason",
        ),
        "feature-proposal" => (
            "Feature proposal",
            "Feature value or rationale",
            "Feature to add",
            "Caution or non-goal",
        ),
        "execution-plan" => (
            "Execution plan",
            "Success condition or assumption",
            "Execution step",
            "Risk or check",
        ),
        "code-review" => (
            "Code review",
            "Positive or safe area",
            "Fix recommendation",
            "Issue or regression risk",
        ),
        "risk-assessment" => (
            "Risk assessment",
            "Mitigation or safe condition",
            "Response action",
            "Key risk or failure condition",
        ),
        "comparison-table" => (
            "Comparison table",
            "Comparison criterion",
            "Comparison result or option",
            "Decision factor or caution",
        ),
        "decision-memo" => (
            "Decision memo",
            "Decision rationale",
            "Decision item or next action",
            "Follow-up check or reversal condition",
        ),
        "bug-analysis" => (
            "Bug analysis",
            "Confirmed fact",
            "Fix direction",
            "Reproduction condition or regression risk",
        ),
        "writing-draft" => (
            "Writing draft",
            "Style or source note",
            "Revision option",
            "Source gap or assumption",
        ),
        "revision-draft" => (
            "Revision draft",
            "Applied revision choice",
            "Further revision option",
            "Meaning change or check",
        ),
        _ => (
            "General report",
            "Strength or supporting reason",
            "Recommendation or next action",
            "Risk, assumption, or check",
        ),
    }
}

fn create_vote_task_prompt(vote: &QueueVoteSpec, language: QueueReportLanguage) -> String {
    let options = vote
        .options
        .iter()
        .map(|option| {
            let description = option
                .description
                .as_deref()
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(|value| format!(" - {value}"))
                .unwrap_or_default();

            format!("- {}: {}{}", option.id, option.label, description)
        })
        .collect::<Vec<_>>()
        .join("\n");
    let criteria = if vote.criteria.is_empty() {
        "- Overall fit for the question".to_string()
    } else {
        vote.criteria
            .iter()
            .map(|criterion| format!("- {criterion}"))
            .collect::<Vec<_>>()
            .join("\n")
    };
    let (
        intro,
        json_only,
        choice_id_instruction,
        json_shape,
        question,
        options_label,
        criteria_label,
    ) = match language {
        QueueReportLanguage::Ko => (
            "이 작업은 선택 투표입니다. 선택지 하나만 고르세요.",
            "Markdown으로 감싸지 말고 JSON 객체 하나만 반환하세요.",
            "제공된 choiceId 값 중 하나만 사용하세요.",
            "JSON 형식:",
            "질문",
            "선택지",
            "평가 기준",
        ),
        QueueReportLanguage::En => (
            "This is a selection vote. Choose exactly one option.",
            "Return only one JSON object. Do not wrap it in Markdown.",
            "Use exactly one of the provided choiceId values.",
            "JSON shape:",
            "Question",
            "Options",
            "Criteria",
        ),
    };

    [
        intro,
        json_only,
        choice_id_instruction,
        json_shape,
        "{\"choiceId\":\"option-id\",\"reason\":\"short reason\",\"risks\":[\"risk if any\"]}",
        "",
        &format!("{question}: {}", vote.question),
        "",
        &format!("{options_label}:"),
        &options,
        "",
        &format!("{criteria_label}:"),
        &criteria,
    ]
    .join("\n")
}

fn prompt_language_for_task(task: &QueueWorkOrderTask) -> QueueReportLanguage {
    if let Some(language) = explicit_report_language(task.response_language.as_deref()) {
        return language;
    }

    if has_hangul(&format!("{} {}", task.title, task.body)) {
        QueueReportLanguage::Ko
    } else {
        QueueReportLanguage::En
    }
}

pub(crate) fn queue_prompt_labels(language: QueueReportLanguage) -> &'static QueuePromptLabels {
    static KO_LABELS: QueuePromptLabels = QueuePromptLabels {
        task_title: "작업 제목",
        priority: "우선순위",
        response_language: "응답 언어",
        task_body: "작업 내용",
        selected_skill_instructions: "선택된 스킬 지시문:",
        selected_references: "선택된 참고자료:",
        response_language_ko: "한국어",
        response_language_en: "영어",
        response_language_es: "스페인어",
        response_language_fr: "프랑스어",
        response_language_zh: "중국어(간체)",
        response_language_hi: "힌디어",
        response_language_auto: "작업 언어에 맞춤",
    };
    static EN_LABELS: QueuePromptLabels = QueuePromptLabels {
        task_title: "Task title",
        priority: "Priority",
        response_language: "Response language",
        task_body: "Task body",
        selected_skill_instructions: "Selected skill instructions:",
        selected_references: "Selected references:",
        response_language_ko: "Korean",
        response_language_en: "English",
        response_language_es: "Spanish",
        response_language_fr: "French",
        response_language_zh: "Simplified Chinese",
        response_language_hi: "Hindi",
        response_language_auto: "Match the task language",
    };

    match language {
        QueueReportLanguage::Ko => &KO_LABELS,
        QueueReportLanguage::En => &EN_LABELS,
    }
}

fn format_persona_prompt_block(persona: &PersonaRecord) -> String {
    let mut blocks = vec!["Response preferences:".to_string()];

    if !persona.description.trim().is_empty() {
        blocks.push(format!(
            "- Additional description: {}",
            persona.description.trim()
        ));
    }

    if persona.styles.is_object() {
        blocks.extend(format_persona_style_preferences(&persona.styles));
    }

    if persona.spectrums.is_object() {
        blocks.push(String::new());
        blocks.push("Work preferences:".to_string());
        blocks.extend(format_persona_spectrum_preferences(&persona.spectrums));
    }

    if !persona.instructions.trim().is_empty() {
        blocks.push(String::new());
        blocks.push("Additional persona instructions:".to_string());
        blocks.push(persona.instructions.trim().to_string());
    }

    blocks.join("\n")
}

fn format_persona_style_preferences(styles: &Value) -> Vec<String> {
    let mut preferences = Vec::new();

    if let Some(value) = styles.get("responseLength").and_then(Value::as_str) {
        preferences.push(
            match value {
                "short" => "- Response length: Prefer concise answers.",
                "detailed" => "- Response length: Prefer detailed answers when useful.",
                _ => "- Response length: Prefer balanced-length answers.",
            }
            .to_string(),
        );
    }

    if let Some(value) = styles.get("emotionalTone").and_then(Value::as_str) {
        preferences.push(
            match value {
                "calm" => "- Tone: Keep the tone calm.",
                "bright" => "- Tone: Keep the tone upbeat.",
                _ => "- Tone: Keep the tone neutral.",
            }
            .to_string(),
        );
    }

    if let Some(value) = styles.get("judgmentAttitude").and_then(Value::as_str) {
        preferences.push(
            match value {
                "critical" => "- Judgment style: Be critical and point out weaknesses.",
                "supportive" => "- Judgment style: Be supportive while staying accurate.",
                _ => "- Judgment style: Balance strengths, weaknesses, and tradeoffs.",
            }
            .to_string(),
        );
    }

    if let Some(value) = styles.get("confidenceLevel").and_then(Value::as_str) {
        preferences.push(
            match value {
                "cautious" => "- Confidence style: State uncertainty carefully.",
                "decisive" => "- Confidence style: Be decisive when evidence is enough.",
                _ => "- Confidence style: Use realistic confidence.",
            }
            .to_string(),
        );
    }

    if let Some(value) = styles.get("socialDistance").and_then(Value::as_str) {
        preferences.push(
            match value {
                "formal" => "- Social distance: Use a formal style.",
                "friendly" => "- Social distance: Use a friendly style.",
                _ => "- Social distance: Use a comfortable style.",
            }
            .to_string(),
        );
    }

    preferences
}

fn format_persona_spectrum_preferences(spectrums: &Value) -> Vec<String> {
    let mut preferences = Vec::new();

    if let Some(level) = spectrum_level(spectrums, "developmentApproach") {
        preferences.push(match level {
            1 => "- Development approach: Prefer fixing structure, boundaries, and data flow before implementation.",
            2 => "- Development approach: Prefer setting direction and rules before implementation.",
            4 => "- Development approach: Prefer quick experiments and decisions from observed results.",
            5 => "- Development approach: Prefer working behavior first and refine structure later.",
            _ => "- Development approach: Prefer iterating between small prototypes and design.",
        }.to_string());
    }

    if let Some(level) = spectrum_level(spectrums, "qualityStandard") {
        preferences.push(match level {
            1 => "- Stability and quality: Treat validation, types, tests, and security very strictly.",
            2 => "- Stability and quality: Prioritize production-grade stability.",
            4 => "- Stability and quality: Prefer shipping first and fixing issues during operation when acceptable.",
            5 => "- Stability and quality: Prioritize speed and experimentation when failure cost is acceptable.",
            _ => "- Stability and quality: Balance risk and speed according to the situation.",
        }.to_string());
    }

    if let Some(level) = spectrum_level(spectrums, "structureBias") {
        preferences.push(
            match level {
                1 => "- Structure preference: Treat boundaries, layers, and module relationships as critical.",
                2 => "- Structure preference: Consistently consider reuse and maintainability.",
                4 => "- Structure preference: Prefer direct implementation over abstraction.",
                5 => "- Structure preference: Prioritize fast connection and visible results over structure.",
                _ => "- Structure preference: Add structure only where it clearly helps.",
            }
            .to_string(),
        );
    }

    if let Some(level) = spectrum_level(spectrums, "productivityStrategy") {
        preferences.push(
            match level {
                1 => "- Productivity strategy: Minimize dependencies and automation; keep direct control.",
                2 => "- Productivity strategy: Introduce only necessary tools carefully.",
                4 => "- Productivity strategy: Automate repetitive work wherever practical.",
                5 => "- Productivity strategy: Combine multiple tools, agents, and pipelines as an operator.",
                _ => "- Productivity strategy: Use automation pragmatically for productivity.",
            }
            .to_string(),
        );
    }

    if let Some(level) = spectrum_level(spectrums, "operationPhilosophy") {
        preferences.push(
            match level {
                1 => "- Operations and deployment: Delay changes when failure risk is unclear.",
                2 => "- Operations and deployment: Deploy after sufficient validation and observability.",
                4 => "- Operations and deployment: Use operational fixes and urgent patches actively when needed.",
                5 => "- Operations and deployment: Treat services as systems that evolve continuously.",
                _ => "- Operations and deployment: Prefer small frequent changes and monitor stability.",
            }
            .to_string(),
        );
    }

    if let Some(level) = spectrum_level(spectrums, "collaborationPhilosophy") {
        preferences.push(
            match level {
                1 => "- Collaboration and context: Use documents, rules, and contracts as collaboration anchors.",
                2 => "- Collaboration and context: Make intent and standards explicit.",
                4 => "- Collaboration and context: Prefer fast collaboration based on experience and judgment.",
                5 => "- Collaboration and context: Give goals and let people or AI agents decide execution details.",
                _ => "- Collaboration and context: Share core context and leave room for autonomy.",
            }
            .to_string(),
        );
    }

    preferences
}

fn spectrum_level(spectrums: &Value, key: &str) -> Option<u8> {
    let value = spectrums.get(key)?;

    if let Some(level) = value.as_u64() {
        return u8::try_from(level).ok();
    }

    value.as_str()?.parse::<u8>().ok()
}

fn format_skill_prompt_block(skill: &SkillRecord) -> String {
    format!("- {}\n{}", skill.name, skill.instructions)
}

fn format_reference_prompt_block(reference: &ReferenceRecord) -> String {
    let source_url = reference.source_url.trim();
    let content = reference.content.trim();
    let tags = reference
        .tags
        .iter()
        .map(|tag| tag.trim())
        .filter(|tag| !tag.is_empty())
        .collect::<Vec<_>>();
    let mut lines = vec![format!("- Title: {}", reference.title)];

    if !source_url.is_empty() {
        lines.push(format!("  Source URL: {source_url}"));
    }

    if !tags.is_empty() {
        lines.push(format!("  Tags: {}", tags.join(", ")));
    }

    if content.is_empty() {
        if !source_url.is_empty() {
            lines.push(
                "  Note: Only the URL is available; do not claim facts from the linked page unless the task supplies its contents."
                    .to_string(),
            );
        }
    } else {
        lines.push("  Content:".to_string());
        lines.extend(content.lines().map(|line| format!("    {line}")));
    }

    lines.join("\n")
}
