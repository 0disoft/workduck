use std::{
    env, fs, io,
    path::{Path, PathBuf},
    time::Duration,
};

use argon2::{Algorithm, Argon2, Params, Version};
use base64::{Engine as _, engine::general_purpose::STANDARD as BASE64};
use chacha20poly1305::{
    Key, XChaCha20Poly1305, XNonce,
    aead::{Aead, KeyInit, Payload},
};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use time::{OffsetDateTime, format_description::well_known::Rfc3339};
use workduck_lib::system_environment::read_cli_user_environment_variable;
use zeroize::Zeroize;

const APP_NAME: &str = "workduck";
const WORKDUCK_DIRECTORY_NAME: &str = ".workduck";
const QUEUE_DIRECTORY_NAME: &str = "queue";
const REPORTS_DIRECTORY_NAME: &str = "reports";
const WORK_ORDERS_DIRECTORY_NAME: &str = "work-orders";
const WORK_ORDER_FILE_SUFFIX: &str = ".workduck-work-order.json";
const REPORT_FILE_SUFFIX: &str = ".workduck-report.json";
const VAULT_FILE_NAME: &str = "secrets.sync.json";
const AGENTS_FILE_NAME: &str = "agents.json";
const PERSONAS_FILE_NAME: &str = "personas.json";
const REFERENCES_FILE_NAME: &str = "references.json";
const SKILLS_FILE_NAME: &str = "skills.json";
const VAULT_AAD: &[u8] = b"workduck.secret-vault.v1";
const VAULT_KEY_LENGTH: usize = 32;
const VAULT_SALT_LENGTH: usize = 16;
const VAULT_NONCE_LENGTH: usize = 24;
const CHAT_COMPLETION_TIMEOUT_SECONDS: u64 = 120;
const MAX_PROMPT_LENGTH: usize = 48_000;
const MAX_MODEL_LENGTH: usize = 160;

#[derive(Debug)]
struct CliError {
    code: &'static str,
    message: String,
}

#[derive(Default)]
struct CliOptions {
    work_order_id: String,
    workspace_path: Option<PathBuf>,
    vault_password: Option<String>,
    keep_work_order: bool,
    json: bool,
}

#[derive(Default)]
struct AgentEvaluateOptions {
    agent_key: String,
    workspace_path: Option<PathBuf>,
    scores: Option<AgentEvaluationScores>,
    json: bool,
}

