// llmnav/1 module
// id=workduck.projects.task-commands
// role=Resolve repository tasks into commands using package scripts, local dependency ownership, and supported toolchain manifests.
// owns=toolchain command selection|bounded manifest discovery|package manager and dev script policy
// excludes=process launch|task run persistence|frontend invocation
// search=repository task command discovery|nested package scripts|desktop dev command
// invariant=Only closed repository task variants select commands, discovery skips generated dependencies, and root scripts retain priority over nested projects.
// stability=architecture
// /llmnav
use super::{ProjectRepositoryTask, ProjectRepositoryTaskError, escape_powershell_single_quoted};
use std::{
    collections::{HashMap, HashSet},
    fs,
    net::TcpListener,
    path::{Path, PathBuf},
};

const DEPENDENCY_DISCOVERY_MAX_DEPTH: usize = 3;
const DEPENDENCY_DISCOVERY_IGNORED_DIRS: &[&str] = &[
    ".git",
    ".hg",
    ".svn",
    ".next",
    ".svelte-kit",
    "build",
    "dist",
    "node_modules",
    "target",
    "vendor",
];

pub(super) fn resolve_repository_task_commands(
    task: ProjectRepositoryTask,
    repository_path: &Path,
) -> Result<Vec<String>, ProjectRepositoryTaskError> {
    if matches!(task, ProjectRepositoryTask::OpenTerminal) {
        return Ok(Vec::new());
    }

    let mut commands = Vec::new();

    match task {
        ProjectRepositoryTask::InstallDependencies => {
            add_package_task_commands(repository_path, task, &mut commands)?;
            add_deno_dependency_commands(repository_path, task, &mut commands);
            add_cargo_task_commands(repository_path, task, &mut commands);
            add_pub_task_commands(repository_path, task, &mut commands);
            add_go_task_commands(repository_path, task, &mut commands);
            add_python_task_commands(repository_path, task, &mut commands);
            add_manifest_directory_task_commands(
                repository_path,
                &mut commands,
                &["composer.json"],
                "composer install",
            );
            add_manifest_directory_task_commands(
                repository_path,
                &mut commands,
                &["Gemfile"],
                "bundle install",
            );
            add_manifest_directory_task_commands(
                repository_path,
                &mut commands,
                &["mix.exs"],
                "mix deps.get",
            );
            add_manifest_directory_task_commands(
                repository_path,
                &mut commands,
                &["Package.swift"],
                "swift package resolve",
            );
        }
        ProjectRepositoryTask::UpdateDependencies => {
            add_package_task_commands(repository_path, task, &mut commands)?;
            add_deno_dependency_commands(repository_path, task, &mut commands);
            add_cargo_task_commands(repository_path, task, &mut commands);
            add_pub_task_commands(repository_path, task, &mut commands);
            add_go_task_commands(repository_path, task, &mut commands);
            add_python_task_commands(repository_path, task, &mut commands);
            add_manifest_directory_task_commands(
                repository_path,
                &mut commands,
                &["composer.json"],
                "composer update",
            );
            add_manifest_directory_task_commands(
                repository_path,
                &mut commands,
                &["Gemfile"],
                "bundle update",
            );
            add_manifest_directory_task_commands(
                repository_path,
                &mut commands,
                &["mix.exs"],
                "mix deps.update --all",
            );
            add_manifest_directory_task_commands(
                repository_path,
                &mut commands,
                &["Package.swift"],
                "swift package update",
            );
        }
        ProjectRepositoryTask::StartDevServer => {
            let package_command_count = commands.len();
            add_package_task_commands(repository_path, task, &mut commands)?;
            let has_desktop_dev_package_command = commands[package_command_count..]
                .iter()
                .any(|command| is_desktop_dev_package_command(command));

            if !has_desktop_dev_package_command {
                add_cargo_task_commands(repository_path, task, &mut commands);
            }
            add_pub_task_commands(repository_path, task, &mut commands);
            add_deno_task_commands(repository_path, task, &mut commands);
            if !has_desktop_dev_package_command {
                add_go_task_commands(repository_path, task, &mut commands);
            }
        }
        ProjectRepositoryTask::Build => {
            add_package_task_commands(repository_path, task, &mut commands)?;
            add_cargo_task_commands(repository_path, task, &mut commands);
            add_pub_task_commands(repository_path, task, &mut commands);
            add_deno_task_commands(repository_path, task, &mut commands);
            add_go_task_commands(repository_path, task, &mut commands);
            add_manifest_directory_task_commands(
                repository_path,
                &mut commands,
                &["Package.swift"],
                "swift build",
            );
        }
        ProjectRepositoryTask::Preview => {
            add_package_task_commands(repository_path, task, &mut commands)?;
            add_deno_task_commands(repository_path, task, &mut commands);
        }
        ProjectRepositoryTask::OpenTerminal => {}
    }

    if commands.is_empty() {
        return Err(ProjectRepositoryTaskError::CommandUnavailable);
    }

    Ok(commands)
}

