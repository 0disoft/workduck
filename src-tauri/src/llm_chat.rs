use std::time::Duration;

const CHAT_COMPLETION_TIMEOUT_SECONDS: u64 = 120;
const MAX_PROMPT_LENGTH: usize = 48_000;
const MAX_MODEL_LENGTH: usize = 120;

#[derive(serde::Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum LlmChatProvider {
    Deepseek,
    Openai,
    Openrouter,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LlmChatCompletionRequest {
    provider: LlmChatProvider,
    model: String,
    api_key: String,
    system_prompt: String,
    user_prompt: String,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum LlmChatCompletionError {
    ProviderUnsupported,
    ApiKeyRequired,
    PromptRequired,
    ModelRequired,
    RequestInvalid,
    AuthenticationFailed,
    RateLimited,
    ProviderRejected,
    ProviderUnavailable,
    ResponseInvalid,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LlmChatCompletionResult {
    ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    content: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<LlmChatCompletionError>,
}

#[derive(serde::Serialize)]
struct ChatCompletionRequestBody<'a> {
    model: &'a str,
    messages: Vec<ChatMessage<'a>>,
    stream: bool,
}

#[derive(serde::Serialize)]
struct ChatMessage<'a> {
    role: &'a str,
    content: &'a str,
}

#[derive(serde::Deserialize)]
struct ChatCompletionResponseBody {
    choices: Vec<ChatChoice>,
}

#[derive(serde::Deserialize)]
struct ChatChoice {
    message: ChatChoiceMessage,
}

#[derive(serde::Deserialize)]
struct ChatChoiceMessage {
    content: Option<String>,
}

#[tauri::command]
pub async fn run_llm_chat_completion(
    request: LlmChatCompletionRequest,
) -> LlmChatCompletionResult {
    let api_key = request.api_key.trim();
    let model = request.model.trim();
    let system_prompt = request.system_prompt.trim();
    let user_prompt = request.user_prompt.trim();

    if api_key.is_empty() {
        return failed(LlmChatCompletionError::ApiKeyRequired);
    }

    if model.is_empty() || model.len() > MAX_MODEL_LENGTH {
        return failed(LlmChatCompletionError::ModelRequired);
    }

    if system_prompt.is_empty()
        || user_prompt.is_empty()
        || system_prompt.len() > MAX_PROMPT_LENGTH
        || user_prompt.len() > MAX_PROMPT_LENGTH
    {
        return failed(LlmChatCompletionError::PromptRequired);
    }

    let endpoint = match provider_chat_completion_endpoint(&request.provider) {
        Some(endpoint) => endpoint,
        None => return failed(LlmChatCompletionError::ProviderUnsupported),
    };
    let client = match reqwest::Client::builder()
        .timeout(Duration::from_secs(CHAT_COMPLETION_TIMEOUT_SECONDS))
        .build()
    {
        Ok(client) => client,
        Err(_) => return failed(LlmChatCompletionError::RequestInvalid),
    };
    let body = ChatCompletionRequestBody {
        model,
        messages: vec![
            ChatMessage {
                role: "system",
                content: system_prompt,
            },
            ChatMessage {
                role: "user",
                content: user_prompt,
            },
        ],
        stream: false,
    };
    let response = match client
        .post(endpoint)
        .bearer_auth(api_key)
        .header(reqwest::header::CONTENT_TYPE, "application/json")
        .json(&body)
        .send()
        .await
    {
        Ok(response) => response,
        Err(error) if error.is_timeout() => {
            return failed(LlmChatCompletionError::ProviderUnavailable)
        }
        Err(_) => return failed(LlmChatCompletionError::ProviderUnavailable),
    };
    let status = response.status();

    if !status.is_success() {
        return failed(map_http_status(status.as_u16()));
    }

    let response_body = match response.json::<ChatCompletionResponseBody>().await {
        Ok(response_body) => response_body,
        Err(_) => return failed(LlmChatCompletionError::ResponseInvalid),
    };
    let content = response_body
        .choices
        .first()
        .and_then(|choice| choice.message.content.as_deref())
        .map(str::trim)
        .filter(|content| !content.is_empty());

    match content {
        Some(content) => succeeded(content.to_string()),
        None => failed(LlmChatCompletionError::ResponseInvalid),
    }
}

fn provider_chat_completion_endpoint(provider: &LlmChatProvider) -> Option<&'static str> {
    match provider {
        LlmChatProvider::Deepseek => Some("https://api.deepseek.com/chat/completions"),
        LlmChatProvider::Openai => Some("https://api.openai.com/v1/chat/completions"),
        LlmChatProvider::Openrouter => Some("https://openrouter.ai/api/v1/chat/completions"),
    }
}

fn map_http_status(status: u16) -> LlmChatCompletionError {
    match status {
        400 | 404 | 422 => LlmChatCompletionError::RequestInvalid,
        401 | 403 => LlmChatCompletionError::AuthenticationFailed,
        429 => LlmChatCompletionError::RateLimited,
        500..=599 => LlmChatCompletionError::ProviderUnavailable,
        _ => LlmChatCompletionError::ProviderRejected,
    }
}

fn succeeded(content: String) -> LlmChatCompletionResult {
    LlmChatCompletionResult {
        ok: true,
        content: Some(content),
        error: None,
    }
}

fn failed(error: LlmChatCompletionError) -> LlmChatCompletionResult {
    LlmChatCompletionResult {
        ok: false,
        content: None,
        error: Some(error),
    }
}
