use std::{
    collections::{HashMap, HashSet},
    env, fs,
    io::{self, Read, Write},
    path::{Path, PathBuf},
};

use base64::{Engine as _, engine::general_purpose::STANDARD as BASE64};
use chacha20poly1305::{
    XChaCha20Poly1305, XNonce,
    aead::{Aead, KeyInit, Payload},
};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use time::{OffsetDateTime, format_description::well_known::Rfc3339};
use workduck_lib::argon2_kdf::{ARGON2ID_VERSION, derive_argon2id_key, parameters_are_supported};
use workduck_lib::queue_execution::*;
use workduck_lib::queue_work_order_execution::{
    QueueWorkOrderCompletion, begin_queue_work_order_execution_at,
};
use zeroize::Zeroize;

const APP_NAME: &str = "workduck";
const WORKDUCK_DIRECTORY_NAME: &str = ".workduck";
const QUEUE_DIRECTORY_NAME: &str = "queue";
const WORK_ORDERS_DIRECTORY_NAME: &str = "work-orders";
const WORK_ORDER_FILE_SUFFIX: &str = ".workduck-work-order.json";
const VAULT_FILE_NAME: &str = "secrets.sync.json";
const AGENTS_FILE_NAME: &str = "agents.json";
const PERSONAS_FILE_NAME: &str = "personas.json";
const REFERENCES_FILE_NAME: &str = "references.json";
const SKILLS_FILE_NAME: &str = "skills.json";
const AGENT_EVALUATION_CRITERION_IDS: [&str; 5] = [
    "problemUnderstanding",
    "logicalValidity",
    "practicalFeasibility",
    "creativeInsight",
    "riskDetection",
];
const VAULT_AAD: &[u8] = b"workduck.secret-vault.v1";
const VAULT_KEY_LENGTH: usize = 32;
const VAULT_SALT_LENGTH: usize = 16;
const VAULT_NONCE_LENGTH: usize = 24;

#[derive(Debug)]
struct CliError {
    code: &'static str,
    message: String,
}

impl From<QueueExecutionErrorDetail> for CliError {
    fn from(error: QueueExecutionErrorDetail) -> Self {
        Self {
            code: error.code,
            message: error.message,
        }
    }
}

#[derive(Default)]
struct CliOptions {
    work_order_id: String,
    workspace_path: Option<PathBuf>,
    vault_password: Option<String>,
    keep_work_order: bool,
    json: bool,
}

impl Drop for CliOptions {
    fn drop(&mut self) {
        if let Some(password) = self.vault_password.as_mut() {
            password.zeroize();
        }
    }
}

#[derive(Default)]
struct AgentEvaluateOptions {
    agent_key: String,
    workspace_path: Option<PathBuf>,
    evaluation_key: Option<String>,
    scores: Option<AgentEvaluationScores>,
    json: bool,
}

