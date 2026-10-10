// llmnav/1 module
// id=workduck.projects.task-powershell
// role=Generate, stage, and launch PowerShell task scripts with execution-owned atomic run records and bounded output previews.
// owns=tracked task script generation|staged script lifetime|terminal launch|task record publication|Unicode output tail
// excludes=command selection|terminal discovery|process liveness
// search=PowerShell tracking script|large command line task loader|atomic task record publication|bounded Unicode log tail
// invariant=Large scripts use a short run-bound loader and clean up their staged source; only the final command can publish success; publication aborts on failure and never exceeds the history read limit; preview truncation preserves Unicode boundaries.
// stability=architecture
// /llmnav
#[cfg(target_os = "windows")]
use super::{ProjectRepositoryTaskError, ProjectRepositoryTaskRunRecord};
#[cfg(target_os = "windows")]
use base64::{Engine as _, engine::general_purpose};
#[cfg(target_os = "windows")]
use std::{
    fs,
    io::Write,
    path::{Path, PathBuf},
};

#[cfg(target_os = "windows")]
const MAX_DIRECT_ENCODED_COMMAND_LENGTH: usize = 24_000;

#[cfg(target_os = "windows")]
pub(super) struct PreparedPowerShellCommand {
    pub(super) encoded_command: String,
    pub(super) staged_script_path: Option<PathBuf>,
}

#[cfg(target_os = "windows")]
impl PreparedPowerShellCommand {
    pub(super) fn transfer_script_to_shell(&mut self) {
        self.staged_script_path = None;
    }
}

#[cfg(target_os = "windows")]
impl Drop for PreparedPowerShellCommand {
    fn drop(&mut self) {
        if let Some(path) = self.staged_script_path.as_ref() {
            let _ = fs::remove_file(path);
        }
    }
}

#[cfg(target_os = "windows")]
pub(super) fn prepare_powershell_command(
    script: &str,
    run_record: Option<&ProjectRepositoryTaskRunRecord>,
) -> Result<PreparedPowerShellCommand, ProjectRepositoryTaskError> {
    let encoded_command = encode_powershell_command(script);
    if encoded_command.len() <= MAX_DIRECT_ENCODED_COMMAND_LENGTH {
        return Ok(PreparedPowerShellCommand {
            encoded_command,
            staged_script_path: None,
        });
    }
    let mut staged_file = tempfile::Builder::new()
        .prefix("workduck-task-script-")
        .suffix(".tmp")
        .tempfile()
        .map_err(|_| ProjectRepositoryTaskError::RecordWriteFailed)?;
    staged_file
        .write_all(script.as_bytes())
        .and_then(|_| staged_file.flush())
        .and_then(|_| staged_file.as_file().sync_all())
        .map_err(|_| ProjectRepositoryTaskError::RecordWriteFailed)?;
    let loader = create_powershell_script_loader(
        staged_file.path(),
        run_record.map(|record| record.id.as_str()).unwrap_or(""),
    );
    let encoded_command = encode_powershell_command(&loader);
    if encoded_command.len() > MAX_DIRECT_ENCODED_COMMAND_LENGTH {
        return Err(ProjectRepositoryTaskError::LaunchFailed);
    }
    let (file, path) = staged_file
        .keep()
        .map_err(|_| ProjectRepositoryTaskError::RecordWriteFailed)?;
    drop(file);
    Ok(PreparedPowerShellCommand {
        encoded_command,
        staged_script_path: Some(path),
    })
}

#[cfg(target_os = "windows")]
pub(super) fn create_powershell_script_loader(path: &Path, run_id: &str) -> String {
    let path =
        escape_powershell_single_quoted(&crate::git_path::git_process_path(path).to_string_lossy());
    let run_id = escape_powershell_single_quoted(run_id);
    format!(
        r#"$workduckTaskRunId = '{run_id}';
$workduckTaskScriptPath = '{path}';
try {{
    $workduckTaskScriptBlock = [ScriptBlock]::Create([System.IO.File]::ReadAllText($workduckTaskScriptPath, [System.Text.Encoding]::UTF8));
}} finally {{
    try {{ [System.IO.File]::Delete($workduckTaskScriptPath) }} catch {{}}
}}
# Preserve the scope used by direct encoded tasks, including native LASTEXITCODE updates.
. $workduckTaskScriptBlock"#
    )
}

