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
            add_deno_dependency_update_commands(repository_path, &mut commands);
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

    filter_local_dependency_package_project_paths(project_paths)
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

fn filter_local_dependency_package_project_paths(project_paths: Vec<PathBuf>) -> Vec<PathBuf> {
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
        .enumerate()
        .filter_map(|(index, project_path)| {
            if index == 0
                || !is_local_dependency_package_project_path(&project_path, &local_dependency_paths)
            {
                Some(project_path)
            } else {
                None
            }
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

fn add_deno_dependency_update_commands(repository_path: &Path, commands: &mut Vec<String>) {
    for project_path in unique_manifest_directories(discover_manifest_paths(
        repository_path,
        &["deno.json", "deno.jsonc", "deno.lock"],
    )) {
        push_unique_command(
            commands,
            command_in_directory(repository_path, &project_path, "deno update"),
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
    let Ok(deno_json) = fs::read_to_string(project_path.join("deno.json")) else {
        return false;
    };
    let Ok(deno_json) = serde_json::from_str::<serde_json::Value>(&deno_json) else {
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
        "Push-Location -LiteralPath '{}'; {}; Pop-Location",
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