#[derive(Clone, Copy, Serialize)]
#[serde(rename_all = "camelCase")]
struct AgentEvaluationScores {
    problem_understanding: u8,
    logical_validity: u8,
    practical_feasibility: u8,
    creative_insight: u8,
    risk_detection: u8,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct QueueEntityRef {
    id: String,
    kind: String,
    label: String,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct QueueWorkOrder {
    schema_version: String,
    r#ref: QueueEntityRef,
    status: String,
    created_at: String,
    #[serde(default)]
    tasks: Vec<QueueWorkOrderTask>,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct QueueWorkOrderTask {
    id: String,
    title: String,
    body: String,
    #[serde(default)]
    priority: Option<String>,
    #[serde(default)]
    agent_ids: Vec<String>,
    #[serde(default)]
    skill_ids: Vec<String>,
    #[serde(default)]
    reference_ids: Vec<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct AgentRegistry {
    #[serde(default)]
    agents: Vec<AgentRecord>,
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AgentRecord {
    id: String,
    name: String,
    #[serde(default)]
    environment_secret_id: Option<String>,
    #[serde(default)]
    persona_id: Option<String>,
    #[serde(default)]
    execution_provider: Option<String>,
    #[serde(default)]
    model_id: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct EnvironmentVault {
    workspace_id: String,
    #[serde(default)]
    secrets: Vec<EnvironmentSecretRecord>,
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct EnvironmentSecretRecord {
    id: String,
    name: String,
    kind: String,
    #[serde(default)]
    tags: Vec<String>,
    value: String,
}

#[derive(Clone)]
struct ResolvedSecret {
    name: String,
    tags: Vec<String>,
    value: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct PersonaRegistry {
    #[serde(default)]
    personas: Vec<PersonaRecord>,
}

#[derive(Clone, Deserialize)]
struct PersonaRecord {
    id: String,
    #[serde(default)]
    description: String,
    #[serde(default)]
    instructions: String,
    #[serde(default)]
    styles: Value,
    #[serde(default)]
    spectrums: Value,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SkillRegistry {
    #[serde(default)]
    skills: Vec<SkillRecord>,
}

#[derive(Clone, Deserialize)]
struct SkillRecord {
    id: String,
    name: String,
    #[serde(default)]
    instructions: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ReferenceRegistry {
    #[serde(default)]
    references: Vec<ReferenceRecord>,
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ReferenceRecord {
    id: String,
    title: String,
    #[serde(default)]
    content: String,
    #[serde(default)]
    source_url: String,
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

#[derive(Clone)]
struct AgentExecutionRun {
    task: QueueWorkOrderTask,
    agent: AgentRecord,
    secret: ResolvedSecret,
    persona: Option<PersonaRecord>,
    provider: String,
    model: String,
    skills: Vec<SkillRecord>,
    references: Vec<ReferenceRecord>,
}

enum AgentPromptMode {
    WorkOrder,
    DirectMessage { message: String },
}

struct AgentPromptPlan {
    mode: AgentPromptMode,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct QueueResultReport {
    schema_version: &'static str,
    r#ref: QueueEntityRef,
    status: &'static str,
    created_at: String,
    agent_name: String,
    tasks: Vec<QueueResultReportTask>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct QueueResultReportTask {
    id: String,
    title: String,
    summary: String,
    files_changed: Vec<String>,
    verification: Vec<String>,
    risks: Vec<String>,
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
                println!("{}", serde_json::to_string_pretty(&payload).unwrap_or_default());
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
    let work_order: QueueWorkOrder = read_json_file(&located.work_order_path, "work-order-invalid")?;

    validate_work_order(&work_order, &options.work_order_id)?;

    let agents: AgentRegistry = read_optional_workspace_json(&located.workspace_path, AGENTS_FILE_NAME)?
        .unwrap_or(AgentRegistry { agents: Vec::new() });
    let personas: PersonaRegistry = read_optional_workspace_json(&located.workspace_path, PERSONAS_FILE_NAME)?
        .unwrap_or(PersonaRegistry { personas: Vec::new() });
    let skills: SkillRegistry = read_optional_workspace_json(&located.workspace_path, SKILLS_FILE_NAME)?
        .unwrap_or(SkillRegistry { skills: Vec::new() });
    let references: ReferenceRegistry =
        read_optional_workspace_json(&located.workspace_path, REFERENCES_FILE_NAME)?
            .unwrap_or(ReferenceRegistry {
                references: Vec::new(),
            });
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
    let mut handles = Vec::new();

    for run in runs {
        handles.push(tauri::async_runtime::spawn(async move {
            run_agent_prompt(run).await
        }));
    }

    let mut outputs = Vec::new();

    for handle in handles {
        let output = handle.await.map_err(|_| CliError {
            code: "agent-execution-failed",
            message: "에이전트 응답 처리 중 작업이 중단되었습니다.".to_string(),
        })??;
        outputs.push(output);
    }

    let report = create_result_report(&work_order, outputs)?;
    let report_path = write_result_report(&located.workspace_path, &report)?;

    if !options.keep_work_order {
        let mut archived_work_order = work_order.clone();
        archived_work_order.status = "archived".to_string();
        write_json_file(&located.work_order_path, &archived_work_order)?;
    }

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
        println!("{}", serde_json::to_string_pretty(&payload).map_err(to_json_error)?);
    } else {
        println!("작업 실행 완료: {}", report_path.display());
        println!("응답 수신: {}", report.agent_name);
    }

    Ok(())
}

fn run_agent_command(args: Vec<String>) -> Result<(), CliError> {
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
    let scores = options.scores.ok_or_else(|| CliError {
        code: "agent-evaluation-score-required",
        message: "다섯 평가 점수를 모두 지정해야 합니다.".to_string(),
    })?;
    let result =
        record_agent_evaluation_in_registry(&mut registry, &workspace_id, &options.agent_key, scores)?;

    write_json_file(&agents_path, &registry)?;

    if options.json {
        let payload = AgentEvaluationJsonSuccess {
            ok: true,
            workspace_path: &workspace_path,
            agent_id: &result.agent_id,
            agent_name: &result.agent_name,
            total_count: result.total_count,
            scores,
        };
        println!("{}", serde_json::to_string_pretty(&payload).map_err(to_json_error)?);
    } else {
        println!(
            "에이전트 평가 저장: {} ({}건)",
            result.agent_name, result.total_count
        );
    }

    Ok(())
}

struct LocatedWorkOrder {
    workspace_path: PathBuf,
    work_order_path: PathBuf,
}

fn parse_args(args: Vec<String>) -> Result<CliOptions, CliError> {
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
            "--vault-password" => {
                index += 1;
                options.vault_password = args.get(index).cloned();
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

    if options.vault_password.is_none() {
        options.vault_password = env::var("WORKDUCK_VAULT_PASSWORD").ok();
    }

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
            "--problem-understanding" => {
                index += 1;
                problem_understanding = Some(parse_score_argument(args.get(index), "--problem-understanding")?);
            }
            "--logical-validity" => {
                index += 1;
                logical_validity = Some(parse_score_argument(args.get(index), "--logical-validity")?);
            }
            "--practical-feasibility" => {
                index += 1;
                practical_feasibility =
                    Some(parse_score_argument(args.get(index), "--practical-feasibility")?);
            }
            "--creative-insight" => {
                index += 1;
                creative_insight = Some(parse_score_argument(args.get(index), "--creative-insight")?);
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
        "{APP_NAME} queue run <work-order-id> [--workspace <path>] [--vault-password <password>] [--json] [--keep-work-order]\n{APP_NAME} agent evaluate <agent-id-or-name> --workspace <path> --problem-understanding <1-9> --logical-validity <1-9> --practical-feasibility <1-9> --creative-insight <1-9> --risk-detection <1-9> [--json]"
    )
}

fn wants_json_output() -> bool {
    env::args().any(|arg| arg == "--json")
}

fn locate_work_order(
    work_order_id: &str,
    workspace_path: Option<&Path>,
) -> Result<LocatedWorkOrder, CliError> {
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
        roots.push(PathBuf::from(user_profile).join("Documents").join("workspace"));
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

    let queue_work_orders = root.join(QUEUE_DIRECTORY_NAME).join(WORK_ORDERS_DIRECTORY_NAME);

    if queue_work_orders.is_dir() {
        if let Ok(path) = find_work_order_in_directory(&queue_work_orders, work_order_id) {
            matches.push(path);
        }
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
    let entries = fs::read_dir(work_orders_path)
        .map_err(|error| io_error("work-orders-read-failed", work_orders_path, error))?;
    let mut matches = Vec::new();

    for entry in entries.flatten() {
        let path = entry.path();

        if path.extension().and_then(|extension| extension.to_str()) != Some("json") {
            continue;
        }

        let file_name = path.file_name().and_then(|name| name.to_str()).unwrap_or("");

        if file_name.contains(work_order_id) {
            matches.push(path);
            continue;
        }

        let content = match fs::read_to_string(&path) {
            Ok(content) => content,
            Err(_) => continue,
        };

        if content.contains(work_order_id) {
            matches.push(path);
        }
    }

    match matches.len() {
        0 => Err(CliError {
            code: "work-order-not-found",
            message: format!("작업 ID를 찾지 못했습니다: {work_order_id}"),
        }),
        1 => fs::canonicalize(&matches[0])
            .map_err(|error| io_error("work-order-path-invalid", &matches[0], error)),
        _ => Err(CliError {
            code: "work-order-ambiguous",
            message: "같은 작업 ID 후보가 여러 개입니다.".to_string(),
        }),
    }
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
    let workspace_json: Option<Value> = read_optional_workspace_json(workspace_path, "workspace.json")?;

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
    total_count: u64,
}

fn record_agent_evaluation_in_registry(
    registry: &mut Value,
    workspace_id: &str,
    agent_key: &str,
    scores: AgentEvaluationScores,
) -> Result<AgentEvaluationWriteResult, CliError> {
    let timestamp = current_timestamp()?;
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
            message: "에이전트 레지스트리의 워크스페이스 ID가 현재 워크스페이스와 다릅니다.".to_string(),
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
    let total_count = {
        let agent_object = ensure_json_object(agent);
        let summary = agent_object
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

        agent_object.insert("updatedAt".to_string(), Value::String(timestamp.clone()));
        next_total_count
    };

    registry_object.insert("updatedAt".to_string(), Value::String(timestamp));

    Ok(AgentEvaluationWriteResult {
        agent_id,
        agent_name,
        total_count,
    })
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
        .or_else(|| value.and_then(Value::as_str).and_then(|value| value.parse::<u64>().ok()))
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
    let envelope: SecretVaultEnvelope =
        read_json_file(&workspace_data_path(workspace_path, VAULT_FILE_NAME), "vault-invalid")?;
    let plaintext = decrypt_secret_vault_payload(password, &envelope)?;
    let vault: EnvironmentVault =
        serde_json::from_str(&plaintext).map_err(|_| CliError {
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

    let salt = BASE64.decode(envelope.kdf.salt.as_bytes()).map_err(|_| CliError {
        code: "vault-salt-invalid",
        message: "보관함 salt가 올바르지 않습니다.".to_string(),
    })?;
    let nonce = BASE64.decode(envelope.cipher.nonce.as_bytes()).map_err(|_| CliError {
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

    let mut key = derive_vault_key(password.as_bytes(), &salt)?;
    let cipher = XChaCha20Poly1305::new(Key::from_slice(&key));
    let plaintext = cipher
        .decrypt(
            XNonce::from_slice(&nonce),
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

fn derive_vault_key(password: &[u8], salt: &[u8]) -> Result<[u8; VAULT_KEY_LENGTH], CliError> {
    let params = Params::new(19 * 1024, 2, 1, Some(VAULT_KEY_LENGTH)).map_err(|_| CliError {
        code: "vault-key-derivation-failed",
        message: "보관함 키 파생 설정이 올바르지 않습니다.".to_string(),
    })?;
    let argon2 = Argon2::new(Algorithm::Argon2id, Version::V0x13, params);
    let mut key = [0_u8; VAULT_KEY_LENGTH];

    argon2
        .hash_password_into(password, salt, &mut key)
        .map_err(|_| CliError {
            code: "vault-key-derivation-failed",
            message: "보관함 키 파생에 실패했습니다.".to_string(),
        })?;

    Ok(key)
}

fn is_supported_envelope(envelope: &SecretVaultEnvelope) -> bool {
    envelope.format == "workduck.secret-vault"
        && envelope.version == 1
        && envelope.kdf.algorithm == "argon2id"
        && envelope.kdf.version == 19
        && envelope.kdf.memory_kib == 19 * 1024
        && envelope.kdf.iterations == 2
        && envelope.kdf.parallelism == 1
        && envelope.cipher.algorithm == "xchacha20poly1305"
}

fn create_execution_runs(
    work_order: &QueueWorkOrder,
    agents: &[AgentRecord],
    vault: Option<&EnvironmentVault>,
    personas: &[PersonaRecord],
    skills: &[SkillRecord],
    references: &[ReferenceRecord],
) -> Result<Vec<AgentExecutionRun>, CliError> {
    let mut runs = Vec::new();

    for task in &work_order.tasks {
        if task.agent_ids.is_empty() {
            return Err(CliError {
                code: "work-order-agent-required",
                message: format!("작업 '{}'에 에이전트가 지정되어 있지 않습니다.", task.title),
            });
        }

        for agent_id in &task.agent_ids {
            let agent = agents
                .iter()
                .find(|candidate| candidate.id == *agent_id)
                .cloned()
                .ok_or_else(|| CliError {
                    code: "agent-not-found",
                    message: format!("에이전트를 찾지 못했습니다: {agent_id}"),
                })?;
            let vault_secret = agent
                .environment_secret_id
                .as_deref()
                .and_then(|secret_id| {
                    vault.and_then(|vault| {
                        vault.secrets
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
                references: select_records(&task.reference_ids, references, |reference| &reference.id),
            });
        }
    }

    if runs.is_empty() {
        return Err(CliError {
            code: "work-order-empty",
            message: "실행할 작업이 없습니다.".to_string(),
        });
    }

    Ok(runs)
}

fn resolve_provider_environment_secret(
    provider: &str,
    agent: &AgentRecord,
) -> Result<ResolvedSecret, CliError> {
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

    Err(CliError {
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

async fn run_agent_prompt(run: AgentExecutionRun) -> Result<(String, String), CliError> {
    if run.secret.value.trim().is_empty() {
        return Err(CliError {
            code: "agent-api-key-required",
            message: format!("에이전트 '{}'의 API 키가 비어 있습니다.", run.agent.name),
        });
    }

    if run.model.trim().is_empty() || run.model.len() > MAX_MODEL_LENGTH {
        return Err(CliError {
            code: "agent-model-required",
            message: format!("에이전트 '{}'의 모델이 올바르지 않습니다.", run.agent.name),
        });
    }

    let prompt_plan = create_agent_prompt_plan(&run.task);
    let system_prompt = create_system_prompt(&run, &prompt_plan);
    let user_prompt = create_user_prompt(&run, &prompt_plan);

    if system_prompt.len() > MAX_PROMPT_LENGTH || user_prompt.len() > MAX_PROMPT_LENGTH {
        return Err(CliError {
            code: "agent-prompt-too-large",
            message: format!("에이전트 '{}'로 보낼 프롬프트가 너무 깁니다.", run.agent.name),
        });
    }

    let endpoint = provider_endpoint(&run.provider).ok_or_else(|| CliError {
        code: "agent-provider-unsupported",
        message: format!("지원하지 않는 제공자입니다: {}", run.provider),
    })?;
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(CHAT_COMPLETION_TIMEOUT_SECONDS))
        .build()
        .map_err(|_| CliError {
            code: "agent-request-invalid",
            message: "HTTP 클라이언트를 만들지 못했습니다.".to_string(),
        })?;
    let body = serde_json::json!({
        "model": run.model,
        "messages": [
            { "role": "system", "content": system_prompt },
            { "role": "user", "content": user_prompt }
        ],
        "stream": false
    });
    let response = client
        .post(endpoint)
        .bearer_auth(run.secret.value.trim())
        .header(reqwest::header::CONTENT_TYPE, "application/json")
        .header("X-Title", "Workduck")
        .json(&body)
        .send()
        .await
        .map_err(|error| CliError {
            code: if error.is_timeout() {
                "agent-provider-timeout"
            } else {
                "agent-provider-unavailable"
            },
            message: format!("에이전트 '{}' 요청에 실패했습니다.", run.agent.name),
        })?;
    let status = response.status();

    if !status.is_success() {
        return Err(CliError {
            code: map_http_status(status.as_u16()),
            message: format!("에이전트 '{}' 요청이 거부되었습니다.", run.agent.name),
        });
    }

    let body = response
        .json::<ChatCompletionResponseBody>()
        .await
        .map_err(|_| CliError {
            code: "agent-response-invalid",
            message: format!("에이전트 '{}' 응답을 해석하지 못했습니다.", run.agent.name),
        })?;
    let content = body
        .choices
        .first()
        .and_then(|choice| choice.message.content.as_deref())
        .map(str::trim)
        .filter(|content| !content.is_empty())
        .ok_or_else(|| CliError {
            code: "agent-response-empty",
            message: format!("에이전트 '{}' 응답이 비어 있습니다.", run.agent.name),
        })?;

    Ok((run.agent.name, content.to_string()))
}

fn create_agent_prompt_plan(task: &QueueWorkOrderTask) -> AgentPromptPlan {
    AgentPromptPlan {
        mode: extract_direct_agent_message(&task.body)
            .map(|message| AgentPromptMode::DirectMessage { message })
            .unwrap_or(AgentPromptMode::WorkOrder),
    }
}

fn extract_direct_agent_message(task_body: &str) -> Option<String> {
    let body = task_body.trim();

    if body.is_empty() || !looks_like_agent_response_collection_request(body) {
        return None;
    }

    first_quoted_text(body)
}

fn looks_like_agent_response_collection_request(body: &str) -> bool {
    let compact_body = body
        .to_lowercase()
        .chars()
        .filter(|character| !character.is_whitespace())
        .collect::<String>();

    (compact_body.contains("각에이전트") || compact_body.contains("에이전트들"))
        && compact_body.contains("응답")
        && (compact_body.contains("보내") || compact_body.contains("전송"))
}

fn first_quoted_text(value: &str) -> Option<String> {
    const QUOTE_PAIRS: [(char, char); 4] = [('"', '"'), ('\'', '\''), ('“', '”'), ('‘', '’')];

    for (open_quote, close_quote) in QUOTE_PAIRS {
        let Some(start_index) = value.find(open_quote) else {
            continue;
        };
        let content_start = start_index + open_quote.len_utf8();
        let Some(relative_end_index) = value[content_start..].find(close_quote) else {
            continue;
        };
        let content = value[content_start..content_start + relative_end_index].trim();

        if !content.is_empty() {
            return Some(content.to_string());
        }
    }

    None
}

fn create_system_prompt(run: &AgentExecutionRun, prompt_plan: &AgentPromptPlan) -> String {
    let mut blocks = match &prompt_plan.mode {
        AgentPromptMode::WorkOrder => vec![
            format!("You are the assistant named {}.", run.agent.name),
            "Handle the assigned task independently and answer in the same language as the task unless the task asks for another language.".to_string(),
            "Do not claim that files, apps, repositories, or external systems were changed unless the task context gives you direct evidence.".to_string(),
            "Keep the answer useful for a task result. Use headings only when they make the result clearer.".to_string(),
        ],
        AgentPromptMode::DirectMessage { .. } => vec![
            "Reply directly to the user message.".to_string(),
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

fn create_user_prompt(run: &AgentExecutionRun, prompt_plan: &AgentPromptPlan) -> String {
    let mut blocks = match &prompt_plan.mode {
        AgentPromptMode::WorkOrder => vec![
            format!("작업 제목: {}", run.task.title),
            format!("우선순위: {}", run.task.priority.as_deref().unwrap_or("normal")),
            String::new(),
            "작업 내용:".to_string(),
            run.task.body.clone(),
        ],
        AgentPromptMode::DirectMessage { message } => vec![
            message.clone(),
        ],
    };

    if !run.skills.is_empty() {
        blocks.push(String::new());
        blocks.push("선택된 스킬 지시문:".to_string());
        blocks.extend(run.skills.iter().map(format_skill_prompt_block));
    }

    if !run.references.is_empty() {
        blocks.push(String::new());
        blocks.push("선택된 참고자료:".to_string());
        blocks.extend(run.references.iter().map(format_reference_prompt_block));
    }

    blocks.join("\n")
}

fn format_persona_prompt_block(persona: &PersonaRecord) -> String {
    let mut blocks = Vec::new();

    if !persona.description.trim().is_empty() {
        blocks.push(format!("Additional guidance: {}", persona.description.trim()));
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
        preferences.push(match value {
            "short" => "Response length: keep replies concise.",
            "detailed" => "Response length: include enough detail for careful review.",
            _ => "Response length: use a moderate amount of detail.",
        }.to_string());
    }

    if let Some(value) = styles.get("emotionalTone").and_then(Value::as_str) {
        preferences.push(match value {
            "calm" => "Tone: stay calm and steady.",
            "bright" => "Tone: sound warm and upbeat.",
            _ => "Tone: stay neutral and clear.",
        }.to_string());
    }

    if let Some(value) = styles.get("judgmentAttitude").and_then(Value::as_str) {
        preferences.push(match value {
            "critical" => "Judgment: examine assumptions critically and call out risks.",
            "supportive" => "Judgment: be supportive while still being truthful.",
            _ => "Judgment: balance critique with practical next steps.",
        }.to_string());
    }

    if let Some(value) = styles.get("confidenceLevel").and_then(Value::as_str) {
        preferences.push(match value {
            "cautious" => "Confidence: be careful with uncertainty and avoid overstatement.",
            "decisive" => "Confidence: be decisive when the evidence is sufficient.",
            _ => "Confidence: state conclusions realistically and name uncertainty when needed.",
        }.to_string());
    }

    if let Some(value) = styles.get("socialDistance").and_then(Value::as_str) {
        preferences.push(match value {
            "formal" => "Social style: keep a professional distance.",
            "friendly" => "Social style: be friendly and approachable.",
            _ => "Social style: be comfortable and direct.",
        }.to_string());
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
        preferences.push(match level {
            1 => "Structure: treat boundaries, layers, and module relationships as critical.",
            2 => "Structure: consistently consider reuse and maintainability.",
            4 => "Structure: prefer direct implementation over abstraction.",
            5 => "Structure: prioritize quick connection and results over structure.",
            _ => "Structure: add only as much structure as the work needs.",
        }.to_string());
    }

    if let Some(level) = spectrum_level(spectrums, "productivityStrategy") {
        preferences.push(match level {
            1 => "Productivity: minimize dependencies and automation to keep direct control.",
            2 => "Productivity: add only necessary tools carefully.",
            4 => "Productivity: automate repeat work whenever practical.",
            5 => "Productivity: combine tools, agents, and pipelines to operate the work.",
            _ => "Productivity: use automation when it improves practical throughput.",
        }.to_string());
    }

    if let Some(level) = spectrum_level(spectrums, "operationPhilosophy") {
        preferences.push(match level {
            1 => "Operations: delay release when failure risk is visible.",
            2 => "Operations: release after enough verification and observability.",
            4 => "Operations: use operational fixes and hotfixes actively.",
            5 => "Operations: treat services as systems that evolve continuously.",
            _ => "Operations: prefer small changes and watch stability.",
        }.to_string());
    }

    if let Some(level) = spectrum_level(spectrums, "collaborationPhilosophy") {
        preferences.push(match level {
            1 => "Collaboration: rely on documents, rules, and contracts.",
            2 => "Collaboration: make intent and standards explicit.",
            4 => "Collaboration: prefer fast collaboration based on experience and judgment.",
            5 => "Collaboration: work autonomously from the goal when possible.",
            _ => "Collaboration: share core context and handle the rest pragmatically.",
        }.to_string());
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

fn create_result_report(
    work_order: &QueueWorkOrder,
    outputs: Vec<(String, String)>,
) -> Result<QueueResultReport, CliError> {
    let created_at = current_timestamp()?;
    let tasks = outputs
        .iter()
        .map(|(agent_name, content)| QueueResultReportTask {
            id: format!("task_{}_{}", slugify(agent_name), unique_token()),
            title: format!("{agent_name}: {}", work_order.r#ref.label),
            summary: content.clone(),
            files_changed: Vec::new(),
            verification: vec![format!("{agent_name} 응답 수신")],
            risks: Vec::new(),
        })
        .collect();

    Ok(QueueResultReport {
        schema_version: "workduck.queue-result-report/v1",
        r#ref: QueueEntityRef {
            id: format!("queue-result-report_{}", unique_token()),
            kind: "queue-result-report".to_string(),
            label: format!("{} 결과 보고서", work_order.r#ref.label),
        },
        status: "active",
        created_at,
        agent_name: outputs
            .iter()
            .map(|(agent_name, _)| agent_name.as_str())
            .collect::<Vec<_>>()
            .join(", "),
        tasks,
    })
}

fn write_result_report(
    workspace_path: &Path,
    report: &QueueResultReport,
) -> Result<PathBuf, CliError> {
    let reports_dir = workspace_path.join(QUEUE_DIRECTORY_NAME).join(REPORTS_DIRECTORY_NAME);
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

fn validate_work_order(work_order: &QueueWorkOrder, requested_id: &str) -> Result<(), CliError> {
    if work_order.schema_version != "workduck.queue-work-order/v1"
        || work_order.r#ref.kind != "queue-work-order"
    {
        return Err(CliError {
            code: "work-order-invalid",
            message: "작업 지시서 형식이 올바르지 않습니다.".to_string(),
        });
    }

    if work_order.r#ref.id != requested_id {
        return Err(CliError {
            code: "work-order-id-mismatch",
            message: "요청한 작업 ID와 파일 안의 작업 ID가 다릅니다.".to_string(),
        });
    }

    if work_order.status == "archived" {
        return Err(CliError {
            code: "work-order-archived",
            message: "이미 완료 처리된 작업 지시서입니다.".to_string(),
        });
    }

    Ok(())
}

fn resolve_agent_provider(
    agent: &AgentRecord,
    secret: &EnvironmentSecretRecord,
) -> Result<String, CliError> {
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

    Err(CliError {
        code: "agent-provider-unsupported",
        message: format!("에이전트 '{}'의 제공자를 확인하지 못했습니다.", agent.name),
    })
}

fn resolve_agent_provider_without_secret(agent: &AgentRecord) -> Result<String, CliError> {
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

    Err(CliError {
        code: "agent-provider-unsupported",
        message: format!(
            "에이전트 '{}'의 제공자를 확인하지 못했습니다. 보관함 암호를 제공하거나 에이전트 제공자를 지정하세요.",
            agent.name
        ),
    })
}

fn normalize_provider(provider: &str) -> Result<String, CliError> {
    match provider.to_ascii_lowercase().as_str() {
        "deepseek" | "openai" | "openrouter" => Ok(provider.to_ascii_lowercase()),
        _ => Err(CliError {
            code: "agent-provider-unsupported",
            message: format!("지원하지 않는 제공자입니다: {provider}"),
        }),
    }
}

fn resolve_agent_model(
    provider: &str,
    agent: &AgentRecord,
    secret: &ResolvedSecret,
) -> Result<String, CliError> {
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

    match provider {
        "deepseek" => Ok("deepseek-v4-pro".to_string()),
        "openai" => Ok("gpt-5.4-mini".to_string()),
        "openrouter" if profile.contains("deepseek") => {
            Ok("deepseek/deepseek-v4-pro".to_string())
        }
        "openrouter" => Ok("openrouter/auto".to_string()),
        _ => Err(CliError {
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
    let temporary_path = path.with_extension("tmp");

    fs::write(&temporary_path, content)
        .map_err(|error| io_error("file-write-failed", &temporary_path, error))?;
    fs::rename(&temporary_path, path).map_err(|error| {
        let _ = fs::remove_file(&temporary_path);
        io_error("file-write-failed", path, error)
    })
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

fn timestamp_for_file_name() -> Result<String, CliError> {
    current_timestamp().map(|timestamp| timestamp.replace([':', '.'], "-"))
}

fn unique_token() -> String {
    let nanos = OffsetDateTime::now_utc().unix_timestamp_nanos();
    format!("{nanos:x}")
}

fn slugify(value: &str) -> String {
    let mut slug = String::new();
    let mut previous_dash = false;

    for character in value.trim().to_lowercase().chars() {
        if character.is_alphanumeric() {
            slug.push(character);
            previous_dash = false;
        } else if !previous_dash {
            slug.push('-');
            previous_dash = true;
        }

        if slug.len() >= 48 {
            break;
        }
    }

    slug.trim_matches('-').to_string()
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