#[cfg(target_os = "windows")]
pub(super) fn create_powershell_script(
    repository_path: &Path,
    command: Option<&str>,
    run_record: Option<&ProjectRepositoryTaskRunRecord>,
) -> String {
    let path = escape_powershell_single_quoted(&repository_path.to_string_lossy());
    let mut script = format!(
        "[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false); Set-Location -LiteralPath '{}' -ErrorAction Stop",
        path
    );
    if let Some(run_record) = run_record {
        script.push_str(&create_powershell_task_record_writer(run_record));
    }

    let mut commands = command
        .into_iter()
        .flat_map(|command| command.lines())
        .map(str::trim)
        .filter(|command| !command.is_empty())
        .peekable();
    while let Some(command) = commands.next() {
        let escaped_command = escape_powershell_single_quoted(command);

        if run_record.is_some() {
            script.push_str(&create_tracked_powershell_command(
                &escaped_command,
                commands.peek().is_none(),
            ));
        } else {
            script.push_str(&format!(
                "; Write-Host 'Workduck: {}'; {}; if ($LASTEXITCODE -ne $null -and $LASTEXITCODE -ne 0) {{ Write-Host ('Workduck exit code: ' + $LASTEXITCODE); return }}",
                escaped_command, command
            ));
        }
    }

    script
}

#[cfg(target_os = "windows")]
fn create_tracked_powershell_command(escaped_command: &str, is_final_command: bool) -> String {
    let success_state = if is_final_command {
        "succeeded"
    } else {
        "running"
    };
    let success_exit_code = if is_final_command {
        "$workduckExitCode"
    } else {
        "$null"
    };
    format!(
        r#";
$workduckCommand = '{escaped_command}';
Write-WorkduckTaskRunRecord -State 'running' -ExitCode $null -OutputTail '';
Write-Host 'Workduck: {escaped_command}';
$workduckExitCode = 0;
$LASTEXITCODE = $null;
$workduckCommandSucceeded = $false;
try {{
    Invoke-Expression ($workduckCommand + '; $workduckCommandSucceeded = $?') 2>&1 | Tee-Object -FilePath $workduckLogPath -Append;
    if ($LASTEXITCODE -ne $null) {{
        $workduckExitCode = [int]$LASTEXITCODE;
    }} elseif (-not $workduckCommandSucceeded) {{
        $workduckExitCode = 1;
    }}
}} catch {{
    $workduckExitCode = 1;
    $_ | Out-String | Tee-Object -FilePath $workduckLogPath -Append;
}}
$workduckTail = '';
if (Test-Path -LiteralPath $workduckLogPath) {{
    try {{
        $logReader = [System.IO.StreamReader]::new($workduckLogPath, [System.Text.Encoding]::UTF8, $true);
        try {{
            [void]$logReader.Peek();
            if ($logReader.BaseStream.Length -gt 65536) {{
                $logReader.DiscardBufferedData();
                [void]$logReader.BaseStream.Seek(-65536, [System.IO.SeekOrigin]::End);
                if ($logReader.CurrentEncoding.CodePage -eq 65001) {{
                    $firstByte = $logReader.BaseStream.ReadByte();
                    while ($firstByte -ge 0 -and ($firstByte -band 192) -eq 128) {{ $firstByte = $logReader.BaseStream.ReadByte() }};
                    if ($firstByte -ge 0) {{ [void]$logReader.BaseStream.Seek(-1, [System.IO.SeekOrigin]::Current) }};
                }} elseif ($logReader.CurrentEncoding.CodePage -eq 1200) {{
                    $firstChar = $logReader.BaseStream.ReadByte() -bor ($logReader.BaseStream.ReadByte() -shl 8);
                    if ($firstChar -lt 56320 -or $firstChar -gt 57343) {{ [void]$logReader.BaseStream.Seek(-2, [System.IO.SeekOrigin]::Current) }};
                }}
            }}
            $workduckTail = $logReader.ReadToEnd().TrimEnd([char[]]"`r`n");
        }} finally {{ $logReader.Dispose() }}
    }} catch {{ $workduckTail = '' }}
    $workduckTail = ($workduckTail -split '\r\n|\n|\r' | Select-Object -Last 40) -join [Environment]::NewLine;
}};
if ($workduckExitCode -eq 0) {{
    Write-WorkduckTaskRunRecord -State '{success_state}' -ExitCode {success_exit_code} -OutputTail $workduckTail;
}} else {{
    Write-WorkduckTaskRunRecord -State 'failed' -ExitCode $workduckExitCode -OutputTail $workduckTail;
    Write-Host ('Workduck exit code: ' + $workduckExitCode);
    return
}}"#
    )
}

