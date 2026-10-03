/* llmnav/1 module
id=workduck.cli.agent-evaluation
role=Parse agent evaluation commands, update agent score history, and synchronize persona summaries under a workspace lock.
owns=agent evaluation options|evaluation deduplication|score accumulation|persona summary synchronization|evaluation registry writes
excludes=queue execution|work-order discovery|vault decryption
search=agent evaluation cli|evaluation score history|persona evaluation summaries|evaluate batch command
invariant=Single and batch evaluations share one locked commit owner, unchanged retries do not rewrite registries, and failed batches commit no evaluations.
stability=architecture
*/
use super::{
    AGENTS_FILE_NAME, CliError, PERSONAS_FILE_NAME, canonicalize_directory, current_timestamp,
    increment_registry_revision, io_error, read_json_file, read_workspace_id, to_json_error,
    usage_text, workspace_data_path, write_json_file,
};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    collections::{HashMap, HashSet},
    io::{self, Read},
    path::{Path, PathBuf},
};
use workduck_lib::workspace_data_file::{
    commit_workspace_registry_pair_under_lock, recover_workspace_registry_transaction_under_lock,
};
use workduck_lib::workspace_registry_lock::acquire_workspace_registry_lock;

const AGENT_EVALUATION_CRITERION_IDS: [&str; 5] = [
    "problemUnderstanding",
    "logicalValidity",
    "practicalFeasibility",
    "creativeInsight",
    "riskDetection",
];
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

pub(super) fn run_agent_command(args: Vec<String>) -> Result<(), CliError> {
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
    let mut transaction = EvaluationRegistryTransaction::open(&workspace_path)?;
    let scores = options.scores.ok_or_else(|| CliError {
        code: "agent-evaluation-score-required",
        message: "다섯 평가 점수를 모두 지정해야 합니다.".to_string(),
    })?;
    let result = transaction.record(
        &options.agent_key,
        options.evaluation_key.as_deref(),
        scores,
    )?;
    transaction.commit()?;

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

    let mut transaction = EvaluationRegistryTransaction::open(&workspace_path)?;
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
        let result = transaction.record(agent_key, item.evaluation_key.as_deref(), item.scores)?;

        results.push(AgentEvaluationBatchJsonItem {
            agent_id: result.agent_id,
            agent_name: result.agent_name,
            applied: result.applied,
            evaluation_key: result.evaluation_key,
            total_count: result.total_count,
            scores: item.scores,
        });
    }

    transaction.commit()?;

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

struct EvaluationRegistryTransaction {
    workspace_path: PathBuf,
    workspace_id: String,
    agents: Value,
    personas: Option<Value>,
    agents_changed: bool,
    _lock: std::fs::File,
}

impl EvaluationRegistryTransaction {
    fn open(workspace_path: &Path) -> Result<Self, CliError> {
        let lock = acquire_workspace_registry_lock(workspace_path)
            .map_err(|error| io_error("agent-registry-lock-failed", workspace_path, error))?;
        recover_workspace_registry_transaction_under_lock(workspace_path).map_err(|_| {
            CliError {
                code: "agent-registry-recovery-failed",
                message: "미완료 에이전트/페르소나 레지스트리 트랜잭션을 복구하지 못했습니다."
                    .to_string(),
            }
        })?;
        let workspace_id = read_workspace_id(workspace_path)?;
        let agents = read_json_file(
            &workspace_data_path(workspace_path, AGENTS_FILE_NAME),
            "agent-registry-invalid",
        )?;
        let personas_path = workspace_data_path(workspace_path, PERSONAS_FILE_NAME);
        let personas = if personas_path.exists() {
            Some(read_json_file(&personas_path, "persona-registry-invalid")?)
        } else {
            None
        };
        Ok(Self {
            workspace_path: workspace_path.to_owned(),
            workspace_id,
            agents,
            personas,
            agents_changed: false,
            _lock: lock,
        })
    }

