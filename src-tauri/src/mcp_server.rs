/* llmnav/1 module
id=workduck.mcp.server
role=Serve one workspace's redacted Agent API snapshot through bounded read-only stdio MCP tools.
owns=stdio MCP protocol|read-only tool catalog|workspace-bound snapshot projection
excludes=workspace mutation|secret values|network transport
search=read-only MCP server|workspace MCP tools|stdio agent snapshot
invariant=Tool input cannot select paths, every tool result is projected from the redacted snapshot, and stdout contains only MCP JSON messages.
risk=privacy
rel=test>workduck.mcp.server.contract
stability=contract
*/
use std::{
    fmt, fs,
    io::{self, BufRead, BufReader, BufWriter, Read, Write},
    path::{Path, PathBuf},
    time::Duration,
};

use rusqlite::{Connection, OpenFlags};
use serde_json::{Map, Value, json};

use crate::agent_api_snapshot::{AgentApiSnapshotRequest, build_agent_api_snapshot};

const SERVER_NAME: &str = "workduck";
const SERVER_DESCRIPTION: &str =
    "Read-only Workduck workspace metadata projected from the redacted Agent API snapshot.";
const MODERN_PROTOCOL_VERSION: &str = "2026-07-28";
const LEGACY_PROTOCOL_VERSIONS: [&str; 4] = [
    "2025-11-25",
    "2025-06-18",
    "2025-03-26",
    "2024-11-05",
];
const CURRENT_SCHEMA_VERSION: i64 = 6;
const MAX_STDIO_MESSAGE_BYTES: usize = 1_048_576;
const SQLITE_BUSY_TIMEOUT_MILLIS: u64 = 5_000;
const PROTOCOL_VERSION_META_KEY: &str = "io.modelcontextprotocol/protocolVersion";
const CLIENT_INFO_META_KEY: &str = "io.modelcontextprotocol/clientInfo";
const CLIENT_CAPABILITIES_META_KEY: &str = "io.modelcontextprotocol/clientCapabilities";

#[derive(Debug, Clone)]
pub struct McpServerConfig {
    workspace_id: String,
    workspace_path: PathBuf,
    database_path: Option<PathBuf>,
}

impl McpServerConfig {
    pub fn new(
        workspace_id: impl Into<String>,
        workspace_path: impl Into<PathBuf>,
        database_path: Option<PathBuf>,
    ) -> Self {
        Self {
            workspace_id: workspace_id.into(),
            workspace_path: workspace_path.into(),
            database_path,
        }
    }
}

#[derive(Debug)]
pub enum McpServerError {
    InvalidConfiguration(String),
    DatabasePathInvalid(PathBuf),
    DatabaseOpen {
        path: PathBuf,
        source: rusqlite::Error,
    },
    DatabaseSchemaTooNew {
        database_version: i64,
        current_version: i64,
    },
    Input(io::Error),
    Output(io::Error),
    MessageTooLarge,
}

impl fmt::Display for McpServerError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::InvalidConfiguration(error) => {
                write!(formatter, "invalid MCP server configuration: {error}")
            }
            Self::DatabasePathInvalid(path) => write!(
                formatter,
                "MCP database path is not an existing regular file: {}",
                path.display()
            ),
            Self::DatabaseOpen { path, source } => write!(
                formatter,
                "failed to open Workduck database read-only at '{}': {source}",
                path.display()
            ),
            Self::DatabaseSchemaTooNew {
                database_version,
                current_version,
            } => write!(
                formatter,
                "Workduck database schema version {database_version} is newer than supported version {current_version}"
            ),
            Self::Input(source) => write!(formatter, "MCP stdin read failed: {source}"),
            Self::Output(source) => write!(formatter, "MCP stdout write failed: {source}"),
            Self::MessageTooLarge => write!(
                formatter,
                "MCP stdio message exceeded the {MAX_STDIO_MESSAGE_BYTES}-byte limit"
            ),
        }
    }
}

impl std::error::Error for McpServerError {}