#[cfg(target_os = "windows")]
pub(super) fn create_powershell_task_record_writer(
    run_record: &ProjectRepositoryTaskRunRecord,
) -> String {
    let record_path = escape_powershell_single_quoted(&run_record.record_path);
    let log_path = escape_powershell_single_quoted(&format!("{}.log", run_record.record_path));
    let id = escape_powershell_single_quoted(&run_record.id);
    let task = escape_powershell_single_quoted(&run_record.task);
    let repository_path = escape_powershell_single_quoted(&run_record.repository_path);
    let record_command = escape_powershell_single_quoted(&run_record.command);
    let started_at = escape_powershell_single_quoted(&run_record.started_at);

    format!(
        r#";
$workduckRecordPath = '{record_path}';
$workduckLogPath = '{log_path}';
$workduckRecordCommand = '{record_command}';
function Write-WorkduckTaskRunRecord {{
    param([string]$State, [Nullable[int]]$ExitCode, [string]$OutputTail)
    if ($OutputTail.Length -gt 16384) {{
        $tailStart = $OutputTail.Length - 16384;
        if ([char]::IsLowSurrogate($OutputTail[$tailStart])) {{ $tailStart += 1 }};
        $OutputTail = $OutputTail.Substring($tailStart);
    }}
    $record = [ordered]@{{
        id = '{id}';
        task = '{task}';
        repositoryPath = '{repository_path}';
        command = $workduckRecordCommand;
        state = $State;
        processId = $PID;
        exitCode = $ExitCode;
        startedAt = '{started_at}';
        finishedAt = if ($State -eq 'running') {{ $null }} else {{ (Get-Date).ToUniversalTime().ToString('o') }};
        outputTail = if ([string]::IsNullOrWhiteSpace($OutputTail)) {{ $null }} else {{ $OutputTail }};
        recordPath = $workduckRecordPath
    }};
    $temporaryPath = [System.IO.Path]::Combine(
        [System.IO.Path]::GetDirectoryName($workduckRecordPath),
        '.workduck-task-record.' + [Guid]::NewGuid().ToString('N') + '.tmp'
    );
    $temporaryCreated = $false;
    try {{
        if (-not ('Workduck.TaskRunFile' -as [type])) {{
            Add-Type -TypeDefinition @'
using System.Runtime.InteropServices;
namespace Workduck {{
    public static class TaskRunFile {{
        [DllImport("kernel32.dll", EntryPoint = "MoveFileExW", CharSet = CharSet.Unicode, ExactSpelling = true, SetLastError = true)]
        [return: MarshalAs(UnmanagedType.Bool)]
        public static extern bool Publish(string source, string destination, uint flags);
    }}
}}
'@ -ErrorAction Stop;
        }}
        $json = $record | ConvertTo-Json -Depth 4 -ErrorAction Stop;
        $bytes = [System.Text.UTF8Encoding]::new($false).GetBytes($json);
        while ($bytes.Length -gt {record_byte_limit}) {{
            $tail = [string]$record.outputTail;
            if ([string]::IsNullOrEmpty($tail)) {{ throw 'Task run metadata exceeds the history byte limit' }};
            $tailStart = [int][Math]::Ceiling($tail.Length / 4.0);
            if ($tailStart -lt $tail.Length -and [char]::IsLowSurrogate($tail[$tailStart])) {{ $tailStart += 1 }};
            $record.outputTail = if ($tailStart -ge $tail.Length) {{ $null }} else {{ $tail.Substring($tailStart) }};
            $json = $record | ConvertTo-Json -Depth 4 -ErrorAction Stop;
            $bytes = [System.Text.UTF8Encoding]::new($false).GetBytes($json);
        }}
        $stream = [System.IO.File]::Open($temporaryPath, [System.IO.FileMode]::CreateNew, [System.IO.FileAccess]::Write, [System.IO.FileShare]::None);
        $temporaryCreated = $true;
        try {{
            $stream.Write($bytes, 0, $bytes.Length);
            $stream.Flush($true);
        }} finally {{ $stream.Dispose() }};
        if ([System.IO.File]::Exists($workduckRecordPath)) {{
            if (([System.IO.File]::GetAttributes($workduckRecordPath) -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {{
                throw 'Task run record is a reparse point';
            }}
        }}
        # Replace the name in one operation; File.Replace can expose a missing name to readers.
        # Flags 9 = MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH.
        # Reader and antivirus sharing conflicts get a bounded retry; permanent failures stop execution.
        for ($publishAttempt = 0; $publishAttempt -lt 8; $publishAttempt++) {{
            if ([Workduck.TaskRunFile]::Publish($temporaryPath, $workduckRecordPath, 9)) {{ break }};
            $publishError = [System.Runtime.InteropServices.Marshal]::GetLastWin32Error();
            if ($publishAttempt -eq 7 -or $publishError -notin @(5, 32, 33)) {{
                throw [System.ComponentModel.Win32Exception]::new($publishError);
            }}
            Start-Sleep -Milliseconds 25;
        }}
    }} catch {{
        Write-Error ('Workduck could not save task history; no further commands will run. ' + $_.Exception.Message) -ErrorAction Continue;
        exit 1;
    }} finally {{
        if ($temporaryCreated) {{
            try {{ [System.IO.File]::Delete($temporaryPath) }} catch {{}}
        }}
    }}
}}"#,
        record_byte_limit = super::history::MAX_RECORD_BYTES
    )
}

#[cfg(target_os = "windows")]
pub(super) fn encode_powershell_command(script: &str) -> String {
    let bytes = script
        .encode_utf16()
        .flat_map(u16::to_le_bytes)
        .collect::<Vec<_>>();

    general_purpose::STANDARD.encode(bytes)
}

pub(super) fn escape_powershell_single_quoted(value: &str) -> String {
    value.replace('\'', "''")
}

#[cfg(target_os = "windows")]
pub(super) fn launch_repository_terminal(
    repository_path: &Path,
    command: Option<&str>,
    run_record: Option<&ProjectRepositoryTaskRunRecord>,
) -> Result<Option<u32>, ProjectRepositoryTaskError> {
    use std::os::windows::process::CommandExt;

    const CREATE_NEW_CONSOLE: u32 = 0x00000010;

    let terminal = crate::terminal_catalog::find_available_terminal_entry("powershell-core")
        .or_else(|| crate::terminal_catalog::find_available_terminal_entry("windows-powershell"))
        .ok_or(ProjectRepositoryTaskError::TerminalUnavailable)?;
    let executable = terminal
        .executable_path
        .as_deref()
        .unwrap_or(terminal.command);
    let shell_repository_path = crate::git_path::git_process_path(repository_path);
    let script = create_powershell_script(&shell_repository_path, command, run_record);
    let mut prepared = prepare_powershell_command(&script, run_record)?;

    let child = std::process::Command::new(executable)
        .args([
            "-NoLogo",
            "-NoProfile",
            "-NoExit",
            "-EncodedCommand",
            &prepared.encoded_command,
        ])
        .current_dir(&shell_repository_path)
        .creation_flags(CREATE_NEW_CONSOLE)
        .spawn()
        .map_err(|_| ProjectRepositoryTaskError::LaunchFailed)?;
    prepared.transfer_script_to_shell();
    Ok(Some(child.id()))
}
