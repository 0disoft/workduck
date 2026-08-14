// llmnav/1 module
// id=workduck.queue.execution-native
// role=Validate and coordinate native multi-agent Queue execution, secret resolution, cancellation, confirmation, and exclusive result-report creation.
// owns=native Queue execution|agent run coordination|execution confirmation tokens
// excludes=frontend execution adapter|Queue folder CRUD
// search=native Queue execution|confirm work order run|cancel agent execution
// invariant=Execution requires the current estimate token, respects global and provider permits, and never exposes resolved secrets through prompt previews.
// stability=architecture
// /llmnav
use std::{
    env, fs, io,
    path::{Path, PathBuf},
};

use futures_util::future::{AbortHandle, Abortable};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};

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
    atomic_file_write::{AtomicFileWriteError, write_file_exclusively},
    path_display::display_path,
    queue_execution_registry::{
        acquire_queue_execution, cancel_running_queue_execution,
        register_queue_execution_abort_handle, running_queue_work_order_ids,
    },
    queue_limits::{
        QUEUE_EXECUTION_MAX_RUNS, QUEUE_TASK_MAX_AGENTS, QUEUE_WORK_ORDER_MAX_TASKS,
        acquire_queue_execution_permit,
    },
    queue_execution_identity::{slugify, timestamp_for_file_name},
    queue_work_order_execution::{
        QueueWorkOrderCompletion, begin_queue_work_order_execution, canonicalize_queue_workspace,
    },
    system_environment::read_cli_user_environment_variable,
};