pub fn run_stdio(config: McpServerConfig) -> Result<(), McpServerError> {
    let stdin = io::stdin();
    let stdout = io::stdout();
    let mut reader = BufReader::new(stdin.lock());
    let mut writer = BufWriter::new(stdout.lock());

    run_stdio_with_io(config, &mut reader, &mut writer)
}

fn run_stdio_with_io<R: BufRead, W: Write>(
    config: McpServerConfig,
    reader: &mut R,
    writer: &mut W,
) -> Result<(), McpServerError> {
    let mut server = McpServer::new(config)?;

    while let Some(frame) = read_stdio_frame(reader)? {
        let response = match serde_json::from_slice::<Value>(&frame) {
            Ok(message) => server.handle_message(message),
            Err(error) => Some(json_rpc_error(
                Value::Null,
                -32700,
                "Parse error",
                Some(json!({ "detail": error.to_string() })),
            )),
        };

        if let Some(response) = response {
            serde_json::to_writer(&mut *writer, &response).map_err(|source| {
                McpServerError::Output(io::Error::other(source.to_string()))
            })?;
            writer
                .write_all(b"\n")
                .map_err(McpServerError::Output)?;
            writer.flush().map_err(McpServerError::Output)?;
        }
    }

    Ok(())
}

fn read_stdio_frame<R: BufRead>(reader: &mut R) -> Result<Option<Vec<u8>>, McpServerError> {
    loop {
        let mut frame = Vec::new();
        let bytes_read = {
            let mut limited = (&mut *reader).take((MAX_STDIO_MESSAGE_BYTES + 1) as u64);
            limited
                .read_until(b'\n', &mut frame)
                .map_err(McpServerError::Input)?
        };

        if bytes_read == 0 {
            return Ok(None);
        }

        if frame.len() > MAX_STDIO_MESSAGE_BYTES {
            return Err(McpServerError::MessageTooLarge);
        }

        while matches!(frame.last(), Some(b'\n' | b'\r')) {
            frame.pop();
        }

        if frame.iter().all(|byte| byte.is_ascii_whitespace()) {
            continue;
        }

        return Ok(Some(frame));
    }
}

struct McpServer {
    config: McpServerConfig,
    database: Option<Connection>,
    negotiated_legacy_protocol: Option<String>,
}

impl McpServer {
    fn new(config: McpServerConfig) -> Result<Self, McpServerError> {
        let database = config
            .database_path
            .as_deref()
            .map(open_read_only_database)
            .transpose()?;
        let server = Self {
            config,
            database,
            negotiated_legacy_protocol: None,
        };
        let probe = server.snapshot_value()?;

        if probe.get("ok").and_then(Value::as_bool) != Some(true) {
            let error = probe
                .get("error")
                .and_then(Value::as_str)
                .unwrap_or("agent-api-snapshot-invalid");
            return Err(McpServerError::InvalidConfiguration(error.to_owned()));
        }

        Ok(server)
    }

    fn handle_message(&mut self, message: Value) -> Option<Value> {
        match message {
            Value::Array(messages) if messages.is_empty() => Some(json_rpc_error(
                Value::Null,
                -32600,
                "Invalid Request",
                None,
            )),
            Value::Array(messages) => {
                let responses = messages
                    .into_iter()
                    .filter_map(|message| self.handle_single_message(message))
                    .collect::<Vec<_>>();

                if responses.is_empty() {
                    None
                } else {
                    Some(Value::Array(responses))
                }
            }
            message => self.handle_single_message(message),
        }
    }

