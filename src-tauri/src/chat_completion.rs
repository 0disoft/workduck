use std::{sync::OnceLock, time::Duration};

use serde::Deserialize;
use serde_json::Value;

const CHAT_COMPLETION_TIMEOUT_SECONDS: u64 = 120;
pub(crate) const CHAT_COMPLETION_MODEL_MAX_LENGTH: usize = 160;

static CHAT_COMPLETION_HTTP_CLIENT: OnceLock<reqwest::Client> = OnceLock::new();

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum ChatCompletionError {
    RequestInvalid,
    AuthenticationFailed,
    RateLimited,
    ProviderRejected,
    ProviderTimeout,
    ProviderUnavailable,
    ResponseEmpty,
    ResponseInvalid,
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

pub(crate) fn create_chat_completion_http_client() -> Result<reqwest::Client, ChatCompletionError> {
    reqwest::Client::builder()
        .timeout(Duration::from_secs(CHAT_COMPLETION_TIMEOUT_SECONDS))
        .build()
        .map_err(|_| ChatCompletionError::RequestInvalid)
}

pub(crate) fn chat_completion_http_client() -> Result<reqwest::Client, ChatCompletionError> {
    if let Some(client) = CHAT_COMPLETION_HTTP_CLIENT.get() {
        return Ok(client.clone());
    }

    let client = create_chat_completion_http_client()?;
    let _ = CHAT_COMPLETION_HTTP_CLIENT.set(client.clone());

    Ok(CHAT_COMPLETION_HTTP_CLIENT.get().cloned().unwrap_or(client))
}

pub(crate) fn chat_completion_endpoint(provider: &str) -> Option<&'static str> {
    match provider {
        "deepseek" => Some("https://api.deepseek.com/chat/completions"),
        "openai" => Some("https://api.openai.com/v1/chat/completions"),
        "openrouter" => Some("https://openrouter.ai/api/v1/chat/completions"),
        "umans" => Some("https://api.code.umans.ai/v1/chat/completions"),
        _ => None,
    }
}

pub(crate) async fn send_chat_completion_json(
    client: &reqwest::Client,
    endpoint: &str,
    api_key: &str,
    body: &Value,
    include_workduck_title: bool,
) -> Result<String, ChatCompletionError> {
    let mut request = client
        .post(endpoint)
        .bearer_auth(api_key)
        .header(reqwest::header::CONTENT_TYPE, "application/json");

    if include_workduck_title {
        request = request.header("X-Title", "Workduck");
    }

    let response = request
        .json(body)
        .send()
        .await
        .map_err(|error| {
            if error.is_timeout() {
                ChatCompletionError::ProviderTimeout
            } else {
                ChatCompletionError::ProviderUnavailable
            }
        })?;
    let status = response.status();

    if !status.is_success() {
        return Err(map_chat_completion_http_status(status.as_u16()));
    }

    response
        .json::<ChatCompletionResponseBody>()
        .await
        .map_err(|_| ChatCompletionError::ResponseInvalid)
        .and_then(extract_chat_completion_content)
}

fn extract_chat_completion_content(
    body: ChatCompletionResponseBody,
) -> Result<String, ChatCompletionError> {
    body.choices
        .first()
        .and_then(|choice| choice.message.content.as_deref())
        .map(str::trim)
        .filter(|content| !content.is_empty())
        .map(str::to_owned)
        .ok_or(ChatCompletionError::ResponseEmpty)
}

fn map_chat_completion_http_status(status: u16) -> ChatCompletionError {
    match status {
        400 | 404 | 422 => ChatCompletionError::RequestInvalid,
        401 | 403 => ChatCompletionError::AuthenticationFailed,
        429 => ChatCompletionError::RateLimited,
        500..=599 => ChatCompletionError::ProviderUnavailable,
        _ => ChatCompletionError::ProviderRejected,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn provider_endpoints_are_openai_compatible_chat_completion_urls() {
        assert_eq!(
            chat_completion_endpoint("deepseek"),
            Some("https://api.deepseek.com/chat/completions")
        );
        assert_eq!(
            chat_completion_endpoint("openai"),
            Some("https://api.openai.com/v1/chat/completions")
        );
        assert_eq!(
            chat_completion_endpoint("openrouter"),
            Some("https://openrouter.ai/api/v1/chat/completions")
        );
        assert_eq!(
            chat_completion_endpoint("umans"),
            Some("https://api.code.umans.ai/v1/chat/completions")
        );
        assert_eq!(chat_completion_endpoint("anthropic"), None);
    }

    #[test]
    fn http_statuses_map_to_provider_error_categories() {
        assert_eq!(
            map_chat_completion_http_status(400),
            ChatCompletionError::RequestInvalid
        );
        assert_eq!(
            map_chat_completion_http_status(401),
            ChatCompletionError::AuthenticationFailed
        );
        assert_eq!(
            map_chat_completion_http_status(429),
            ChatCompletionError::RateLimited
        );
        assert_eq!(
            map_chat_completion_http_status(503),
            ChatCompletionError::ProviderUnavailable
        );
        assert_eq!(
            map_chat_completion_http_status(418),
            ChatCompletionError::ProviderRejected
        );
    }

    #[test]
    fn response_content_is_trimmed_and_required() {
        let content = extract_chat_completion_content(ChatCompletionResponseBody {
            choices: vec![ChatChoice {
                message: ChatChoiceMessage {
                    content: Some("  hello  ".to_string()),
                },
            }],
        })
        .expect("content");

        assert_eq!(content, "hello");
        assert_eq!(
            extract_chat_completion_content(ChatCompletionResponseBody {
                choices: vec![ChatChoice {
                    message: ChatChoiceMessage {
                        content: Some("   ".to_string()),
                    },
                }],
            }),
            Err(ChatCompletionError::ResponseEmpty)
        );
        assert_eq!(
            extract_chat_completion_content(ChatCompletionResponseBody { choices: vec![] }),
            Err(ChatCompletionError::ResponseEmpty)
        );
    }
}