    fn record(
        &mut self,
        agent_key: &str,
        evaluation_key: Option<&str>,
        scores: AgentEvaluationScores,
    ) -> Result<AgentEvaluationWriteResult, CliError> {
        let result = record_agent_evaluation_in_registry(
            &mut self.agents,
            &self.workspace_id,
            agent_key,
            evaluation_key,
            scores,
        )?;
        self.agents_changed |= result.applied;
        Ok(result)
    }

    fn commit(mut self) -> Result<(), CliError> {
        let personas_changed = match self.personas.as_mut() {
            Some(personas) => sync_persona_evaluation_summaries_from_agents(
                personas,
                &self.agents,
                &self.workspace_id,
            )?,
            None => false,
        };
        if !self.agents_changed && !personas_changed {
            return Ok(());
        }
        if self.agents_changed {
            increment_registry_revision(&mut self.agents)?;
        }
        if personas_changed {
            // A changed persona summary always has an existing persona registry.
            if let Some(personas) = self.personas.as_mut() {
                increment_registry_revision(personas)?;
                let serialize = |value: &Value| {
                    serde_json::to_string_pretty(value).map_err(|error| CliError {
                        code: "file-write-failed",
                        message: format!("JSON 직렬화에 실패했습니다: {error}"),
                    })
                };
                let agents_content = serialize(&self.agents)?;
                let personas_content = serialize(personas)?;
                commit_workspace_registry_pair_under_lock(
                    &self.workspace_path,
                    &agents_content,
                    &personas_content,
                )
                .map_err(|_| CliError {
                    code: "agent-registry-write-failed",
                    message: "에이전트/페르소나 레지스트리 트랜잭션 저장에 실패했습니다."
                        .to_string(),
                })?;
            }
            Ok(())
        } else {
            write_json_file(
                &workspace_data_path(&self.workspace_path, AGENTS_FILE_NAME),
                &self.agents,
            )
        }
    }
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

    let total_count = record_evaluation_summary_on_record(agent, &timestamp, scores)?;

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

        merge_evaluation_summary_snapshots(persona_summary, agent_summary)?;
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
                .min(count.saturating_mul(9));

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
) -> Result<(), CliError> {
    let mut merged = *target;
    merged.total_count = checked_summary_add(merged.total_count, source.total_count)?;

    for index in 0..AGENT_EVALUATION_CRITERION_IDS.len() {
        merged.counts[index] = checked_summary_add(merged.counts[index], source.counts[index])?;
        merged.score_sums[index] =
            checked_summary_add(merged.score_sums[index], source.score_sums[index])?;
    }
    *target = merged;
    Ok(())
}