#[derive(Default)]
struct AgentEvaluateBatchOptions {
    workspace_path: Option<PathBuf>,
    input_path: Option<PathBuf>,
    json: bool,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct AgentEvaluationBatchInput {
    evaluations: Vec<AgentEvaluationBatchItem>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct AgentEvaluationBatchItem {
    #[serde(default)]
    agent_id: Option<String>,
    #[serde(default)]
    agent_name: Option<String>,
    #[serde(default)]
    evaluation_key: Option<String>,
    scores: AgentEvaluationScores,
}

#[derive(Clone, Copy, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct AgentEvaluationScores {
    problem_understanding: u8,
    logical_validity: u8,
    practical_feasibility: u8,
    creative_insight: u8,
    risk_detection: u8,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SecretVaultEnvelope {
    format: String,
    version: u8,
    kdf: SecretVaultKdf,
    cipher: SecretVaultCipher,
    ciphertext: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SecretVaultKdf {
    algorithm: String,
    version: u32,
    #[serde(rename = "memoryKiB")]
    memory_kib: u32,
    iterations: u32,
    parallelism: u32,
    salt: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SecretVaultCipher {
    algorithm: String,
    nonce: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct JsonSuccess<'a> {
    ok: bool,
    workspace_path: &'a Path,
    work_order_path: &'a Path,
    report_path: &'a Path,
    agents: Vec<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct AgentEvaluationJsonSuccess<'a> {
    ok: bool,
    workspace_path: &'a Path,
    agent_id: &'a str,
    agent_name: &'a str,
    applied: bool,
    evaluation_key: Option<&'a str>,
    total_count: u64,
    scores: AgentEvaluationScores,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct AgentEvaluationBatchJsonSuccess<'a> {
    ok: bool,
    workspace_path: &'a Path,
    evaluations: Vec<AgentEvaluationBatchJsonItem>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct AgentEvaluationBatchJsonItem {
    agent_id: String,
    agent_name: String,
    applied: bool,
    evaluation_key: Option<String>,
    total_count: u64,
    scores: AgentEvaluationScores,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct JsonFailure<'a> {
    ok: bool,
    code: &'a str,
    message: &'a str,
}

fn main() {
    if env::args().any(|arg| arg == "-h" || arg == "--help") {
        println!("{}", usage_text());
        return;
    }

    let result = tauri::async_runtime::block_on(run());

    match result {
        Ok(()) => {}
        Err(error) => {
            if wants_json_output() {
                let payload = JsonFailure {
                    ok: false,
                    code: error.code,
                    message: &error.message,
                };
                println!(
                    "{}",
                    serde_json::to_string_pretty(&payload).unwrap_or_default()
                );
            } else {
                eprintln!("{}: {}", error.code, error.message);
            }
            std::process::exit(1);
        }
    }
}

async fn run() -> Result<(), CliError> {
    let args: Vec<String> = env::args().skip(1).collect();

    if args.first().map(String::as_str) == Some("agent") {
        return run_agent_command(args);
    }

    let options = parse_args(args)?;

    let located = locate_work_order(&options.work_order_id, options.workspace_path.as_deref())?;
    let workspace_id = read_workspace_id(&located.workspace_path)?;
    let execution = begin_queue_work_order_execution_at(
        &located.workspace_path,
        &located.work_order_path,
        &options.work_order_id,
    )?;
    let work_order = execution.work_order().clone();

    let agents: AgentRegistry =
        read_optional_workspace_json(&located.workspace_path, AGENTS_FILE_NAME)?
            .unwrap_or(AgentRegistry { agents: Vec::new() });
    let personas: PersonaRegistry =
        read_optional_workspace_json(&located.workspace_path, PERSONAS_FILE_NAME)?.unwrap_or(
            PersonaRegistry {
                personas: Vec::new(),
            },
        );
    let skills: SkillRegistry =
        read_optional_workspace_json(&located.workspace_path, SKILLS_FILE_NAME)?
            .unwrap_or(SkillRegistry { skills: Vec::new() });
    let references: ReferenceRegistry =
        read_optional_workspace_json(&located.workspace_path, REFERENCES_FILE_NAME)?.unwrap_or(
            ReferenceRegistry {
                references: Vec::new(),
            },
        );
    let vault = read_environment_vault(
        &located.workspace_path,
        &workspace_id,
        options.vault_password.as_deref(),
    )?;
    let runs = create_execution_runs(
        &work_order,
        &agents.agents,
        vault.as_ref(),
        &personas.personas,
        &skills.skills,
        &references.references,
    )?;
    let client = queue_http_client().map_err(|error| CliError {
        code: error.code,
        message: error.message,
    })?;
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
        let output = handle.await.map_err(|_| CliError {
            code: "agent-execution-failed",
            message: "에이전트 응답 처리 중 작업이 중단되었습니다.".to_string(),
        })?;
        outputs.push(output);
    }

    let report = create_result_report(&work_order, outputs)?;
    let completion = if options.keep_work_order {
        QueueWorkOrderCompletion::KeepActive
    } else {
        QueueWorkOrderCompletion::Archive
    };
    let success = execution.complete(&report, completion)?;
    let report_path = success.report_path;

    if options.json {
        let payload = JsonSuccess {
            ok: true,
            workspace_path: &located.workspace_path,
            work_order_path: &located.work_order_path,
            report_path: &report_path,
            agents: report
                .tasks
                .iter()
                .map(|task| task.title.split(':').next().unwrap_or("").to_string())
                .collect(),
        };
        println!(
            "{}",
            serde_json::to_string_pretty(&payload).map_err(to_json_error)?
        );
    } else {
        let language = report_language_for_work_order(&work_order);
        println!("{}", command_completed(&report_path, language));
        println!("{}", responses_received(&report.agent_name, language));
    }

    Ok(())
}

fn run_agent_command(args: Vec<String>) -> Result<(), CliError> {
    match args.get(1).map(String::as_str) {
        Some("evaluate") => run_agent_evaluate_command(args),
        Some("evaluate-batch") => run_agent_evaluate_batch_command(args),
        _ => Err(CliError {
            code: "usage",
            message: usage_text(),
        }),
    }
}

fn run_agent_evaluate_command(args: Vec<String>) -> Result<(), CliError> {
    let options = parse_agent_evaluate_args(args)?;
    let workspace_path = options
        .workspace_path
        .as_deref()
        .ok_or_else(|| CliError {
            code: "workspace-required",
            message: "--workspace 옵션으로 워크스페이스를 지정해야 합니다.".to_string(),
        })
        .and_then(canonicalize_directory)?;
    let workspace_id = read_workspace_id(&workspace_path)?;
    let agents_path = workspace_data_path(&workspace_path, AGENTS_FILE_NAME);
    let mut registry: Value = read_json_file(&agents_path, "agent-registry-invalid")?;
    let personas_path = workspace_data_path(&workspace_path, PERSONAS_FILE_NAME);
    let mut persona_registry: Option<Value> = if personas_path.exists() {
        Some(read_json_file(&personas_path, "persona-registry-invalid")?)
    } else {
        None
    };
    let scores = options.scores.ok_or_else(|| CliError {
        code: "agent-evaluation-score-required",
        message: "다섯 평가 점수를 모두 지정해야 합니다.".to_string(),
    })?;
    let result = record_agent_evaluation_in_registry(
        &mut registry,
        &workspace_id,
        &options.agent_key,
        options.evaluation_key.as_deref(),
        scores,
    )?;
    let persona_registry_changed = if let Some(persona_registry) = persona_registry.as_mut() {
        sync_persona_evaluation_summaries_from_agents(persona_registry, &registry, &workspace_id)?
    } else {
        false
    };

    write_json_file(&agents_path, &registry)?;
    if persona_registry_changed {
        if let Some(persona_registry) = &persona_registry {
            write_json_file(&personas_path, persona_registry)?;
        }
    }

    if options.json {
        let payload = AgentEvaluationJsonSuccess {
            ok: true,
            workspace_path: &workspace_path,
            agent_id: &result.agent_id,
            agent_name: &result.agent_name,
            applied: result.applied,
            evaluation_key: result.evaluation_key.as_deref(),
            total_count: result.total_count,
            scores,
        };
        println!(
            "{}",
            serde_json::to_string_pretty(&payload).map_err(to_json_error)?
        );
    } else {
        if result.applied {
            println!(
                "에이전트 평가 저장: {} ({}건)",
                result.agent_name, result.total_count
            );
        } else {
            println!(
                "이미 저장된 에이전트 평가: {} ({}건)",
                result.agent_name, result.total_count
            );
        }
    }

    Ok(())
}

fn run_agent_evaluate_batch_command(args: Vec<String>) -> Result<(), CliError> {
    let options = parse_agent_evaluate_batch_args(args)?;
    let workspace_path = options
        .workspace_path
        .as_deref()
        .ok_or_else(|| CliError {
            code: "workspace-required",
            message: "--workspace 옵션으로 워크스페이스를 지정해야 합니다.".to_string(),
        })
        .and_then(canonicalize_directory)?;
    let input_path = options.input_path.as_deref().ok_or_else(|| CliError {
        code: "agent-evaluation-input-required",
        message: "--input 옵션으로 평가 JSON 경로를 지정해야 합니다.".to_string(),
    })?;
    let input = read_agent_evaluation_batch_input(input_path)?;

    if input.evaluations.is_empty() {
        return Err(CliError {
            code: "agent-evaluation-batch-empty",
            message: "저장할 평가 항목이 없습니다.".to_string(),
        });
    }

    let workspace_id = read_workspace_id(&workspace_path)?;
    let agents_path = workspace_data_path(&workspace_path, AGENTS_FILE_NAME);
    let mut registry: Value = read_json_file(&agents_path, "agent-registry-invalid")?;
    let personas_path = workspace_data_path(&workspace_path, PERSONAS_FILE_NAME);
    let mut persona_registry: Option<Value> = if personas_path.exists() {
        Some(read_json_file(&personas_path, "persona-registry-invalid")?)
    } else {
        None
    };
    let mut results = Vec::new();

    for (index, item) in input.evaluations.into_iter().enumerate() {
        validate_agent_evaluation_scores(item.scores)?;
        let agent_key = item
            .agent_id
            .as_deref()
            .or(item.agent_name.as_deref())
            .map(str::trim)
            .filter(|key| !key.is_empty())
            .ok_or_else(|| CliError {
                code: "agent-required",
                message: format!(
                    "{}번째 평가 항목에 에이전트 ID 또는 이름이 필요합니다.",
                    index + 1
                ),
            })?;
        let result = record_agent_evaluation_in_registry(
            &mut registry,
            &workspace_id,
            agent_key,
            item.evaluation_key.as_deref(),
            item.scores,
        )?;

        results.push(AgentEvaluationBatchJsonItem {
            agent_id: result.agent_id,
            agent_name: result.agent_name,
            applied: result.applied,
            evaluation_key: result.evaluation_key,
            total_count: result.total_count,
            scores: item.scores,
        });
    }

    let persona_registry_changed = if let Some(persona_registry) = persona_registry.as_mut() {
        sync_persona_evaluation_summaries_from_agents(persona_registry, &registry, &workspace_id)?
    } else {
        false
    };

    write_json_file(&agents_path, &registry)?;
    if persona_registry_changed {
        if let Some(persona_registry) = &persona_registry {
            write_json_file(&personas_path, persona_registry)?;
        }
    }

    if options.json {
        let payload = AgentEvaluationBatchJsonSuccess {
            ok: true,
            workspace_path: &workspace_path,
            evaluations: results,
        };
        println!(
            "{}",
            serde_json::to_string_pretty(&payload).map_err(to_json_error)?
        );
    } else {
        println!("에이전트 평가 일괄 저장: {}건", results.len());
    }

    Ok(())
}

struct LocatedWorkOrder {
    workspace_path: PathBuf,
    work_order_path: PathBuf,
}

#[derive(Deserialize)]
struct WorkOrderLookupDocument {
    r#ref: WorkOrderLookupRef,
}

#[derive(Deserialize)]
struct WorkOrderLookupRef {
    id: String,
}

fn parse_args(args: Vec<String>) -> Result<CliOptions, CliError> {
    parse_args_with_vault_password(args, env::var("WORKDUCK_VAULT_PASSWORD").ok())
}

fn parse_args_with_vault_password(
    args: Vec<String>,
    vault_password: Option<String>,
) -> Result<CliOptions, CliError> {
    if args.is_empty() {
        return Err(CliError {
            code: "usage",
            message: usage_text(),
        });
    }

    let mut options = CliOptions::default();
    let mut index = 0;

    if args[index] != "queue" {
        return Err(CliError {
            code: "usage",
            message: usage_text(),
        });
    }
    index += 1;

    if args.get(index).map(String::as_str) != Some("run") {
        return Err(CliError {
            code: "usage",
            message: usage_text(),
        });
    }
    index += 1;

    if index < args.len() {
        options.work_order_id = args[index].clone();
        index += 1;
    }

    while index < args.len() {
        match args[index].as_str() {
            "--workspace" => {
                index += 1;
                options.workspace_path = args.get(index).map(PathBuf::from);
            }
            "--keep-work-order" => {
                options.keep_work_order = true;
            }
            "--json" => {
                options.json = true;
            }
            option => {
                return Err(CliError {
                    code: "unknown-option",
                    message: format!("지원하지 않는 옵션입니다: {option}"),
                });
            }
        }
        index += 1;
    }

    if options.work_order_id.trim().is_empty() {
        return Err(CliError {
            code: "work-order-id-required",
            message: usage_text(),
        });
    }

    options.work_order_id = options.work_order_id.trim().to_string();
    options.vault_password = vault_password;

    Ok(options)
}

fn parse_agent_evaluate_args(args: Vec<String>) -> Result<AgentEvaluateOptions, CliError> {
    let mut options = AgentEvaluateOptions::default();
    let mut problem_understanding = None;
    let mut logical_validity = None;
    let mut practical_feasibility = None;
    let mut creative_insight = None;
    let mut risk_detection = None;
    let mut index = 0;

    if args.get(index).map(String::as_str) != Some("agent") {
        return Err(CliError {
            code: "usage",
            message: usage_text(),
        });
    }
    index += 1;

    if args.get(index).map(String::as_str) != Some("evaluate") {
        return Err(CliError {
            code: "usage",
            message: usage_text(),
        });
    }
    index += 1;

    if let Some(agent_key) = args.get(index) {
        options.agent_key = agent_key.clone();
        index += 1;
    }

    while index < args.len() {
        match args[index].as_str() {
            "--workspace" => {
                index += 1;
                options.workspace_path = args.get(index).map(PathBuf::from);
            }
            "--evaluation-key" => {
                index += 1;
                options.evaluation_key = args.get(index).cloned();
            }
            "--problem-understanding" => {
                index += 1;
                problem_understanding = Some(parse_score_argument(
                    args.get(index),
                    "--problem-understanding",
                )?);
            }
            "--logical-validity" => {
                index += 1;
                logical_validity =
                    Some(parse_score_argument(args.get(index), "--logical-validity")?);
            }
            "--practical-feasibility" => {
                index += 1;
                practical_feasibility = Some(parse_score_argument(
                    args.get(index),
                    "--practical-feasibility",
                )?);
            }
            "--creative-insight" => {
                index += 1;
                creative_insight =
                    Some(parse_score_argument(args.get(index), "--creative-insight")?);
            }
            "--risk-detection" => {
                index += 1;
                risk_detection = Some(parse_score_argument(args.get(index), "--risk-detection")?);
            }
            "--json" => {
                options.json = true;
            }
            option => {
                return Err(CliError {
                    code: "unknown-option",
                    message: format!("지원하지 않는 옵션입니다: {option}"),
                });
            }
        }
        index += 1;
    }

    if options.agent_key.trim().is_empty() {
        return Err(CliError {
            code: "agent-required",
            message: "평가를 저장할 에이전트 ID 또는 이름을 지정해야 합니다.".to_string(),
        });
    }

    options.scores = Some(AgentEvaluationScores {
        problem_understanding: problem_understanding.ok_or_else(missing_score_error)?,
        logical_validity: logical_validity.ok_or_else(missing_score_error)?,
        practical_feasibility: practical_feasibility.ok_or_else(missing_score_error)?,
        creative_insight: creative_insight.ok_or_else(missing_score_error)?,
        risk_detection: risk_detection.ok_or_else(missing_score_error)?,
    });

    Ok(options)
}

fn parse_agent_evaluate_batch_args(
    args: Vec<String>,
) -> Result<AgentEvaluateBatchOptions, CliError> {
    let mut options = AgentEvaluateBatchOptions::default();
    let mut index = 0;

    if args.get(index).map(String::as_str) != Some("agent") {
        return Err(CliError {
            code: "usage",
            message: usage_text(),
        });
    }
    index += 1;

    if args.get(index).map(String::as_str) != Some("evaluate-batch") {
        return Err(CliError {
            code: "usage",
            message: usage_text(),
        });
    }
    index += 1;

    while index < args.len() {
        match args[index].as_str() {
            "--workspace" => {
                index += 1;
                options.workspace_path = args.get(index).map(PathBuf::from);
            }
            "--input" => {
                index += 1;
                options.input_path = args.get(index).map(PathBuf::from);
            }
            "--json" => {
                options.json = true;
            }
            option => {
                return Err(CliError {
                    code: "unknown-option",
                    message: format!("지원하지 않는 옵션입니다: {option}"),
                });
            }
        }
        index += 1;
    }

    Ok(options)
}

fn read_agent_evaluation_batch_input(
    input_path: &Path,
) -> Result<AgentEvaluationBatchInput, CliError> {
    if input_path == Path::new("-") {
        let mut content = String::new();
        io::stdin()
            .read_to_string(&mut content)
            .map_err(|error| CliError {
                code: "agent-evaluation-input-read-failed",
                message: format!("표준 입력에서 평가 JSON을 읽지 못했습니다: {error}"),
            })?;

        return serde_json::from_str(&content).map_err(|_| CliError {
            code: "agent-evaluation-input-invalid",
            message: "평가 JSON을 해석하지 못했습니다.".to_string(),
        });
    }

    read_json_file(input_path, "agent-evaluation-input-invalid")
}

fn validate_agent_evaluation_scores(scores: AgentEvaluationScores) -> Result<(), CliError> {
    for (flag, score) in [
        ("problemUnderstanding", scores.problem_understanding),
        ("logicalValidity", scores.logical_validity),
        ("practicalFeasibility", scores.practical_feasibility),
        ("creativeInsight", scores.creative_insight),
        ("riskDetection", scores.risk_detection),
    ] {
        if !(1..=9).contains(&score) {
            return Err(CliError {
                code: "agent-evaluation-score-invalid",
                message: format!("{flag} 값은 1부터 9까지의 정수여야 합니다."),
            });
        }
    }

    Ok(())
}

fn parse_score_argument(value: Option<&String>, flag: &'static str) -> Result<u8, CliError> {
    let raw_value = value.ok_or_else(|| CliError {
        code: "agent-evaluation-score-required",
        message: format!("{flag} 값이 필요합니다."),
    })?;
    let score = raw_value.parse::<u8>().map_err(|_| CliError {
        code: "agent-evaluation-score-invalid",
        message: format!("{flag} 값은 1부터 9까지의 정수여야 합니다."),
    })?;

    if !(1..=9).contains(&score) {
        return Err(CliError {
            code: "agent-evaluation-score-invalid",
            message: format!("{flag} 값은 1부터 9까지의 정수여야 합니다."),
        });
    }

    Ok(score)
}

fn missing_score_error() -> CliError {
    CliError {
        code: "agent-evaluation-score-required",
        message: "다섯 평가 점수를 모두 지정해야 합니다.".to_string(),
    }
}

fn usage_text() -> String {
    format!(
        "{APP_NAME} queue run <work-order-id> [--workspace <path>] [--json] [--keep-work-order]\n{APP_NAME} agent evaluate <agent-id-or-name> --workspace <path> --problem-understanding <1-9> --logical-validity <1-9> --practical-feasibility <1-9> --creative-insight <1-9> --risk-detection <1-9> [--evaluation-key <key>] [--json]\n{APP_NAME} agent evaluate-batch --workspace <path> --input <path-or-> [--json]"
    )
}

fn wants_json_output() -> bool {
    env::args().any(|arg| arg == "--json")
}

fn locate_work_order(
    work_order_id: &str,
    workspace_path: Option<&Path>,
) -> Result<LocatedWorkOrder, CliError> {
    let work_order_id = work_order_id.trim();

    if let Some(workspace_path) = workspace_path {
        let workspace_path = canonicalize_directory(workspace_path)?;
        let work_order_path = find_work_order_in_workspace(&workspace_path, work_order_id)?;

        return Ok(LocatedWorkOrder {
            workspace_path,
            work_order_path,
        });
    }

    let mut matches = Vec::new();

    for root in default_search_roots() {
        collect_work_order_matches(&root, work_order_id, 0, &mut matches)?;
    }

    matches.sort();
    matches.dedup();

    match matches.len() {
        0 => Err(CliError {
            code: "work-order-not-found",
            message: format!("작업 ID를 찾지 못했습니다: {work_order_id}"),
        }),
        1 => {
            let work_order_path = matches.remove(0);
            let workspace_path = workspace_from_work_order_path(&work_order_path)?;

            Ok(LocatedWorkOrder {
                workspace_path,
                work_order_path,
            })
        }
        _ => Err(CliError {
            code: "work-order-ambiguous",
            message: "--workspace 옵션으로 워크스페이스를 지정해야 합니다.".to_string(),
        }),
    }
}

fn default_search_roots() -> Vec<PathBuf> {
    let mut roots = Vec::new();

    if let Ok(current_dir) = env::current_dir() {
        roots.push(current_dir);
    }

    if let Some(user_profile) = env::var_os("USERPROFILE") {
        roots.push(
            PathBuf::from(user_profile)
                .join("Documents")
                .join("workspace"),
        );
    }

    if let Ok(workspace) = env::var("WORKDUCK_WORKSPACE") {
        roots.push(PathBuf::from(workspace));
    }

    roots
        .into_iter()
        .filter_map(|path| fs::canonicalize(path).ok())
        .filter(|path| path.is_dir())
        .collect()
}

fn collect_work_order_matches(
    root: &Path,
    work_order_id: &str,
    depth: usize,
    matches: &mut Vec<PathBuf>,
) -> Result<(), CliError> {
    if depth > 5 || should_skip_search_directory(root) {
        return Ok(());
    }

    let queue_work_orders = root
        .join(QUEUE_DIRECTORY_NAME)
        .join(WORK_ORDERS_DIRECTORY_NAME);

    if queue_work_orders.is_dir() {
        matches.extend(find_work_order_matches_in_directory(
            &queue_work_orders,
            work_order_id,
        )?);
    }

    let entries = match fs::read_dir(root) {
        Ok(entries) => entries,
        Err(error) if error.kind() == io::ErrorKind::PermissionDenied => return Ok(()),
        Err(error) => return Err(io_error("workspace-search-failed", root, error)),
    };

    for entry in entries.flatten() {
        let path = entry.path();

        if path.is_dir() {
            collect_work_order_matches(&path, work_order_id, depth + 1, matches)?;
        }
    }

    Ok(())
}

fn should_skip_search_directory(path: &Path) -> bool {
    matches!(
        path.file_name().and_then(|name| name.to_str()),
        Some(".git" | "node_modules" | "target" | ".svelte-kit" | "build")
    )
}

fn find_work_order_in_workspace(
    workspace_path: &Path,
    work_order_id: &str,
) -> Result<PathBuf, CliError> {
    let work_orders_path = workspace_path
        .join(QUEUE_DIRECTORY_NAME)
        .join(WORK_ORDERS_DIRECTORY_NAME);

    find_work_order_in_directory(&work_orders_path, work_order_id)
}

fn find_work_order_in_directory(
    work_orders_path: &Path,
    work_order_id: &str,
) -> Result<PathBuf, CliError> {
    let mut matches = find_work_order_matches_in_directory(work_orders_path, work_order_id)?;

    match matches.len() {
        0 => Err(CliError {
            code: "work-order-not-found",
            message: format!("작업 ID를 찾지 못했습니다: {}", work_order_id.trim()),
        }),
        1 => Ok(matches.remove(0)),
        _ => Err(CliError {
            code: "work-order-ambiguous",
            message: format!(
                "같은 ref.id를 가진 작업 파일이 여러 개입니다: {} ({}개)",
                work_order_id.trim(),
                matches.len()
            ),
        }),
    }
}

fn find_work_order_matches_in_directory(
    work_orders_path: &Path,
    work_order_id: &str,
) -> Result<Vec<PathBuf>, CliError> {
    let entries = fs::read_dir(work_orders_path)
        .map_err(|error| io_error("work-orders-read-failed", work_orders_path, error))?;
    let work_order_id = work_order_id.trim();
    let mut matches = Vec::new();

    for entry in entries.flatten() {
        let path = entry.path();
        let file_name = path
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("");

        if !file_name.ends_with(WORK_ORDER_FILE_SUFFIX) || !path.is_file() {
            continue;
        }

        let content = match fs::read_to_string(&path) {
            Ok(content) => content,
            Err(_) => continue,
        };

        let lookup = match serde_json::from_str::<WorkOrderLookupDocument>(&content) {
            Ok(lookup) => lookup,
            Err(_) => continue,
        };

        if lookup.r#ref.id != work_order_id {
            continue;
        }

        matches.push(
            fs::canonicalize(&path)
                .map_err(|error| io_error("work-order-path-invalid", &path, error))?,
        );
    }

    matches.sort();
    matches.dedup();
    Ok(matches)
}

fn workspace_from_work_order_path(work_order_path: &Path) -> Result<PathBuf, CliError> {
    let file_name = work_order_path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("");

    if !file_name.ends_with(WORK_ORDER_FILE_SUFFIX) {
        return Err(CliError {
            code: "work-order-file-invalid",
            message: "Workduck 작업 지시서 파일이 아닙니다.".to_string(),
        });
    }

    let work_orders = work_order_path.parent().ok_or_else(|| CliError {
        code: "work-order-path-invalid",
        message: "작업 지시서 경로가 올바르지 않습니다.".to_string(),
    })?;
    let queue = work_orders.parent().ok_or_else(|| CliError {
        code: "work-order-path-invalid",
        message: "작업 지시서 경로가 올바르지 않습니다.".to_string(),
    })?;
    let workspace = queue.parent().ok_or_else(|| CliError {
        code: "work-order-path-invalid",
        message: "작업 지시서 경로가 올바르지 않습니다.".to_string(),
    })?;

    if work_orders.file_name().and_then(|name| name.to_str()) != Some(WORK_ORDERS_DIRECTORY_NAME)
        || queue.file_name().and_then(|name| name.to_str()) != Some(QUEUE_DIRECTORY_NAME)
    {
        return Err(CliError {
            code: "work-order-path-invalid",
            message: "작업 지시서가 queue/work-orders 아래에 있지 않습니다.".to_string(),
        });
    }

    canonicalize_directory(workspace)
}

fn read_workspace_id(workspace_path: &Path) -> Result<String, CliError> {
    let workspace_json: Option<Value> =
        read_optional_workspace_json(workspace_path, "workspace.json")?;

    workspace_json
        .and_then(|value| {
            value
                .get("id")
                .and_then(Value::as_str)
                .map(str::trim)
                .filter(|id| !id.is_empty())
                .map(ToString::to_string)
        })
        .or_else(|| {
            workspace_path
                .file_name()
                .and_then(|name| name.to_str())
                .map(ToString::to_string)
        })
        .ok_or_else(|| CliError {
            code: "workspace-id-unavailable",
            message: "워크스페이스 ID를 확인하지 못했습니다.".to_string(),
        })
}

struct AgentEvaluationWriteResult {
    agent_id: String,
    agent_name: String,
    applied: bool,
    evaluation_key: Option<String>,
    total_count: u64,
}

fn record_agent_evaluation_in_registry(
    registry: &mut Value,
    workspace_id: &str,
    agent_key: &str,
    evaluation_key: Option<&str>,
    scores: AgentEvaluationScores,
) -> Result<AgentEvaluationWriteResult, CliError> {
    let timestamp = current_timestamp()?;
    let normalized_evaluation_key = normalize_evaluation_key(evaluation_key);
    let registry_object = registry.as_object_mut().ok_or_else(|| CliError {
        code: "agent-registry-invalid",
        message: "에이전트 레지스트리 형식이 올바르지 않습니다.".to_string(),
    })?;

    let registry_workspace_id = registry_object
        .get("workspaceId")
        .and_then(Value::as_str)
        .unwrap_or("");

    if registry_workspace_id != workspace_id {
        return Err(CliError {
            code: "agent-registry-workspace-mismatch",
            message: "에이전트 레지스트리의 워크스페이스 ID가 현재 워크스페이스와 다릅니다."
                .to_string(),
        });
    }

    let agents = registry_object
        .get_mut("agents")
        .and_then(Value::as_array_mut)
        .ok_or_else(|| CliError {
            code: "agent-registry-invalid",
            message: "에이전트 목록 형식이 올바르지 않습니다.".to_string(),
        })?;
    let agent_index = resolve_agent_index(agents, agent_key)?;
    let agent = agents.get_mut(agent_index).ok_or_else(|| CliError {
        code: "agent-not-found",
        message: format!("에이전트를 찾지 못했습니다: {agent_key}"),
    })?;
    let agent_id = agent
        .get("id")
        .and_then(Value::as_str)
        .unwrap_or(agent_key)
        .to_string();
    let agent_name = agent
        .get("name")
        .and_then(Value::as_str)
        .unwrap_or(&agent_id)
        .to_string();

    if let Some(evaluation_key) = normalized_evaluation_key.as_ref() {
        let already_recorded = {
            let agent_object = ensure_json_object(agent);
            let evaluation_keys_value = agent_object
                .entry("evaluationKeys")
                .or_insert_with(|| Value::Array(Vec::new()));

            if !evaluation_keys_value.is_array() {
                *evaluation_keys_value = Value::Array(Vec::new());
            }

            let evaluation_keys = evaluation_keys_value.as_array_mut().expect("array value");

            if evaluation_keys
                .iter()
                .any(|value| value.as_str() == Some(evaluation_key.as_str()))
            {
                true
            } else {
                evaluation_keys.push(Value::String(evaluation_key.clone()));
                false
            }
        };

        if already_recorded {
            return Ok(AgentEvaluationWriteResult {
                agent_id,
                agent_name,
                applied: false,
                evaluation_key: normalized_evaluation_key,
                total_count: read_evaluation_summary_snapshot(agent.get("evaluationSummary"))
                    .total_count,
            });
        }
    }

    let total_count = record_evaluation_summary_on_record(agent, &timestamp, scores);

    registry_object.insert("updatedAt".to_string(), Value::String(timestamp));

    Ok(AgentEvaluationWriteResult {
        agent_id,
        agent_name,
        applied: true,
        evaluation_key: normalized_evaluation_key,
        total_count,
    })
}

fn normalize_evaluation_key(value: Option<&str>) -> Option<String> {
    value
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToString::to_string)
}

#[derive(Clone, Copy, Debug, Default, Eq, PartialEq)]
struct EvaluationSummarySnapshot {
    total_count: u64,
    counts: [u64; 5],
    score_sums: [u64; 5],
}

fn sync_persona_evaluation_summaries_from_agents(
    persona_registry: &mut Value,
    agent_registry: &Value,
    workspace_id: &str,
) -> Result<bool, CliError> {
    let timestamp = current_timestamp()?;
    let persona_registry_object = persona_registry.as_object_mut().ok_or_else(|| CliError {
        code: "persona-registry-invalid",
        message: "페르소나 레지스트리 형식이 올바르지 않습니다.".to_string(),
    })?;

    let persona_registry_workspace_id = persona_registry_object
        .get("workspaceId")
        .and_then(Value::as_str)
        .unwrap_or("");

    if persona_registry_workspace_id != workspace_id {
        return Err(CliError {
            code: "persona-registry-workspace-mismatch",
            message: "페르소나 레지스트리의 워크스페이스 ID가 현재 워크스페이스와 다릅니다."
                .to_string(),
        });
    }

    let agent_registry_object = agent_registry.as_object().ok_or_else(|| CliError {
        code: "agent-registry-invalid",
        message: "에이전트 레지스트리 형식이 올바르지 않습니다.".to_string(),
    })?;

    let agent_registry_workspace_id = agent_registry_object
        .get("workspaceId")
        .and_then(Value::as_str)
        .unwrap_or("");

    if agent_registry_workspace_id != workspace_id {
        return Err(CliError {
            code: "agent-registry-workspace-mismatch",
            message: "에이전트 레지스트리의 워크스페이스 ID가 현재 워크스페이스와 다릅니다."
                .to_string(),
        });
    }

    let agents = agent_registry_object
        .get("agents")
        .and_then(Value::as_array)
        .ok_or_else(|| CliError {
            code: "agent-registry-invalid",
            message: "에이전트 목록 형식이 올바르지 않습니다.".to_string(),
        })?;
    let personas = persona_registry_object
        .get_mut("personas")
        .and_then(Value::as_array_mut)
        .ok_or_else(|| CliError {
            code: "persona-registry-invalid",
            message: "페르소나 목록 형식이 올바르지 않습니다.".to_string(),
        })?;

    let persona_ids = personas
        .iter()
        .filter_map(|persona| persona.get("id").and_then(Value::as_str))
        .map(ToOwned::to_owned)
        .collect::<HashSet<_>>();
    let mut summary_by_persona_id = HashMap::<String, EvaluationSummarySnapshot>::new();

    for agent in agents {
        let Some(persona_id) = agent
            .get("personaId")
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|value| !value.is_empty())
        else {
            continue;
        };

        if !persona_ids.contains(persona_id) {
            continue;
        }

        let agent_summary = read_evaluation_summary_snapshot(agent.get("evaluationSummary"));
        let persona_summary = summary_by_persona_id
            .entry(persona_id.to_string())
            .or_default();

        merge_evaluation_summary_snapshots(persona_summary, agent_summary);
    }

    let mut changed = false;

    for persona in personas {
        let Some(persona_id) = persona.get("id").and_then(Value::as_str) else {
            continue;
        };
        let next_summary = summary_by_persona_id
            .get(persona_id)
            .copied()
            .unwrap_or_default();

        if read_evaluation_summary_snapshot(persona.get("evaluationSummary")) == next_summary {
            continue;
        }

        let persona_object = ensure_json_object(persona);
        persona_object.insert(
            "evaluationSummary".to_string(),
            evaluation_summary_snapshot_to_value(next_summary),
        );
        persona_object.insert("updatedAt".to_string(), Value::String(timestamp.clone()));
        changed = true;
    }

    if changed {
        persona_registry_object.insert("updatedAt".to_string(), Value::String(timestamp));
    }

    Ok(changed)
}

fn read_evaluation_summary_snapshot(value: Option<&Value>) -> EvaluationSummarySnapshot {
    let input = value.and_then(Value::as_object);
    let raw_criteria = input
        .and_then(|value| value.get("criteria"))
        .and_then(Value::as_object);
    let mut summary = EvaluationSummarySnapshot::default();

    for (index, criterion_id) in AGENT_EVALUATION_CRITERION_IDS.iter().enumerate() {
        let raw_criterion = raw_criteria
            .and_then(|criteria| criteria.get(*criterion_id))
            .and_then(Value::as_object);
        let count = read_json_u64(raw_criterion.and_then(|criterion| criterion.get("count")));
        let score_sum =
            read_json_u64(raw_criterion.and_then(|criterion| criterion.get("scoreSum")))
                .min(count * 9);

        summary.counts[index] = count;
        summary.score_sums[index] = score_sum;
    }

    let largest_criterion_count = summary.counts.iter().copied().max().unwrap_or(0);
    summary.total_count =
        read_json_u64(input.and_then(|value| value.get("totalCount"))).max(largest_criterion_count);

    summary
}

fn merge_evaluation_summary_snapshots(
    target: &mut EvaluationSummarySnapshot,
    source: EvaluationSummarySnapshot,
) {
    target.total_count += source.total_count;

    for index in 0..AGENT_EVALUATION_CRITERION_IDS.len() {
        target.counts[index] += source.counts[index];
        target.score_sums[index] += source.score_sums[index];
    }
}

fn evaluation_summary_snapshot_to_value(summary: EvaluationSummarySnapshot) -> Value {
    let mut criteria = serde_json::Map::new();

    for (index, criterion_id) in AGENT_EVALUATION_CRITERION_IDS.iter().enumerate() {
        criteria.insert(
            (*criterion_id).to_string(),
            serde_json::json!({
                "count": summary.counts[index],
                "scoreSum": summary.score_sums[index],
            }),
        );
    }

    serde_json::json!({
        "totalCount": summary.total_count,
        "criteria": criteria,
    })
}

fn record_evaluation_summary_on_record(
    record: &mut Value,
    timestamp: &str,
    scores: AgentEvaluationScores,
) -> u64 {
    let record_object = ensure_json_object(record);
    let summary = record_object
        .entry("evaluationSummary")
        .or_insert_with(|| serde_json::json!({}));
    let summary_object = ensure_json_object(summary);
    let previous_total_count = read_json_u64(summary_object.get("totalCount"));
    let next_total_count = previous_total_count + 1;

    summary_object.insert("totalCount".to_string(), Value::from(next_total_count));
    let criteria_value = summary_object
        .entry("criteria")
        .or_insert_with(|| serde_json::json!({}));
    let criteria_object = ensure_json_object(criteria_value);

    for (criterion_id, score) in [
        ("problemUnderstanding", scores.problem_understanding),
        ("logicalValidity", scores.logical_validity),
        ("practicalFeasibility", scores.practical_feasibility),
        ("creativeInsight", scores.creative_insight),
        ("riskDetection", scores.risk_detection),
    ] {
        let criterion_value = criteria_object
            .entry(criterion_id.to_string())
            .or_insert_with(|| serde_json::json!({}));
        let criterion_object = ensure_json_object(criterion_value);
        let previous_count = read_json_u64(criterion_object.get("count"));
        let previous_score_sum = read_json_u64(criterion_object.get("scoreSum"));

        criterion_object.insert("count".to_string(), Value::from(previous_count + 1));
        criterion_object.insert(
            "scoreSum".to_string(),
            Value::from(previous_score_sum + u64::from(score)),
        );
    }

    record_object.insert(
        "updatedAt".to_string(),
        Value::String(timestamp.to_string()),
    );

    next_total_count
}

fn resolve_agent_index(agents: &[Value], agent_key: &str) -> Result<usize, CliError> {
    if let Some((index, _)) = agents
        .iter()
        .enumerate()
        .find(|(_, agent)| agent.get("id").and_then(Value::as_str) == Some(agent_key))
    {
        return Ok(index);
    }

    let matching_indexes: Vec<usize> = agents
        .iter()
        .enumerate()
        .filter_map(|(index, agent)| {
            (agent.get("name").and_then(Value::as_str) == Some(agent_key)).then_some(index)
        })
        .collect();

    match matching_indexes.len() {
        0 => Err(CliError {
            code: "agent-not-found",
            message: format!("에이전트를 찾지 못했습니다: {agent_key}"),
        }),
        1 => Ok(matching_indexes[0]),
        _ => Err(CliError {
            code: "agent-ambiguous",
            message: "같은 이름의 에이전트가 여러 개입니다. 에이전트 ID를 지정하세요.".to_string(),
        }),
    }
}

fn ensure_json_object(value: &mut Value) -> &mut serde_json::Map<String, Value> {
    if !value.is_object() {
        *value = serde_json::json!({});
    }

    value.as_object_mut().expect("object value")
}

fn read_json_u64(value: Option<&Value>) -> u64 {
    value
        .and_then(Value::as_u64)
        .or_else(|| {
            value
                .and_then(Value::as_str)
                .and_then(|value| value.parse::<u64>().ok())
        })
        .unwrap_or(0)
}

fn read_environment_vault(
    workspace_path: &Path,
    workspace_id: &str,
    password: Option<&str>,
) -> Result<Option<EnvironmentVault>, CliError> {
    let Some(password) = password else {
        return Ok(None);
    };
    let envelope: SecretVaultEnvelope = read_json_file(
        &workspace_data_path(workspace_path, VAULT_FILE_NAME),
        "vault-invalid",
    )?;
    let plaintext = decrypt_secret_vault_payload(password, &envelope)?;
    let vault: EnvironmentVault = serde_json::from_str(&plaintext).map_err(|_| CliError {
        code: "vault-invalid",
        message: "보관함 데이터를 해석하지 못했습니다.".to_string(),
    })?;

    if vault.workspace_id != workspace_id {
        return Err(CliError {
            code: "vault-workspace-mismatch",
            message: "보관함의 워크스페이스 ID가 현재 워크스페이스와 다릅니다.".to_string(),
        });
    }

    Ok(Some(vault))
}

fn decrypt_secret_vault_payload(
    password: &str,
    envelope: &SecretVaultEnvelope,
) -> Result<String, CliError> {
    if password.is_empty() {
        return Err(CliError {
            code: "vault-password-required",
            message: "보관함 암호가 비어 있습니다.".to_string(),
        });
    }

    if !is_supported_envelope(envelope) {
        return Err(CliError {
            code: "vault-envelope-invalid",
            message: "지원하지 않는 보관함 형식입니다.".to_string(),
        });
    }

    let salt = BASE64
        .decode(envelope.kdf.salt.as_bytes())
        .map_err(|_| CliError {
            code: "vault-salt-invalid",
            message: "보관함 salt가 올바르지 않습니다.".to_string(),
        })?;
    let nonce = BASE64
        .decode(envelope.cipher.nonce.as_bytes())
        .map_err(|_| CliError {
            code: "vault-nonce-invalid",
            message: "보관함 nonce가 올바르지 않습니다.".to_string(),
        })?;
    let ciphertext = BASE64
        .decode(envelope.ciphertext.as_bytes())
        .map_err(|_| CliError {
            code: "vault-ciphertext-invalid",
            message: "보관함 암호문이 올바르지 않습니다.".to_string(),
        })?;

    if salt.len() != VAULT_SALT_LENGTH || nonce.len() != VAULT_NONCE_LENGTH {
        return Err(CliError {
            code: "vault-envelope-invalid",
            message: "보관함 암호화 매개변수가 올바르지 않습니다.".to_string(),
        });
    }

    let mut key = derive_vault_key(
        password.as_bytes(),
        &salt,
        envelope.kdf.memory_kib,
        envelope.kdf.iterations,
        envelope.kdf.parallelism,
    )?;
    let cipher = XChaCha20Poly1305::new_from_slice(&key).map_err(|_| CliError {
        code: "vault-decryption-failed",
        message: "보관함 복호화에 실패했습니다.".to_string(),
    })?;
    let xnonce = <&XNonce>::try_from(nonce.as_slice()).map_err(|_| CliError {
        code: "vault-nonce-invalid",
        message: "보관함 nonce가 올바르지 않습니다.".to_string(),
    })?;
    let plaintext = cipher
        .decrypt(
            xnonce,
            Payload {
                msg: ciphertext.as_ref(),
                aad: VAULT_AAD,
            },
        )
        .map_err(|_| CliError {
            code: "vault-decryption-failed",
            message: "보관함 복호화에 실패했습니다.".to_string(),
        })?;
    key.zeroize();

    String::from_utf8(plaintext).map_err(|_| CliError {
        code: "vault-plaintext-invalid",
        message: "보관함 평문이 UTF-8 문자열이 아닙니다.".to_string(),
    })
}

fn derive_vault_key(
    password: &[u8],
    salt: &[u8],
    memory_kib: u32,
    iterations: u32,
    parallelism: u32,
) -> Result<[u8; VAULT_KEY_LENGTH], CliError> {
    derive_argon2id_key(password, salt, memory_kib, iterations, parallelism).map_err(|_| CliError {
        code: "vault-key-derivation-failed",
        message: "보관함 키 파생에 실패했습니다.".to_string(),
    })
}

fn is_supported_envelope(envelope: &SecretVaultEnvelope) -> bool {
    envelope.format == "workduck.secret-vault"
        && envelope.version == 1
        && envelope.kdf.algorithm == "argon2id"
        && envelope.kdf.version == ARGON2ID_VERSION
        && parameters_are_supported(
            envelope.kdf.version,
            envelope.kdf.memory_kib,
            envelope.kdf.iterations,
            envelope.kdf.parallelism,
        )
        && envelope.cipher.algorithm == "xchacha20poly1305"
}

fn read_optional_workspace_json<T: for<'de> Deserialize<'de>>(
    workspace_path: &Path,
    file_name: &str,
) -> Result<Option<T>, CliError> {
    let path = workspace_data_path(workspace_path, file_name);

    if !path.exists() {
        return Ok(None);
    }

    read_json_file(&path, "workspace-data-invalid").map(Some)
}

fn read_json_file<T: for<'de> Deserialize<'de>>(
    path: &Path,
    code: &'static str,
) -> Result<T, CliError> {
    let content =
        fs::read_to_string(path).map_err(|error| io_error("file-read-failed", path, error))?;

    serde_json::from_str(&content).map_err(|_| CliError {
        code,
        message: format!("JSON 파일을 해석하지 못했습니다: {}", path.display()),
    })
}

fn write_json_file<T: Serialize>(path: &Path, value: &T) -> Result<(), CliError> {
    let content = serde_json::to_string_pretty(value)
        .map_err(to_json_error)
        .map(|content| format!("{content}\n"))?;
    reject_symlink_path(path)?;

    let parent = path.parent().ok_or_else(|| CliError {
        code: "file-write-failed",
        message: format!("파일 경로에 상위 디렉터리가 없습니다: {}", path.display()),
    })?;
    let file_name = path
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| CliError {
            code: "file-write-failed",
            message: format!("파일 이름이 유효하지 않습니다: {}", path.display()),
        })?;
    let process_id = std::process::id();

