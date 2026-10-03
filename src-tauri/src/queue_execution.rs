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
    fs, io,
    path::{Path, PathBuf},
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
    atomic_file_write::{AtomicFileWriteError, write_file_exclusively},
    path_display::display_path,
    queue_execution_identity::{slugify, timestamp_for_file_name},
    queue_execution_registry::{
        acquire_queue_execution, cancel_running_queue_execution,
        register_queue_execution_abort_handle, running_queue_work_order_ids,
    },
    queue_limits::acquire_queue_execution_permit,
    queue_work_order_execution::{
        QueueWorkOrderCompletion, begin_queue_work_order_execution, canonicalize_queue_workspace,
    },
};

#[path = "queue_execution_planning.rs"]
mod planning;
use planning::validate_queue_execution_confirmation;
pub(crate) use planning::validate_work_order_execution_limits;
pub use planning::{
    create_execution_estimate_from_runs, create_execution_runs, create_prompt_preview_plan,
    create_prompt_previews, validate_work_order,
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
            match Abortable::new(run_agent_prompt_bounded(run, client), abort_registration).await {
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

#[cfg(test)]
#[path = "queue_execution_tests.rs"]
mod tests;
