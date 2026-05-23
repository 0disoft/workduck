use std::{
    env, fs, io,
    path::{Path, PathBuf},
    sync::OnceLock,
    time::Duration,
};

use serde::{Deserialize, Serialize};
use serde_json::Value;
use time::{OffsetDateTime, format_description::well_known::Rfc3339};

use crate::{path_display::display_path, system_environment::read_cli_user_environment_variable};

const QUEUE_DIRECTORY_NAME: &str = "queue";
const REPORTS_DIRECTORY_NAME: &str = "reports";
const REPORT_FILE_SUFFIX: &str = ".workduck-report.json";
const CHAT_COMPLETION_TIMEOUT_SECONDS: u64 = 120;
const CHAT_COMPLETION_MAX_ATTEMPTS: u8 = 3;
const CHAT_COMPLETION_RETRY_BASE_DELAY_MILLIS: u64 = 500;
const CHAT_COMPLETION_RETRY_MAX_DELAY_MILLIS: u64 = 2_000;
const CHAT_COMPLETION_RETRY_JITTER_MILLIS: u64 = 250;
const MAX_PROMPT_LENGTH: usize = 48_000;
const MAX_MODEL_LENGTH: usize = 160;

static QUEUE_HTTP_CLIENT: OnceLock<reqwest::Client> = OnceLock::new();

pub fn create_queue_http_client() -> Result<reqwest::Client, QueueExecutionErrorDetail> {
    reqwest::Client::builder()
        .timeout(Duration::from_secs(CHAT_COMPLETION_TIMEOUT_SECONDS))
        .build()
        .map_err(|_| {
            QueueExecutionErrorDetail::new(
                "agent-request-invalid",
                "HTTP 클라이언트를 만들지 못했습니다.",
            )
        })
}