    for index in 0..32 {
        let temporary_path = parent.join(format!(".{file_name}.tmp.{process_id}.{index}"));
        reject_symlink_path(&temporary_path)?;

        let mut temporary_file = match fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temporary_path)
        {
            Ok(file) => file,
            Err(error) if error.kind() == io::ErrorKind::AlreadyExists => continue,
            Err(error) => return Err(io_error("file-write-failed", &temporary_path, error)),
        };

        let write_result = temporary_file
            .write_all(content.as_bytes())
            .and_then(|_| temporary_file.flush());
        drop(temporary_file);

        if let Err(error) = write_result {
            let _ = fs::remove_file(&temporary_path);
            return Err(io_error("file-write-failed", &temporary_path, error));
        }

        return fs::rename(&temporary_path, path).map_err(|error| {
            let _ = fs::remove_file(&temporary_path);
            io_error("file-write-failed", path, error)
        });
    }

    Err(CliError {
        code: "file-write-failed",
        message: format!("임시 파일 이름을 확보하지 못했습니다: {}", path.display()),
    })
}

fn reject_symlink_path(path: &Path) -> Result<(), CliError> {
    if let Ok(metadata) = fs::symlink_metadata(path) {
        if metadata.file_type().is_symlink() {
            return Err(CliError {
                code: "file-write-failed",
                message: format!("심볼릭 링크에는 쓸 수 없습니다: {}", path.display()),
            });
        }
    }

    Ok(())
}