pub(super) struct PackageProject {
    pub(super) package_manager: PackageManager,
    pub(super) scripts: HashMap<String, String>,
    pub(super) local_dependency_paths: Vec<PathBuf>,
}

#[derive(Clone, Copy)]
pub(super) enum PackageManager {
    Bun,
    Npm,
    Pnpm,
    Yarn,
}

fn read_package_project_at(project_path: &Path) -> Option<PackageProject> {
    let package_json_path = project_path.join("package.json");
    let package_json = fs::read_to_string(package_json_path).ok()?;
    let package_json: serde_json::Value = serde_json::from_str(&package_json).ok()?;
    let scripts = package_json
        .get("scripts")
        .and_then(serde_json::Value::as_object)
        .cloned()
        .unwrap_or_default();
    let scripts = scripts
        .into_iter()
        .filter_map(|(name, command)| command.as_str().map(|command| (name, command.to_owned())))
        .collect();
    let package_manager = package_json
        .get("packageManager")
        .and_then(serde_json::Value::as_str)
        .and_then(parse_package_manager)
        .unwrap_or_else(|| detect_package_manager_from_locks(project_path));

    Some(PackageProject {
        package_manager,
        scripts,
        local_dependency_paths: collect_local_package_dependency_paths(project_path, &package_json),
    })
}

fn collect_local_package_dependency_paths(
    project_path: &Path,
    package_json: &serde_json::Value,
) -> Vec<PathBuf> {
    let mut local_dependency_paths = Vec::new();

    for section in [
        "dependencies",
        "devDependencies",
        "optionalDependencies",
        "peerDependencies",
    ] {
        let Some(dependencies) = package_json
            .get(section)
            .and_then(serde_json::Value::as_object)
        else {
            continue;
        };

        for dependency in dependencies.values().filter_map(serde_json::Value::as_str) {
            let Some(dependency_path) =
                resolve_local_package_dependency_path(project_path, dependency)
            else {
                continue;
            };

            if !local_dependency_paths
                .iter()
                .any(|existing_path| existing_path == &dependency_path)
            {
                local_dependency_paths.push(dependency_path);
            }
        }
    }

    local_dependency_paths
}

fn resolve_local_package_dependency_path(project_path: &Path, dependency: &str) -> Option<PathBuf> {
    let relative_path = dependency.strip_prefix("file:")?.trim();

    if relative_path.is_empty() {
        return None;
    }

    let dependency_path = project_path.join(relative_path);

    if !dependency_path.join("package.json").is_file() {
        return None;
    }

    Some(fs::canonicalize(&dependency_path).unwrap_or(dependency_path))
}

fn parse_package_manager(value: &str) -> Option<PackageManager> {
    if value.starts_with("bun@") {
        Some(PackageManager::Bun)
    } else if value.starts_with("pnpm@") {
        Some(PackageManager::Pnpm)
    } else if value.starts_with("yarn@") {
        Some(PackageManager::Yarn)
    } else if value.starts_with("npm@") {
        Some(PackageManager::Npm)
    } else {
        None
    }
}

fn detect_package_manager_from_locks(repository_path: &Path) -> PackageManager {
    if repository_path.join("bun.lock").is_file() || repository_path.join("bun.lockb").is_file() {
        PackageManager::Bun
    } else if repository_path.join("pnpm-lock.yaml").is_file() {
        PackageManager::Pnpm
    } else if repository_path.join("yarn.lock").is_file() {
        PackageManager::Yarn
    } else {
        PackageManager::Npm
    }
}

fn add_package_task_commands(
    repository_path: &Path,
    task: ProjectRepositoryTask,
    commands: &mut Vec<String>,
) -> Result<(), ProjectRepositoryTaskError> {
    for project_path in discover_package_project_paths(repository_path, task) {
        let Some(package_project) = read_package_project_at(&project_path) else {
            continue;
        };
        let Some(command) = resolve_package_task_command(task, &package_project)? else {
            continue;
        };

        push_unique_command(
            commands,
            command_in_directory(repository_path, &project_path, &command),
        );
    }

    Ok(())
}