    fn handle_single_message(&mut self, message: Value) -> Option<Value> {
        let Value::Object(object) = message else {
            return Some(json_rpc_error(
                Value::Null,
                -32600,
                "Invalid Request",
                None,
            ));
        };
        let id = object.get("id").cloned();
        let Some(method) = object.get("method").and_then(Value::as_str) else {
            return id.map(|id| json_rpc_error(id, -32600, "Invalid Request", None));
        };

        if object.get("jsonrpc").and_then(Value::as_str) != Some("2.0") {
            return id.map(|id| json_rpc_error(id, -32600, "Invalid Request", None));
        }

        let params = object.get("params").cloned().unwrap_or_else(|| json!({}));
        let requested_version = request_protocol_version(&params);
        let modern_request = requested_version == Some(MODERN_PROTOCOL_VERSION)
            || method == "server/discover";

        if let Some(version) = requested_version {
            if version != MODERN_PROTOCOL_VERSION {
                return id.map(|id| unsupported_protocol_version(id, version));
            }

            if method != "server/discover" {
                if let Err(error) = validate_modern_request_meta(&params) {
                    return id.map(|id| json_rpc_error(id, error.code, error.message, error.data));
                }
            }
        }

        let legacy_ready = self.negotiated_legacy_protocol.is_some();
        let result = match method {
            "server/discover" => self.handle_server_discover(),
            "initialize" if modern_request => Err(RpcFailure::new(-32601, "Method not found")),
            "initialize" => self.handle_initialize(&params),
            "ping" if modern_request => Err(RpcFailure::new(-32601, "Method not found")),
            "ping" => Ok(json!({})),
            "tools/list" if modern_request || legacy_ready => {
                self.handle_tools_list(modern_request)
            }
            "tools/call" if modern_request || legacy_ready => self.handle_tools_call(&params),
            "tools/list" | "tools/call" => Err(RpcFailure::new(-32002, "Server not initialized")),
            "notifications/initialized" | "notifications/cancelled" => return None,
            _ => Err(RpcFailure::new(-32601, "Method not found")),
        };

        match id {
            Some(id) => Some(match result {
                Ok(result) => json_rpc_success(id, result, modern_request),
                Err(error) => json_rpc_error(id, error.code, error.message, error.data),
            }),
            None => None,
        }
    }

    fn handle_server_discover(&self) -> Result<Value, RpcFailure> {
        Ok(json!({
            "supportedVersions": [MODERN_PROTOCOL_VERSION],
            "capabilities": {
                "tools": {}
            },
            "serverInfo": server_info(),
            "instructions": SERVER_DESCRIPTION
        }))
    }

    fn handle_initialize(&mut self, params: &Value) -> Result<Value, RpcFailure> {
        let preferred_version = params
            .get("protocolVersion")
            .and_then(Value::as_str)
            .unwrap_or(LEGACY_PROTOCOL_VERSIONS[0]);
        let selected_version = if LEGACY_PROTOCOL_VERSIONS.contains(&preferred_version) {
            preferred_version
        } else {
            LEGACY_PROTOCOL_VERSIONS[0]
        };

        self.negotiated_legacy_protocol = Some(selected_version.to_owned());

        Ok(json!({
            "protocolVersion": selected_version,
            "capabilities": {
                "tools": {
                    "listChanged": false
                }
            },
            "serverInfo": server_info(),
            "instructions": SERVER_DESCRIPTION
        }))
    }

    fn handle_tools_list(&self, modern_request: bool) -> Result<Value, RpcFailure> {
        if modern_request {
            return Ok(json!({
                "tools": tool_catalog(),
                "ttlMs": 300_000,
                "cacheScope": "private"
            }));
        }

        Ok(json!({ "tools": tool_catalog() }))
    }

    fn handle_tools_call(&self, params: &Value) -> Result<Value, RpcFailure> {
        let object = params
            .as_object()
            .ok_or_else(|| RpcFailure::invalid_params("tools/call params must be an object"))?;
        let name = object
            .get("name")
            .and_then(Value::as_str)
            .ok_or_else(|| RpcFailure::invalid_params("tools/call requires a tool name"))?;
        let arguments = object.get("arguments").unwrap_or(&Value::Null);

        if !arguments.is_null()
            && arguments
                .as_object()
                .map(|arguments| !arguments.is_empty())
                .unwrap_or(true)
        {
            return Err(RpcFailure::invalid_params(
                "Workduck read-only tools do not accept arguments; the workspace is bound when the server starts",
            ));
        }

        let snapshot = self.snapshot()?;
        let data = match name {
            "workspace_status" => project_workspace_status(&snapshot)?,
            "list_projects" => required_field(&snapshot, "projectRegistry")?,
            "list_queue" => required_field(&snapshot, "queue")?,
            "list_runs" => json!({
                "generatedAt": required_field(&snapshot, "generatedAt")?,
                "repositoryImportAttempts": required_field(
                    &snapshot,
                    "repositoryImportAttempts"
                )?,
                "repositoryTaskRuns": required_field(&snapshot, "repositoryTaskRuns")?
            }),
            _ => {
                return Err(RpcFailure::invalid_params(format!(
                    "unknown Workduck tool: {name}"
                )))
            }
        };
        let text = serde_json::to_string_pretty(&data)
            .map_err(|_| RpcFailure::internal("failed to serialize tool result"))?;
        Ok(json!({
            "content": [{
                "type": "text",
                "text": text
            }],
            "structuredContent": data,
            "isError": false
        }))
    }