fn workspace_data_path(workspace_path: &Path, file_name: &str) -> PathBuf {
    workspace_path.join(WORKDUCK_DIRECTORY_NAME).join(file_name)
}

fn canonicalize_directory(path: &Path) -> Result<PathBuf, CliError> {
    let path =
        fs::canonicalize(path).map_err(|error| io_error("workspace-path-invalid", path, error))?;

    if !path.is_dir() {
        return Err(CliError {
            code: "workspace-path-invalid",
            message: format!("디렉터리가 아닙니다: {}", path.display()),
        });
    }

    Ok(path)
}

fn current_timestamp() -> Result<String, CliError> {
    OffsetDateTime::now_utc()
        .format(&Rfc3339)
        .map_err(|_| CliError {
            code: "timestamp-format-failed",
            message: "현재 시각을 문자열로 만들지 못했습니다.".to_string(),
        })
}

fn to_json_error(_: serde_json::Error) -> CliError {
    CliError {
        code: "json-serialize-failed",
        message: "JSON 직렬화에 실패했습니다.".to_string(),
    }
}

fn io_error(code: &'static str, path: &Path, error: io::Error) -> CliError {
    CliError {
        code,
        message: format!("{}: {error}", path.display()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn queue_run_args(extra: &[&str]) -> Vec<String> {
        ["queue", "run", "  wo_test  "]
            .into_iter()
            .chain(extra.iter().copied())
            .map(str::to_string)
            .collect()
    }

    fn write_work_order_lookup_fixture(
        work_orders_path: &Path,
        file_name: &str,
        ref_id: &str,
        label: &str,
    ) -> PathBuf {
        fs::create_dir_all(work_orders_path).expect("work-orders directory");
        let path = work_orders_path.join(file_name);
        let content = serde_json::json!({
            "schemaVersion": "workduck.queue-work-order/v1",
            "ref": {
                "id": ref_id,
                "kind": "queue-work-order",
                "label": label
            },
            "status": "active",
            "tasks": []
        });
        fs::write(
            &path,
            serde_json::to_string_pretty(&content).expect("fixture JSON"),
        )
        .expect("fixture write");
        path
    }

    #[test]
    fn queue_run_reads_vault_password_from_the_environment_boundary() {
        let options = parse_args_with_vault_password(
            queue_run_args(&["--json"]),
            Some("environment-only-password".to_string()),
        )
        .expect("environment-backed password should be accepted");

        assert_eq!(options.work_order_id, "wo_test");
        assert_eq!(options.vault_password.as_deref(), Some("environment-only-password"));
        assert!(options.json);
    }

    #[test]
    fn queue_run_rejects_vault_password_command_line_argument() {
        let error = match parse_args_with_vault_password(
            queue_run_args(&["--vault-password", "must-not-enter-argv"]),
            None,
        ) {
            Ok(_) => panic!("password-bearing command-line arguments must be rejected"),
            Err(error) => error,
        };

        assert_eq!(error.code, "unknown-option");
        assert!(!error.message.contains("must-not-enter-argv"));
        assert!(!usage_text().contains("--vault-password"));
    }

    #[test]
    fn work_order_lookup_matches_only_the_exact_ref_id() {
        let workspace = tempfile::tempdir().expect("workspace");
        let work_orders_path = workspace.path().join("queue").join("work-orders");
        let requested_id = "wo_exact";
        let expected_path = write_work_order_lookup_fixture(
            &work_orders_path,
            "unrelated-file-name.workduck-work-order.json",
            requested_id,
            "Exact match",
        );
        write_work_order_lookup_fixture(
            &work_orders_path,
            "wo_exact-filename-trap.workduck-work-order.json",
            "wo_other",
            "Body mentions wo_exact but ref.id does not match",
        );

        let found = find_work_order_in_directory(&work_orders_path, requested_id)
            .expect("exact ref.id should be found");

        assert_eq!(
            found,
            fs::canonicalize(expected_path).expect("canonical fixture path")
        );
    }

    #[test]
    fn work_order_lookup_rejects_duplicate_exact_ref_ids() {
        let workspace = tempfile::tempdir().expect("workspace");
        let work_orders_path = workspace.path().join("queue").join("work-orders");
        write_work_order_lookup_fixture(
            &work_orders_path,
            "first.workduck-work-order.json",
            "wo_duplicate",
            "First",
        );
        write_work_order_lookup_fixture(
            &work_orders_path,
            "second.workduck-work-order.json",
            "wo_duplicate",
            "Second",
        );

        let error = match find_work_order_in_directory(&work_orders_path, "wo_duplicate") {
            Ok(_) => panic!("duplicate ref.id values must be rejected"),
            Err(error) => error,
        };

        assert_eq!(error.code, "work-order-ambiguous");
        assert!(error.message.contains("2개"));
    }

    #[test]
    fn work_order_lookup_ignores_non_work_order_json_and_malformed_candidates() {
        let workspace = tempfile::tempdir().expect("workspace");
        let work_orders_path = workspace.path().join("queue").join("work-orders");
        fs::create_dir_all(&work_orders_path).expect("work-orders directory");
        fs::write(
            work_orders_path.join("not-a-work-order.json"),
            r#"{"ref":{"id":"wo_hidden"}}"#,
        )
        .expect("non-work-order JSON");
        fs::write(
            work_orders_path.join("broken.workduck-work-order.json"),
            r#"{"ref":{"id":"wo_hidden"}"#,
        )
        .expect("malformed work-order JSON");

        let error = match find_work_order_in_directory(&work_orders_path, "wo_hidden") {
            Ok(_) => panic!("invalid candidates must not be selected"),
            Err(error) => error,
        };

        assert_eq!(error.code, "work-order-not-found");
    }
}