fn discover_package_project_paths(
    repository_path: &Path,
    task: ProjectRepositoryTask,
) -> Vec<PathBuf> {
    let mut project_paths = Vec::new();
    let root_project = read_package_project_at(repository_path);

    if root_project.is_some() {
        project_paths.push(repository_path.to_path_buf());
    }

    if root_project_has_task_script(task, root_project.as_ref()) {
        return project_paths;
    }

    for project_path in
        unique_manifest_directories(discover_manifest_paths(repository_path, &["package.json"]))
    {
        if !project_paths.contains(&project_path) {
            project_paths.push(project_path);
        }
    }

    filter_local_dependency_package_project_paths(repository_path, project_paths)
}

fn root_project_has_task_script(
    task: ProjectRepositoryTask,
    root_project: Option<&PackageProject>,
) -> bool {
    if !matches!(
        task,
        ProjectRepositoryTask::StartDevServer
            | ProjectRepositoryTask::Build
            | ProjectRepositoryTask::Preview
    ) {
        return false;
    }

    root_project
        .and_then(|project| resolve_package_task_command(task, project).ok().flatten())
        .is_some()
}

fn filter_local_dependency_package_project_paths(
    repository_path: &Path,
    project_paths: Vec<PathBuf>,
) -> Vec<PathBuf> {
    let local_dependency_paths = project_paths
        .iter()
        .filter_map(|project_path| read_package_project_at(project_path))
        .flat_map(|project| project.local_dependency_paths)
        .collect::<Vec<_>>();

    if local_dependency_paths.is_empty() {
        return project_paths;
    }

    project_paths
        .into_iter()
        .filter(|project_path| {
            project_path == repository_path
                || !is_local_dependency_package_project_path(project_path, &local_dependency_paths)
        })
        .collect()
}

fn is_local_dependency_package_project_path(
    project_path: &Path,
    local_dependency_paths: &[PathBuf],
) -> bool {
    let normalized_project_path =
        fs::canonicalize(project_path).unwrap_or_else(|_| project_path.to_path_buf());

    local_dependency_paths
        .iter()
        .any(|dependency_path| dependency_path == &normalized_project_path)
}

pub(super) fn resolve_package_task_command(
    task: ProjectRepositoryTask,
    project: &PackageProject,
) -> Result<Option<String>, ProjectRepositoryTaskError> {
    match task {
        ProjectRepositoryTask::InstallDependencies => Ok(Some(format!(
            "{} install",
            project.package_manager.executable()
        ))),
        ProjectRepositoryTask::UpdateDependencies => {
            Ok(Some(project.package_manager.update_command().to_owned()))
        }
        ProjectRepositoryTask::StartDevServer => resolve_package_dev_server_command(project),
        ProjectRepositoryTask::Build => resolve_optional_package_script_command(project, "build"),
        ProjectRepositoryTask::Preview => {
            resolve_optional_package_script_command(project, "preview")
        }
        ProjectRepositoryTask::OpenTerminal => Ok(None),
    }
}

pub(super) fn resolve_package_dev_server_command(
    project: &PackageProject,
) -> Result<Option<String>, ProjectRepositoryTaskError> {
    let Some((script, script_command)) = resolve_package_dev_server_script(project) else {
        return Ok(None);
    };

    let command = resolve_optional_package_script_command(project, script)?;

    if script != "dev" || !is_vite_strict_port_script(script_command) {
        return Ok(command);
    }

    let port = find_available_local_port(5173, 40)
        .ok_or(ProjectRepositoryTaskError::CommandUnavailable)?;
    let Some(command) = command else {
        return Ok(None);
    };

    Ok(Some(format!("{command} -- --port {port}")))
}

fn resolve_package_dev_server_script(project: &PackageProject) -> Option<(&'static str, &str)> {
    for script in ["desktop:dev", "dev", "start"] {
        if let Some(command) = project.scripts.get(script) {
            return Some((script, command));
        }
    }

    None
}

fn is_desktop_dev_package_command(command: &str) -> bool {
    command.to_ascii_lowercase().contains(" run desktop:dev")
}

fn resolve_optional_package_script_command(
    project: &PackageProject,
    script: &str,
) -> Result<Option<String>, ProjectRepositoryTaskError> {
    if !project.scripts.contains_key(script) {
        return Ok(None);
    }

    Ok(Some(format!(
        "{} run {}",
        project.package_manager.executable(),
        script
    )))
}

fn is_vite_strict_port_script(script: &str) -> bool {
    let script = script.to_ascii_lowercase();
    let flags = script.split_whitespace().map(normalize_cli_flag);

    script.contains("vite")
        && flags.clone().any(|flag| flag == "strictport")
        && flags.clone().any(|flag| flag == "port")
}