    fn snapshot(&self) -> Result<Map<String, Value>, RpcFailure> {
        let result = self
            .snapshot_value()
            .map_err(|error| RpcFailure::internal(error.to_string()))?;

        if result.get("ok").and_then(Value::as_bool) != Some(true) {
            let code = result
                .get("error")
                .and_then(Value::as_str)
                .unwrap_or("agent-api-snapshot-failed");
            return Err(RpcFailure::internal(code));
        }

        result
            .get("snapshot")
            .and_then(Value::as_object)
            .cloned()
            .ok_or_else(|| RpcFailure::internal("agent snapshot payload is missing"))
    }

    fn snapshot_value(&self) -> Result<Value, McpServerError> {
        serde_json::to_value(build_agent_api_snapshot(
            AgentApiSnapshotRequest::new(
                self.config.workspace_id.clone(),
                self.config.workspace_path.to_string_lossy().into_owned(),
            ),
            self.database.as_ref(),
        ))
        .map_err(|error| McpServerError::InvalidConfiguration(error.to_string()))
    }
}

fn project_workspace_status(snapshot: &Map<String, Value>) -> Result<Value, RpcFailure> {
    Ok(json!({
        "version": required_field(snapshot, "version")?,
        "generatedAt": required_field(snapshot, "generatedAt")?,
        "capabilities": required_field(snapshot, "capabilities")?,
        "workspace": required_field(snapshot, "workspace")?,
        "workspaceMetadata": required_field(snapshot, "workspaceMetadata")?
    }))
}

fn required_field(snapshot: &Map<String, Value>, key: &str) -> Result<Value, RpcFailure> {
    snapshot
        .get(key)
        .cloned()
        .ok_or_else(|| RpcFailure::internal(format!("agent snapshot field is missing: {key}")))
}

fn open_read_only_database(path: &Path) -> Result<Connection, McpServerError> {
    let canonical_path = fs::canonicalize(path)
        .map_err(|_| McpServerError::DatabasePathInvalid(path.to_path_buf()))?;
    let metadata = fs::metadata(&canonical_path)
        .map_err(|_| McpServerError::DatabasePathInvalid(canonical_path.clone()))?;

    if !metadata.is_file() {
        return Err(McpServerError::DatabasePathInvalid(canonical_path));
    }

    let connection = Connection::open_with_flags(
        &canonical_path,
        OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX,
    )
    .map_err(|source| McpServerError::DatabaseOpen {
        path: canonical_path.clone(),
        source,
    })?;

    connection
        .busy_timeout(Duration::from_millis(SQLITE_BUSY_TIMEOUT_MILLIS))
        .map_err(|source| McpServerError::DatabaseOpen {
            path: canonical_path.clone(),
            source,
        })?;

    let schema_version = connection
        .query_row("PRAGMA user_version", [], |row| row.get::<_, i64>(0))
        .map_err(|source| McpServerError::DatabaseOpen {
            path: canonical_path,
            source,
        })?;

    if schema_version > CURRENT_SCHEMA_VERSION {
        return Err(McpServerError::DatabaseSchemaTooNew {
            database_version: schema_version,
            current_version: CURRENT_SCHEMA_VERSION,
        });
    }

    Ok(connection)
}

fn request_protocol_version(params: &Value) -> Option<&str> {
    params
        .get("_meta")
        .and_then(Value::as_object)
        .and_then(|metadata| metadata.get(PROTOCOL_VERSION_META_KEY))
        .and_then(Value::as_str)
}