const QUEUE_DIRECTORY_NAME: &str = "queue";
const REPORTS_DIRECTORY_NAME: &str = "reports";
const REPORT_FILE_SUFFIX: &str = ".workduck-report.json";

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
    pub execution_id: String,
    pub workspace_path: String,
    pub work_order_relative_path: String,
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
    pub confirmation_token: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QueueExecutionCancelRequest {
    pub execution_id: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QueueExecutionInspectRequest {
    pub workspace_path: String,
    #[serde(default)]
    pub work_order_ids: Vec<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QueueExecutionCommandResult {
    pub ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub report: Option<QueueResultReport>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub work_order: Option<QueueWorkOrder>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub report_relative_path: Option<String>,
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

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QueueExecutionInspectCommandResult {
    pub ok: bool,
    #[serde(default)]
    pub running_work_order_ids: Vec<String>,
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
    pub estimate: Option<QueueExecutionEstimate>,
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

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QueueExecutionEstimate {
    pub request_count: usize,
    pub maximum_provider_attempt_count: usize,
    pub estimated_input_tokens: usize,
    pub maximum_estimated_input_tokens: usize,
    pub confirmation_token: String,
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
    if let Err(error) = validate_queue_execution_confirmation(&request) {
        return queue_execution_failed(error);
    }
    let workspace_path = match canonicalize_queue_workspace(Path::new(&request.workspace_path)) {
        Ok(workspace_path) => workspace_path,
        Err(error) => return queue_execution_failed(error),
    };
    let _execution_guard = match acquire_queue_execution(
        &request.execution_id,
        &workspace_path,
        &request.work_order.r#ref.id,
    ) {
        Ok(guard) => guard,
        Err(error) => return queue_execution_failed(error),
    };
    let execution = match begin_queue_work_order_execution(
        &workspace_path,
        &request.work_order_relative_path,
        &request.work_order.r#ref.id,
    ) {
        Ok(execution) => execution,
        Err(error) => return queue_execution_failed(error),
    };
    let work_order = execution.work_order().clone();

    match execute_queue_work_order_inner(&request, &work_order).await {
        Ok(report) => match execution.complete(&report, QueueWorkOrderCompletion::Archive) {
            Ok(success) => QueueExecutionCommandResult {
                ok: true,
                report: Some(report),
                work_order: Some(success.work_order),
                report_relative_path: Some(success.report_relative_path),
                error: None,
                message: None,
            },
            Err(error) => queue_execution_failed(error),
        },
        Err(error) => match execution.fail() {
            Ok(failed_work_order) => {
                queue_execution_failed_with_work_order(error, Some(failed_work_order))
            }
            Err(state_error) => queue_execution_failed(state_error),
        },
    }
}

async fn execute_queue_work_order_inner(
    request: &QueueExecutionRequest,
    work_order: &QueueWorkOrder,
) -> Result<QueueResultReport, QueueExecutionErrorDetail> {
    if work_order.tasks.is_empty() {
        return Err(QueueExecutionErrorDetail::new(
            "queue-execution-no-task",
            "Work order has no task.",
        ));
    }

    let Some(vault) = request.vault.as_ref() else {
        return Err(QueueExecutionErrorDetail::new(
            "queue-execution-vault-locked",
            "Environment vault is locked.",
        ));
    };

    let runs = match create_execution_runs(
        work_order,
        &request.agents,
        Some(vault),
        &request.personas,
        &request.skills,
        &request.references,
    ) {
        Ok(runs) => runs,
        Err(error) => return Err(error),
    };
    let client = queue_http_client()?;
    let mut handles = Vec::new();
    let mut local_abort_handles = LocalAbortHandles::default();

    for run in runs {
        let task = run.task.clone();
        let agent_name = run.agent.name.clone();
        let client = client.clone();
        let (abort_handle, abort_registration) = AbortHandle::new_pair();

        if let Err(error) =
            register_queue_execution_abort_handle(&request.execution_id, abort_handle.clone())
        {
            return Err(error);
        }
        local_abort_handles.push(abort_handle);

        handles.push(tauri::async_runtime::spawn(async move {
            match Abortable::new(
                run_agent_prompt_bounded(run, client),
                abort_registration,
            )
            .await
            {
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
                return Err(QueueExecutionErrorDetail::new(
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
            return Err(QueueExecutionErrorDetail::new(
                "queue-execution-cancelled",
                "작업 실행이 취소되었습니다.",
            ));
        }
        outputs.push(output);
    }

    create_result_report(work_order, outputs)
}

#[tauri::command]
pub fn cancel_queue_work_order_execution(
    request: QueueExecutionCancelRequest,
) -> QueueExecutionCancelCommandResult {
    match cancel_running_queue_execution(&request.execution_id) {
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
pub fn inspect_queue_work_order_executions(
    request: QueueExecutionInspectRequest,
) -> QueueExecutionInspectCommandResult {
    let workspace_path = match canonicalize_queue_workspace(Path::new(&request.workspace_path)) {
        Ok(workspace_path) => workspace_path,
        Err(error) => {
            return QueueExecutionInspectCommandResult {
                ok: false,
                running_work_order_ids: Vec::new(),
                error: Some(error.code),
                message: Some(error.message),
            };
        }
    };

    match running_queue_work_order_ids(&workspace_path, &request.work_order_ids) {
        Ok(running_work_order_ids) => QueueExecutionInspectCommandResult {
            ok: true,
            running_work_order_ids,
            error: None,
            message: None,
        },
        Err(error) => QueueExecutionInspectCommandResult {
            ok: false,
            running_work_order_ids: Vec::new(),
            error: Some(error.code),
            message: Some(error.message),
        },
    }
}

#[tauri::command]
pub fn preview_queue_work_order_prompt(
    request: QueuePromptPreviewRequest,
) -> QueuePromptPreviewCommandResult {
    match create_prompt_preview_plan(
        &request.work_order,
        &request.agents,
        &request.personas,
        &request.skills,
        &request.references,
    ) {
        Ok((previews, estimate)) => QueuePromptPreviewCommandResult {
            ok: true,
            previews,
            estimate: Some(estimate),
            error: None,
            message: None,
        },
        Err(error) => QueuePromptPreviewCommandResult {
            ok: false,
            previews: Vec::new(),
            estimate: None,
            error: Some(error.code),
            message: Some(error.message),
        },
    }
}

fn queue_execution_failed(error: QueueExecutionErrorDetail) -> QueueExecutionCommandResult {
    queue_execution_failed_with_work_order(error, None)
}

fn queue_execution_failed_with_work_order(
    error: QueueExecutionErrorDetail,
    work_order: Option<QueueWorkOrder>,
) -> QueueExecutionCommandResult {
    QueueExecutionCommandResult {
        ok: false,
        report: None,
        work_order,
        report_relative_path: None,
        error: Some(error.code),
        message: Some(error.message),
    }
}

#[derive(Debug, Default)]
struct LocalAbortHandles {
    handles: Vec<AbortHandle>,
}

pub async fn run_agent_prompt_bounded(
    run: AgentExecutionRun,
    client: reqwest::Client,
) -> Result<AgentRunOutput, AgentRunFailure> {
    let _permit = acquire_queue_execution_permit(&run.provider)
        .await
        .map_err(|error| AgentRunFailure {
            code: "agent-execution-failed",
            message: format!("작업 실행 제한기를 사용할 수 없습니다: {error:?}"),
            execution_attempts: Vec::new(),
        })?;

    run_agent_prompt(run, client).await
}

impl LocalAbortHandles {
    fn push(&mut self, abort_handle: AbortHandle) {
        self.handles.push(abort_handle);
    }
}

impl Drop for LocalAbortHandles {
    fn drop(&mut self) {
        for abort_handle in &self.handles {
            abort_handle.abort();
        }
    }
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

        let (previews, estimate) =
            create_prompt_preview_plan(&work_order, &agents, &personas, &skills, &references)
                .expect("prompt previews");

        assert_eq!(previews.len(), 1);
        assert_eq!(estimate.request_count, 1);
        assert_eq!(estimate.maximum_provider_attempt_count, 3);
        assert!(estimate.estimated_input_tokens > 0);
        assert_eq!(
            estimate.maximum_estimated_input_tokens,
            estimate.estimated_input_tokens * 3
        );
        assert_eq!(estimate.confirmation_token.len(), 64);
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
    fn linked_secret_resolution_keeps_unlinked_agents_on_environment_fallback_path() {
        let agent = AgentRecord {
            id: "agent_1".to_string(),
            name: "Env fallback agent".to_string(),
            environment_secret_id: None,
            persona_id: None,
            execution_provider: Some("openrouter".to_string()),
            model_id: Some("openrouter/auto".to_string()),
        };

        let linked_secret =
            resolve_agent_linked_secret(&agent, None).expect("unlinked agent is valid");

        assert!(linked_secret.is_none());
    }

    #[test]
    fn execution_run_rejects_missing_linked_secret_before_environment_fallback() {
        let work_order = QueueWorkOrder {
            schema_version: "workduck.queue-work-order/v1".to_string(),
            r#ref: QueueEntityRef {
                id: "work_order_1".to_string(),
                kind: "queue-work-order".to_string(),
                label: "Secret lookup".to_string(),
            },
            status: "active".to_string(),
            created_at: "2026-06-20T00:00:00Z".to_string(),
            tasks: vec![QueueWorkOrderTask {
                id: "task_1".to_string(),
                kind: None,
                title: "Secret lookup".to_string(),
                body: "Run with the linked key".to_string(),
                priority: Some("normal".to_string()),
                response_language: Some("en".to_string()),
                response_format: Some("general".to_string()),
                project_ids: Vec::new(),
                agent_ids: vec!["agent_1".to_string()],
                skill_ids: Vec::new(),
                reference_ids: Vec::new(),
                vote: None,
            }],
        };
        let agents = vec![AgentRecord {
            id: "agent_1".to_string(),
            name: "Linked secret agent".to_string(),
            environment_secret_id: Some("missing-secret".to_string()),
            persona_id: None,
            execution_provider: Some("openrouter".to_string()),
            model_id: Some("openrouter/auto".to_string()),
        }];
        let vault = EnvironmentVault {
            workspace_id: "workspace_1".to_string(),
            secrets: Vec::new(),
        };

        let error = match create_execution_runs(&work_order, &agents, Some(&vault), &[], &[], &[]) {
            Ok(_) => panic!("missing linked secret should not fall back to environment variables"),
            Err(error) => error,
        };

        assert_eq!(error.code, "agent-secret-not-found");
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
    fn execution_runs_reject_work_orders_above_the_task_limit_before_agent_resolution() {
        let work_order = work_order_with_shape(65, 1);

        let error = match create_execution_runs(&work_order, &[], None, &[], &[], &[]) {
            Ok(_) => panic!("oversized task list must be rejected"),
            Err(error) => error,
        };

        assert_eq!(error.code, "work-order-task-limit");
    }

    #[test]
    fn execution_runs_reject_tasks_above_the_agent_limit_before_agent_resolution() {
        let work_order = work_order_with_shape(1, 9);

        let error = match create_execution_runs(&work_order, &[], None, &[], &[], &[]) {
            Ok(_) => panic!("oversized agent list must be rejected"),
            Err(error) => error,
        };

        assert_eq!(error.code, "work-order-agent-limit");
    }

    #[test]
    fn execution_runs_reject_total_runs_above_the_hard_cap_before_agent_resolution() {
        let work_order = work_order_with_shape(17, 8);

        let error = match create_execution_runs(&work_order, &[], None, &[], &[], &[]) {
            Ok(_) => panic!("oversized execution fanout must be rejected"),
            Err(error) => error,
        };

        assert_eq!(error.code, "work-order-execution-limit");
    }

    fn work_order_with_shape(task_count: usize, agents_per_task: usize) -> QueueWorkOrder {
        QueueWorkOrder {
            schema_version: "workduck.queue-work-order/v1".to_string(),
            r#ref: QueueEntityRef {
                id: "wo_limits".to_string(),
                kind: "queue-work-order".to_string(),
                label: "Limits".to_string(),
            },
            status: "active".to_string(),
            created_at: "2026-08-10T00:00:00Z".to_string(),
            tasks: (0..task_count)
                .map(|task_index| QueueWorkOrderTask {
                    id: format!("task_{task_index}"),
                    kind: None,
                    title: format!("Task {task_index}"),
                    body: "Bound execution fanout".to_string(),
                    priority: Some("normal".to_string()),
                    response_language: Some("en".to_string()),
                    response_format: Some("general".to_string()),
                    project_ids: Vec::new(),
                    agent_ids: (0..agents_per_task)
                        .map(|agent_index| format!("agent_{agent_index}"))
                        .collect(),
                    skill_ids: Vec::new(),
                    reference_ids: Vec::new(),
                    vote: None,
                })
                .collect(),
        }
    }

    #[test]
    fn local_abort_handles_abort_all_handles_when_execution_scope_ends() {
        let (first_handle, _first_registration) = AbortHandle::new_pair();
        let (second_handle, _second_registration) = AbortHandle::new_pair();
        let first_assertion = first_handle.clone();
        let second_assertion = second_handle.clone();

        {
            let mut handles = LocalAbortHandles::default();
            handles.push(first_handle);
            handles.push(second_handle);
        }

        assert!(first_assertion.is_aborted());
        assert!(second_assertion.is_aborted());
    }

    #[test]
    fn write_json_file_does_not_clobber_an_existing_report() {
        let temp_dir = tempfile::tempdir().expect("temporary report directory");
        let report_path = temp_dir.path().join("existing.workduck-report.json");
        fs::write(&report_path, "existing report").expect("existing report fixture");

        let error = write_json_file(&report_path, &serde_json::json!({ "replacement": true }))
            .expect_err("existing report must not be replaced");

        assert_eq!(error.code, "file-write-failed");
        assert_eq!(
            fs::read_to_string(report_path).expect("preserved report"),
            "existing report"
        );
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
    validate_work_order_execution_limits(work_order)?;
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
            let vault_secret = resolve_agent_linked_secret(&agent, vault)?;
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

fn resolve_agent_linked_secret(
    agent: &AgentRecord,
    vault: Option<&EnvironmentVault>,
) -> Result<Option<EnvironmentSecretRecord>, QueueExecutionErrorDetail> {
    let Some(secret_id) = agent
        .environment_secret_id
        .as_deref()
        .map(str::trim)
        .filter(|secret_id| !secret_id.is_empty())
    else {
        return Ok(None);
    };

    vault
        .and_then(|vault| {
            vault
                .secrets
                .iter()
                .find(|candidate| candidate.id == secret_id)
                .cloned()
        })
        .map(Some)
        .ok_or_else(|| QueueExecutionErrorDetail {
            code: "agent-secret-not-found",
            message: format!(
                "에이전트 '{}'에 연결된 API 키를 찾지 못했습니다. Environment에서 키를 다시 선택하거나 보관함을 잠금 해제하세요.",
                agent.name
            ),
        })
}

pub fn create_prompt_previews(
    work_order: &QueueWorkOrder,
    agents: &[AgentRecord],
    personas: &[PersonaRecord],
    skills: &[SkillRecord],
    references: &[ReferenceRecord],
) -> Result<Vec<QueuePromptPreview>, QueueExecutionErrorDetail> {
    validate_work_order_execution_limits(work_order)?;
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

pub fn create_prompt_preview_plan(
    work_order: &QueueWorkOrder,
    agents: &[AgentRecord],
    personas: &[PersonaRecord],
    skills: &[SkillRecord],
    references: &[ReferenceRecord],
) -> Result<(Vec<QueuePromptPreview>, QueueExecutionEstimate), QueueExecutionErrorDetail> {
    let previews = create_prompt_previews(work_order, agents, personas, skills, references)?;
    let estimate = create_queue_execution_estimate(&previews);
    Ok((previews, estimate))
}

pub fn create_execution_estimate_from_runs(runs: &[AgentExecutionRun]) -> QueueExecutionEstimate {
    let previews = runs
        .iter()
        .map(|run| {
            let prompt_plan = create_agent_prompt_plan(&run.task);
            QueuePromptPreview {
                id: format!("{}:{}", run.task.id, run.agent.id),
                task_id: run.task.id.clone(),
                task_title: run.task.title.clone(),
                agent_id: run.agent.id.clone(),
                agent_name: run.agent.name.clone(),
                system_prompt: create_system_prompt(run, &prompt_plan),
                user_prompt: create_user_prompt(run, &prompt_plan),
            }
        })
        .collect::<Vec<_>>();
    create_queue_execution_estimate(&previews)
}

fn validate_queue_execution_confirmation(
    request: &QueueExecutionRequest,
) -> Result<(), QueueExecutionErrorDetail> {
    let (_, estimate) = create_prompt_preview_plan(
        &request.work_order,
        &request.agents,
        &request.personas,
        &request.skills,
        &request.references,
    )?;
    if request.confirmation_token != estimate.confirmation_token {
        return Err(QueueExecutionErrorDetail::new(
            "queue-execution-confirmation-required",
            "The queue execution estimate must be reviewed and confirmed before execution.",
        ));
    }
    Ok(())
}

fn create_queue_execution_estimate(previews: &[QueuePromptPreview]) -> QueueExecutionEstimate {
    let request_count = previews.len();
    let estimated_input_tokens = previews
        .iter()
        .map(|preview| {
            estimate_prompt_tokens(&preview.system_prompt)
                .saturating_add(estimate_prompt_tokens(&preview.user_prompt))
                .saturating_add(32)
        })
        .sum::<usize>();
    let maximum_provider_attempt_count = request_count
        .saturating_mul(usize::from(crate::queue_provider_client::CHAT_COMPLETION_MAX_ATTEMPTS));
    let maximum_estimated_input_tokens = estimated_input_tokens
        .saturating_mul(usize::from(crate::queue_provider_client::CHAT_COMPLETION_MAX_ATTEMPTS));
    let mut digest = Sha256::new();
    digest.update(b"workduck.queue-execution-estimate/v1\0");
    for preview in previews {
        for value in [
            preview.id.as_str(),
            preview.task_id.as_str(),
            preview.agent_id.as_str(),
            preview.system_prompt.as_str(),
            preview.user_prompt.as_str(),
        ] {
            digest.update(value.len().to_le_bytes());
            digest.update(value.as_bytes());
        }
    }
    digest.update(request_count.to_le_bytes());
    digest.update(estimated_input_tokens.to_le_bytes());

    QueueExecutionEstimate {
        request_count,
        maximum_provider_attempt_count,
        estimated_input_tokens,
        maximum_estimated_input_tokens,
        confirmation_token: digest
            .finalize()
            .iter()
            .map(|byte| format!("{byte:02x}"))
            .collect(),
    }
}

fn estimate_prompt_tokens(prompt: &str) -> usize {
    let mut ascii_characters = 0usize;
    let mut non_ascii_characters = 0usize;
    for character in prompt.chars() {
        if character.is_ascii() {
            ascii_characters += 1;
        } else {
            non_ascii_characters += 1;
        }
    }
    ascii_characters
        .div_ceil(4)
        .saturating_add(non_ascii_characters)
}

pub(crate) fn validate_work_order_execution_limits(
    work_order: &QueueWorkOrder,
) -> Result<(), QueueExecutionErrorDetail> {
    if work_order.tasks.len() > QUEUE_WORK_ORDER_MAX_TASKS {
        return Err(QueueExecutionErrorDetail::new(
            "work-order-task-limit",
            format!(
                "작업 지시서는 최대 {QUEUE_WORK_ORDER_MAX_TASKS}개 작업까지 실행할 수 있습니다."
            ),
        ));
    }

    let mut total_runs = 0usize;
    for task in &work_order.tasks {
        if task.agent_ids.len() > QUEUE_TASK_MAX_AGENTS {
            return Err(QueueExecutionErrorDetail::new(
                "work-order-agent-limit",
                format!(
                    "작업 '{}'에는 최대 {QUEUE_TASK_MAX_AGENTS}개 에이전트만 지정할 수 있습니다.",
                    task.title
                ),
            ));
        }

        total_runs = total_runs
            .checked_add(task.agent_ids.len())
            .ok_or_else(|| {
                QueueExecutionErrorDetail::new(
                    "work-order-execution-limit",
                    "작업 실행 수를 계산할 수 없습니다.",
                )
            })?;
        if total_runs > QUEUE_EXECUTION_MAX_RUNS {
            return Err(QueueExecutionErrorDetail::new(
                "work-order-execution-limit",
                format!(
                    "작업 지시서는 최대 {QUEUE_EXECUTION_MAX_RUNS}개 에이전트 실행까지 허용됩니다."
                ),
            ));
        }
    }

    Ok(())
}

fn resolve_provider_environment_secret(
    provider: &str,
    agent: &AgentRecord,
) -> Result<ResolvedSecret, QueueExecutionErrorDetail> {
    let env_names: &[&str] = match provider {
        "openrouter" => &["OPENROUTER_API_KEY", "OPEN_ROUTER_API_KEY"],
        "openai" => &["OPENAI_API_KEY"],
        "deepseek" => &["DEEPSEEK_API_KEY"],
        "umans" => &["UMANS_API_KEY", "UMANS_CODE_API_KEY"],
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

    for provider in ["openrouter", "umans", "deepseek", "openai"] {
        if secret_profile.contains(provider) {
            return Ok(provider.to_string());
        }
    }

    let agent_profile = normalize_profile_text(std::iter::once(agent.name.as_str()));

    for provider in ["openrouter", "umans", "deepseek", "openai"] {
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

    for provider in ["openrouter", "umans", "deepseek", "openai"] {
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
        "deepseek" | "openai" | "openrouter" | "umans" => Ok(provider.to_ascii_lowercase()),
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
    write_file_exclusively(path, &content).map_err(|error| {
        let message = match error {
            AtomicFileWriteError::TargetInvalid => "보고서 파일 경로가 올바르지 않습니다.",
            AtomicFileWriteError::TargetAlreadyExists => "같은 이름의 보고서 파일이 이미 있습니다.",
            AtomicFileWriteError::WriteFailed => "보고서 파일을 안전하게 저장하지 못했습니다.",
        };

        QueueExecutionErrorDetail::new(
            "file-write-failed",
            format!("{}: {message}", display_path(path)),
        )
    })
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
