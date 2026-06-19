use std::{
    collections::HashMap,
    env, fs, io,
    path::{Path, PathBuf},
    sync::{Mutex, OnceLock},
};

use futures_util::future::{AbortHandle, Abortable};
use serde::{Deserialize, Serialize};
use serde_json::Value;

pub use crate::queue_prompt_builder::{
    create_agent_prompt_plan, create_system_prompt, create_user_prompt,
};
pub use crate::queue_provider_client::{
    create_queue_http_client, queue_http_client, run_agent_prompt,
};
pub use crate::queue_result_report::{
    create_result_report, report_language_for_work_order, responses_received,
};

use crate::{
    path_display::display_path,
    queue_execution_identity::{slugify, timestamp_for_file_name},
    system_environment::read_cli_user_environment_variable,
};

const QUEUE_DIRECTORY_NAME: &str = "queue";
const REPORTS_DIRECTORY_NAME: &str = "reports";
const REPORT_FILE_SUFFIX: &str = ".workduck-report.json";

static RUNNING_QUEUE_WORK_ORDERS: OnceLock<Mutex<HashMap<String, RunningQueueWorkOrderExecution>>> =
    OnceLock::new();

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QueueExecutionErrorDetail {
    pub code: &'static str,
    pub message: String,
}

impl QueueExecutionErrorDetail {
    pub(crate) fn new(code: &'static str, message: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
        }
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
    pub response_format: Option<String>,
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
    #[serde(default)]
    pub tags: Vec<String>,
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

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QueueExecutionCancelRequest {
    pub work_order_id: String,
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

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QueueExecutionCancelCommandResult {
    pub ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<&'static str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QueuePromptPreviewRequest {
    pub work_order: QueueWorkOrder,
    #[serde(default)]
    pub agents: Vec<AgentRecord>,
    #[serde(default)]
    pub skills: Vec<SkillRecord>,
    #[serde(default)]
    pub references: Vec<ReferenceRecord>,
    #[serde(default)]
    pub personas: Vec<PersonaRecord>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QueuePromptPreviewCommandResult {
    pub ok: bool,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub previews: Vec<QueuePromptPreview>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<&'static str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QueuePromptPreview {
    pub id: String,
    pub task_id: String,
    pub task_title: String,
    pub agent_id: String,
    pub agent_name: String,
    pub system_prompt: String,
    pub user_prompt: String,
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
    pub(crate) fn new(code: &'static str, message: impl Into<String>) -> Self {
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

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QueueResultReport {
    pub schema_version: &'static str,
    pub r#ref: QueueEntityRef,
    pub status: &'static str,
    pub created_at: String,
    pub agent_name: String,
    pub source_work_order: QueueEntityRef,
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
    pub response_format: Option<String>,
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

#[tauri::command]
pub async fn execute_queue_work_order(
    request: QueueExecutionRequest,
) -> QueueExecutionCommandResult {
    if let Err(error) = validate_executable_work_order_status(&request.work_order) {
        return queue_execution_failed(error);
    }

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

    let _execution_guard = match acquire_queue_work_order_execution(&request.work_order.r#ref.id) {
        Ok(guard) => guard,
        Err(error) => return queue_execution_failed(error),
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
        let (abort_handle, abort_registration) = AbortHandle::new_pair();

        if let Err(error) =
            register_queue_work_order_abort_handle(&request.work_order.r#ref.id, abort_handle)
        {
            return queue_execution_failed(error);
        }

        handles.push(tauri::async_runtime::spawn(async move {
            match Abortable::new(run_agent_prompt(run, client), abort_registration).await {
                Ok(Ok(output)) => AgentRunOutcome::Success(output),
                Ok(Err(error)) => AgentRunOutcome::Failure {
                    task,
                    agent_name,
                    code: error.code,
                    message: error.message,
                    execution_attempts: error.execution_attempts,
                },
                Err(_) => AgentRunOutcome::Failure {
                    task,
                    agent_name,
                    code: "queue-execution-cancelled",
                    message: "작업 실행이 취소되었습니다.".to_string(),
                    execution_attempts: Vec::new(),
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
        if matches!(
            output,
            AgentRunOutcome::Failure {
                code: "queue-execution-cancelled",
                ..
            }
        ) {
            return queue_execution_failed(QueueExecutionErrorDetail::new(
                "queue-execution-cancelled",
                "작업 실행이 취소되었습니다.",
            ));
        }
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

#[tauri::command]
pub fn cancel_queue_work_order_execution(
    request: QueueExecutionCancelRequest,
) -> QueueExecutionCancelCommandResult {
    match cancel_running_queue_work_order_execution(&request.work_order_id) {
        Ok(()) => QueueExecutionCancelCommandResult {
            ok: true,
            error: None,
            message: None,
        },
        Err(error) => QueueExecutionCancelCommandResult {
            ok: false,
            error: Some(error.code),
            message: Some(error.message),
        },
    }
}

#[tauri::command]
pub fn preview_queue_work_order_prompt(
    request: QueuePromptPreviewRequest,
) -> QueuePromptPreviewCommandResult {
    match create_prompt_previews(
        &request.work_order,
        &request.agents,
        &request.personas,
        &request.skills,
        &request.references,
    ) {
        Ok(previews) => QueuePromptPreviewCommandResult {
            ok: true,
            previews,
            error: None,
            message: None,
        },
        Err(error) => QueuePromptPreviewCommandResult {
            ok: false,
            previews: Vec::new(),
            error: Some(error.code),
            message: Some(error.message),
        },
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

#[derive(Debug)]
struct QueueWorkOrderExecutionGuard {
    work_order_id: String,
}

#[derive(Debug, Default)]
struct RunningQueueWorkOrderExecution {
    abort_handles: Vec<AbortHandle>,
    cancel_requested: bool,
}

impl Drop for QueueWorkOrderExecutionGuard {
    fn drop(&mut self) {
        if let Ok(mut running_work_orders) = running_queue_work_orders().lock() {
            running_work_orders.remove(&self.work_order_id);
        }
    }
}

fn acquire_queue_work_order_execution(
    work_order_id: &str,
) -> Result<QueueWorkOrderExecutionGuard, QueueExecutionErrorDetail> {
    let normalized_work_order_id = work_order_id.trim();

    if normalized_work_order_id.is_empty() {
        return Err(QueueExecutionErrorDetail::new(
            "work-order-invalid",
            "작업 지시서 ID가 비어 있습니다.",
        ));
    }

    let mut running_work_orders = running_queue_work_orders().lock().map_err(|_| {
        QueueExecutionErrorDetail::new(
            "agent-execution-failed",
            "작업 실행 상태를 확인하지 못했습니다.",
        )
    })?;

    if running_work_orders.contains_key(normalized_work_order_id) {
        return Err(QueueExecutionErrorDetail::new(
            "work-order-running",
            "이미 실행 중인 작업 지시서입니다.",
        ));
    }

    running_work_orders.insert(
        normalized_work_order_id.to_string(),
        RunningQueueWorkOrderExecution::default(),
    );

    Ok(QueueWorkOrderExecutionGuard {
        work_order_id: normalized_work_order_id.to_string(),
    })
}

fn register_queue_work_order_abort_handle(
    work_order_id: &str,
    abort_handle: AbortHandle,
) -> Result<(), QueueExecutionErrorDetail> {
    let normalized_work_order_id = work_order_id.trim();
    let mut running_work_orders = running_queue_work_orders().lock().map_err(|_| {
        QueueExecutionErrorDetail::new(
            "agent-execution-failed",
            "작업 실행 상태를 확인하지 못했습니다.",
        )
    })?;

    let Some(execution) = running_work_orders.get_mut(normalized_work_order_id) else {
        return Err(QueueExecutionErrorDetail::new(
            "work-order-not-running",
            "실행 중인 작업 지시서를 찾지 못했습니다.",
        ));
    };

    if execution.cancel_requested {
        abort_handle.abort();
    }

    execution.abort_handles.push(abort_handle);

    Ok(())
}

fn cancel_running_queue_work_order_execution(
    work_order_id: &str,
) -> Result<(), QueueExecutionErrorDetail> {
    let normalized_work_order_id = work_order_id.trim();

    if normalized_work_order_id.is_empty() {
        return Err(QueueExecutionErrorDetail::new(
            "work-order-invalid",
            "작업 지시서 ID가 비어 있습니다.",
        ));
    }

    let mut running_work_orders = running_queue_work_orders().lock().map_err(|_| {
        QueueExecutionErrorDetail::new(
            "agent-execution-failed",
            "작업 실행 상태를 확인하지 못했습니다.",
        )
    })?;

    let Some(execution) = running_work_orders.get_mut(normalized_work_order_id) else {
        return Err(QueueExecutionErrorDetail::new(
            "work-order-not-running",
            "실행 중인 작업 지시서를 찾지 못했습니다.",
        ));
    };

    execution.cancel_requested = true;

    for abort_handle in &execution.abort_handles {
        abort_handle.abort();
    }

    Ok(())
}

fn running_queue_work_orders()
-> &'static Mutex<HashMap<String, RunningQueueWorkOrderExecution>> {
    RUNNING_QUEUE_WORK_ORDERS.get_or_init(|| Mutex::new(HashMap::new()))
}

pub fn command_completed(report_path: &Path, language: QueueReportLanguage) -> String {
    match language {
        QueueReportLanguage::Ko => format!("작업 실행 완료: {}", display_path(report_path)),
        QueueReportLanguage::En => {
            format!("Work execution completed: {}", display_path(report_path))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::queue_execution_identity::unique_token;
    use crate::queue_prompt_builder::{create_work_order_user_prompt_blocks, queue_prompt_labels};
    use crate::queue_result_report::create_success_report_task;
    use crate::queue_response_parser::{parse_structured_agent_response, parse_vote_ballot};

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
    fn unique_token_adds_sequence_entropy() {
        let mut tokens = std::collections::HashSet::new();

        for _ in 0..1024 {
            assert!(tokens.insert(unique_token()));
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
            response_format: Some("pros-cons".to_string()),
            project_ids: Vec::new(),
            agent_ids: Vec::new(),
            skill_ids: Vec::new(),
            reference_ids: Vec::new(),
            vote: None,
        };

        let prompt = create_work_order_user_prompt_blocks(
            &task,
            queue_prompt_labels(QueueReportLanguage::Ko),
        )
        .join("\n");

        assert!(prompt.contains("응답 형식:"));
        assert!(prompt.contains("형식: 장단점 분석"));
        assert!(prompt.contains(r#""summary""#));
        assert!(prompt.contains(r#""strengths""#));
        assert!(prompt.contains(r#""recommendations""#));
        assert!(prompt.contains(r#""cautions""#));
        assert!(prompt.contains("첫 문자는 여는 중괄호(`{`), 마지막 문자는 닫는 중괄호(`}`)"));
        assert!(prompt.contains("응답 형식 위반"));
        assert!(prompt.contains("<tool_call>"));
        assert!(prompt.contains("세 개의 백틱 뒤에 json"));
    }

    #[test]
    fn work_order_system_prompt_disallows_fake_tool_use() {
        let run = AgentExecutionRun {
            task: QueueWorkOrderTask {
                id: "task_1".to_string(),
                kind: None,
                title: "릴리스 판단".to_string(),
                body: "파일명을 판단해줘".to_string(),
                priority: Some("normal".to_string()),
                response_language: Some("ko".to_string()),
                response_format: Some("decision-memo".to_string()),
                project_ids: Vec::new(),
                agent_ids: Vec::new(),
                skill_ids: Vec::new(),
                reference_ids: Vec::new(),
                vote: None,
            },
            agent: AgentRecord {
                id: "agent_1".to_string(),
                name: "테스트 에이전트".to_string(),
                environment_secret_id: None,
                persona_id: None,
                execution_provider: Some("openrouter".to_string()),
                model_id: Some("test/model".to_string()),
            },
            secret: ResolvedSecret {
                name: "OPENROUTER_API_KEY".to_string(),
                tags: Vec::new(),
                value: "secret".to_string(),
            },
            persona: None,
            provider: "openrouter".to_string(),
            model: "test/model".to_string(),
            skills: Vec::new(),
            references: Vec::new(),
        };
        let prompt_plan = create_agent_prompt_plan(&run.task);
        let prompt = create_system_prompt(&run, &prompt_plan);

        assert!(prompt.contains("cannot run commands"));
        assert!(prompt.contains("Use only the task text and selected context"));
        assert!(prompt.contains("Do not pretend to call tools"));
    }

    #[test]
    fn prompt_preview_uses_selected_context_without_resolving_secrets() {
        let work_order = QueueWorkOrder {
            schema_version: "workduck.queue-work-order/v1".to_string(),
            r#ref: QueueEntityRef {
                id: "work_order_1".to_string(),
                kind: "queue-work-order".to_string(),
                label: "릴리스 판단".to_string(),
            },
            status: "active".to_string(),
            created_at: "2026-05-27T00:00:00Z".to_string(),
            tasks: vec![QueueWorkOrderTask {
                id: "task_1".to_string(),
                kind: None,
                title: "릴리스 판단".to_string(),
                body: "릴리스해도 되는지 검토해줘".to_string(),
                priority: Some("normal".to_string()),
                response_language: Some("ko".to_string()),
                response_format: Some("decision-memo".to_string()),
                project_ids: Vec::new(),
                agent_ids: vec!["agent_1".to_string()],
                skill_ids: vec!["skill_1".to_string()],
                reference_ids: vec!["reference_1".to_string()],
                vote: None,
            }],
        };
        let agents = vec![AgentRecord {
            id: "agent_1".to_string(),
            name: "검토 에이전트".to_string(),
            environment_secret_id: Some("missing-secret".to_string()),
            persona_id: Some("persona_1".to_string()),
            execution_provider: Some("openrouter".to_string()),
            model_id: Some("test/model".to_string()),
        }];
        let personas = vec![PersonaRecord {
            id: "persona_1".to_string(),
            description: "꼼꼼한 리뷰어".to_string(),
            instructions: "근거를 먼저 확인한다.".to_string(),
            styles: Value::Null,
            spectrums: Value::Null,
        }];
        let skills = vec![SkillRecord {
            id: "skill_1".to_string(),
            name: "Release review".to_string(),
            instructions: "릴리스 위험을 확인한다.".to_string(),
        }];
        let references = vec![ReferenceRecord {
            id: "reference_1".to_string(),
            title: "Release notes".to_string(),
            content: "변경 사항 요약".to_string(),
            source_url: "https://example.com/release".to_string(),
            tags: vec!["release".to_string()],
        }];

        let previews =
            create_prompt_previews(&work_order, &agents, &personas, &skills, &references)
                .expect("prompt previews");

        assert_eq!(previews.len(), 1);
        assert_eq!(previews[0].agent_name, "검토 에이전트");
        assert!(previews[0].system_prompt.contains("검토 에이전트"));
        assert!(previews[0].system_prompt.contains("근거를 먼저 확인한다."));
        assert!(
            previews[0]
                .user_prompt
                .contains("릴리스해도 되는지 검토해줘")
        );
        assert!(previews[0].user_prompt.contains("Release review"));
        assert!(previews[0].user_prompt.contains("변경 사항 요약"));
        assert!(!previews[0].system_prompt.contains("missing-secret"));
        assert!(!previews[0].user_prompt.contains("missing-secret"));
    }

    #[test]
    fn prompt_preview_reports_missing_agent() {
        let work_order = QueueWorkOrder {
            schema_version: "workduck.queue-work-order/v1".to_string(),
            r#ref: QueueEntityRef {
                id: "work_order_1".to_string(),
                kind: "queue-work-order".to_string(),
                label: "릴리스 판단".to_string(),
            },
            status: "active".to_string(),
            created_at: "2026-05-27T00:00:00Z".to_string(),
            tasks: vec![QueueWorkOrderTask {
                id: "task_1".to_string(),
                kind: None,
                title: "릴리스 판단".to_string(),
                body: "릴리스해도 되는지 검토해줘".to_string(),
                priority: Some("normal".to_string()),
                response_language: Some("ko".to_string()),
                response_format: Some("decision-memo".to_string()),
                project_ids: Vec::new(),
                agent_ids: vec!["agent_missing".to_string()],
                skill_ids: Vec::new(),
                reference_ids: Vec::new(),
                vote: None,
            }],
        };

        let error =
            create_prompt_previews(&work_order, &[], &[], &[], &[]).expect_err("missing agent");

        assert_eq!(error.code, "agent-not-found");
    }

    #[test]
    fn work_order_prompt_accepts_bug_analysis_response_format() {
        let task = QueueWorkOrderTask {
            id: "task_1".to_string(),
            kind: None,
            title: "버그 분석".to_string(),
            body: "오류 원인을 분석해줘".to_string(),
            priority: Some("normal".to_string()),
            response_language: Some("ko".to_string()),
            response_format: Some("bug-analysis".to_string()),
            project_ids: Vec::new(),
            agent_ids: Vec::new(),
            skill_ids: Vec::new(),
            reference_ids: Vec::new(),
            vote: None,
        };

        let prompt = create_work_order_user_prompt_blocks(
            &task,
            queue_prompt_labels(QueueReportLanguage::Ko),
        )
        .join("\n");

        assert!(prompt.contains("형식: 버그 분석"));
        assert!(prompt.contains("재현 조건 또는 회귀 위험"));
    }

    #[test]
    fn structured_response_parser_prefers_json_over_wrapping_text() {
        let content = r#"
Here is my answer:
```json
{"summary":"Astro fits best","strengths":["Static content"],"recommendations":["Prototype Astro"],"cautions":["Team familiarity"]}
```
"#;

        let response = parse_structured_agent_response(content, QueueReportLanguage::En)
            .expect("structured response");

        assert_eq!(response.summary, "Astro fits best");
        assert_eq!(response.strengths, vec!["Static content"]);
        assert_eq!(response.recommendations, vec!["Prototype Astro"]);
        assert_eq!(response.cautions, vec!["Team familiarity"]);
    }

    #[test]
    fn structured_response_parser_accepts_korean_section_response() {
        let content = r#"
판단
en-US 표기는 한국어 지원 앱을 영어 전용처럼 보이게 합니다.

장점
- 일반 사용자의 오해 가능성을 줄일 수 있습니다.
- 주 다운로드 대상을 명확히 할 수 있습니다.

결론
- setup.exe를 기본 다운로드로 안내하세요.

위험
- 기존 링크를 확인해야 합니다.
"#;

        let response = parse_structured_agent_response(content, QueueReportLanguage::Ko)
            .expect("structured response");

        assert_eq!(
            response.summary,
            "en-US 표기는 한국어 지원 앱을 영어 전용처럼 보이게 합니다."
        );
        assert_eq!(
            response.strengths,
            vec![
                "일반 사용자의 오해 가능성을 줄일 수 있습니다.",
                "주 다운로드 대상을 명확히 할 수 있습니다."
            ]
        );
        assert_eq!(
            response.recommendations,
            vec!["setup.exe를 기본 다운로드로 안내하세요."]
        );
        assert_eq!(response.cautions, vec!["기존 링크를 확인해야 합니다."]);
    }

    #[test]
    fn malformed_tool_call_response_is_marked_as_unparsed() {
        let work_order = QueueWorkOrder {
            schema_version: "workduck.queue-work-order/v1".to_string(),
            r#ref: QueueEntityRef {
                id: "wo_1".to_string(),
                kind: "queue-work-order".to_string(),
                label: "릴리스 판단".to_string(),
            },
            status: "active".to_string(),
            created_at: "2026-05-24T00:00:00Z".to_string(),
            tasks: Vec::new(),
        };
        let output = AgentRunOutput {
            task: QueueWorkOrderTask {
                id: "task_1".to_string(),
                kind: None,
                title: "릴리스 판단".to_string(),
                body: "파일명을 판단해줘".to_string(),
                priority: Some("normal".to_string()),
                response_language: Some("ko".to_string()),
                response_format: Some("decision-memo".to_string()),
                project_ids: Vec::new(),
                agent_ids: Vec::new(),
                skill_ids: Vec::new(),
                reference_ids: Vec::new(),
                vote: None,
            },
            agent_name: "키미K2.6".to_string(),
            content: "<tool_call_begin> functions.Bash:0 <tool_call_end>".to_string(),
            execution_attempts: Vec::new(),
        };

        let task = create_success_report_task(&work_order, &output);

        assert!(task.structured_response.is_none());
        assert!(task.summary.contains("도구 호출"));
        assert!(
            task.verification
                .iter()
                .any(|item| item.contains("구조화 응답"))
        );
        assert!(
            task.risks
                .iter()
                .any(|item| item.contains("신뢰하지 않아야"))
        );
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
            response_format: Some("general".to_string()),
            project_ids: Vec::new(),
            agent_ids: Vec::new(),
            skill_ids: Vec::new(),
            reference_ids: Vec::new(),
            vote: Some(vote_spec()),
        };

        let prompt = create_work_order_user_prompt_blocks(
            &task,
            queue_prompt_labels(QueueReportLanguage::Ko),
        )
        .join("\n");

        assert!(prompt.contains("JSON 객체 하나만 반환하세요."));
        assert!(!prompt.contains("응답 형식:"));
    }

    #[test]
    fn result_report_file_slug_preserves_unicode_segments() {
        assert_eq!(
            slugify("커밋 정리: workduck 결과 보고서"),
            "커밋-정리-workduck-결과-보고서"
        );
        assert_eq!(slugify("GPT5.4미니"), "gpt5-4미니");
        assert_eq!(slugify("결과 보고서"), "결과-보고서");
    }

    #[test]
    fn validate_work_order_allows_failed_retry_but_rejects_running_and_archived() {
        let mut work_order = QueueWorkOrder {
            schema_version: "workduck.queue-work-order/v1".to_string(),
            r#ref: QueueEntityRef {
                id: "wo_retry".to_string(),
                kind: "queue-work-order".to_string(),
                label: "재시도".to_string(),
            },
            status: "failed".to_string(),
            created_at: "2026-05-31T00:00:00Z".to_string(),
            tasks: vec![QueueWorkOrderTask {
                id: "task_1".to_string(),
                kind: None,
                title: "재시도".to_string(),
                body: "다시 실행".to_string(),
                priority: Some("normal".to_string()),
                response_language: Some("ko".to_string()),
                response_format: Some("general".to_string()),
                project_ids: Vec::new(),
                agent_ids: vec!["agent_1".to_string()],
                skill_ids: Vec::new(),
                reference_ids: Vec::new(),
                vote: None,
            }],
        };

        assert!(validate_work_order(&work_order, "wo_retry").is_ok());

        work_order.status = "running".to_string();
        let running_error =
            validate_work_order(&work_order, "wo_retry").expect_err("running is blocked");
        assert_eq!(running_error.code, "work-order-running");

        work_order.status = "archived".to_string();
        let archived_error =
            validate_work_order(&work_order, "wo_retry").expect_err("archived is blocked");
        assert_eq!(archived_error.code, "work-order-archived");
    }

    #[test]
    fn queue_work_order_execution_guard_rejects_duplicate_running_id_until_released() {
        let work_order_id = format!("wo_{}", unique_token());
        let first_guard =
            acquire_queue_work_order_execution(&work_order_id).expect("first execution guard");
        let duplicate_error = acquire_queue_work_order_execution(&work_order_id)
            .expect_err("duplicate execution should be rejected");

        assert_eq!(duplicate_error.code, "work-order-running");

        drop(first_guard);

        let second_guard =
            acquire_queue_work_order_execution(&work_order_id).expect("released execution guard");
        drop(second_guard);
    }

    #[test]
    fn queue_work_order_execution_guard_normalizes_ids_before_tracking() {
        let work_order_id = format!("wo_{}", unique_token());
        let first_guard = acquire_queue_work_order_execution(&format!(" {work_order_id} "))
            .expect("trimmed execution guard");
        let duplicate_error = acquire_queue_work_order_execution(&work_order_id)
            .expect_err("trimmed duplicate should be rejected");

        assert_eq!(duplicate_error.code, "work-order-running");

        drop(first_guard);
    }

    #[test]
    fn cancel_running_queue_work_order_execution_aborts_registered_handles() {
        let work_order_id = format!("wo_{}", unique_token());
        let guard =
            acquire_queue_work_order_execution(&work_order_id).expect("execution guard");
        let (abort_handle, _abort_registration) = AbortHandle::new_pair();
        let abort_handle_for_assertion = abort_handle.clone();

        register_queue_work_order_abort_handle(&work_order_id, abort_handle)
            .expect("abort handle registration");
        cancel_running_queue_work_order_execution(&work_order_id).expect("cancel running work order");

        assert!(abort_handle_for_assertion.is_aborted());

        drop(guard);
    }

    #[test]
    fn cancel_running_queue_work_order_execution_rejects_missing_running_id() {
        let work_order_id = format!("wo_{}", unique_token());
        let error = cancel_running_queue_work_order_execution(&work_order_id)
            .expect_err("missing execution should be rejected");

        assert_eq!(error.code, "work-order-not-running");
    }

    #[test]
    fn queue_work_order_abort_handle_registered_after_cancel_is_aborted_immediately() {
        let work_order_id = format!("wo_{}", unique_token());
        let guard =
            acquire_queue_work_order_execution(&work_order_id).expect("execution guard");
        let (abort_handle, _abort_registration) = AbortHandle::new_pair();
        let abort_handle_for_assertion = abort_handle.clone();

        cancel_running_queue_work_order_execution(&work_order_id).expect("cancel running work order");
        register_queue_work_order_abort_handle(&work_order_id, abort_handle)
            .expect("late abort handle registration");

        assert!(abort_handle_for_assertion.is_aborted());

        drop(guard);
    }
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

pub fn create_prompt_previews(
    work_order: &QueueWorkOrder,
    agents: &[AgentRecord],
    personas: &[PersonaRecord],
    skills: &[SkillRecord],
    references: &[ReferenceRecord],
) -> Result<Vec<QueuePromptPreview>, QueueExecutionErrorDetail> {
    let mut previews = Vec::new();

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
            let persona = agent
                .persona_id
                .as_ref()
                .and_then(|persona_id| personas.iter().find(|persona| persona.id == *persona_id))
                .cloned();
            let run = AgentExecutionRun {
                task: task.clone(),
                agent: agent.clone(),
                secret: ResolvedSecret {
                    name: String::new(),
                    tags: Vec::new(),
                    value: String::new(),
                },
                persona,
                provider: agent.execution_provider.clone().unwrap_or_default(),
                model: agent.model_id.clone().unwrap_or_default(),
                skills: select_records(&task.skill_ids, skills, |skill| &skill.id),
                references: select_records(&task.reference_ids, references, |reference| {
                    &reference.id
                }),
            };
            let prompt_plan = create_agent_prompt_plan(&run.task);

            previews.push(QueuePromptPreview {
                id: format!("{}:{}", task.id, agent.id),
                task_id: task.id.clone(),
                task_title: task.title.clone(),
                agent_id: agent.id,
                agent_name: agent.name,
                system_prompt: create_system_prompt(&run, &prompt_plan),
                user_prompt: create_user_prompt(&run, &prompt_plan),
            });
        }
    }

    if previews.is_empty() {
        return Err(QueueExecutionErrorDetail {
            code: "work-order-empty",
            message: "실행할 작업이 없습니다.".to_string(),
        });
    }

    Ok(previews)
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

    validate_executable_work_order_status(work_order)?;

    Ok(())
}

fn validate_executable_work_order_status(
    work_order: &QueueWorkOrder,
) -> Result<(), QueueExecutionErrorDetail> {
    match work_order.status.as_str() {
        "active" | "failed" => Ok(()),
        "running" => Err(QueueExecutionErrorDetail {
            code: "work-order-running",
            message: "이미 실행 중인 작업 지시서입니다.".to_string(),
        }),
        "archived" => Err(QueueExecutionErrorDetail {
            code: "work-order-archived",
            message: "이미 완료 처리된 작업 지시서입니다.".to_string(),
        }),
        _ => Err(QueueExecutionErrorDetail {
            code: "work-order-invalid-status",
            message: "작업 지시서 상태가 실행 가능한 상태가 아닙니다.".to_string(),
        }),
    }
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
        if !provider.eq_ignore_ascii_case("auto") {
            return normalize_provider(provider);
        }
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

    for provider in ["openrouter", "deepseek", "openai"] {
        if agent_profile.contains(provider) {
            return Ok(provider.to_string());
        }
    }

    Err(QueueExecutionErrorDetail {
        code: "agent-provider-unsupported",
        message: format!("에이전트 '{}'의 제공자를 확인하지 못했습니다.", agent.name),
    })
}

fn resolve_agent_provider_without_secret(
    agent: &AgentRecord,
) -> Result<String, QueueExecutionErrorDetail> {
    if let Some(provider) = agent
        .execution_provider
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        if !provider.eq_ignore_ascii_case("auto") {
            return normalize_provider(provider);
        }
    }

    let agent_profile = normalize_profile_text(std::iter::once(agent.name.as_str()));

    for provider in ["openrouter", "deepseek", "openai"] {
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

fn normalize_profile_text<'a>(parts: impl Iterator<Item = &'a str>) -> String {
    parts
        .collect::<Vec<_>>()
        .join(" ")
        .to_ascii_lowercase()
        .chars()
        .filter(|character| character.is_ascii_alphanumeric())
        .collect()
}

fn write_json_file<T: Serialize>(path: &Path, value: &T) -> Result<(), QueueExecutionErrorDetail> {
    let content = serde_json::to_string_pretty(value).map_err(|_| {
        QueueExecutionErrorDetail::new("json-serialize-failed", "JSON으로 변환하지 못했습니다.")
    })?;
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