fn normalize_cli_flag(token: &str) -> String {
    let trimmed = token.trim_matches(|character: char| {
        matches!(
            character,
            '"' | '\'' | '`' | ',' | ';' | '(' | ')' | '[' | ']'
        )
    });

    trimmed
        .split_once('=')
        .map(|(flag, _)| flag)
        .unwrap_or(trimmed)
        .to_ascii_lowercase()
        .replace('-', "")
}

fn find_available_local_port(start: u16, attempts: u16) -> Option<u16> {
    (0..attempts)
        .filter_map(|offset| start.checked_add(offset))
        .find(|port| TcpListener::bind(("127.0.0.1", *port)).is_ok())
}

impl PackageManager {
    fn executable(self) -> &'static str {
        match self {
            PackageManager::Bun => "bun",
            PackageManager::Npm => "npm",
            PackageManager::Pnpm => "pnpm",
            PackageManager::Yarn => "yarn",
        }
    }

    fn update_command(self) -> &'static str {
        match self {
            PackageManager::Bun => "bun update",
            PackageManager::Npm => "npm update",
            PackageManager::Pnpm => "pnpm update",
            PackageManager::Yarn => "yarn upgrade",
        }
    }
}

fn add_deno_dependency_commands(
    repository_path: &Path,
    task: ProjectRepositoryTask,
    commands: &mut Vec<String>,
) {
    let command = match task {
        ProjectRepositoryTask::InstallDependencies => "deno install",
        ProjectRepositoryTask::UpdateDependencies => "deno update",
        _ => return,
    };
    for project_path in unique_manifest_directories(discover_manifest_paths(
        repository_path,
        &["deno.json", "deno.jsonc", "deno.lock"],
    )) {
        push_unique_command(
            commands,
            command_in_directory(repository_path, &project_path, command),
        );
    }
}

fn add_deno_task_commands(
    repository_path: &Path,
    task: ProjectRepositoryTask,
    commands: &mut Vec<String>,
) {
    let task_name = match task {
        ProjectRepositoryTask::StartDevServer => "dev",
        ProjectRepositoryTask::Build => "build",
        ProjectRepositoryTask::Preview => "preview",
        _ => return,
    };

    for project_path in unique_manifest_directories(discover_manifest_paths(
        repository_path,
        &["deno.json", "deno.jsonc"],
    )) {
        if deno_task_exists(&project_path, task_name) {
            push_unique_command(
                commands,
                command_in_directory(
                    repository_path,
                    &project_path,
                    &format!("deno task {task_name}"),
                ),
            );
        }
    }
}

fn deno_task_exists(project_path: &Path, task_name: &str) -> bool {
    let primary_config = project_path.join("deno.json");
    let config_path = if primary_config.exists() {
        primary_config
    } else {
        project_path.join("deno.jsonc")
    };
    let Ok(deno_json) = fs::read_to_string(config_path) else {
        return false;
    };
    let options = jsonc_parser::ParseOptions {
        allow_comments: true,
        allow_trailing_commas: true,
        allow_loose_object_property_names: false,
        allow_missing_commas: false,
        allow_single_quoted_strings: false,
        allow_hexadecimal_numbers: false,
        allow_unary_plus_numbers: false,
        allow_bare_decimal_point_numbers: false,
        allow_non_finite_numbers: false,
        allow_extended_string_escapes: false,
    };
    let Ok(deno_json) =
        jsonc_parser::parse_to_serde_value::<serde_json::Value>(&deno_json, &options)
    else {
        return false;
    };

    deno_json
        .get("tasks")
        .and_then(serde_json::Value::as_object)
        .is_some_and(|tasks| tasks.contains_key(task_name))
}

fn add_cargo_task_commands(
    repository_path: &Path,
    task: ProjectRepositoryTask,
    commands: &mut Vec<String>,
) {
    for cargo_manifest_path in
        discover_root_or_nested_manifest_paths(repository_path, &["Cargo.toml"])
    {
        if let Some(command) =
            resolve_cargo_task_command(task, repository_path, &cargo_manifest_path)
        {
            push_unique_command(commands, command);
        }
    }
}

fn resolve_cargo_task_command(
    task: ProjectRepositoryTask,
    repository_path: &Path,
    cargo_manifest_path: &Path,
) -> Option<String> {
    let command = match task {
        ProjectRepositoryTask::InstallDependencies => "cargo fetch",
        ProjectRepositoryTask::UpdateDependencies => "cargo update",
        ProjectRepositoryTask::StartDevServer => "cargo run",
        ProjectRepositoryTask::Build => "cargo build",
        ProjectRepositoryTask::Preview => return None,
        ProjectRepositoryTask::OpenTerminal => return None,
    };

    if cargo_manifest_path
        .parent()
        .is_some_and(|project_path| project_path == repository_path)
    {
        return Some(command.to_owned());
    }

    Some(format!(
        "{command} --manifest-path '{}'",
        escape_powershell_single_quoted(&relative_shell_path(repository_path, cargo_manifest_path))
    ))
}