fn validate_modern_request_meta(params: &Value) -> Result<(), RpcFailure> {
    let metadata = params
        .get("_meta")
        .and_then(Value::as_object)
        .ok_or_else(|| RpcFailure::invalid_params("2026-07-28 requests require _meta"))?;
    let client_info = metadata
        .get(CLIENT_INFO_META_KEY)
        .and_then(Value::as_object)
        .ok_or_else(|| {
            RpcFailure::invalid_params(
                "2026-07-28 requests require io.modelcontextprotocol/clientInfo",
            )
        })?;

    if client_info
        .get("name")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|name| !name.is_empty())
        .is_none()
        || client_info
            .get("version")
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|version| !version.is_empty())
            .is_none()
    {
        return Err(RpcFailure::invalid_params(
            "MCP clientInfo requires non-empty name and version fields",
        ));
    }

    if metadata
        .get(CLIENT_CAPABILITIES_META_KEY)
        .and_then(Value::as_object)
        .is_none()
    {
        return Err(RpcFailure::invalid_params(
            "2026-07-28 requests require io.modelcontextprotocol/clientCapabilities",
        ));
    }

    Ok(())
}

fn server_info() -> Value {
    json!({
        "name": SERVER_NAME,
        "version": env!("CARGO_PKG_VERSION"),
        "description": SERVER_DESCRIPTION
    })
}

fn tool_catalog() -> Vec<Value> {
    vec![
        read_only_tool(
            "workspace_status",
            "Workspace status",
            "Return the bound workspace identity, read-only capabilities, and redacted .workduck metadata status.",
        ),
        read_only_tool(
            "list_projects",
            "List projects",
            "Return the redacted project, group, and repository registry from Workduck SQLite storage.",
        ),
        read_only_tool(
            "list_queue",
            "List queue",
            "Return Queue file names, relative paths, kinds, and counts without reading task bodies.",
        ),
        read_only_tool(
            "list_runs",
            "List runs",
            "Return repository import attempts and task-run metadata without command text or output tails.",
        ),
    ]
}

fn read_only_tool(name: &'static str, title: &'static str, description: &'static str) -> Value {
    json!({
        "name": name,
        "title": title,
        "description": description,
        "inputSchema": {
            "type": "object",
            "properties": {},
            "additionalProperties": false
        },
        "outputSchema": {
            "type": "object"
        },
        "annotations": {
            "readOnlyHint": true,
            "destructiveHint": false,
            "idempotentHint": true,
            "openWorldHint": false
        }
    })
}

#[derive(Debug)]
struct RpcFailure {
    code: i64,
    message: String,
    data: Option<Value>,
}

impl RpcFailure {
    fn new(code: i64, message: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
            data: None,
        }
    }

    fn invalid_params(message: impl Into<String>) -> Self {
        Self::new(-32602, message)
    }

    fn internal(message: impl Into<String>) -> Self {
        Self::new(-32603, message)
    }
}

fn json_rpc_success(id: Value, result: Value, modern_request: bool) -> Value {
    let mut response = json!({
        "jsonrpc": "2.0",
        "id": id,
        "result": result
    });

    if modern_request {
        response
            .as_object_mut()
            .expect("JSON-RPC success response must be an object")
            .insert("resultType".to_owned(), Value::String("complete".to_owned()));
    }

    response
}

fn unsupported_protocol_version(id: Value, requested: &str) -> Value {
    json_rpc_error(
        id,
        -32022,
        "Unsupported protocol version",
        Some(json!({
            "supported": [MODERN_PROTOCOL_VERSION],
            "requested": requested
        })),
    )
}

