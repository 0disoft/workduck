// llmnav/1 module
// id=workduck.projects.task-powershell
// role=Generate PowerShell task scripts with execution-owned run records, bounded output previews, and atomic publication.
// owns=tracked task script generation|PowerShell command encoding|task record publication|Unicode output tail
// excludes=command selection|terminal discovery|process liveness
// search=PowerShell tracking script|atomic task record publication|bounded Unicode log tail
// invariant=Only the final command can publish success; record publication exposes synced complete JSON and aborts execution on failure; preview truncation preserves Unicode boundaries.
// stability=architecture
// /llmnav
#[cfg(target_os = "windows")]
use super::ProjectRepositoryTaskRunRecord;
#[cfg(target_os = "windows")]
use base64::{Engine as _, engine::general_purpose};
#[cfg(target_os = "windows")]
use std::path::Path;

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
}}"#
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