fn add_pub_task_commands(
    repository_path: &Path,
    task: ProjectRepositoryTask,
    commands: &mut Vec<String>,
) {
    for pubspec_path in discover_root_or_nested_manifest_paths(repository_path, &["pubspec.yaml"]) {
        let Some(project_path) = pubspec_path.parent() else {
            continue;
        };
        let Some(command) = resolve_pub_task_command(task, project_path) else {
            continue;
        };

        push_unique_command(
            commands,
            command_in_directory(repository_path, &project_path, command),
        );
    }
}

fn resolve_pub_task_command(
    task: ProjectRepositoryTask,
    project_path: &Path,
) -> Option<&'static str> {
    let is_flutter = is_flutter_project(project_path);

    match task {
        ProjectRepositoryTask::InstallDependencies if is_flutter => Some("flutter pub get"),
        ProjectRepositoryTask::InstallDependencies => Some("dart pub get"),
        ProjectRepositoryTask::UpdateDependencies if is_flutter => Some("flutter pub upgrade"),
        ProjectRepositoryTask::UpdateDependencies => Some("dart pub upgrade"),
        ProjectRepositoryTask::StartDevServer if is_flutter => Some("flutter run"),
        ProjectRepositoryTask::Build if is_flutter => Some("flutter build"),
        _ => None,
    }
}

fn add_go_task_commands(
    repository_path: &Path,
    task: ProjectRepositoryTask,
    commands: &mut Vec<String>,
) {
    for go_mod_path in discover_root_or_nested_manifest_paths(repository_path, &["go.mod"]) {
        let Some(project_path) = go_mod_path.parent() else {
            continue;
        };

        match task {
            ProjectRepositoryTask::InstallDependencies => push_unique_command(
                commands,
                command_in_directory(repository_path, project_path, "go mod download"),
            ),
            ProjectRepositoryTask::UpdateDependencies => {
                push_unique_command(
                    commands,
                    command_in_directory(repository_path, project_path, "go get -u ./..."),
                );
                push_unique_command(
                    commands,
                    command_in_directory(repository_path, project_path, "go mod tidy"),
                );
            }
            ProjectRepositoryTask::StartDevServer => push_unique_command(
                commands,
                command_in_directory(repository_path, project_path, "go run ./..."),
            ),
            ProjectRepositoryTask::Build => push_unique_command(
                commands,
                command_in_directory(repository_path, project_path, "go build ./..."),
            ),
            ProjectRepositoryTask::Preview => {}
            ProjectRepositoryTask::OpenTerminal => {}
        }
    }
}

fn add_python_task_commands(
    repository_path: &Path,
    task: ProjectRepositoryTask,
    commands: &mut Vec<String>,
) {
    if !matches!(
        task,
        ProjectRepositoryTask::InstallDependencies | ProjectRepositoryTask::UpdateDependencies
    ) {
        return;
    }

    for project_path in discover_root_or_nested_manifest_directories(
        repository_path,
        &["uv.lock", "poetry.lock", "pdm.lock"],
    ) {
        let command = match task {
            ProjectRepositoryTask::InstallDependencies
                if project_path.join("uv.lock").is_file() =>
            {
                "uv sync"
            }
            ProjectRepositoryTask::InstallDependencies
                if project_path.join("poetry.lock").is_file() =>
            {
                "poetry install"
            }
            ProjectRepositoryTask::InstallDependencies
                if project_path.join("pdm.lock").is_file() =>
            {
                "pdm install"
            }
            ProjectRepositoryTask::UpdateDependencies if project_path.join("uv.lock").is_file() => {
                "uv lock --upgrade"
            }
            ProjectRepositoryTask::UpdateDependencies
                if project_path.join("poetry.lock").is_file() =>
            {
                "poetry update"
            }
            ProjectRepositoryTask::UpdateDependencies
                if project_path.join("pdm.lock").is_file() =>
            {
                "pdm update"
            }
            _ => continue,
        };

        push_unique_command(
            commands,
            command_in_directory(repository_path, &project_path, command),
        );
    }
}

fn add_manifest_directory_task_commands(
    repository_path: &Path,
    commands: &mut Vec<String>,
    manifest_file_names: &[&str],
    command: &str,
) {
    for project_path in
        discover_root_or_nested_manifest_directories(repository_path, manifest_file_names)
    {
        push_unique_command(
            commands,
            command_in_directory(repository_path, &project_path, command),
        );
    }
}

