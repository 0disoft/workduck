use std::time::Duration;

use serde_json::Value;
use time::OffsetDateTime;

use crate::{
    chat_completion::{
        ChatCompletionError, CHAT_COMPLETION_MODEL_MAX_LENGTH, chat_completion_endpoint,
        chat_completion_http_client, create_chat_completion_http_client, send_chat_completion_json,
    },
    queue_execution::{
        AgentExecutionAttempt, AgentExecutionRun, AgentRunFailure, AgentRunOutput,
        QueueExecutionErrorDetail,
    },
    queue_prompt_builder::{create_agent_prompt_plan, create_system_prompt, create_user_prompt},
};

pub(crate) const CHAT_COMPLETION_MAX_ATTEMPTS: u8 = 3;
const CHAT_COMPLETION_RETRY_BASE_DELAY_MILLIS: u64 = 500;
const CHAT_COMPLETION_RETRY_MAX_DELAY_MILLIS: u64 = 2_000;
const CHAT_COMPLETION_RETRY_JITTER_MILLIS: u64 = 250;
const MAX_PROMPT_LENGTH: usize = 48_000;

pub fn create_queue_http_client() -> Result<reqwest::Client, QueueExecutionErrorDetail> {
    create_chat_completion_http_client().map_err(|_| {
        QueueExecutionErrorDetail::new(
            "agent-request-invalid",
            "HTTP 클라이언트를 만들지 못했습니다.",
        )
    })
}

pub fn queue_http_client() -> Result<reqwest::Client, QueueExecutionErrorDetail> {
    chat_completion_http_client().map_err(|_| {
        QueueExecutionErrorDetail::new(
            "agent-request-invalid",
            "HTTP 클라이언트를 만들지 못했습니다.",
        )
    })
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

    if run.model.trim().is_empty() || run.model.len() > CHAT_COMPLETION_MODEL_MAX_LENGTH {
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

    let endpoint = chat_completion_endpoint(&run.provider).ok_or_else(|| {
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
        match send_agent_chat_completion_request(
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

async fn send_agent_chat_completion_request(
    client: &reqwest::Client,
    endpoint: &str,
    api_key: &str,
    body: &Value,
    agent_name: &str,
) -> Result<String, QueueExecutionErrorDetail> {
    send_chat_completion_json(client, endpoint, api_key, body, true)
        .await
        .map_err(|error| map_chat_completion_error(error, agent_name))
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

fn map_chat_completion_error(
    error: ChatCompletionError,
    agent_name: &str,
) -> QueueExecutionErrorDetail {
    match error {
        ChatCompletionError::RequestInvalid => QueueExecutionErrorDetail {
            code: "agent-request-invalid",
            message: format!("에이전트 '{agent_name}' 요청이 거부되었습니다."),
        },
        ChatCompletionError::AuthenticationFailed => QueueExecutionErrorDetail {
            code: "agent-authentication-failed",
            message: format!("에이전트 '{agent_name}' 요청이 거부되었습니다."),
        },
        ChatCompletionError::RateLimited => QueueExecutionErrorDetail {
            code: "agent-rate-limited",
            message: format!("에이전트 '{agent_name}' 요청이 거부되었습니다."),
        },
        ChatCompletionError::ProviderRejected => QueueExecutionErrorDetail {
            code: "agent-provider-rejected",
            message: format!("에이전트 '{agent_name}' 요청이 거부되었습니다."),
        },
        ChatCompletionError::ProviderTimeout => QueueExecutionErrorDetail {
            code: "agent-provider-timeout",
            message: format!("에이전트 '{agent_name}' 요청에 실패했습니다."),
        },
        ChatCompletionError::ProviderUnavailable => QueueExecutionErrorDetail {
            code: "agent-provider-unavailable",
            message: format!("에이전트 '{agent_name}' 요청에 실패했습니다."),
        },
        ChatCompletionError::ResponseEmpty => QueueExecutionErrorDetail {
            code: "agent-response-empty",
            message: format!("에이전트 '{agent_name}' 응답이 비어 있습니다."),
        },
        ChatCompletionError::ResponseInvalid => QueueExecutionErrorDetail {
            code: "agent-response-invalid",
            message: format!("에이전트 '{agent_name}' 응답을 해석하지 못했습니다."),
        },
    }
}
