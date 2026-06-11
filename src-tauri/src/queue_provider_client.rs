use std::{sync::OnceLock, time::Duration};

use serde::Deserialize;
use serde_json::Value;
use time::OffsetDateTime;

use crate::{
    queue_execution::{
        AgentExecutionAttempt, AgentExecutionRun, AgentRunFailure, AgentRunOutput,
        QueueExecutionErrorDetail,
    },
    queue_prompt_builder::{create_agent_prompt_plan, create_system_prompt, create_user_prompt},
};

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

    Ok(QUEUE_HTTP_CLIENT.get().cloned().unwrap_or(client))
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
