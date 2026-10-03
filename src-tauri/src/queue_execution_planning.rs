// llmnav/1 module
// id=workduck.queue.execution-planning
// role=Build secret-free prompt previews and bounded execution plans, resolve run configuration, and bind execution confirmation to the reviewed prompts.
// owns=agent and context selection|provider model and secret resolution|execution estimates and confirmation tokens|work order limits
// excludes=provider HTTP requests|execution cancellation|report persistence
// search=queue execution plan|prompt preview estimate|confirm queue execution token
// invariant=Previews never resolve API secrets, run and task caps are checked before resolution, and execution validates the current prompt estimate token.
// stability=architecture
// /llmnav
use super::{
    AgentExecutionRun, AgentRecord, EnvironmentSecretRecord, EnvironmentVault, PersonaRecord,
    QueueExecutionErrorDetail, QueueExecutionEstimate, QueueExecutionRequest, QueuePromptPreview,
    QueueWorkOrder, ReferenceRecord, ResolvedSecret, SkillRecord,
};
use crate::queue_limits::{
    QUEUE_EXECUTION_MAX_RUNS, QUEUE_TASK_MAX_AGENTS, QUEUE_WORK_ORDER_MAX_TASKS,
};
use crate::queue_prompt_builder::{
    create_agent_prompt_plan, create_system_prompt, create_user_prompt,
};
use crate::system_environment::read_cli_user_environment_variable;
use sha2::{Digest, Sha256};
use std::env;

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

pub(super) fn resolve_agent_linked_secret(
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

pub(super) fn validate_queue_execution_confirmation(
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
    let maximum_provider_attempt_count = request_count.saturating_mul(usize::from(
        crate::queue_provider_client::CHAT_COMPLETION_MAX_ATTEMPTS,
    ));
    let maximum_estimated_input_tokens = estimated_input_tokens.saturating_mul(usize::from(
        crate::queue_provider_client::CHAT_COMPLETION_MAX_ATTEMPTS,
    ));
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
