use std::{env, path::Path, process::Command};

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

pub struct TerminalCatalogEntry {
    pub(crate) id: &'static str,
    pub(crate) command: &'static str,
    pub(crate) executable_path: Option<String>,
    pub(crate) available: bool,
}

pub(crate) fn find_available_terminal_entry(terminal_id: &str) -> Option<TerminalCatalogEntry> {
    terminal_candidates()
        .into_iter()
        .find(|terminal| terminal.id == terminal_id && terminal.available)
}

#[cfg(target_os = "windows")]
fn terminal_candidates() -> Vec<TerminalCatalogEntry> {
    vec![
        create_terminal_entry("powershell-core", "pwsh.exe"),
        create_terminal_entry("windows-powershell", "powershell.exe"),
        create_terminal_entry("command-prompt", "cmd.exe"),
        create_git_bash_entry(),
        create_terminal_entry("wsl", "wsl.exe"),
    ]
}

#[cfg(target_os = "macos")]
fn terminal_candidates() -> Vec<TerminalCatalogEntry> {
    vec![
        create_terminal_entry("zsh", "zsh"),
        create_terminal_entry("bash", "bash"),
    ]
}

#[cfg(all(unix, not(target_os = "macos")))]
fn terminal_candidates() -> Vec<TerminalCatalogEntry> {
    vec![
        create_terminal_entry("zsh", "zsh"),
        create_terminal_entry("bash", "bash"),
    ]
}

fn create_terminal_entry(id: &'static str, command: &'static str) -> TerminalCatalogEntry {
    let executable_path = find_executable(command);

    TerminalCatalogEntry {
        id,
        command,
        available: executable_path.is_some(),
        executable_path,
    }
}

#[cfg(target_os = "windows")]
fn create_git_bash_entry() -> TerminalCatalogEntry {
    const GIT_BASH_PATHS: [&str; 2] = [
        r"C:\Program Files\Git\bin\bash.exe",
        r"C:\Program Files (x86)\Git\bin\bash.exe",
    ];

    let executable_path = GIT_BASH_PATHS
        .iter()
        .find(|path| Path::new(path).is_file())
        .map(|path| (*path).to_string())
        .or_else(|| {
            find_executable("bash.exe").filter(|path| path.to_ascii_lowercase().contains(r"\git\"))
        });

    TerminalCatalogEntry {
        id: "git-bash",
        command: "bash.exe",
        available: executable_path.is_some(),
        executable_path,
    }
}

fn find_executable(command_name: &str) -> Option<String> {
    if command_name.trim().is_empty() {
        return None;
    }

    find_executable_with_path_lookup(command_name).or_else(|| find_executable_in_path(command_name))
}

#[cfg(target_os = "windows")]
fn find_executable_with_path_lookup(command_name: &str) -> Option<String> {
    let mut command = Command::new("where.exe");
    command.arg(command_name);
    command.creation_flags(CREATE_NO_WINDOW);

    let output = command.output().ok()?;

    if !output.status.success() {
        return None;
    }

    String::from_utf8_lossy(&output.stdout)
        .lines()
        .map(str::trim)
        .find(|line| !line.is_empty())
        .map(str::to_string)
}

#[cfg(not(target_os = "windows"))]
fn find_executable_with_path_lookup(command_name: &str) -> Option<String> {
    let output = Command::new("which").arg(command_name).output().ok()?;

    if !output.status.success() {
        return None;
    }

    String::from_utf8_lossy(&output.stdout)
        .lines()
        .map(str::trim)
        .find(|line| !line.is_empty())
        .map(str::to_string)
}

fn find_executable_in_path(command: &str) -> Option<String> {
    let path_value = env::var_os("PATH")?;

    env::split_paths(&path_value)
        .map(|path| path.join(command))
        .find(|candidate| candidate.is_file())
        .map(|candidate| candidate.to_string_lossy().into_owned())
}