pub fn queue_http_client() -> Result<reqwest::Client, QueueExecutionErrorDetail> {
    if let Some(client) = QUEUE_HTTP_CLIENT.get() {
        return Ok(client.clone());
    }

    let client = create_queue_http_client()?;
    let _ = QUEUE_HTTP_CLIENT.set(client.clone());

    Ok(QUEUE_HTTP_CLIENT
        .get()
        .cloned()
        .unwrap_or(client))
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QueueExecutionErrorDetail {
    pub code: &'static str,
    pub message: String,
}

impl QueueExecutionErrorDetail {
    fn new(code: &'static str, message: impl Into<String>) -> Self {
        Self { code, message: message.into() }
    }
}


#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QueueEntityRef {
    pub id: String,
    pub kind: String,
    pub label: String,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QueueWorkOrder {
    pub schema_version: String,
    pub r#ref: QueueEntityRef,
    pub status: String,
    pub created_at: String,
    #[serde(default)]
    pub tasks: Vec<QueueWorkOrderTask>,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QueueWorkOrderTask {
    pub id: String,
    #[serde(default)]
    pub kind: Option<String>,
    pub title: String,
    pub body: String,
    #[serde(default)]
    pub priority: Option<String>,
    #[serde(default)]
    pub response_language: Option<String>,
    #[serde(default)]
    pub project_ids: Vec<String>,
    #[serde(default)]
    pub agent_ids: Vec<String>,
    #[serde(default)]
    pub skill_ids: Vec<String>,
    #[serde(default)]
    pub reference_ids: Vec<String>,
    #[serde(default)]
    pub vote: Option<QueueVoteSpec>,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QueueVoteSpec {
    pub question: String,
    #[serde(default)]
    pub options: Vec<QueueVoteOption>,
    #[serde(default)]
    pub criteria: Vec<String>,
    #[serde(default)]
    pub response_kind: Option<String>,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QueueVoteOption {
    pub id: String,
    pub label: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentRegistry {
    #[serde(default)]
    pub agents: Vec<AgentRecord>,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentRecord {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub environment_secret_id: Option<String>,
    #[serde(default)]
    pub persona_id: Option<String>,
    #[serde(default)]
    pub execution_provider: Option<String>,
    #[serde(default)]
    pub model_id: Option<String>,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EnvironmentVault {
    pub workspace_id: String,
    #[serde(default)]
    pub secrets: Vec<EnvironmentSecretRecord>,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EnvironmentSecretRecord {
    pub id: String,
    pub name: String,
    pub kind: String,
    #[serde(default)]
    pub tags: Vec<String>,
    pub value: String,
}

#[derive(Clone)]
pub struct ResolvedSecret {
    pub name: String,
    pub tags: Vec<String>,
    pub value: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PersonaRegistry {
    #[serde(default)]
    pub personas: Vec<PersonaRecord>,
}

#[derive(Clone, Deserialize, Serialize)]
pub struct PersonaRecord {
    pub id: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub instructions: String,
    #[serde(default)]
    pub styles: Value,
    #[serde(default)]
    pub spectrums: Value,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillRegistry {
    #[serde(default)]
    pub skills: Vec<SkillRecord>,
}

#[derive(Clone, Deserialize, Serialize)]
pub struct SkillRecord {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub instructions: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReferenceRegistry {
    #[serde(default)]
    pub references: Vec<ReferenceRecord>,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReferenceRecord {
    pub id: String,
    pub title: String,
    #[serde(default)]
    pub content: String,
    #[serde(default)]
    pub source_url: String,
}

#[derive(Clone)]
pub struct AgentExecutionRun {
    pub task: QueueWorkOrderTask,
    pub agent: AgentRecord,
    pub secret: ResolvedSecret,
    pub persona: Option<PersonaRecord>,
    pub provider: String,
    pub model: String,
    pub skills: Vec<SkillRecord>,
    pub references: Vec<ReferenceRecord>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QueueExecutionRequest {
    pub work_order: QueueWorkOrder,
    #[serde(default)]
    pub agents: Vec<AgentRecord>,
    #[serde(default)]
    pub vault: Option<EnvironmentVault>,
    #[serde(default)]
    pub skills: Vec<SkillRecord>,
    #[serde(default)]
    pub references: Vec<ReferenceRecord>,
    #[serde(default)]
    pub personas: Vec<PersonaRecord>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QueueExecutionCommandResult {
    pub ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub report: Option<QueueResultReport>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<&'static str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
}

#[derive(Deserialize)]
struct ChatCompletionResponseBody {
    choices: Vec<ChatChoice>,
}

#[derive(Deserialize)]
struct ChatChoice {
    message: ChatChoiceMessage,
}

#[derive(Deserialize)]
struct ChatChoiceMessage {
    content: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QueueVoteResult {
    pub question: String,
    pub options: Vec<QueueVoteOption>,
    pub ballot: QueueVoteBallot,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QueueVoteBallot {
    pub choice_id: String,
    pub reason: String,
    pub risks: Vec<String>,
    pub parse_status: String,
}



pub enum AgentPromptMode {
    WorkOrder,
    DirectMessage { message: String },
}

pub struct AgentPromptPlan {
    pub mode: AgentPromptMode,
}

pub struct AgentRunOutput {
    pub task: QueueWorkOrderTask,
    pub agent_name: String,
    pub content: String,
    pub execution_attempts: Vec<AgentExecutionAttempt>,
}

#[derive(Debug, Clone)]
pub struct AgentRunFailure {
    pub code: &'static str,
    pub message: String,
    pub execution_attempts: Vec<AgentExecutionAttempt>,
}

impl AgentRunFailure {
    fn new(code: &'static str, message: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
            execution_attempts: Vec::new(),
        }
    }
}

pub enum AgentRunOutcome {
    Success(AgentRunOutput),
    Failure {
        task: QueueWorkOrderTask,
        agent_name: String,
        code: &'static str,
        message: String,
        execution_attempts: Vec<AgentExecutionAttempt>,
    },
}



#[derive(Clone, Copy)]
pub enum QueueReportLanguage {
    Ko,
    En,
}

struct QueuePromptLabels {
    task_title: &'static str,
    priority: &'static str,
    response_language: &'static str,
    task_body: &'static str,
    selected_skill_instructions: &'static str,
    selected_references: &'static str,
    response_language_ko: &'static str,
    response_language_en: &'static str,
    response_language_auto: &'static str,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QueueResultReport {
    pub schema_version: &'static str,
    pub r#ref: QueueEntityRef,
    pub status: &'static str,
    pub created_at: String,
    pub agent_name: String,
    pub tasks: Vec<QueueResultReportTask>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QueueResultReportTask {
    pub id: String,
    pub title: String,
    pub summary: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub structured_response: Option<QueueStructuredResponse>,
    pub files_changed: Vec<String>,
    pub verification: Vec<String>,
    pub risks: Vec<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub execution_attempts: Vec<AgentExecutionAttempt>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub response_language: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub vote: Option<QueueVoteResult>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QueueStructuredResponse {
    pub summary: String,
    pub strengths: Vec<String>,
    pub recommendations: Vec<String>,
    pub cautions: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentExecutionAttempt {
    pub attempt: u8,
    pub code: &'static str,
    pub message: String,
    pub retryable: bool,
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

#[tauri::command]
pub async fn execute_queue_work_order(
    request: QueueExecutionRequest,
) -> QueueExecutionCommandResult {
    if request.work_order.tasks.is_empty() {
        return queue_execution_failed(QueueExecutionErrorDetail::new(
            "queue-execution-no-task",
            "Work order has no task.",
        ));
    }

    let Some(vault) = request.vault.as_ref() else {
        return queue_execution_failed(QueueExecutionErrorDetail::new(
            "queue-execution-vault-locked",
            "Environment vault is locked.",
        ));
    };

    let runs = match create_execution_runs(
        &request.work_order,
        &request.agents,
        Some(vault),
        &request.personas,
        &request.skills,
        &request.references,
    ) {
        Ok(runs) => runs,
        Err(error) => return queue_execution_failed(error),
    };
    let client = match queue_http_client() {
        Ok(client) => client,
        Err(error) => return queue_execution_failed(error),
    };
    let mut handles = Vec::new();

    for run in runs {
        let task = run.task.clone();
        let agent_name = run.agent.name.clone();
        let client = client.clone();

        handles.push(tauri::async_runtime::spawn(async move {
            match run_agent_prompt(run, client).await {
                Ok(output) => AgentRunOutcome::Success(output),
                Err(error) => AgentRunOutcome::Failure {
                    task,
                    agent_name,
                    code: error.code,
                    message: error.message,
                    execution_attempts: error.execution_attempts,
                },
            }
        }));
    }

    let mut outputs = Vec::new();

    for handle in handles {
        let output = match handle.await {
            Ok(output) => output,
            Err(_) => {
                return queue_execution_failed(QueueExecutionErrorDetail::new(
                    "agent-execution-failed",
                    "Agent response handling was interrupted.",
                ));
            }
        };
        outputs.push(output);
    }

    match create_result_report(&request.work_order, outputs) {
        Ok(report) => QueueExecutionCommandResult {
            ok: true,
            report: Some(report),
            error: None,
            message: None,
        },
        Err(error) => queue_execution_failed(error),
    }
}

fn queue_execution_failed(error: QueueExecutionErrorDetail) -> QueueExecutionCommandResult {
    QueueExecutionCommandResult {
        ok: false,
        report: None,
        error: Some(error.code),
        message: Some(error.message),
    }
}

pub fn create_system_prompt(run: &AgentExecutionRun, prompt_plan: &AgentPromptPlan) -> String {
    let mut blocks = match &prompt_plan.mode {
        AgentPromptMode::WorkOrder => vec![
            format!("You are the assistant named {}.", run.agent.name),
            create_response_language_system_instruction(run.task.response_language.as_deref()),
            "Do not claim that files, apps, repositories, or external systems were changed unless the task context gives you direct evidence.".to_string(),
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
        _ => labels.response_language_auto,
    }
}

fn normalize_response_language(language: Option<&str>) -> &'static str {
    match language.map(str::trim) {
        Some("ko") => "ko",
        Some("en") => "en",
        _ => "auto",
    }
}

fn create_work_order_user_prompt_blocks(
    task: &QueueWorkOrderTask,
    labels: &QueuePromptLabels,
) -> Vec<String> {
    let language = prompt_language_for_task(task);
    let mut blocks = vec![
        format!("{}: {}", labels.task_title, task.title),
        format!("{}: {}", labels.priority, task.priority.as_deref().unwrap_or("normal")),
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
        blocks.push(create_work_order_response_format_prompt(language));
    }

    blocks
}

fn create_work_order_response_format_prompt(language: QueueReportLanguage) -> String {
    match language {
        QueueReportLanguage::Ko => [
            "응답 형식:",
            "마크다운이나 설명 문장을 붙이지 말고 JSON 객체 하나만 반환하세요.",
            r#"{"summary":"핵심 결론 한 문장","strengths":["장점 또는 판단 근거"],"recommendations":["제안 또는 다음 행동"],"cautions":["주의점, 리스크, 확인할 항목"]}"#,
            "규칙:",
            "- summary는 비워두지 마세요.",
            "- strengths, recommendations, cautions는 각각 1~5개의 짧은 항목으로 작성하세요.",
            "- 해당 항목이 없으면 빈 배열을 사용하세요.",
            "- 사용자가 요청한 응답 언어를 유지하세요.",
        ]
        .join("\n"),
        QueueReportLanguage::En => [
            "Response format:",
            "Return exactly one JSON object. Do not wrap it in Markdown or add prose outside it.",
            r#"{"summary":"One-sentence conclusion","strengths":["Strength or supporting reason"],"recommendations":["Recommendation or next action"],"cautions":["Risk, assumption, or check"]}"#,
            "Rules:",
            "- Keep summary non-empty.",
            "- Keep strengths, recommendations, and cautions to 1-5 short items each.",
            "- Use an empty array when a section has no items.",
            "- Use the requested response language.",
        ]
        .join("\n"),
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
    let (intro, json_only, choice_id_instruction, json_shape, question, options_label, criteria_label) =
        match language {
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

fn queue_prompt_labels(language: QueueReportLanguage) -> &'static QueuePromptLabels {
    static KO_LABELS: QueuePromptLabels = QueuePromptLabels {
        task_title: "작업 제목",
        priority: "우선순위",
        response_language: "응답 언어",
        task_body: "작업 내용",
        selected_skill_instructions: "선택된 스킬 지시문:",
        selected_references: "선택된 참고자료:",
        response_language_ko: "한국어",
        response_language_en: "영어",
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
        response_language_auto: "Match the task language",
    };

    match language {
        QueueReportLanguage::Ko => &KO_LABELS,
        QueueReportLanguage::En => &EN_LABELS,
    }
}

fn format_persona_prompt_block(persona: &PersonaRecord) -> String {
    let mut blocks = Vec::new();

    if !persona.description.trim().is_empty() {
        blocks.push(format!(
            "Additional guidance: {}",
            persona.description.trim()
        ));
    }

    if persona.styles.is_object() {
        blocks.extend(format_persona_style_preferences(&persona.styles));
    }

    if persona.spectrums.is_object() {
        blocks.extend(format_persona_spectrum_preferences(&persona.spectrums));
    }

    if !persona.instructions.trim().is_empty() {
        blocks.push(format!(
            "Additional user-written persona guidance: {}",
            persona.instructions.trim()
        ));
    }

    blocks.join("\n")
}

fn format_persona_style_preferences(styles: &Value) -> Vec<String> {
    let mut preferences = Vec::new();

    if let Some(value) = styles.get("responseLength").and_then(Value::as_str) {
        preferences.push(
            match value {
                "short" => "Response length: keep replies concise.",
                "detailed" => "Response length: include enough detail for careful review.",
                _ => "Response length: use a moderate amount of detail.",
            }
            .to_string(),
        );
    }

    if let Some(value) = styles.get("emotionalTone").and_then(Value::as_str) {
        preferences.push(
            match value {
                "calm" => "Tone: stay calm and steady.",
                "bright" => "Tone: sound warm and upbeat.",
                _ => "Tone: stay neutral and clear.",
            }
            .to_string(),
        );
    }

    if let Some(value) = styles.get("judgmentAttitude").and_then(Value::as_str) {
        preferences.push(
            match value {
                "critical" => "Judgment: examine assumptions critically and call out risks.",
                "supportive" => "Judgment: be supportive while still being truthful.",
                _ => "Judgment: balance critique with practical next steps.",
            }
            .to_string(),
        );
    }

    if let Some(value) = styles.get("confidenceLevel").and_then(Value::as_str) {
        preferences.push(
            match value {
                "cautious" => "Confidence: be careful with uncertainty and avoid overstatement.",
                "decisive" => "Confidence: be decisive when the evidence is sufficient.",
                _ => {
                    "Confidence: state conclusions realistically and name uncertainty when needed."
                }
            }
            .to_string(),
        );
    }

    if let Some(value) = styles.get("socialDistance").and_then(Value::as_str) {
        preferences.push(
            match value {
                "formal" => "Social style: keep a professional distance.",
                "friendly" => "Social style: be friendly and approachable.",
                _ => "Social style: be comfortable and direct.",
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
            1 => "Development approach: settle structure, boundaries, and data flow before implementation.",
            2 => "Development approach: set direction and rules before implementation.",
            4 => "Development approach: move quickly through experiments and learn from results.",
            5 => "Development approach: prioritize working behavior and fast iteration.",
            _ => "Development approach: balance small prototypes with design adjustment.",
        }.to_string());
    }

    if let Some(level) = spectrum_level(spectrums, "qualityStandard") {
        preferences.push(match level {
            1 => "Stability and quality: treat validation, types, tests, and security very strictly.",
            2 => "Stability and quality: prefer production-grade reliability.",
            4 => "Stability and quality: prioritize shipping and handle issues operationally when needed.",
            5 => "Stability and quality: prioritize speed and experiments over failure cost.",
            _ => "Stability and quality: balance risk and speed by context.",
        }.to_string());
    }

    if let Some(level) = spectrum_level(spectrums, "structureBias") {
        preferences.push(
            match level {
                1 => "Structure: treat boundaries, layers, and module relationships as critical.",
                2 => "Structure: consistently consider reuse and maintainability.",
                4 => "Structure: prefer direct implementation over abstraction.",
                5 => "Structure: prioritize quick connection and results over structure.",
                _ => "Structure: add only as much structure as the work needs.",
            }
            .to_string(),
        );
    }

    if let Some(level) = spectrum_level(spectrums, "productivityStrategy") {
        preferences.push(
            match level {
                1 => "Productivity: minimize dependencies and automation to keep direct control.",
                2 => "Productivity: add only necessary tools carefully.",
                4 => "Productivity: automate repeat work whenever practical.",
                5 => "Productivity: combine tools, agents, and pipelines to operate the work.",
                _ => "Productivity: use automation when it improves practical throughput.",
            }
            .to_string(),
        );
    }

    if let Some(level) = spectrum_level(spectrums, "operationPhilosophy") {
        preferences.push(
            match level {
                1 => "Operations: delay release when failure risk is visible.",
                2 => "Operations: release after enough verification and observability.",
                4 => "Operations: use operational fixes and hotfixes actively.",
                5 => "Operations: treat services as systems that evolve continuously.",
                _ => "Operations: prefer small changes and watch stability.",
            }
            .to_string(),
        );
    }

    if let Some(level) = spectrum_level(spectrums, "collaborationPhilosophy") {
        preferences.push(
            match level {
                1 => "Collaboration: rely on documents, rules, and contracts.",
                2 => "Collaboration: make intent and standards explicit.",
                4 => "Collaboration: prefer fast collaboration based on experience and judgment.",
                5 => "Collaboration: work autonomously from the goal when possible.",
                _ => "Collaboration: share core context and handle the rest pragmatically.",
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
    let body = if reference.content.trim().is_empty() {
        reference.source_url.trim()
    } else {
        reference.content.trim()
    };

    format!("- {}\n{}", reference.title, body)
}

pub fn create_result_report(
    work_order: &QueueWorkOrder,
    outputs: Vec<AgentRunOutcome>,
) -> Result<QueueResultReport, QueueExecutionErrorDetail> {
    let created_at = current_timestamp()?;
    let tasks = outputs
        .iter()
        .map(|output| create_result_report_task(work_order, output))
        .collect();

    Ok(QueueResultReport {
        schema_version: "workduck.queue-result-report/v1",
        r#ref: QueueEntityRef {
            id: format!("queue-result-report_{}", unique_token()),
            kind: "queue-result-report".to_string(),
            label: report_label(
                &work_order.r#ref.label,
                report_language_for_work_order(work_order),
            ),
        },
        status: "active",
        created_at,
        agent_name: outputs
            .iter()
            .map(agent_name_from_outcome)
            .collect::<Vec<_>>()
            .join(", "),
        tasks,
    })
}

fn create_result_report_task(
    work_order: &QueueWorkOrder,
    outcome: &AgentRunOutcome,
) -> QueueResultReportTask {
    match outcome {
        AgentRunOutcome::Success(output) => create_success_report_task(work_order, output),
        AgentRunOutcome::Failure {
            task,
            agent_name,
            code,
            message,
            execution_attempts,
        } => {
            let language = report_language_for_task(task, work_order);

            QueueResultReportTask {
                id: format!("task_{}_{}", slugify(agent_name), unique_token()),
                title: format!("{agent_name}: {}", task.title),
                summary: response_not_received(message, language),
                structured_response: None,
                files_changed: Vec::new(),
                verification: vec![response_failed(agent_name, code, language)],
                risks: vec![response_excluded_risk(language).to_string()],
                execution_attempts: execution_attempts.clone(),
                response_language: task.response_language.clone(),
                vote: None,
            }
        }
    }
}

fn create_success_report_task(
    work_order: &QueueWorkOrder,
    output: &AgentRunOutput,
) -> QueueResultReportTask {
    let language = report_language_for_task(&output.task, work_order);
    let vote = if output.task.kind.as_deref() == Some("vote") {
        output
            .task
            .vote
            .as_ref()
            .map(|spec| parse_vote_result(&output.content, spec))
    } else {
        None
    };
    let vote_summary = vote
        .as_ref()
        .filter(|result| result.ballot.parse_status == "parsed")
        .map(|result| result.ballot.reason.trim())
        .filter(|reason| !reason.is_empty())
        .map(ToString::to_string);
    let mut verification = vec![response_received(&output.agent_name, language)];
    let mut risks = Vec::new();

    if !output.execution_attempts.is_empty() {
        verification.push(response_retry_succeeded(
            output.execution_attempts.len(),
            language,
        ));
    }

    if let Some(vote) = &vote {
        if vote.ballot.parse_status == "parsed" {
            verification.push(vote_parsed(&vote.ballot.choice_id, language));
        } else {
            verification.push(vote_unmatched(language).to_string());
            risks.push(vote_invalid_choice_risk(language).to_string());
        }

        risks.extend(vote.ballot.risks.clone());
    }

    let structured_response =
        if vote.is_none() && output.task.kind.as_deref() != Some("direct-message") {
            parse_structured_agent_response(&output.content)
        } else {
            None
        };
    let structured_summary = structured_response
        .as_ref()
        .map(|response| format_structured_response_summary(response, language));

    QueueResultReportTask {
        id: format!("task_{}_{}", slugify(&output.agent_name), unique_token()),
        title: format!("{}: {}", output.agent_name, output.task.title),
        summary: vote_summary
            .or(structured_summary)
            .unwrap_or_else(|| output.content.clone()),
        structured_response,
        files_changed: Vec::new(),
        verification,
        risks,
        execution_attempts: output.execution_attempts.clone(),
        response_language: output.task.response_language.clone(),
        vote,
    }
}

fn parse_structured_agent_response(content: &str) -> Option<QueueStructuredResponse> {
    for candidate in json_object_candidates(content) {
        let Ok(parsed) = serde_json::from_str::<Value>(&candidate) else {
            continue;
        };

        let summary = read_optional_text(parsed.get("summary"));
        let strengths = read_limited_text_array(parsed.get("strengths"), 5);
        let recommendations = read_limited_text_array(parsed.get("recommendations"), 5);
        let cautions = read_limited_text_array(parsed.get("cautions"), 5);

        if summary.trim().is_empty()
            && strengths.is_empty()
            && recommendations.is_empty()
            && cautions.is_empty()
        {
            continue;
        }

        return Some(QueueStructuredResponse {
            summary,
            strengths,
            recommendations,
            cautions,
        });
    }

    None
}

fn read_limited_text_array(value: Option<&Value>, limit: usize) -> Vec<String> {
    read_text_array(value)
        .into_iter()
        .map(|item| item.trim().to_string())
        .filter(|item| !item.is_empty())
        .take(limit)
        .collect()
}

fn format_structured_response_summary(
    response: &QueueStructuredResponse,
    language: QueueReportLanguage,
) -> String {
    let labels = match language {
        QueueReportLanguage::Ko => ("요약", "장점/근거", "제안", "주의점"),
        QueueReportLanguage::En => (
            "Summary",
            "Strengths/Evidence",
            "Recommendations",
            "Cautions",
        ),
    };
    let mut sections = Vec::new();

    if !response.summary.trim().is_empty() {
        sections.push(format!("{}: {}", labels.0, response.summary.trim()));
    }

    push_structured_summary_section(&mut sections, labels.1, &response.strengths);
    push_structured_summary_section(&mut sections, labels.2, &response.recommendations);
    push_structured_summary_section(&mut sections, labels.3, &response.cautions);

    sections.join("\n\n")
}

fn push_structured_summary_section(sections: &mut Vec<String>, label: &str, items: &[String]) {
    if items.is_empty() {
        return;
    }

    let body = items
        .iter()
        .map(|item| format!("- {item}"))
        .collect::<Vec<_>>()
        .join("\n");

    sections.push(format!("{label}:\n{body}"));
}

pub fn report_language_for_work_order(work_order: &QueueWorkOrder) -> QueueReportLanguage {
    if let Some(language) = work_order
        .tasks
        .iter()
        .find_map(|task| explicit_report_language(task.response_language.as_deref()))
    {
        return language;
    }

    let text = format!(
        "{} {}",
        work_order.r#ref.label,
        work_order
            .tasks
            .iter()
            .map(|task| task.body.as_str())
            .collect::<Vec<_>>()
            .join(" ")
    );

    if has_hangul(&text) {
        QueueReportLanguage::Ko
    } else {
        QueueReportLanguage::En
    }
}

fn report_language_for_task(
    task: &QueueWorkOrderTask,
    work_order: &QueueWorkOrder,
) -> QueueReportLanguage {
    if let Some(language) = explicit_report_language(task.response_language.as_deref()) {
        return language;
    }

    if has_hangul(&format!("{} {}", task.title, task.body)) {
        QueueReportLanguage::Ko
    } else {
        report_language_for_work_order(work_order)
    }
}

fn explicit_report_language(value: Option<&str>) -> Option<QueueReportLanguage> {
    match value {
        Some("ko") => Some(QueueReportLanguage::Ko),
        Some("en") => Some(QueueReportLanguage::En),
        _ => None,
    }
}

fn has_hangul(value: &str) -> bool {
    value
        .chars()
        .any(|character| ('\u{AC00}'..='\u{D7A3}').contains(&character))
}

fn report_label(work_order_label: &str, language: QueueReportLanguage) -> String {
    match language {
        QueueReportLanguage::Ko => format!("{work_order_label} 결과 보고서"),
        QueueReportLanguage::En => format!("{work_order_label} result report"),
    }
}

fn response_received(agent_name: &str, language: QueueReportLanguage) -> String {
    match language {
        QueueReportLanguage::Ko => format!("{agent_name} 응답 수신"),
        QueueReportLanguage::En => format!("{agent_name} response received"),
    }
}

fn vote_parsed(choice_id: &str, language: QueueReportLanguage) -> String {
    match language {
        QueueReportLanguage::Ko => format!("투표 응답 해석됨: {choice_id}"),
        QueueReportLanguage::En => format!("Vote parsed: {choice_id}"),
    }
}

fn vote_unmatched(language: QueueReportLanguage) -> &'static str {
    match language {
        QueueReportLanguage::Ko => "투표 응답을 선택지와 연결하지 못했습니다.",
        QueueReportLanguage::En => "Vote response could not be matched to an option.",
    }
}

fn vote_invalid_choice_risk(language: QueueReportLanguage) -> &'static str {
    match language {
        QueueReportLanguage::Ko => "투표 응답에 유효한 choiceId가 없습니다.",
        QueueReportLanguage::En => "The vote response did not contain a valid choiceId.",
    }
}

fn response_not_received(error: &str, language: QueueReportLanguage) -> String {
    match language {
        QueueReportLanguage::Ko => format!("응답을 받지 못했습니다: {error}"),
        QueueReportLanguage::En => format!("Response was not received: {error}"),
    }
}

fn response_failed(agent_name: &str, error: &str, language: QueueReportLanguage) -> String {
    match language {
        QueueReportLanguage::Ko => format!("{agent_name} 응답 실패: {error}"),
        QueueReportLanguage::En => format!("{agent_name} response failed: {error}"),
    }
}

fn response_retry_succeeded(attempt_count: usize, language: QueueReportLanguage) -> String {
    match language {
        QueueReportLanguage::Ko => format!("일시 실패 {attempt_count}회 후 응답 수신"),
        QueueReportLanguage::En => {
            format!("Response received after {attempt_count} transient failure(s)")
        }
    }
}

fn response_excluded_risk(language: QueueReportLanguage) -> &'static str {
    match language {
        QueueReportLanguage::Ko => "이 에이전트의 응답은 결과 집계에서 제외해야 합니다.",
        QueueReportLanguage::En => "This agent response should be excluded from result aggregation.",
    }
}

pub fn command_completed(report_path: &Path, language: QueueReportLanguage) -> String {
    match language {
        QueueReportLanguage::Ko => format!("작업 실행 완료: {}", display_path(report_path)),
        QueueReportLanguage::En => format!("Work execution completed: {}", display_path(report_path)),
    }
}

pub fn responses_received(agent_names: &str, language: QueueReportLanguage) -> String {
    match language {
        QueueReportLanguage::Ko => format!("응답 수신: {agent_names}"),
        QueueReportLanguage::En => format!("Responses received: {agent_names}"),
    }
}

fn agent_name_from_outcome(outcome: &AgentRunOutcome) -> &str {
    match outcome {
        AgentRunOutcome::Success(output) => &output.agent_name,
        AgentRunOutcome::Failure { agent_name, .. } => agent_name,
    }
}

fn parse_vote_result(content: &str, spec: &QueueVoteSpec) -> QueueVoteResult {
    QueueVoteResult {
        question: spec.question.clone(),
        options: spec.options.clone(),
        ballot: parse_vote_ballot(content, spec),
    }
}

fn parse_vote_ballot(content: &str, spec: &QueueVoteSpec) -> QueueVoteBallot {
    let Some(record) = parse_vote_json_record(content, spec) else {
        return QueueVoteBallot {
            choice_id: String::new(),
            reason: String::new(),
            risks: Vec::new(),
            parse_status: "unparsed".to_string(),
        };
    };

    let choice_id = read_optional_text(record.get("choiceId"));
    let reason = read_optional_text(record.get("reason"));
    let risks = read_text_array(record.get("risks"));
    let parse_status = if spec.options.iter().any(|option| option.id == choice_id) {
        "parsed"
    } else {
        "invalid-choice"
    };

    QueueVoteBallot {
        choice_id,
        reason,
        risks,
        parse_status: parse_status.to_string(),
    }
}

fn parse_vote_json_record(content: &str, spec: &QueueVoteSpec) -> Option<Value> {
    let mut first_record = None;

    for candidate in json_object_candidates(content) {
        let Ok(parsed) = serde_json::from_str::<Value>(&candidate) else {
            continue;
        };

        if !parsed.is_object() {
            continue;
        }

        if first_record.is_none() {
            first_record = Some(parsed.clone());
        }

        let choice_id = read_optional_text(parsed.get("choiceId"));

        if spec.options.iter().any(|option| option.id == choice_id) {
            return Some(parsed);
        }
    }

    first_record
}

fn json_object_candidates(content: &str) -> Vec<String> {
    let fenced_candidates = fenced_json_object_candidates(content);
    let balanced_candidates = balanced_json_object_candidates(content);

    if fenced_candidates.is_empty() {
        return balanced_candidates;
    }

    let mut candidates = fenced_candidates;

    for candidate in balanced_candidates {
        if !candidates.iter().any(|existing| existing == &candidate) {
            candidates.push(candidate);
        }
    }

    candidates
}

fn fenced_json_object_candidates(content: &str) -> Vec<String> {
    let mut candidates = Vec::new();
    let mut remainder = content;

    while let Some(fence_start) = remainder.find("```") {
        remainder = &remainder[fence_start + 3..];
        let Some(line_end) = remainder.find('\n') else {
            break;
        };

        let info = remainder[..line_end].trim().to_ascii_lowercase();
        remainder = &remainder[line_end + 1..];
        let Some(fence_end) = remainder.find("```") else {
            break;
        };

        if info.is_empty() || info == "json" {
            let fenced_body = remainder[..fence_end].trim();
            candidates.extend(balanced_json_object_candidates(fenced_body));
        }

        remainder = &remainder[fence_end + 3..];
    }

    candidates
}

fn balanced_json_object_candidates(content: &str) -> Vec<String> {
    let mut candidates = Vec::new();

    for (start_index, character) in content.char_indices() {
        if character != '{' {
            continue;
        }

        if let Some(end_index) = find_balanced_json_object_end(content, start_index) {
            let candidate = content[start_index..=end_index].trim().to_string();

            if !candidates.iter().any(|existing| existing == &candidate) {
                candidates.push(candidate);
            }
        }
    }

    candidates
}

fn find_balanced_json_object_end(content: &str, start_index: usize) -> Option<usize> {
    let mut depth = 0usize;
    let mut in_string = false;
    let mut is_escaped = false;

    for (offset, character) in content[start_index..].char_indices() {
        let index = start_index + offset;

        if in_string {
            if is_escaped {
                is_escaped = false;
            } else if character == '\\' {
                is_escaped = true;
            } else if character == '"' {
                in_string = false;
            }

            continue;
        }

        match character {
            '"' => in_string = true,
            '{' => depth += 1,
            '}' => {
                depth = depth.saturating_sub(1);

                if depth == 0 {
                    return Some(index);
                }
            }
            _ => {}
        }
    }

    None
}

#[cfg(test)]
mod tests {
    use super::*;

    fn vote_spec() -> QueueVoteSpec {
        QueueVoteSpec {
            question: "Pick a framework".to_string(),
            options: vec![
                QueueVoteOption {
                    id: "astro".to_string(),
                    label: "Astro".to_string(),
                    description: None,
                },
                QueueVoteOption {
                    id: "svelte".to_string(),
                    label: "Svelte".to_string(),
                    description: None,
                },
            ],
            criteria: Vec::new(),
            response_kind: None,
        }
    }

    #[test]
    fn vote_parser_prefers_fenced_json_over_prose_braces() {
        let content = r#"I considered option {A}, then chose:
```json
{"choiceId":"svelte","reason":"better fit","risks":["team familiarity"]}
```
"#;

        let ballot = parse_vote_ballot(content, &vote_spec());

        assert_eq!(ballot.parse_status, "parsed");
        assert_eq!(ballot.choice_id, "svelte");
        assert_eq!(ballot.reason, "better fit");
        assert_eq!(ballot.risks, vec!["team familiarity"]);
    }

    #[test]
    fn vote_parser_scans_until_a_valid_choice_object() {
        let content = r#"
{"choiceId":"ember","reason":"not available"}
Final answer:
{"choiceId":"astro","reason":"static content fit","risks":[]}
"#;

        let ballot = parse_vote_ballot(content, &vote_spec());

        assert_eq!(ballot.parse_status, "parsed");
        assert_eq!(ballot.choice_id, "astro");
        assert_eq!(ballot.reason, "static content fit");
    }

    #[test]
    fn vote_parser_keeps_invalid_choice_visible_when_no_valid_choice_exists() {
        let content = r#"{"choiceId":"ember","reason":"unsupported option","risks":[]}"#;

        let ballot = parse_vote_ballot(content, &vote_spec());

        assert_eq!(ballot.parse_status, "invalid-choice");
        assert_eq!(ballot.choice_id, "ember");
    }

    #[test]
    fn work_order_prompt_includes_a_structured_response_format() {
        let task = QueueWorkOrderTask {
            id: "task_1".to_string(),
            kind: None,
            title: "에이전트 참모진들 의견참고".to_string(),
            body: "플랫폼 대안을 검토해줘".to_string(),
            priority: Some("normal".to_string()),
            response_language: Some("ko".to_string()),
            project_ids: Vec::new(),
            agent_ids: Vec::new(),
            skill_ids: Vec::new(),
            reference_ids: Vec::new(),
            vote: None,
        };

        let prompt =
            create_work_order_user_prompt_blocks(&task, queue_prompt_labels(QueueReportLanguage::Ko))
                .join("\n");

        assert!(prompt.contains("응답 형식:"));
        assert!(prompt.contains(r#""summary""#));
        assert!(prompt.contains(r#""strengths""#));
        assert!(prompt.contains(r#""recommendations""#));
        assert!(prompt.contains(r#""cautions""#));
    }

    #[test]
    fn structured_response_parser_prefers_json_over_wrapping_text() {
        let content = r#"
Here is my answer:
```json
{"summary":"Astro fits best","strengths":["Static content"],"recommendations":["Prototype Astro"],"cautions":["Team familiarity"]}
```
"#;

        let response = parse_structured_agent_response(content).expect("structured response");

        assert_eq!(response.summary, "Astro fits best");
        assert_eq!(response.strengths, vec!["Static content"]);
        assert_eq!(response.recommendations, vec!["Prototype Astro"]);
        assert_eq!(response.cautions, vec!["Team familiarity"]);
    }

    #[test]
    fn vote_prompt_keeps_json_only_response_format() {
        let task = QueueWorkOrderTask {
            id: "task_1".to_string(),
            kind: Some("vote".to_string()),
            title: "프레임워크 선정".to_string(),
            body: "하나를 골라줘".to_string(),
            priority: Some("normal".to_string()),
            response_language: Some("ko".to_string()),
            project_ids: Vec::new(),
            agent_ids: Vec::new(),
            skill_ids: Vec::new(),
            reference_ids: Vec::new(),
            vote: Some(vote_spec()),
        };

        let prompt =
            create_work_order_user_prompt_blocks(&task, queue_prompt_labels(QueueReportLanguage::Ko))
                .join("\n");

        assert!(prompt.contains("JSON 객체 하나만 반환하세요."));
        assert!(!prompt.contains("응답 형식:"));
    }

    #[test]
    fn result_report_file_slug_uses_ascii_segments_only() {
        assert_eq!(slugify("커밋 정리: workduck 결과 보고서"), "workduck");
        assert_eq!(slugify("GPT5.4미니"), "gpt5-4");
        assert_eq!(slugify("결과 보고서"), "");
    }
}

fn read_optional_text(value: Option<&Value>) -> String {
    value
        .and_then(Value::as_str)
        .map(normalize_inline_text)
        .unwrap_or_default()
}

fn read_text_array(value: Option<&Value>) -> Vec<String> {
    let Some(items) = value.and_then(Value::as_array) else {
        return Vec::new();
    };

    items
        .iter()
        .filter_map(Value::as_str)
        .map(normalize_inline_text)
        .filter(|item| !item.is_empty())
        .collect()
}

fn normalize_inline_text(value: &str) -> String {
    value.split_whitespace().collect::<Vec<_>>().join(" ")
}

pub fn create_execution_runs(
    work_order: &QueueWorkOrder,
    agents: &[AgentRecord],
    vault: Option<&EnvironmentVault>,
    personas: &[PersonaRecord],
    skills: &[SkillRecord],
    references: &[ReferenceRecord],
) -> Result<Vec<AgentExecutionRun>, QueueExecutionErrorDetail> {
    let mut runs = Vec::new();

    for task in &work_order.tasks {
        if task.agent_ids.is_empty() {
            return Err(QueueExecutionErrorDetail {
                code: "work-order-agent-required",
                message: format!("작업 '{}'에 에이전트가 지정되어 있지 않습니다.", task.title),
            });
        }

        for agent_id in &task.agent_ids {
            let agent = agents
                .iter()
                .find(|candidate| candidate.id == *agent_id)
                .cloned()
                .ok_or_else(|| QueueExecutionErrorDetail {
                    code: "agent-not-found",
                    message: format!("에이전트를 찾지 못했습니다: {agent_id}"),
                })?;
            let vault_secret = agent
                .environment_secret_id
                .as_deref()
                .and_then(|secret_id| {
                    vault.and_then(|vault| {
                        vault
                            .secrets
                            .iter()
                            .find(|candidate| candidate.id == secret_id)
                            .cloned()
                    })
                });
            let provider = match &vault_secret {
                Some(secret) => resolve_agent_provider(&agent, secret)?,
                None => resolve_agent_provider_without_secret(&agent)?,
            };
            let secret = match vault_secret {
                Some(secret) => ResolvedSecret {
                    name: secret.name,
                    tags: secret.tags,
                    value: secret.value,
                },
                None => resolve_provider_environment_secret(&provider, &agent)?,
            };
            let model = resolve_agent_model(&provider, &agent, &secret)?;
            let persona = agent
                .persona_id
                .as_ref()
                .and_then(|persona_id| personas.iter().find(|persona| persona.id == *persona_id))
                .cloned();

            runs.push(AgentExecutionRun {
                task: task.clone(),
                agent,
                secret,
                persona,
                provider,
                model,
                skills: select_records(&task.skill_ids, skills, |skill| &skill.id),
                references: select_records(&task.reference_ids, references, |reference| {
                    &reference.id
                }),
            });
        }
    }

    if runs.is_empty() {
        return Err(QueueExecutionErrorDetail {
            code: "work-order-empty",
            message: "실행할 작업이 없습니다.".to_string(),
        });
    }

    Ok(runs)
}

fn resolve_provider_environment_secret(
    provider: &str,
    agent: &AgentRecord,
) -> Result<ResolvedSecret, QueueExecutionErrorDetail> {
    let env_names: &[&str] = match provider {
        "openrouter" => &["OPENROUTER_API_KEY", "OPEN_ROUTER_API_KEY"],
        "openai" => &["OPENAI_API_KEY"],
        "deepseek" => &["DEEPSEEK_API_KEY"],
        _ => &[],
    };

    for env_name in env_names {
        if let Ok(value) = env::var(env_name) {
            if !value.trim().is_empty() {
                return Ok(ResolvedSecret {
                    name: (*env_name).to_string(),
                    tags: vec!["llm".to_string(), provider.to_string()],
                    value,
                });
            }
        }

        if let Some(value) = read_cli_user_environment_variable(env_name) {
            return Ok(ResolvedSecret {
                name: (*env_name).to_string(),
                tags: vec!["llm".to_string(), provider.to_string()],
                value,
            });
        }
    }

    Err(QueueExecutionErrorDetail {
        code: "agent-api-key-env-missing",
        message: format!(
            "에이전트 '{}'에 사용할 {provider} API 키를 찾지 못했습니다. WORKDUCK_VAULT_PASSWORD를 설정하거나 제공자 환경변수를 설정하세요.",
            agent.name
        ),
    })
}

fn select_records<T: Clone>(ids: &[String], records: &[T], id_of: impl Fn(&T) -> &str) -> Vec<T> {
    records
        .iter()
        .filter(|record| ids.iter().any(|id| id == id_of(record)))
        .cloned()
        .collect()
}

pub async fn run_agent_prompt(
    run: AgentExecutionRun,
    client: reqwest::Client,
) -> Result<AgentRunOutput, AgentRunFailure> {
    if run.secret.value.trim().is_empty() {
        return Err(AgentRunFailure::new(
            "agent-api-key-required",
            format!("에이전트 '{}'의 API 키가 비어 있습니다.", run.agent.name),
        ));
    }

    if run.model.trim().is_empty() || run.model.len() > MAX_MODEL_LENGTH {
        return Err(AgentRunFailure::new(
            "agent-model-required",
            format!("에이전트 '{}'의 모델이 올바르지 않습니다.", run.agent.name),
        ));
    }

    let prompt_plan = create_agent_prompt_plan(&run.task);
    let system_prompt = create_system_prompt(&run, &prompt_plan);
    let user_prompt = create_user_prompt(&run, &prompt_plan);

    if system_prompt.len() > MAX_PROMPT_LENGTH || user_prompt.len() > MAX_PROMPT_LENGTH {
        return Err(AgentRunFailure::new(
            "agent-prompt-too-large",
            format!(
                "에이전트 '{}'로 보낼 프롬프트가 너무 깁니다.",
                run.agent.name
            ),
        ));
    }

    let endpoint = provider_endpoint(&run.provider).ok_or_else(|| {
        AgentRunFailure::new(
            "agent-provider-unsupported",
            format!("지원하지 않는 제공자입니다: {}", run.provider),
        )
    })?;
    let body = serde_json::json!({
        "model": run.model,
        "messages": [
            { "role": "system", "content": system_prompt },
            { "role": "user", "content": user_prompt }
        ],
        "stream": false
    });

    let mut execution_attempts = Vec::new();

    for attempt in 1..=CHAT_COMPLETION_MAX_ATTEMPTS {
        match send_chat_completion_request(
            &client,
            endpoint,
            run.secret.value.trim(),
            &body,
            &run.agent.name,
        )
        .await
        {
            Ok(content) => {
                return Ok(AgentRunOutput {
                    task: run.task,
                    agent_name: run.agent.name,
                    content,
                    execution_attempts,
                });
            }
            Err(error) => {
                let retryable = is_retryable_agent_error(error.code);

                execution_attempts.push(AgentExecutionAttempt {
                    attempt,
                    code: error.code,
                    message: error.message.clone(),
                    retryable,
                });

                if retryable && attempt < CHAT_COMPLETION_MAX_ATTEMPTS {
                    wait_before_retry(attempt).await;
                    continue;
                }

                return Err(AgentRunFailure {
                    code: error.code,
                    message: error.message,
                    execution_attempts,
                });
            }
        }
    }

    Err(AgentRunFailure {
        code: "agent-provider-unavailable",
        message: format!("에이전트 '{}' 요청에 실패했습니다.", run.agent.name),
        execution_attempts,
    })
}

async fn send_chat_completion_request(
    client: &reqwest::Client,
    endpoint: &str,
    api_key: &str,
    body: &Value,
    agent_name: &str,
) -> Result<String, QueueExecutionErrorDetail> {
    let response = client
        .post(endpoint)
        .bearer_auth(api_key)
        .header(reqwest::header::CONTENT_TYPE, "application/json")
        .header("X-Title", "Workduck")
        .json(body)
        .send()
        .await
        .map_err(|error| QueueExecutionErrorDetail {
            code: if error.is_timeout() {
                "agent-provider-timeout"
            } else {
                "agent-provider-unavailable"
            },
            message: format!("에이전트 '{agent_name}' 요청에 실패했습니다."),
        })?;
    let status = response.status();

    if !status.is_success() {
        return Err(QueueExecutionErrorDetail {
            code: map_http_status(status.as_u16()),
            message: format!("에이전트 '{agent_name}' 요청이 거부되었습니다."),
        });
    }

    let body = response
        .json::<ChatCompletionResponseBody>()
        .await
        .map_err(|_| QueueExecutionErrorDetail {
            code: "agent-response-invalid",
            message: format!("에이전트 '{agent_name}' 응답을 해석하지 못했습니다."),
        })?;
    let content = body
        .choices
        .first()
        .and_then(|choice| choice.message.content.as_deref())
        .map(str::trim)
        .filter(|content| !content.is_empty())
        .ok_or_else(|| QueueExecutionErrorDetail {
            code: "agent-response-empty",
            message: format!("에이전트 '{agent_name}' 응답이 비어 있습니다."),
        })?;

    Ok(content.to_string())
}

async fn wait_before_retry(failed_attempt: u8) {
    let delay = retry_delay(failed_attempt);
    tokio::time::sleep(delay).await;
}

fn retry_delay(failed_attempt: u8) -> Duration {
    let multiplier = 1_u64 << u32::from(failed_attempt.saturating_sub(1));
    let base_delay = CHAT_COMPLETION_RETRY_BASE_DELAY_MILLIS
        .saturating_mul(multiplier)
        .min(CHAT_COMPLETION_RETRY_MAX_DELAY_MILLIS);
    Duration::from_millis(base_delay + retry_jitter_millis(failed_attempt))
}

fn retry_jitter_millis(failed_attempt: u8) -> u64 {
    let timestamp = OffsetDateTime::now_utc().unix_timestamp_nanos() as u64;
    (timestamp ^ u64::from(failed_attempt)) % (CHAT_COMPLETION_RETRY_JITTER_MILLIS + 1)
}

fn is_retryable_agent_error(code: &str) -> bool {
    matches!(
        code,
        "agent-provider-timeout" | "agent-provider-unavailable" | "agent-rate-limited"
    )
}

pub fn validate_work_order(
    work_order: &QueueWorkOrder,
    requested_id: &str,
) -> Result<(), QueueExecutionErrorDetail> {
    if work_order.schema_version != "workduck.queue-work-order/v1"
        || work_order.r#ref.kind != "queue-work-order"
    {
        return Err(QueueExecutionErrorDetail {
            code: "work-order-invalid",
            message: "작업 지시서 형식이 올바르지 않습니다.".to_string(),
        });
    }

    if work_order.r#ref.id != requested_id {
        return Err(QueueExecutionErrorDetail {
            code: "work-order-id-mismatch",
            message: "요청한 작업 ID와 파일 안의 작업 ID가 다릅니다.".to_string(),
        });
    }

    if work_order.status == "archived" {
        return Err(QueueExecutionErrorDetail {
            code: "work-order-archived",
            message: "이미 완료 처리된 작업 지시서입니다.".to_string(),
        });
    }

    Ok(())
}

fn resolve_agent_provider(
    agent: &AgentRecord,
    secret: &EnvironmentSecretRecord,
) -> Result<String, QueueExecutionErrorDetail> {
    if let Some(provider) = agent
        .execution_provider
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        return normalize_provider(provider);
    }

    let secret_profile = normalize_profile_text(
        std::iter::once(secret.name.as_str())
            .chain(std::iter::once(secret.kind.as_str()))
            .chain(secret.tags.iter().map(String::as_str)),
    );

    for provider in ["openrouter", "deepseek", "openai"] {
        if secret_profile.contains(provider) {
            return Ok(provider.to_string());
        }
    }

    let agent_profile = normalize_profile_text(std::iter::once(agent.name.as_str()));

    for provider in ["deepseek", "openrouter", "openai"] {
        if agent_profile.contains(provider) {
            return Ok(provider.to_string());
        }
    }

    Err(QueueExecutionErrorDetail {
        code: "agent-provider-unsupported",
        message: format!("에이전트 '{}'의 제공자를 확인하지 못했습니다.", agent.name),
    })
}

fn resolve_agent_provider_without_secret(agent: &AgentRecord) -> Result<String, QueueExecutionErrorDetail> {
    if let Some(provider) = agent
        .execution_provider
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        return normalize_provider(provider);
    }

    let agent_profile = normalize_profile_text(std::iter::once(agent.name.as_str()));

    for provider in ["deepseek", "openrouter", "openai"] {
        if agent_profile.contains(provider) {
            return Ok(provider.to_string());
        }
    }

    Err(QueueExecutionErrorDetail {
        code: "agent-provider-unsupported",
        message: format!(
            "에이전트 '{}'의 제공자를 확인하지 못했습니다. 보관함 암호를 제공하거나 에이전트 제공자를 지정하세요.",
            agent.name
        ),
    })
}

fn normalize_provider(provider: &str) -> Result<String, QueueExecutionErrorDetail> {
    match provider.to_ascii_lowercase().as_str() {
        "deepseek" | "openai" | "openrouter" => Ok(provider.to_ascii_lowercase()),
        _ => Err(QueueExecutionErrorDetail {
            code: "agent-provider-unsupported",
            message: format!("지원하지 않는 제공자입니다: {provider}"),
        }),
    }
}

fn resolve_agent_model(
    provider: &str,
    agent: &AgentRecord,
    secret: &ResolvedSecret,
) -> Result<String, QueueExecutionErrorDetail> {
    if let Some(model) = agent
        .model_id
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        return Ok(model.to_string());
    }

    let profile = normalize_profile_text(
        std::iter::once(agent.name.as_str())
            .chain(std::iter::once(secret.name.as_str()))
            .chain(secret.tags.iter().map(String::as_str)),
    );

    match crate::queue_model_catalog::resolve_queue_model_fallback(provider, &profile) {
        Some(model) => Ok(model.to_string()),
        None => Err(QueueExecutionErrorDetail {
            code: "agent-provider-unsupported",
            message: format!("지원하지 않는 제공자입니다: {provider}"),
        }),
    }
}

fn provider_endpoint(provider: &str) -> Option<&'static str> {
    match provider {
        "deepseek" => Some("https://api.deepseek.com/chat/completions"),
        "openai" => Some("https://api.openai.com/v1/chat/completions"),
        "openrouter" => Some("https://openrouter.ai/api/v1/chat/completions"),
        _ => None,
    }
}

fn map_http_status(status: u16) -> &'static str {
    match status {
        400 | 404 | 422 => "agent-request-invalid",
        401 | 403 => "agent-authentication-failed",
        429 => "agent-rate-limited",
        500..=599 => "agent-provider-unavailable",
        _ => "agent-provider-rejected",
    }
}

fn normalize_profile_text<'a>(parts: impl Iterator<Item = &'a str>) -> String {
    parts
        .collect::<Vec<_>>()
        .join(" ")
        .to_ascii_lowercase()
        .chars()
        .filter(|character| character.is_ascii_alphanumeric())
        .collect()
}


fn current_timestamp() -> Result<String, QueueExecutionErrorDetail> {
    OffsetDateTime::now_utc()
        .format(&Rfc3339)
        .map_err(|_| QueueExecutionErrorDetail::new("timestamp-format-failed", "현재 시간을 만들지 못했습니다."))
}

fn timestamp_for_file_name() -> Result<String, QueueExecutionErrorDetail> {
    Ok(current_timestamp()?.replace(':', "-").replace('.', "-"))
}

fn unique_token() -> String {
    format!("{:x}", OffsetDateTime::now_utc().unix_timestamp_nanos())
}

fn slugify(value: &str) -> String {
    let slug = value
        .trim()
        .to_ascii_lowercase()
        .chars()
        .map(|character| {
            if character.is_ascii_alphanumeric() || character == '-' || character == '_' {
                character
            } else if character.is_whitespace() {
                '-'
            } else {
                '-'
            }
        })
        .fold(String::new(), |mut slug, character| {
            if character == '-' && slug.ends_with('-') {
                return slug;
            }

            slug.push(character);
            slug
        });

    slug
        .trim_matches('-')
        .trim_matches('_')
        .chars()
        .take(80)
        .collect()
}

fn write_json_file<T: Serialize>(path: &Path, value: &T) -> Result<(), QueueExecutionErrorDetail> {
    let content = serde_json::to_string_pretty(value)
        .map_err(|_| QueueExecutionErrorDetail::new("json-serialize-failed", "JSON으로 변환하지 못했습니다."))?;
    fs::write(path, content).map_err(|error| io_error("file-write-failed", path, error))
}

fn io_error(code: &'static str, path: &Path, error: io::Error) -> QueueExecutionErrorDetail {
    QueueExecutionErrorDetail::new(code, format!("{}: {}", display_path(path), error))
}

pub fn write_result_report(
    workspace_path: &Path,
    report: &QueueResultReport,
) -> Result<PathBuf, QueueExecutionErrorDetail> {
    let reports_dir = workspace_path
        .join(QUEUE_DIRECTORY_NAME)
        .join(REPORTS_DIRECTORY_NAME);
    fs::create_dir_all(&reports_dir)
        .map_err(|error| io_error("report-directory-create-failed", &reports_dir, error))?;
    let label_slug = slugify(&report.r#ref.label);
    let file_name = format!(
        "{}-{}{}",
        timestamp_for_file_name()?,
        if label_slug.is_empty() {
            "report".to_string()
        } else {
            label_slug
        },
        REPORT_FILE_SUFFIX
    );
    let report_path = reports_dir.join(file_name);

    write_json_file(&report_path, report)?;

    fs::canonicalize(&report_path)
        .map_err(|error| io_error("report-path-invalid", &report_path, error))
}
