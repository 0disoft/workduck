/* llmnav/1 module
id=workduck.mcp.cli
role=Resolve one fixed Workduck workspace and launch its read-only stdio MCP server.
owns=MCP command options|workspace ID discovery|local database discovery
excludes=MCP protocol handling|snapshot redaction|workspace mutation
search=workduck MCP command|stdio MCP launcher|workspace MCP configuration
invariant=The workspace and optional database are resolved before serving and are never accepted from model-generated tool arguments.
stability=contract
*/
use std::{
    env, fs,
    path::{Path, PathBuf},
    process::ExitCode,
};

use serde_json::Value;
use workduck_lib::mcp_server::{McpServerConfig, run_stdio};

const APP_NAME: &str = "workduck-mcp";
const APP_IDENTIFIER: &str = "com.workduck.desktop";
const DATABASE_FILE_NAME: &str = "workduck.sqlite3";
const WORKSPACE_FILE_MAX_BYTES: u64 = 1_048_576;

#[derive(Default)]
struct Options {
    workspace_path: Option<PathBuf>,
    workspace_id: Option<String>,
    database_path: Option<PathBuf>,
}

fn main() -> ExitCode {
    match run() {
        Ok(()) => ExitCode::SUCCESS,
        Err(error) => {
            eprintln!("{APP_NAME}: {error}");
            ExitCode::FAILURE
        }
    }
}

fn run() -> Result<(), String> {
    let args = env::args().skip(1).collect::<Vec<_>>();

    if args.iter().any(|arg| arg == "-h" || arg == "--help") {
        println!("{}", usage_text());
        return Ok(());
    }

    if args.len() == 1 && args[0] == "--version" {
        println!("{}", env!("CARGO_PKG_VERSION"));
        return Ok(());
    }

    let options = parse_args(&args)?;
    let workspace_path = resolve_workspace_path(options.workspace_path)?;
    let workspace_id = resolve_workspace_id(options.workspace_id, &workspace_path)?;
    let database_path = resolve_database_path(options.database_path);

    if database_path.is_none() {
        eprintln!(
            "{APP_NAME}: Workduck database was not found; list_projects and repository import attempts will report their data source as unavailable. Pass --database or WORKDUCK_DATABASE_PATH to enable them."
        );
    }

    run_stdio(McpServerConfig::new(
        workspace_id,
        workspace_path,
        database_path,
    ))
    .map_err(|error| error.to_string())
}

fn parse_args(args: &[String]) -> Result<Options, String> {
    if args.first().map(String::as_str) != Some("serve") {
        return Err(format!("expected 'serve' command\n\n{}", usage_text()));
    }

    let mut options = Options::default();
    let mut index = 1;

    while index < args.len() {
        match args[index].as_str() {
            "--workspace" => {
                options.workspace_path = Some(PathBuf::from(read_option_value(
                    args,
                    &mut index,
                    "--workspace",
                )?));
            }
            "--workspace-id" => {
                options.workspace_id = Some(read_option_value(
                    args,
                    &mut index,
                    "--workspace-id",
                )?);
            }
            "--database" => {
                options.database_path = Some(PathBuf::from(read_option_value(
                    args,
                    &mut index,
                    "--database",
                )?));
            }
            unknown => return Err(format!("unknown option: {unknown}\n\n{}", usage_text())),
        }

        index += 1;
    }

    Ok(options)
}

fn read_option_value(
    args: &[String],
    index: &mut usize,
    option: &'static str,
) -> Result<String, String> {
    *index += 1;
    let value = args
        .get(*index)
        .map(String::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| format!("{option} requires a value"))?;

    Ok(value.to_owned())
}

fn resolve_workspace_path(configured: Option<PathBuf>) -> Result<PathBuf, String> {
    let workspace_path = configured
        .or_else(|| non_empty_env_path("WORKDUCK_WORKSPACE"))
        .ok_or_else(|| {
            "workspace path is required through --workspace or WORKDUCK_WORKSPACE".to_owned()
        })?;

    if !workspace_path.is_absolute() {
        return Err(format!(
            "workspace path must be absolute: {}",
            workspace_path.display()
        ));
    }

    let canonical_path = fs::canonicalize(&workspace_path).map_err(|error| {
        format!(
            "failed to resolve workspace '{}': {error}",
            workspace_path.display()
        )
    })?;
    let metadata = fs::metadata(&canonical_path).map_err(|error| {
        format!(
            "failed to inspect workspace '{}': {error}",
            canonical_path.display()
        )
    })?;

    if !metadata.is_dir() {
        return Err(format!(
            "workspace path is not a directory: {}",
            canonical_path.display()
        ));
    }

    fs::read_dir(&canonical_path).map_err(|error| {
        format!(
            "workspace directory is not readable '{}': {error}",
            canonical_path.display()
        )
    })?;

    Ok(canonical_path)
}

