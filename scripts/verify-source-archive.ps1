param(
    [Parameter(Mandatory = $true)]
    [string]$OutputPath,
    [Parameter(Mandatory = $true)]
    [string]$ExtractPath
)

$ErrorActionPreference = 'Stop'
$repositoryRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))

function Resolve-RepositoryPath([string]$PathValue) {
    if ([IO.Path]::IsPathRooted($PathValue)) {
        return [IO.Path]::GetFullPath($PathValue)
    }
    return [IO.Path]::GetFullPath((Join-Path $repositoryRoot $PathValue))
}

function Assert-PathInsideRepository([string]$Candidate, [string]$Label) {
    $relative = [IO.Path]::GetRelativePath($repositoryRoot, $Candidate)
    if ($relative -eq '..' -or $relative.StartsWith("..$([IO.Path]::DirectorySeparatorChar)")) {
        throw "$Label must stay inside the repository: $Candidate"
    }
}

$archivePath = Resolve-RepositoryPath $OutputPath
$expandedPath = Resolve-RepositoryPath $ExtractPath
Assert-PathInsideRepository $archivePath 'OutputPath'
Assert-PathInsideRepository $expandedPath 'ExtractPath'

if ([IO.Path]::GetExtension($archivePath) -ne '.zip') {
    throw "OutputPath must use the .zip extension."
}
if ($expandedPath -eq $repositoryRoot) {
    throw 'ExtractPath must not be the repository root.'
}

$archiveParent = Split-Path -Parent $archivePath
New-Item -ItemType Directory -Force -Path $archiveParent | Out-Null
if (Test-Path -LiteralPath $archivePath) {
    Remove-Item -LiteralPath $archivePath -Force
}
if (Test-Path -LiteralPath $expandedPath) {
    Remove-Item -LiteralPath $expandedPath -Recurse -Force
}
New-Item -ItemType Directory -Force -Path $expandedPath | Out-Null

& git -C $repositoryRoot archive --format=zip --output=$archivePath HEAD
if ($LASTEXITCODE -ne 0) {
    throw "git archive failed with exit code $LASTEXITCODE."
}

Expand-Archive -LiteralPath $archivePath -DestinationPath $expandedPath

$expectedFiles = @(& git -C $repositoryRoot ls-files)
if ($LASTEXITCODE -ne 0) {
    throw "git ls-files failed with exit code $LASTEXITCODE."
}
$expectedSet = [Collections.Generic.HashSet[string]]::new([StringComparer]::Ordinal)
foreach ($path in $expectedFiles) {
    [void]$expectedSet.Add($path.Replace('\', '/'))
}
$actualSet = [Collections.Generic.HashSet[string]]::new([StringComparer]::Ordinal)
foreach ($file in Get-ChildItem -LiteralPath $expandedPath -File -Recurse) {
    $relative = [IO.Path]::GetRelativePath($expandedPath, $file.FullName).Replace('\', '/')
    [void]$actualSet.Add($relative)
}

if (!$expectedSet.SetEquals($actualSet)) {
    $missing = @($expectedSet | Where-Object { !$actualSet.Contains($_) } | Sort-Object)
    $unexpected = @($actualSet | Where-Object { !$expectedSet.Contains($_) } | Sort-Object)
    throw "Source archive file list differs from Git. Missing: $($missing -join ', '); unexpected: $($unexpected -join ', ')"
}
if (!$actualSet.Contains('src-tauri/src/bin/workduck-cli.rs')) {
    throw 'Source archive is missing src-tauri/src/bin/workduck-cli.rs.'
}

$previousCargoTargetDirectory = $env:CARGO_TARGET_DIR
$env:CARGO_TARGET_DIR = Join-Path $repositoryRoot 'src-tauri/target/source-archive-smoke'
try {
    & cargo check --locked --manifest-path (Join-Path $expandedPath 'src-tauri/Cargo.toml') --bin workduck-cli
    if ($LASTEXITCODE -ne 0) {
        throw "Archived CLI cargo check failed with exit code $LASTEXITCODE."
    }

    Push-Location $expandedPath
    try {
        & bun run workduck --help
        if ($LASTEXITCODE -ne 0) {
            throw "Archived CLI help smoke failed with exit code $LASTEXITCODE."
        }
    } finally {
        Pop-Location
    }
} finally {
    $env:CARGO_TARGET_DIR = $previousCargoTargetDirectory
}

$archiveHash = (Get-FileHash -LiteralPath $archivePath -Algorithm SHA256).Hash.ToLowerInvariant()
Write-Output "Verified git archive: $archivePath"
Write-Output "Tracked files: $($expectedSet.Count)"
Write-Output "SHA-256: $archiveHash"