fn discover_root_or_nested_manifest_paths(
    repository_path: &Path,
    file_names: &[&str],
) -> Vec<PathBuf> {
    if file_names
        .iter()
        .any(|file_name| repository_path.join(file_name).is_file())
    {
        return file_names
            .iter()
            .map(|file_name| repository_path.join(file_name))
            .filter(|path| path.is_file())
            .collect();
    }

    discover_manifest_paths(repository_path, file_names)
}

fn discover_root_or_nested_manifest_directories(
    repository_path: &Path,
    file_names: &[&str],
) -> Vec<PathBuf> {
    unique_manifest_directories(discover_root_or_nested_manifest_paths(
        repository_path,
        file_names,
    ))
}

fn discover_manifest_paths(repository_path: &Path, file_names: &[&str]) -> Vec<PathBuf> {
    let mut paths = Vec::new();
    discover_manifest_paths_inner(repository_path, file_names, 0, &mut paths);
    paths.sort();
    paths
}

fn discover_manifest_paths_inner(
    current_path: &Path,
    file_names: &[&str],
    depth: usize,
    paths: &mut Vec<PathBuf>,
) {
    for file_name in file_names {
        let manifest_path = current_path.join(file_name);

        if manifest_path.is_file() {
            paths.push(manifest_path);
        }
    }

    if depth >= DEPENDENCY_DISCOVERY_MAX_DEPTH {
        return;
    }

    let Ok(entries) = fs::read_dir(current_path) else {
        return;
    };

    for entry in entries.flatten() {
        let path = entry.path();

        if path.is_dir() && !should_skip_dependency_discovery_dir(&path) {
            discover_manifest_paths_inner(&path, file_names, depth + 1, paths);
        }
    }
}

fn should_skip_dependency_discovery_dir(path: &Path) -> bool {
    let Some(file_name) = path.file_name().and_then(|name| name.to_str()) else {
        return false;
    };

    DEPENDENCY_DISCOVERY_IGNORED_DIRS
        .iter()
        .any(|ignored| file_name.eq_ignore_ascii_case(ignored))
}

fn unique_manifest_directories(manifest_paths: Vec<PathBuf>) -> Vec<PathBuf> {
    let mut seen = HashSet::new();
    let mut directories = Vec::new();

    for manifest_path in manifest_paths {
        let Some(directory) = manifest_path.parent() else {
            continue;
        };
        let directory = directory.to_path_buf();

        if seen.insert(directory.clone()) {
            directories.push(directory);
        }
    }

    directories
}

fn command_in_directory(repository_path: &Path, directory: &Path, command: &str) -> String {
    if directory == repository_path {
        return command.to_owned();
    }

    format!(
        "Push-Location -LiteralPath '{}' -ErrorAction Stop; try {{ {} }} finally {{ Pop-Location }}",
        escape_powershell_single_quoted(&relative_shell_path(repository_path, directory)),
        command
    )
}

fn relative_shell_path(repository_path: &Path, path: &Path) -> String {
    path.strip_prefix(repository_path)
        .unwrap_or(path)
        .to_string_lossy()
        .replace('\\', "/")
}

fn is_flutter_project(project_path: &Path) -> bool {
    let pubspec = fs::read_to_string(project_path.join("pubspec.yaml")).unwrap_or_default();

    pubspec.contains("sdk: flutter")
        || pubspec.lines().any(|line| line.trim_start() == "flutter:")
        || ["android", "ios", "linux", "macos", "web", "windows"]
            .iter()
            .any(|directory| project_path.join(directory).is_dir())
}

fn push_unique_command(commands: &mut Vec<String>, command: String) {
    if !commands.iter().any(|candidate| candidate == &command) {
        commands.push(command);
    }
}

#[cfg(test)]
mod package_discovery_tests {
    use super::*;

