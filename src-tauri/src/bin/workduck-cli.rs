/* llmnav/1 module
id=workduck.cli.execution
role=Execute queue work orders and agent evaluations from the command line under explicit workspace and vault contracts.
owns=CLI option parsing|work-order discovery|queue execution|command dispatch
excludes=Node launcher|Tauri desktop command registry|agent evaluation implementation
search=workduck cli execution|queue work order command|agent evaluation cli
invariant=Failures retain stable error codes and JSON mode never reports an unsuccessful operation as success.
stability=architecture
*/

use std::{
    env, fs, io,
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
use zeroize::{Zeroize, Zeroizing};

#[path = "../cli/agent_evaluation.rs"]
mod agent_evaluation;
use agent_evaluation::run_agent_command;

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
    confirmed: bool,
    json: bool,
}

impl Drop for CliOptions {
    fn drop(&mut self) {
        if let Some(password) = self.vault_password.as_mut() {
            password.zeroize();
        }
    }
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
    let work_order: QueueWorkOrder =
        read_json_file(&located.work_order_path, "work-order-invalid")?;
    validate_work_order(&work_order, &options.work_order_id)?;

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
    let estimate = create_execution_estimate_from_runs(&runs);
    if !options.confirmed {
        return Err(CliError {
            code: "queue-execution-confirmation-required",
            message: format!(
                "실행 계획: 요청 {}회, 예상 입력 토큰 약 {}개, 재시도 포함 최대 요청 {}회/입력 토큰 약 {}개. 출력 토큰과 실제 공급자 과금은 포함하지 않습니다. 검토 후 --yes를 추가해 다시 실행하세요.",
                estimate.request_count,
                estimate.estimated_input_tokens,
                estimate.maximum_provider_attempt_count,
                estimate.maximum_estimated_input_tokens,
            ),
        });
    }
    let execution = begin_queue_work_order_execution_at(
        &located.workspace_path,
        &located.work_order_path,
        &options.work_order_id,
    )?;
    let work_order = execution.work_order().clone();
    let runs = create_execution_runs(
        &work_order,
        &agents.agents,
        vault.as_ref(),
        &personas.personas,
        &skills.skills,
        &references.references,
    )?;
    let current_estimate = create_execution_estimate_from_runs(&runs);
    if current_estimate.confirmation_token != estimate.confirmation_token {
        let _ = execution.fail();
        return Err(CliError {
            code: "queue-execution-confirmation-stale",
            message:
                "승인 후 작업 지시서나 실행 컨텍스트가 바뀌었습니다. 현재 계획을 다시 확인하세요."
                    .to_string(),
        });
    }
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
            match run_agent_prompt_bounded(run, client).await {
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
            "--yes" => {
                options.confirmed = true;
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

fn usage_text() -> String {
    format!(
        "{APP_NAME} queue run <work-order-id> [--workspace <path>] [--json] [--keep-work-order] [--yes]\n{APP_NAME} agent evaluate <agent-id-or-name> --workspace <path> --problem-understanding <1-9> --logical-validity <1-9> --practical-feasibility <1-9> --creative-insight <1-9> --risk-detection <1-9> [--evaluation-key <key>] [--json]\n{APP_NAME} agent evaluate-batch --workspace <path> --input <path-or-> [--json]"
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
    let vault: EnvironmentVault =
        serde_json::from_str(plaintext.as_str()).map_err(|_| CliError {
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
) -> Result<Zeroizing<String>, CliError> {
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

    match String::from_utf8(plaintext) {
        Ok(plaintext) => Ok(Zeroizing::new(plaintext)),
        Err(error) => {
            let mut plaintext = error.into_bytes();
            plaintext.zeroize();
            Err(CliError {
                code: "vault-plaintext-invalid",
                message: "보관함 평문이 UTF-8 문자열이 아닙니다.".to_string(),
            })
        }
    }
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
    workduck_lib::write_file_atomically(path, &content).map_err(|_| CliError {
        code: "file-write-failed",
        message: format!("파일 저장에 실패했습니다: {}", path.display()),
    })
}

fn increment_registry_revision(registry: &mut Value) -> Result<(), CliError> {
    let revision = registry
        .get("revision")
        .map(|value| {
            value.as_u64().ok_or_else(|| CliError {
                code: "agent-registry-invalid",
                message: "레지스트리 revision은 0 이상의 정수여야 합니다.".to_string(),
            })
        })
        .transpose()?
        .unwrap_or(0);
    let next_revision = revision.checked_add(1).ok_or_else(|| CliError {
        code: "agent-registry-invalid",
        message: "레지스트리 revision이 허용 범위를 초과했습니다.".to_string(),
    })?;
    registry["revision"] = Value::from(next_revision);
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
        assert_eq!(
            options.vault_password.as_deref(),
            Some("environment-only-password")
        );
        assert!(options.json);
    }

    #[test]
    fn queue_run_requires_explicit_cost_confirmation() {
        let preview =
            parse_args_with_vault_password(queue_run_args(&[]), None).expect("preview invocation");
        let confirmed = parse_args_with_vault_password(queue_run_args(&["--yes"]), None)
            .expect("confirmed invocation");

        assert!(!preview.confirmed);
        assert!(confirmed.confirmed);
        assert!(usage_text().contains("--yes"));
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
