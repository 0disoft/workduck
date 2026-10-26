// llmnav/1 module
// id=workduck.chat-completion.http
// role=Bound shared provider chat HTTP responses before JSON decoding.
// owns=HTTP client|endpoints|response limits
// search=chat response limit|provider JSON
// invariant=Body bytes are bounded before parsing, including chunked transfers.
// stability=contract
// /llmnav
use std::{sync::OnceLock, time::Duration};

use serde::Deserialize;
use serde_json::Value;

const CHAT_COMPLETION_TIMEOUT_SECONDS: u64 = 120;
const CHAT_COMPLETION_RESPONSE_MAX_BYTES: usize = 1024 * 1024;
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

    let response = request.json(body).send().await.map_err(|error| {
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

    read_chat_completion_body(response)
        .await
        .and_then(extract_chat_completion_content)
}

async fn read_chat_completion_body(
    mut response: reqwest::Response,
) -> Result<ChatCompletionResponseBody, ChatCompletionError> {
    if response
        .content_length()
        .is_some_and(|length| length > CHAT_COMPLETION_RESPONSE_MAX_BYTES as u64)
    {
        return Err(ChatCompletionError::ResponseInvalid);
    }

    let mut bytes = Vec::new();
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|_| ChatCompletionError::ResponseInvalid)?
    {
        if chunk.len() > CHAT_COMPLETION_RESPONSE_MAX_BYTES - bytes.len() {
            return Err(ChatCompletionError::ResponseInvalid);
        }
        bytes.extend_from_slice(&chunk);
    }

    serde_json::from_slice(&bytes).map_err(|_| ChatCompletionError::ResponseInvalid)
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
    use std::{
        io::{BufRead, BufReader, Read, Write},
        net::{TcpListener, TcpStream},
        sync::mpsc,
        thread,
    };

    const RESPONSE_LIMIT: usize = 1024 * 1024;

    fn completion_body(length: usize) -> Vec<u8> {
        let mut body = r#"{"choices":[{"message":{"content":"  hello 한글  "}}]}"#
            .as_bytes()
            .to_vec();
        body.resize(length, b' ');
        body
    }

    fn fixed_response(body: &[u8]) -> Vec<u8> {
        let mut response = format!(
            "HTTP/1.1 200 OK\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
            body.len()
        )
        .into_bytes();
        response.extend_from_slice(body);
        response
    }

    fn chunked_response(body: &[u8], complete: bool) -> Vec<u8> {
        let mut response =
            b"HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\nConnection: close\r\n\r\n".to_vec();
        let split = body
            .iter()
            .position(|byte| !byte.is_ascii())
            .map_or(body.len(), |index| index + 1);
        // Deliberately split a UTF-8 codepoint across HTTP frames.
        for chunk in std::iter::once(&body[..split]).chain(body[split..].chunks(4097)) {
            write!(response, "{:x}\r\n", chunk.len()).unwrap();
            response.extend_from_slice(chunk);
            response.extend_from_slice(b"\r\n");
        }
        if complete {
            response.extend_from_slice(b"0\r\n\r\n");
        }
        response
    }

    fn request_fixture(response: Vec<u8>) -> Result<String, ChatCompletionError> {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        listener.set_nonblocking(true).unwrap();
        let endpoint = format!("http://{}/chat/completions", listener.local_addr().unwrap());
        let (release, wait_for_release) = mpsc::channel();
        let server = thread::spawn(move || {
            loop {
                match listener.accept() {
                    Ok((mut stream, _)) => {
                        stream.set_nonblocking(false).unwrap();
                        stream
                            .set_read_timeout(Some(Duration::from_secs(5)))
                            .unwrap();
                        stream
                            .set_write_timeout(Some(Duration::from_secs(5)))
                            .unwrap();
                        read_fixture_request(&mut stream);
                        // Oversized responses may be rejected before this write finishes.
                        let _ = stream.write_all(&response);
                        let _ = wait_for_release.recv_timeout(Duration::from_secs(5));
                        break;
                    }
                    Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {
                        match wait_for_release.recv_timeout(Duration::from_millis(10)) {
                            Err(mpsc::RecvTimeoutError::Timeout) => continue,
                            _ => break,
                        }
                    }
                    Err(error) => panic!("fixture accept failed: {error}"),
                }
            }
        });
        let result = tauri::async_runtime::block_on(async {
            let client = reqwest::Client::builder().no_proxy().build().unwrap();
            tokio::time::timeout(
                Duration::from_secs(3),
                send_chat_completion_json(
                    &client,
                    &endpoint,
                    "fixture-key",
                    &serde_json::json!({"model": "fixture"}),
                    false,
                ),
            )
            .await
        });
        let _ = release.send(());
        server.join().unwrap();
        result.expect("response must be accepted or rejected without waiting for the stream to end")
    }

    fn read_fixture_request(stream: &mut TcpStream) {
        let mut reader = BufReader::new(stream);
        let mut content_length = 0;
        loop {
            let mut line = String::new();
            assert!(reader.read_line(&mut line).unwrap() > 0);
            if line == "\r\n" {
                break;
            }
            if let Some(value) = line.to_ascii_lowercase().strip_prefix("content-length:") {
                content_length = value.trim().parse::<usize>().unwrap();
            }
        }
        let mut body = vec![0; content_length];
        reader.read_exact(&mut body).unwrap();
    }

    #[test]
    fn response_at_byte_limit_is_accepted_with_known_or_chunked_length() {
        let body = completion_body(RESPONSE_LIMIT);
        for response in [fixed_response(&body), chunked_response(&body, true)] {
            assert_eq!(request_fixture(response), Ok("hello 한글".to_string()));
        }
    }

    #[test]
    fn oversized_valid_json_is_rejected_with_known_or_chunked_length() {
        let body = completion_body(RESPONSE_LIMIT + 1);
        for response in [fixed_response(&body), chunked_response(&body, true)] {
            assert_eq!(
                request_fixture(response),
                Err(ChatCompletionError::ResponseInvalid)
            );
        }
    }

    #[test]
    fn oversized_response_is_rejected_without_waiting_for_body_completion() {
        let headers = format!(
            "HTTP/1.1 200 OK\r\nContent-Length: {}\r\n\r\n",
            RESPONSE_LIMIT + 1
        );
        for response in [
            headers.into_bytes(),
            chunked_response(&completion_body(RESPONSE_LIMIT + 1), false),
        ] {
            assert_eq!(
                request_fixture(response),
                Err(ChatCompletionError::ResponseInvalid)
            );
        }
    }

    #[test]
    fn bounded_response_keeps_invalid_json_and_http_error_classification() {
        assert_eq!(
            request_fixture(fixed_response(b"not JSON")),
            Err(ChatCompletionError::ResponseInvalid)
        );
        assert_eq!(
            request_fixture(
                b"HTTP/1.1 429 Too Many Requests\r\nContent-Length: 99999999\r\n\r\n".to_vec()
            ),
            Err(ChatCompletionError::RateLimited)
        );
    }

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