    #[cfg(target_os = "windows")]
    #[test]
    fn directory_commands_stop_on_missing_paths_and_restore_location_after_failure() {
        for (create_directory, command, caught) in [
            (
                false,
                "Set-Content -LiteralPath 'marker.txt' -Value 'ran'",
                true,
            ),
            (
                true,
                "Set-Content -LiteralPath 'marker.txt' -Value 'ran'; throw 'failure'",
                true,
            ),
            (
                true,
                "Set-Content -LiteralPath 'marker.txt' -Value 'ran'",
                false,
            ),
        ] {
            let repository = tempfile::tempdir().unwrap();
            let directory = repository.path().join("app's folder");
            if create_directory {
                fs::create_dir(&directory).unwrap();
            }
            let scoped_command = command_in_directory(repository.path(), &directory, command);
            let script = format!(
                "Set-Location -LiteralPath '{}' -ErrorAction Stop; $caught = $false; try {{ {scoped_command} }} catch {{ $caught = $true }}; @{{ caught = $caught; path = (Get-Location).Path }} | ConvertTo-Json",
                escape_powershell_single_quoted(&repository.path().to_string_lossy())
            );
            let output = std::process::Command::new("powershell.exe")
                .args([
                    "-NoLogo",
                    "-NoProfile",
                    "-NonInteractive",
                    "-Command",
                    &script,
                ])
                .output()
                .unwrap();
            assert!(
                output.status.success(),
                "{}",
                String::from_utf8_lossy(&output.stderr)
            );
            let result: serde_json::Value = serde_json::from_slice(&output.stdout).unwrap();
            assert_eq!(result["caught"], caught);
            // PowerShell can expand TEMP's short name; compare the restored directory identity.
            assert_eq!(
                fs::canonicalize(result["path"].as_str().unwrap()).unwrap(),
                fs::canonicalize(repository.path()).unwrap()
            );
            assert!(!repository.path().join("marker.txt").exists());
            assert_eq!(directory.join("marker.txt").exists(), create_directory);
        }
    }

    #[test]
    fn rootless_repository_skips_owned_packages_even_when_they_sort_first() {
        let repository = tempfile::tempdir().unwrap();
        for (directory, manifest) in [
            ("packages/a-library", r#"{"name":"library"}"#),
            ("packages/m-independent", "{}"),
            (
                "packages/z-app",
                r#"{"devDependencies":{"library":"file:../a-library"}}"#,
            ),
        ] {
            let project = repository.path().join(directory);
            fs::create_dir_all(&project).unwrap();
            fs::write(project.join("package.json"), manifest).unwrap();
        }
        for (task, command) in [
            (ProjectRepositoryTask::InstallDependencies, "npm install"),
            (ProjectRepositoryTask::UpdateDependencies, "npm update"),
        ] {
            let commands = resolve_repository_task_commands(task, repository.path())
                .unwrap_or_else(|_| panic!("missing {command}"));
            assert_eq!(
                commands,
                ["packages/m-independent", "packages/z-app"]
                    .map(|path| format!(
                        "Push-Location -LiteralPath '{path}' -ErrorAction Stop; try {{ {command} }} finally {{ Pop-Location }}"
                    ))
                    .to_vec()
            );
        }
    }

    #[test]
    fn actual_repository_root_remains_an_installation_owner() {
        let repository = tempfile::tempdir().unwrap();
        let project = repository.path().join("packages/library");
        fs::create_dir_all(&project).unwrap();
        fs::write(repository.path().join("package.json"), "{}").unwrap();
        fs::write(
            project.join("package.json"),
            r#"{"dependencies":{"root":"file:../.."}}"#,
        )
        .unwrap();
        let commands = resolve_repository_task_commands(
            ProjectRepositoryTask::InstallDependencies,
            repository.path(),
        )
        .unwrap_or_else(|_| panic!("missing root install"));
        assert_eq!(
            commands,
            vec![
                "npm install",
                "Push-Location -LiteralPath 'packages/library' -ErrorAction Stop; try { npm install } finally { Pop-Location }"
            ]
        );
    }
}

#[cfg(test)]
mod deno_tests {
    use super::*;

    #[test]
    fn discovers_dependency_installation_from_deno_configs() {
        for filename in ["deno.json", "deno.jsonc"] {
            let repository = tempfile::tempdir().unwrap();
            fs::write(repository.path().join(filename), "{}").unwrap();
            let commands = resolve_repository_task_commands(
                ProjectRepositoryTask::InstallDependencies,
                repository.path(),
            )
            .unwrap_or_else(|_| panic!("missing install command for {filename}"));
            assert_eq!(commands, vec!["deno install"]);
        }
    }

    #[test]
    fn deno_dependency_commands_are_unique_per_project() {
        let repository = tempfile::tempdir().unwrap();
        for filename in ["deno.json", "deno.jsonc", "deno.lock"] {
            fs::write(repository.path().join(filename), "{}").unwrap();
        }
        for (task, command) in [
            (ProjectRepositoryTask::InstallDependencies, "deno install"),
            (ProjectRepositoryTask::UpdateDependencies, "deno update"),
        ] {
            let commands = resolve_repository_task_commands(task, repository.path())
                .unwrap_or_else(|_| panic!("missing {command}"));
            assert_eq!(commands, vec![command]);
        }
    }