fn checked_summary_add(left: u64, right: u64) -> Result<u64, CliError> {
    left.checked_add(right).ok_or_else(|| CliError {
        code: "agent-registry-invalid",
        message: "에이전트 평가 통계가 허용 범위를 초과했습니다.".to_string(),
    })
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
) -> Result<u64, CliError> {
    // Check every counter before changing the record or its timestamp.
    let summary = record.get("evaluationSummary");
    let next_total_count = checked_summary_add(
        read_json_u64(summary.and_then(|value| value.get("totalCount"))),
        1,
    )?;
    let mut next_criteria = [("", 0_u64, 0_u64); 5];
    for (index, (criterion_id, score)) in [
        ("problemUnderstanding", scores.problem_understanding),
        ("logicalValidity", scores.logical_validity),
        ("practicalFeasibility", scores.practical_feasibility),
        ("creativeInsight", scores.creative_insight),
        ("riskDetection", scores.risk_detection),
    ]
    .into_iter()
    .enumerate()
    {
        let criterion = summary
            .and_then(|value| value.get("criteria"))
            .and_then(|value| value.get(criterion_id));
        next_criteria[index] = (
            criterion_id,
            checked_summary_add(
                read_json_u64(criterion.and_then(|value| value.get("count"))),
                1,
            )?,
            checked_summary_add(
                read_json_u64(criterion.and_then(|value| value.get("scoreSum"))),
                u64::from(score),
            )?,
        );
    }
    let record_object = ensure_json_object(record);
    let summary = record_object
        .entry("evaluationSummary")
        .or_insert_with(|| serde_json::json!({}));
    let summary_object = ensure_json_object(summary);
    summary_object.insert("totalCount".to_string(), Value::from(next_total_count));
    let criteria_value = summary_object
        .entry("criteria")
        .or_insert_with(|| serde_json::json!({}));
    let criteria_object = ensure_json_object(criteria_value);

    for (criterion_id, next_count, next_score_sum) in next_criteria {
        let criterion_value = criteria_object
            .entry(criterion_id.to_string())
            .or_insert_with(|| serde_json::json!({}));
        let criterion_object = ensure_json_object(criterion_value);
        criterion_object.insert("count".to_string(), Value::from(next_count));
        criterion_object.insert("scoreSum".to_string(), Value::from(next_score_sum));
    }

    record_object.insert(
        "updatedAt".to_string(),
        Value::String(timestamp.to_string()),
    );

    Ok(next_total_count)
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::WORKDUCK_DIRECTORY_NAME;
    use std::fs;

    fn agent_evaluate_args(workspace_path: &Path, evaluation_key: &str) -> Vec<String> {
        [
            "agent".to_string(),
            "evaluate".to_string(),
            "agent-1".to_string(),
            "--workspace".to_string(),
            workspace_path.to_string_lossy().into_owned(),
            "--evaluation-key".to_string(),
            evaluation_key.to_string(),
            "--problem-understanding".to_string(),
            "5".to_string(),
            "--logical-validity".to_string(),
            "5".to_string(),
            "--practical-feasibility".to_string(),
            "5".to_string(),
            "--creative-insight".to_string(),
            "5".to_string(),
            "--risk-detection".to_string(),
            "5".to_string(),
            "--json".to_string(),
        ]
        .into_iter()
        .collect()
    }

    #[test]
    fn concurrent_agent_evaluations_preserve_both_updates() {
        let workspace = tempfile::tempdir().expect("workspace");
        let workduck_path = workspace.path().join(WORKDUCK_DIRECTORY_NAME);
        fs::create_dir_all(&workduck_path).expect("workduck directory");
        fs::write(
            workduck_path.join("workspace.json"),
            serde_json::to_vec_pretty(&serde_json::json!({ "id": "workspace-1" }))
                .expect("workspace JSON"),
        )
        .expect("workspace write");
        fs::write(
            workduck_path.join(AGENTS_FILE_NAME),
            serde_json::to_vec_pretty(&serde_json::json!({
                "workspaceId": "workspace-1",
                "agents": [{ "id": "agent-1", "name": "Agent 1" }]
            }))
            .expect("agents JSON"),
        )
        .expect("agents write");

        let barrier = std::sync::Arc::new(std::sync::Barrier::new(3));
        let handles = ["evaluation-1", "evaluation-2"].map(|evaluation_key| {
            let barrier = std::sync::Arc::clone(&barrier);
            let args = agent_evaluate_args(workspace.path(), evaluation_key);

            std::thread::spawn(move || {
                barrier.wait();
                run_agent_evaluate_command(args).expect("concurrent evaluation");
            })
        });

        barrier.wait();
        for handle in handles {
            handle.join().expect("evaluation thread");
        }

        let registry: Value = read_json_file(
            &workduck_path.join(AGENTS_FILE_NAME),
            "agent-registry-invalid",
        )
        .expect("updated registry");
        let agent = &registry["agents"][0];

        assert_eq!(agent["evaluationSummary"]["totalCount"], 2);
        assert_eq!(agent["evaluationKeys"].as_array().map(Vec::len), Some(2));
    }

    fn evaluation_workspace() -> tempfile::TempDir {
        let workspace = tempfile::tempdir().expect("workspace");
        let directory = workspace.path().join(WORKDUCK_DIRECTORY_NAME);
        fs::create_dir_all(&directory).expect("registry directory");
        for (name, value) in [
            ("workspace.json", serde_json::json!({"id": "workspace-1"})),
            (
                AGENTS_FILE_NAME,
                serde_json::json!({
                    "workspaceId": "workspace-1", "revision": 0,
                    "agents": [{"id": "agent-1", "name": "Agent 1", "personaId": "persona-1"}]
                }),
            ),
            (
                PERSONAS_FILE_NAME,
                serde_json::json!({
                    "workspaceId": "workspace-1", "revision": 0,
                    "personas": [{"id": "persona-1", "name": "Persona 1"}]
                }),
            ),
        ] {
            fs::write(
                directory.join(name),
                serde_json::to_vec_pretty(&value).unwrap(),
            )
            .unwrap();
        }
        workspace
    }

    fn registry_bytes(workspace: &Path) -> (Vec<u8>, Vec<u8>) {
        (
            fs::read(workspace_data_path(workspace, AGENTS_FILE_NAME)).unwrap(),
            fs::read(workspace_data_path(workspace, PERSONAS_FILE_NAME)).unwrap(),
        )
    }

    fn run_evaluation_batch(workspace: &Path, evaluations: Value) -> Result<(), CliError> {
        let input = workspace.join("evaluation-input.json");
        fs::write(
            &input,
            serde_json::to_vec(&serde_json::json!({"evaluations": evaluations})).unwrap(),
        )
        .unwrap();
        run_agent_evaluate_batch_command(vec![
            "agent".into(),
            "evaluate-batch".into(),
            "--workspace".into(),
            workspace.to_string_lossy().into_owned(),
            "--input".into(),
            input.to_string_lossy().into_owned(),
            "--json".into(),
        ])
    }

    fn batch_item(key: &str, score: u8) -> Value {
        serde_json::json!({
            "agentId": "agent-1", "evaluationKey": key,
            "scores": {
                "problemUnderstanding": score, "logicalValidity": score,
                "practicalFeasibility": score, "creativeInsight": score, "riskDetection": score
            }
        })
    }

    #[test]
    fn duplicate_single_evaluation_does_not_rewrite_registry_files() {
        let workspace = evaluation_workspace();
        run_agent_evaluate_command(agent_evaluate_args(workspace.path(), "same-key")).unwrap();
        let before = registry_bytes(workspace.path());
        run_agent_evaluate_command(agent_evaluate_args(workspace.path(), "same-key")).unwrap();
        assert_eq!(registry_bytes(workspace.path()), before);
    }

    #[test]
    fn duplicate_evaluation_without_a_persona_registry_keeps_the_agent_snapshot() {
        let workspace = evaluation_workspace();
        fs::remove_file(workspace_data_path(workspace.path(), PERSONAS_FILE_NAME)).unwrap();
        run_agent_evaluate_command(agent_evaluate_args(workspace.path(), "same-key")).unwrap();
        let path = workspace_data_path(workspace.path(), AGENTS_FILE_NAME);
        let before = fs::read(&path).unwrap();
        run_agent_evaluate_command(agent_evaluate_args(workspace.path(), "same-key")).unwrap();
        assert!(fs::read(&path).unwrap() == before);
    }

    #[test]
    fn duplicate_evaluation_repairs_a_stale_persona_without_advancing_agent_revision() {
        let workspace = evaluation_workspace();
        run_agent_evaluate_command(agent_evaluate_args(workspace.path(), "same-key")).unwrap();
        let agents_before = registry_bytes(workspace.path()).0;
        let personas_path = workspace_data_path(workspace.path(), PERSONAS_FILE_NAME);
        let mut personas: Value =
            read_json_file(&personas_path, "persona-registry-invalid").unwrap();
        personas["personas"][0]["evaluationSummary"] = serde_json::json!({});
        fs::write(&personas_path, serde_json::to_vec(&personas).unwrap()).unwrap();
        run_agent_evaluate_command(agent_evaluate_args(workspace.path(), "same-key")).unwrap();
        let personas: Value = read_json_file(&personas_path, "persona-registry-invalid").unwrap();
        assert!(registry_bytes(workspace.path()).0 == agents_before);
        assert_eq!(personas["revision"], 2);
        assert_eq!(
            personas["personas"][0]["evaluationSummary"]["totalCount"],
            1
        );
    }

    #[test]
    fn duplicate_batch_does_not_rewrite_but_new_evaluations_commit_once() {
        let workspace = evaluation_workspace();
        run_evaluation_batch(
            workspace.path(),
            serde_json::json!([batch_item("existing", 5)]),
        )
        .unwrap();
        let before = registry_bytes(workspace.path());
        run_evaluation_batch(
            workspace.path(),
            serde_json::json!([batch_item("existing", 5)]),
        )
        .unwrap();
        assert_eq!(registry_bytes(workspace.path()), before);
        run_evaluation_batch(
            workspace.path(),
            serde_json::json!([batch_item("existing", 5), batch_item("new", 6)]),
        )
        .unwrap();
        let (agents, personas) = registry_bytes(workspace.path());
        let agents: Value = serde_json::from_slice(&agents).unwrap();
        let personas: Value = serde_json::from_slice(&personas).unwrap();
        assert_eq!(agents["revision"], 2);
        assert_eq!(personas["revision"], 2);
        assert_eq!(agents["agents"][0]["evaluationSummary"]["totalCount"], 2);
        assert_eq!(
            personas["personas"][0]["evaluationSummary"]["criteria"]["riskDetection"]["scoreSum"],
            11
        );
    }

    #[test]
    fn an_invalid_later_batch_item_keeps_both_registries_unchanged() {
        let workspace = evaluation_workspace();
        let before = registry_bytes(workspace.path());
        let error = run_evaluation_batch(
            workspace.path(),
            serde_json::json!([batch_item("valid", 5), batch_item("invalid", 0)]),
        )
        .unwrap_err();
        assert_eq!(error.code, "agent-evaluation-score-invalid");
        assert_eq!(registry_bytes(workspace.path()), before);
    }

    #[test]
    fn maximum_summary_counts_normalize_without_panicking() {
        let summary = serde_json::json!({
            "totalCount": u64::MAX,
            "criteria": {"riskDetection": {"count": u64::MAX, "scoreSum": u64::MAX}}
        });
        let normalized = read_evaluation_summary_snapshot(Some(&summary));
        assert_eq!(normalized.total_count, u64::MAX);
        assert_eq!(normalized.score_sums[4], u64::MAX);
    }

    #[test]
    fn saturated_agent_summary_returns_an_error_without_writing() {
        for summary in [
            serde_json::json!({"totalCount": u64::MAX}),
            serde_json::json!({"criteria": {"riskDetection": {"count": u64::MAX}}}),
            serde_json::json!({"criteria": {"riskDetection": {"scoreSum": u64::MAX}}}),
        ] {
            let workspace = evaluation_workspace();
            let agents_path = workspace_data_path(workspace.path(), AGENTS_FILE_NAME);
            let mut registry: Value =
                read_json_file(&agents_path, "agent-registry-invalid").unwrap();
            registry["agents"][0]["evaluationSummary"] = summary;
            fs::write(&agents_path, serde_json::to_vec(&registry).unwrap()).unwrap();
            let before = registry_bytes(workspace.path());
            let error =
                run_agent_evaluate_command(agent_evaluate_args(workspace.path(), "overflow"))
                    .unwrap_err();
            assert_eq!(error.code, "agent-registry-invalid");
            assert!(registry_bytes(workspace.path()) == before);
        }
    }

    #[test]
    fn overflowing_persona_totals_return_an_error_without_mutating_personas() {
        let agents = serde_json::json!({
            "workspaceId": "workspace-1", "agents": [
                {"id": "first", "personaId": "persona-1", "evaluationSummary": {"totalCount": u64::MAX}},
                {"id": "second", "personaId": "persona-1", "evaluationSummary": {"totalCount": 1}}
            ]
        });
        let mut personas = serde_json::json!({
            "workspaceId": "workspace-1", "personas": [{"id": "persona-1"}]
        });
        let before = personas.clone();
        let error =
            sync_persona_evaluation_summaries_from_agents(&mut personas, &agents, "workspace-1")
                .unwrap_err();
        assert_eq!(error.code, "agent-registry-invalid");
        assert_eq!(personas, before);
    }
}