fn resolve_workspace_id(configured: Option<String>, workspace_path: &Path) -> Result<String, String> {
    if let Some(workspace_id) = configured
        .or_else(|| non_empty_env_string("WORKDUCK_WORKSPACE_ID"))
        .map(|workspace_id| workspace_id.trim().to_owned())
        .filter(|workspace_id| !workspace_id.is_empty())
    {
        return Ok(workspace_id);
    }

    if let Some(workspace_id) = read_workspace_id_file(workspace_path)? {
        return Ok(workspace_id);
    }

    workspace_path
        .file_name()
        .and_then(|name| name.to_str())
        .map(str::trim)
        .filter(|name| !name.is_empty())
        .map(str::to_owned)
        .ok_or_else(|| "workspace ID could not be derived; pass --workspace-id".to_owned())
}

fn read_workspace_id_file(workspace_path: &Path) -> Result<Option<String>, String> {
    let file_path = workspace_path.join(".workduck").join("workspace.json");
    let metadata = match fs::symlink_metadata(&file_path) {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(error) => {
            return Err(format!(
                "failed to inspect workspace metadata '{}': {error}",
                file_path.display()
            ))
        }
    };

    if metadata.file_type().is_symlink() || !metadata.is_file() {
        return Err(format!(
            "workspace metadata is not a regular file: {}",
            file_path.display()
        ));
    }

    if metadata.len() > WORKSPACE_FILE_MAX_BYTES {
        return Err(format!(
            "workspace metadata exceeds {WORKSPACE_FILE_MAX_BYTES} bytes: {}",
            file_path.display()
        ));
    }

    let content = fs::read_to_string(&file_path).map_err(|error| {
        format!(
            "failed to read workspace metadata '{}': {error}",
            file_path.display()
        )
    })?;
    let value = serde_json::from_str::<Value>(&content).map_err(|error| {
        format!(
            "workspace metadata is invalid JSON '{}': {error}",
            file_path.display()
        )
    })?;

    Ok(value
        .get("id")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|workspace_id| !workspace_id.is_empty())
        .map(str::to_owned))
}

fn resolve_database_path(configured: Option<PathBuf>) -> Option<PathBuf> {
    if let Some(path) = configured.or_else(|| non_empty_env_path("WORKDUCK_DATABASE_PATH")) {
        return Some(path);
    }

    default_database_candidates()
        .into_iter()
        .find(|path| path.is_file())
}

fn non_empty_env_path(name: &str) -> Option<PathBuf> {
    non_empty_env_string(name).map(PathBuf::from)
}

fn non_empty_env_string(name: &str) -> Option<String> {
    env::var(name)
        .ok()
        .map(|value| value.trim().to_owned())
        .filter(|value| !value.is_empty())
}

fn default_database_candidates() -> Vec<PathBuf> {
    let mut candidates = Vec::new();

    #[cfg(windows)]
    if let Some(local_app_data) = env::var_os("LOCALAPPDATA") {
        candidates.push(
            PathBuf::from(local_app_data)
                .join(APP_IDENTIFIER)
                .join(DATABASE_FILE_NAME),
        );
    }

    #[cfg(target_os = "macos")]
    if let Some(home) = env::var_os("HOME") {
        candidates.push(
            PathBuf::from(home)
                .join("Library")
                .join("Application Support")
                .join(APP_IDENTIFIER)
                .join(DATABASE_FILE_NAME),
        );
    }

    #[cfg(target_os = "linux")]
    {
        if let Some(data_home) = env::var_os("XDG_DATA_HOME") {
            candidates.push(
                PathBuf::from(data_home)
                    .join(APP_IDENTIFIER)
                    .join(DATABASE_FILE_NAME),
            );
        }

        if let Some(home) = env::var_os("HOME") {
            candidates.push(
                PathBuf::from(home)
                    .join(".local")
                    .join("share")
                    .join(APP_IDENTIFIER)
                    .join(DATABASE_FILE_NAME),
            );
        }
    }

    candidates
}

fn usage_text() -> String {
    format!(
        "{APP_NAME} serve --workspace <absolute-path> [--workspace-id <id>] [--database <workduck.sqlite3>]\n\nEnvironment fallbacks:\n  WORKDUCK_WORKSPACE\n  WORKDUCK_WORKSPACE_ID\n  WORKDUCK_DATABASE_PATH"
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn workspace_id_prefers_workspace_metadata() {
        let workspace = tempfile::tempdir().expect("temporary workspace");
        let workduck = workspace.path().join(".workduck");
        fs::create_dir_all(&workduck).expect("workduck directory");
        fs::write(
            workduck.join("workspace.json"),
            r#"{"id":"workspace_from_metadata"}"#,
        )
        .expect("workspace metadata");

        assert_eq!(
            read_workspace_id_file(workspace.path()).expect("workspace metadata ID"),
            Some("workspace_from_metadata".to_owned())
        );
    }

    #[test]
    fn parser_rejects_unbound_positional_paths() {
        let error = parse_args(&["serve".to_owned(), "C:/workspace".to_owned()])
            .err()
            .expect("unknown positional path");

        assert!(error.contains("unknown option"));
    }
}