    #[test]
    fn installs_nested_deno_projects_alongside_node_projects() {
        let repository = tempfile::tempdir().unwrap();
        fs::write(repository.path().join("package.json"), "{}").unwrap();
        let project = repository.path().join("services/worker");
        fs::create_dir_all(&project).unwrap();
        fs::write(project.join("deno.jsonc"), "{}").unwrap();
        fs::write(project.join("deno.lock"), "{}").unwrap();
        let ignored_project = repository.path().join("node_modules/dependency");
        fs::create_dir_all(&ignored_project).unwrap();
        fs::write(ignored_project.join("deno.json"), "{}").unwrap();
        let commands = resolve_repository_task_commands(
            ProjectRepositoryTask::InstallDependencies,
            repository.path(),
        )
        .unwrap_or_else(|_| panic!("missing mixed project installs"));
        assert_eq!(
            commands,
            vec![
                "npm install",
                "Push-Location -LiteralPath 'services/worker' -ErrorAction Stop; try { deno install } finally { Pop-Location }"
            ]
        );
    }

    #[test]
    fn discovers_deno_tasks_from_both_config_filenames() {
        for filename in ["deno.json", "deno.jsonc"] {
            let repository = tempfile::tempdir().unwrap();
            fs::write(
                repository.path().join(filename),
                r#"{"tasks":{"dev":"deno run dev.ts","build":"deno run build.ts","preview":"deno run preview.ts"}}"#,
            )
            .unwrap();
            for (task, name) in [
                (ProjectRepositoryTask::StartDevServer, "dev"),
                (ProjectRepositoryTask::Build, "build"),
                (ProjectRepositoryTask::Preview, "preview"),
            ] {
                let commands = resolve_repository_task_commands(task, repository.path())
                    .unwrap_or_else(|_| panic!("missing {name} in {filename}"));
                assert_eq!(commands, vec![format!("deno task {name}")]);
            }
        }
    }

    #[test]
    fn discovers_nested_jsonc_tasks_with_comments_and_trailing_commas() {
        let repository = tempfile::tempdir().unwrap();
        let project = repository.path().join("apps/web");
        fs::create_dir_all(&project).unwrap();
        fs::write(
            project.join("deno.jsonc"),
            r#"{
                // Development commands
                "tasks": {
                    /* Preserve comment markers inside command strings. */
                    "dev": "deno run https://example.com/dev.ts --label=\"한글/*text*/\"",
                },
            }"#,
        )
        .unwrap();
        let commands = resolve_repository_task_commands(
            ProjectRepositoryTask::StartDevServer,
            repository.path(),
        )
        .unwrap_or_else(|_| panic!("missing nested JSONC dev task"));
        assert_eq!(
            commands,
            vec![
                "Push-Location -LiteralPath 'apps/web' -ErrorAction Stop; try { deno task dev } finally { Pop-Location }"
            ]
        );
    }

    #[test]
    fn accepts_comments_and_trailing_commas_in_deno_json() {
        let repository = tempfile::tempdir().unwrap();
        fs::write(
            repository.path().join("deno.json"),
            "{ /* build */ \"tasks\": {\"build\": \"deno run build.ts\",},}",
        )
        .unwrap();
        assert!(deno_task_exists(repository.path(), "build"));
    }

    #[test]
    fn primary_deno_config_does_not_fall_back_to_conflicting_jsonc() {
        let repository = tempfile::tempdir().unwrap();
        fs::write(
            repository.path().join("deno.jsonc"),
            r#"{"tasks":{"preview":"deno run preview.ts"}}"#,
        )
        .unwrap();
        for primary in [r#"{"tasks":{"build":"deno run build.ts"}}"#, "{"] {
            fs::write(repository.path().join("deno.json"), primary).unwrap();
            assert!(!deno_task_exists(repository.path(), "preview"));
        }
    }

    #[test]
    fn rejects_invalid_configs_and_does_not_invent_missing_tasks() {
        let repository = tempfile::tempdir().unwrap();
        for config in [
            r#"{tasks:{"dev":"deno run dev.ts"}}"#,
            r#"{"tasks":{'dev':'deno run dev.ts'}}"#,
            r#"{"tasks":{"dev":"deno run dev.ts" "build":"deno run build.ts"}}"#,
            r#"{"tasks":{"dev":"deno run dev.ts"}} /* unfinished"#,
            r#"{"tasks":{"build":"deno run build.ts"}}"#,
        ] {
            fs::write(repository.path().join("deno.jsonc"), config).unwrap();
            assert!(matches!(
                resolve_repository_task_commands(
                    ProjectRepositoryTask::StartDevServer,
                    repository.path()
                ),
                Err(ProjectRepositoryTaskError::CommandUnavailable)
            ));
        }
    }
}