fn json_rpc_error(
    id: Value,
    code: i64,
    message: impl Into<String>,
    data: Option<Value>,
) -> Value {
    let mut error = json!({
        "code": code,
        "message": message.into()
    });

    if let Some(data) = data {
        error
            .as_object_mut()
            .expect("JSON-RPC error must be an object")
            .insert("data".to_owned(), data);
    }

    json!({
        "jsonrpc": "2.0",
        "id": id,
        "error": error
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_server(workspace: &Path) -> McpServer {
        McpServer::new(McpServerConfig::new(
            "workspace_test",
            workspace,
            None,
        ))
        .expect("test MCP server")
    }

    fn request(id: i64, method: &str, params: Value) -> Value {
        json!({
            "jsonrpc": "2.0",
            "id": id,
            "method": method,
            "params": params
        })
    }

    fn modern_params() -> Value {
        json!({
            "_meta": {
                (PROTOCOL_VERSION_META_KEY): MODERN_PROTOCOL_VERSION,
                (CLIENT_INFO_META_KEY): {
                    "name": "workduck-test-client",
                    "version": "1.0.0"
                },
                (CLIENT_CAPABILITIES_META_KEY): {}
            }
        })
    }

    #[test]
    fn tool_catalog_is_fixed_read_only_and_accepts_no_paths() {
        let workspace = tempfile::tempdir().expect("temporary workspace");
        let mut server = test_server(workspace.path());
        server
            .handle_message(request(
                0,
                "initialize",
                json!({ "protocolVersion": "2025-11-25" }),
            ))
            .expect("initialize response");
        let response = server
            .handle_message(request(1, "tools/list", json!({})))
            .expect("tools/list response");
        let tools = response["result"]["tools"]
            .as_array()
            .expect("tool list");
        let names = tools
            .iter()
            .filter_map(|tool| tool["name"].as_str())
            .collect::<Vec<_>>();

        assert_eq!(
            names,
            vec![
                "workspace_status",
                "list_projects",
                "list_queue",
                "list_runs"
            ]
        );
        assert!(tools.iter().all(|tool| {
            tool["inputSchema"]["additionalProperties"] == false
                && tool["annotations"]["readOnlyHint"] == true
                && tool["annotations"]["destructiveHint"] == false
        }));
    }

    #[test]
    fn tool_call_rejects_model_selected_workspace_paths() {
        let workspace = tempfile::tempdir().expect("temporary workspace");
        let mut server = test_server(workspace.path());
        server
            .handle_message(request(
                0,
                "initialize",
                json!({ "protocolVersion": "2025-11-25" }),
            ))
            .expect("initialize response");
        let response = server
            .handle_message(request(
                2,
                "tools/call",
                json!({
                    "name": "workspace_status",
                    "arguments": {
                        "workspace": "C:/other-workspace"
                    }
                }),
            ))
            .expect("tools/call response");

        assert_eq!(response["error"]["code"], -32602);
    }

    // llmnav/1 symbol
    // id=workduck.mcp.server.contract
    // role=Verify MCP projections retain Agent API redaction and never return command or output bodies.
    // search=MCP redaction contract|read-only tool privacy|MCP secret omission
    // stability=contract
    // /llmnav
    #[test]
    fn run_tool_projects_redacted_snapshot_without_command_or_output_text() {
        let workspace = tempfile::tempdir().expect("temporary workspace");
        let run_dir = workspace
            .path()
            .join(".workduck")
            .join("repository-task-runs");
        fs::create_dir_all(&run_dir).expect("run directory");
        fs::write(
            run_dir.join("run.json"),
            r#"{
                "id":"run_1",
                "task":"build",
                "repositoryPath":"projects/workduck",
                "state":"failed",
                "command":"echo secret-command",
                "outputTail":"secret-output",
                "startedAt":"2026-08-20T00:00:00Z"
            }"#,
        )
        .expect("run record");
        let mut server = test_server(workspace.path());
        server
            .handle_message(request(
                0,
                "initialize",
                json!({ "protocolVersion": "2025-11-25" }),
            ))
            .expect("initialize response");
        let response = server
            .handle_message(request(
                3,
                "tools/call",
                json!({ "name": "list_runs", "arguments": {} }),
            ))
            .expect("tools/call response");
        let serialized = response.to_string();

        assert!(serialized.contains("hasCommand"));
        assert!(serialized.contains("hasOutputTail"));
        assert!(!serialized.contains("secret-command"));
        assert!(!serialized.contains("secret-output"));
    }

    #[test]
    fn modern_discovery_and_legacy_initialize_are_both_supported() {
        let workspace = tempfile::tempdir().expect("temporary workspace");
        let mut server = test_server(workspace.path());
        let discovery = server
            .handle_message(request(4, "server/discover", json!({})))
            .expect("server/discover response");
        let initialize = server
            .handle_message(request(
                5,
                "initialize",
                json!({ "protocolVersion": "2025-11-25" }),
            ))
            .expect("initialize response");

        assert_eq!(discovery["resultType"], "complete");
        assert_eq!(
            discovery["result"]["supportedVersions"][0],
            MODERN_PROTOCOL_VERSION
        );
        assert_eq!(initialize["result"]["protocolVersion"], "2025-11-25");
    }

    #[test]
    fn modern_tool_list_uses_top_level_result_type_and_private_ttl() {
        let workspace = tempfile::tempdir().expect("temporary workspace");
        let mut server = test_server(workspace.path());
        let response = server
            .handle_message(request(7, "tools/list", modern_params()))
            .expect("modern tools/list response");

        assert_eq!(response["resultType"], "complete");
        assert_eq!(response["result"]["ttlMs"], 300_000);
        assert_eq!(response["result"]["cacheScope"], "private");
    }

    #[test]
    fn unsupported_per_request_version_uses_closed_negotiation_error() {
        let workspace = tempfile::tempdir().expect("temporary workspace");
        let mut server = test_server(workspace.path());
        let response = server
            .handle_message(request(
                8,
                "tools/list",
                json!({
                    "_meta": {
                        (PROTOCOL_VERSION_META_KEY): "2099-01-01"
                    }
                }),
            ))
            .expect("unsupported version response");

        assert_eq!(response["error"]["code"], -32022);
        assert_eq!(response["error"]["data"]["requested"], "2099-01-01");
        assert_eq!(
            response["error"]["data"]["supported"][0],
            MODERN_PROTOCOL_VERSION
        );
    }

    #[test]
    fn project_tool_reads_explicit_database_through_read_only_connection() {
        let workspace = tempfile::tempdir().expect("temporary workspace");
        let database = tempfile::NamedTempFile::new().expect("temporary database");
        let connection = Connection::open(database.path()).expect("create database");
        connection
            .execute_batch(
                r#"PRAGMA user_version = 6;
                CREATE TABLE project_registries (
                    workspace_id TEXT PRIMARY KEY NOT NULL,
                    registry_json TEXT NOT NULL
                );
                CREATE TABLE project_repository_import_attempt_records (
                    id TEXT PRIMARY KEY NOT NULL,
                    workspace_id TEXT NOT NULL,
                    node_id TEXT NOT NULL,
                    repository_name TEXT NOT NULL,
                    state TEXT NOT NULL,
                    phase TEXT NOT NULL,
                    upstream_remote_url TEXT NOT NULL,
                    fork_remote_url TEXT,
                    target_path TEXT,
                    error_code TEXT,
                    started_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    finished_at TEXT
                );
                INSERT INTO project_registries (workspace_id, registry_json)
                VALUES (
                    'workspace_test',
                    '{"version":1,"nodes":[{"id":"project_1","kind":"project","name":"Workduck","path":"projects/workduck","githubCredentialSecretId":"secret_mcp","repositories":[]}]}'
                );"#,
            )
            .expect("database schema");
        drop(connection);

        let mut server = McpServer::new(McpServerConfig::new(
            "workspace_test",
            workspace.path(),
            Some(database.path().to_path_buf()),
        ))
        .expect("MCP server with database");
        server
            .handle_message(request(
                0,
                "initialize",
                json!({ "protocolVersion": "2025-11-25" }),
            ))
            .expect("initialize response");
        let response = server
            .handle_message(request(
                6,
                "tools/call",
                json!({ "name": "list_projects", "arguments": {} }),
            ))
            .expect("project tool response");
        let serialized = response.to_string();

        assert_eq!(
            response["result"]["structuredContent"]["counts"]["projects"],
            1
        );
        assert!(!serialized.contains("secret_mcp"));
    }
}
