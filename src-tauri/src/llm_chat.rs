// llmnav/1 module
// id=workduck.llm.chat-native
// role=Validate and execute bounded non-streaming provider chat completions from desktop command requests.
// owns=provider allowlist|prompt and model bounds|chat error normalization
// excludes=provider credential storage|streaming chat
// search=native llm chat|desktop chat completion|provider chat errors
// invariant=Requests require a non-empty API key, model, and bounded prompts before any provider network call.
// stability=contract
// /llmnav
use serde_json::json;

use crate::chat_completion::{
    ChatCompletionError, CHAT_COMPLETION_MODEL_MAX_LENGTH, chat_completion_endpoint,
    chat_completion_http_client,
    send_chat_completion_json,
};

const MAX_PROMPT_LENGTH: usize = 48_000;

#[derive(serde::Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum LlmChatProvider {
    Deepseek,
    Openai,
    Openrouter,
    Umans,
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

    if model.is_empty() || model.len() > CHAT_COMPLETION_MODEL_MAX_LENGTH {
        return failed(LlmChatCompletionError::ModelRequired);
    }

    if system_prompt.is_empty()
        || user_prompt.is_empty()
        || system_prompt.len() > MAX_PROMPT_LENGTH
        || user_prompt.len() > MAX_PROMPT_LENGTH
    {
        return failed(LlmChatCompletionError::PromptRequired);
    }

    let endpoint = match chat_completion_endpoint(request.provider.as_str()) {
        Some(endpoint) => endpoint,
        None => return failed(LlmChatCompletionError::ProviderUnsupported),
    };
    let client = match chat_completion_http_client() {
        Ok(client) => client,
        Err(error) => return failed(map_chat_completion_error(error)),
    };
    let body = json!({
        "model": model,
        "messages": [
            { "role": "system", "content": system_prompt },
            { "role": "user", "content": user_prompt }
        ],
        "stream": false
    });

    match send_chat_completion_json(&client, endpoint, api_key, &body, false).await {
        Ok(content) => succeeded(content),
        Err(error) => failed(map_chat_completion_error(error)),
    }
}

impl LlmChatProvider {
    fn as_str(&self) -> &'static str {
        match self {
            Self::Deepseek => "deepseek",
            Self::Openai => "openai",
            Self::Openrouter => "openrouter",
            Self::Umans => "umans",
        }
    }
}

fn map_chat_completion_error(error: ChatCompletionError) -> LlmChatCompletionError {
    match error {
        ChatCompletionError::RequestInvalid => LlmChatCompletionError::RequestInvalid,
        ChatCompletionError::AuthenticationFailed => LlmChatCompletionError::AuthenticationFailed,
        ChatCompletionError::RateLimited => LlmChatCompletionError::RateLimited,
        ChatCompletionError::ProviderRejected => LlmChatCompletionError::ProviderRejected,
        ChatCompletionError::ProviderTimeout | ChatCompletionError::ProviderUnavailable => {
            LlmChatCompletionError::ProviderUnavailable
        }
        ChatCompletionError::ResponseEmpty | ChatCompletionError::ResponseInvalid => {
            LlmChatCompletionError::ResponseInvalid
        }
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
