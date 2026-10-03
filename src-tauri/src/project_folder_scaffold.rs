// llmnav/1 module
// id=workduck.projects.scaffold-transaction
// role=Plan and apply repository scaffolds with exclusive ownership, durable journals, conflict preservation, and recovery.
// owns=scaffold selection and planning|scaffold file and manifest writes|scaffold locking and recovery
// excludes=folder command DTOs|workspace and repository root validation|Git operations
// search=scaffold apply transaction|recover scaffold journal|preserve scaffold conflicts
// invariant=Apply writes missing files only, and cleanup verifies repository parents and recorded checksums before removing generated files.
// stability=architecture
// /llmnav
use super::{
    ProjectFolderError, ProjectFolderSsealedScaffoldFilePlan, ProjectFolderSsealedScaffoldPlan,
};
use crate::atomic_file_write::{write_file_atomically, write_file_exclusively};
use crate::queue_execution_identity::unique_token;
use crate::ssealed_scaffold::{SsealedScaffold, ssealed_scaffolds};
use crate::ssealed_scaffold_generated::SSEALED_SCAFFOLD_TOOL_VERSION;
use crate::windows_filename::is_windows_reserved_name;
use sha2::{Digest, Sha256};
use std::{
    fs,
    io::{self, Read, Write},
    path::{Component, Path, PathBuf},
};
use time::{OffsetDateTime, format_description::well_known::Rfc3339};

const SSEALED_SCAFFOLD_LOCK_FILE_NAME: &str = ".ssealed-init.lock";
const SSEALED_SCAFFOLD_APPLY_JOURNAL_FILE_NAME: &str = "apply-journal.json";
const SSEALED_SCAFFOLD_APPLY_JOURNAL_VERSION: u32 = 1;

#[derive(serde::Deserialize, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct SsealedScaffoldApplyJournal {
    version: u32,
    manifest_checksum: String,
    files: Vec<SsealedScaffoldApplyJournalFile>,
}

#[derive(serde::Deserialize, serde::Serialize)]
struct SsealedScaffoldApplyJournalFile {
    path: String,
    checksum: String,
}

pub(super) fn validate_ssealed_scaffold_selection(
    scope: Option<String>,
    profile: Option<String>,
) -> Result<Option<(&'static str, &'static str)>, ProjectFolderError> {
    let Some(scope) = scope else {
        return Ok(None);
    };
    let scope = scope.trim();

    if scope.is_empty() || scope == "none" {
        return Ok(None);
    }

    let profile = profile
        .as_deref()
        .map(str::trim)
        .filter(|profile| !profile.is_empty())
        .unwrap_or("generic");

    find_ssealed_scaffold(scope, profile)
        .map(|scaffold| Some((scaffold.scope, scaffold.profile)))
        .ok_or(ProjectFolderError::SsealedScaffoldFailed)
}

fn find_ssealed_scaffold(scope: &str, profile: &str) -> Option<&'static SsealedScaffold> {
    ssealed_scaffolds()
        .ok()?
        .iter()
        .find(|candidate| candidate.scope == scope && candidate.profile == profile)
}

pub(super) fn write_ssealed_scaffold(
    target_path: &Path,
    scope: &str,
    profile: &str,
) -> Result<(), ProjectFolderError> {
    let scaffold =
        find_ssealed_scaffold(scope, profile).ok_or(ProjectFolderError::SsealedScaffoldFailed)?;
    let mut manifest_files = Vec::with_capacity(scaffold.files.len());

    for file in scaffold.files {
        write_ssealed_scaffold_file(target_path, file.path, file.content)?;
        manifest_files.push(create_ssealed_manifest_file(
            file.path,
            file.kind,
            &sha256_checksum(file.content),
        ));
    }

    let generated_at = OffsetDateTime::now_utc()
        .format(&Rfc3339)
        .unwrap_or_else(|_| "1970-01-01T00:00:00Z".to_owned());
    let manifest = serde_json::json!({
        "tool": "ssealed",
        "schemaVersion": 1,
        "generatorVersion": SSEALED_SCAFFOLD_TOOL_VERSION,
        "version": SSEALED_SCAFFOLD_TOOL_VERSION,
        "generatedBy": "workduck",
        "generatedAt": generated_at,
        "scope": scaffold.scope,
        "profile": scaffold.profile,
        "addons": [],
        "density": scaffold.density,
        "runner": scaffold.runner,
        "files": manifest_files,
    });
    let manifest_content = serde_json::to_string_pretty(&manifest)
        .map_err(|_| ProjectFolderError::SsealedScaffoldFailed)?;

    write_ssealed_scaffold_file(
        target_path,
        ".ssealed/manifest.json",
        &(manifest_content + "\n"),
    )
}

fn write_ssealed_scaffold_file(
    target_path: &Path,
    relative_path: &str,
    content: &str,
) -> Result<(), ProjectFolderError> {
    let file_path = resolve_ssealed_scaffold_file_path(target_path, relative_path)?;

    match fs::symlink_metadata(&file_path) {
        Ok(metadata) => {
            if metadata_is_link_or_reparse(&metadata) || metadata.is_file() || metadata.is_dir() {
                return Err(ProjectFolderError::Conflict);
            }
        }
        Err(error) if error.kind() == io::ErrorKind::NotFound => {}
        Err(_) => return Err(ProjectFolderError::SsealedScaffoldFailed),
    }

    create_ssealed_scaffold_parent_directories(target_path, relative_path)?;

    fs::write(file_path, content).map_err(|_| ProjectFolderError::SsealedScaffoldFailed)
}

pub(super) fn create_ssealed_repository_scaffold_plan(
    target_path: &Path,
    scope: &str,
    profile: &str,
    should_apply: bool,
) -> Result<ProjectFolderSsealedScaffoldPlan, ProjectFolderError> {
    let scaffold =
        find_ssealed_scaffold(scope, profile).ok_or(ProjectFolderError::SsealedScaffoldFailed)?;
    if should_apply {
        recover_ssealed_repository_apply_journal(target_path)?;
    }
    let mut files = Vec::with_capacity(scaffold.files.len());
    let mut missing_count = 0;
    let mut unchanged_count = 0;
    let mut conflict_count = 0;

    for file in scaffold.files {
        let checksum = sha256_checksum(file.content);
        let status =
            inspect_ssealed_repository_scaffold_file(target_path, file.path, file.content)?;

        match status {
            "missing" => missing_count += 1,
            "unchanged" => unchanged_count += 1,
            "conflict" => conflict_count += 1,
            _ => return Err(ProjectFolderError::SsealedScaffoldFailed),
        }

        files.push(ProjectFolderSsealedScaffoldFilePlan {
            path: file.path.to_owned(),
            kind: file.kind.to_owned(),
            checksum,
            status: status.to_owned(),
        });
    }

    let plan = ProjectFolderSsealedScaffoldPlan {
        tool_version: SSEALED_SCAFFOLD_TOOL_VERSION,
        scope: scaffold.scope,
        profile: scaffold.profile,
        density: scaffold.density,
        runner: scaffold.runner,
        files,
        missing_count,
        added_count: 0,
        unchanged_count,
        conflict_count,
    };

    if should_apply {
        apply_ssealed_repository_scaffold_plan(target_path, scaffold, plan, None)
    } else {
        Ok(plan)
    }
}

fn apply_ssealed_repository_scaffold_plan(
    target_path: &Path,
    scaffold: &SsealedScaffold,
    plan: ProjectFolderSsealedScaffoldPlan,
    failure_after_created_files: Option<usize>,
) -> Result<ProjectFolderSsealedScaffoldPlan, ProjectFolderError> {
    let mut committed_plan = plan.clone();
    for file in &mut committed_plan.files {
        if file.status == "missing" {
            file.status = "added".to_string();
        }
    }
    committed_plan.added_count = committed_plan.missing_count;
    committed_plan.missing_count = 0;

    let manifest_content = create_ssealed_repository_apply_manifest_content(&committed_plan)?;
    let missing_files = scaffold
        .files
        .iter()
        .filter(|file| {
            plan.files
                .iter()
                .any(|planned| planned.path == file.path && planned.status == "missing")
        })
        .collect::<Vec<_>>();
    let staging_directory = tempfile::Builder::new()
        .prefix(".ssealed-stage.")
        .tempdir_in(target_path)
        .map_err(|_| ProjectFolderError::SsealedScaffoldFailed)?;

    for file in &missing_files {
        let staging_path = resolve_ssealed_scaffold_file_path(staging_directory.path(), file.path)?;
        create_ssealed_scaffold_parent_directories(staging_directory.path(), file.path)?;
        fs::write(staging_path, file.content)
            .map_err(|_| ProjectFolderError::SsealedScaffoldFailed)?;
    }

    for file in &missing_files {
        if inspect_ssealed_repository_scaffold_file(target_path, file.path, file.content)?
            != "missing"
        {
            return Err(ProjectFolderError::Conflict);
        }
    }

    let journal = SsealedScaffoldApplyJournal {
        version: SSEALED_SCAFFOLD_APPLY_JOURNAL_VERSION,
        manifest_checksum: sha256_checksum(&manifest_content),
        files: missing_files
            .iter()
            .map(|file| SsealedScaffoldApplyJournalFile {
                path: file.path.to_string(),
                checksum: sha256_checksum(file.content),
            })
            .collect(),
    };
    let journal_path = write_ssealed_repository_apply_journal(target_path, &journal)?;
    let mut created_file_count = 0;
    let mut created_directories = Vec::new();

    let apply_result = (|| {
        for file in &missing_files {
            create_ssealed_scaffold_parent_directories_tracking(
                target_path,
                file.path,
                &mut created_directories,
            )?;
            let staging_path =
                resolve_ssealed_scaffold_file_path(staging_directory.path(), file.path)?;
            let staged_content = fs::read_to_string(staging_path)
                .map_err(|_| ProjectFolderError::SsealedScaffoldFailed)?;
            let target_file_path = resolve_ssealed_scaffold_file_path(target_path, file.path)?;
            write_file_exclusively(&target_file_path, &staged_content).map_err(
                |error| match error {
                    crate::atomic_file_write::AtomicFileWriteError::TargetAlreadyExists => {
                        ProjectFolderError::Conflict
                    }
                    _ => ProjectFolderError::SsealedScaffoldFailed,
                },
            )?;
            created_file_count += 1;

            if failure_after_created_files.is_some_and(|limit| created_file_count >= limit) {
                return Err(ProjectFolderError::SsealedScaffoldFailed);
            }
        }

        write_ssealed_repository_manifest_file(target_path, &manifest_content)
    })();

    if let Err(error) = apply_result {
        if rollback_ssealed_repository_apply(
            target_path,
            &journal.files[..created_file_count],
            &created_directories,
        )
        .is_ok()
        {
            let _ = fs::remove_file(&journal_path);
        }
        return Err(error);
    }

    let _ = fs::remove_file(journal_path);
    Ok(committed_plan)
}

fn inspect_ssealed_repository_scaffold_file(
    target_path: &Path,
    relative_path: &str,
    content: &str,
) -> Result<&'static str, ProjectFolderError> {
    if has_ssealed_repository_scaffold_parent_conflict(target_path, relative_path)? {
        return Ok("conflict");
    }

    let file_path = resolve_ssealed_scaffold_file_path(target_path, relative_path)?;

    match fs::symlink_metadata(&file_path) {
        Ok(metadata) => {
            if metadata_is_link_or_reparse(&metadata) || metadata.is_dir() {
                return Ok("conflict");
            }

            if !metadata.is_file() {
                return Ok("conflict");
            }

            match fs::read_to_string(&file_path) {
                Ok(existing_content) if existing_content == content => Ok("unchanged"),
                Ok(_) => Ok("conflict"),
                Err(_) => Err(ProjectFolderError::SsealedScaffoldFailed),
            }
        }
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok("missing"),
        Err(_) => Err(ProjectFolderError::SsealedScaffoldFailed),
    }
}

fn has_ssealed_repository_scaffold_parent_conflict(
    target_path: &Path,
    relative_path: &str,
) -> Result<bool, ProjectFolderError> {
    let relative_path = validate_ssealed_scaffold_relative_path(relative_path)?;
    let mut current_path = target_path.to_path_buf();
    let components = relative_path.components().collect::<Vec<_>>();

    for component in components.iter().take(components.len().saturating_sub(1)) {
        let Component::Normal(segment) = component else {
            return Err(ProjectFolderError::SsealedScaffoldFailed);
        };
        current_path.push(segment);

        match fs::symlink_metadata(&current_path) {
            Ok(metadata) => {
                if metadata_is_link_or_reparse(&metadata) || !metadata.is_dir() {
                    return Ok(true);
                }
            }
            Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(false),
            Err(_) => return Err(ProjectFolderError::SsealedScaffoldFailed),
        }
    }

    Ok(false)
}

fn create_ssealed_scaffold_parent_directories(
    target_path: &Path,
    relative_path: &str,
) -> Result<(), ProjectFolderError> {
    create_ssealed_scaffold_parent_directories_tracking(target_path, relative_path, &mut Vec::new())
}

fn create_ssealed_scaffold_parent_directories_tracking(
    target_path: &Path,
    relative_path: &str,
    created_directories: &mut Vec<PathBuf>,
) -> Result<(), ProjectFolderError> {
    let relative_path = validate_ssealed_scaffold_relative_path(relative_path)?;
    let mut current_path = target_path.to_path_buf();
    let components = relative_path.components().collect::<Vec<_>>();

    for component in components.iter().take(components.len().saturating_sub(1)) {
        let Component::Normal(segment) = component else {
            return Err(ProjectFolderError::SsealedScaffoldFailed);
        };
        current_path.push(segment);

        match fs::symlink_metadata(&current_path) {
            Ok(metadata) => {
                if metadata_is_link_or_reparse(&metadata) || !metadata.is_dir() {
                    return Err(ProjectFolderError::Conflict);
                }
            }
            Err(error) if error.kind() == io::ErrorKind::NotFound => {
                fs::create_dir(&current_path)
                    .map_err(|_| ProjectFolderError::SsealedScaffoldFailed)?;
                created_directories.push(current_path.clone());
            }
            Err(_) => return Err(ProjectFolderError::SsealedScaffoldFailed),
        }

        let normalized_current_path = fs::canonicalize(&current_path)
            .map_err(|_| ProjectFolderError::SsealedScaffoldFailed)?;

        if !normalized_current_path.starts_with(target_path) {
            return Err(ProjectFolderError::SsealedScaffoldFailed);
        }
    }

    Ok(())
}

fn resolve_ssealed_scaffold_file_path(
    target_path: &Path,
    relative_path: &str,
) -> Result<PathBuf, ProjectFolderError> {
    Ok(target_path.join(validate_ssealed_scaffold_relative_path(relative_path)?))
}

fn validate_ssealed_scaffold_relative_path(
    relative_path: &str,
) -> Result<PathBuf, ProjectFolderError> {
    if relative_path.is_empty()
        || relative_path.contains('\0')
        || relative_path.contains('\\')
        || relative_path
            .split('/')
            .any(|segment| segment.is_empty() || segment == "." || segment == "..")
    {
        return Err(ProjectFolderError::SsealedScaffoldFailed);
    }

    let path = Path::new(relative_path);
    if path.is_absolute() {
        return Err(ProjectFolderError::SsealedScaffoldFailed);
    }

    let mut validated_path = PathBuf::new();
    for component in path.components() {
        let Component::Normal(segment) = component else {
            return Err(ProjectFolderError::SsealedScaffoldFailed);
        };
        let Some(segment) = segment.to_str() else {
            return Err(ProjectFolderError::SsealedScaffoldFailed);
        };
        if segment.ends_with(' ')
            || segment.ends_with('.')
            || segment
                .chars()
                .any(|character| matches!(character, '<' | '>' | ':' | '"' | '|' | '?' | '*'))
            || is_windows_reserved_name(segment)
        {
            return Err(ProjectFolderError::SsealedScaffoldFailed);
        }
        validated_path.push(segment);
    }

    if validated_path.as_os_str().is_empty() {
        Err(ProjectFolderError::SsealedScaffoldFailed)
    } else {
        Ok(validated_path)
    }
}

fn create_ssealed_repository_apply_manifest_content(
    plan: &ProjectFolderSsealedScaffoldPlan,
) -> Result<String, ProjectFolderError> {
    let manifest_files: Vec<_> = plan
        .files
        .iter()
        .filter(|file| file.status != "conflict")
        .map(|file| create_ssealed_manifest_file(&file.path, &file.kind, &file.checksum))
        .collect();
    let manifest_conflicts: Vec<_> = plan
        .files
        .iter()
        .filter(|file| file.status == "conflict")
        .map(|file| {
            serde_json::json!({
                "path": file.path,
                "checksum": file.checksum,
                "kind": file.kind,
            })
        })
        .collect();
    let generated_at = OffsetDateTime::now_utc()
        .format(&Rfc3339)
        .unwrap_or_else(|_| "1970-01-01T00:00:00Z".to_owned());
    let manifest = serde_json::json!({
        "tool": "ssealed",
        "schemaVersion": 1,
        "generatorVersion": plan.tool_version,
        "version": plan.tool_version,
        "generatedBy": "workduck",
        "generatedAt": generated_at,
        "scope": plan.scope,
        "profile": plan.profile,
        "addons": [],
        "density": plan.density,
        "runner": plan.runner,
        "mode": "existing-repository-missing-files",
        "files": manifest_files,
        "conflicts": manifest_conflicts,
    });
    let manifest_content = serde_json::to_string_pretty(&manifest)
        .map_err(|_| ProjectFolderError::SsealedScaffoldFailed)?;

    Ok(manifest_content + "\n")
}

fn create_ssealed_manifest_file(path: &str, kind: &str, checksum: &str) -> serde_json::Value {
    let ownership = if path == ".gitignore" || path == "package.json" {
        "block-managed"
    } else {
        "seeded"
    };
    let presence = if ownership == "block-managed" {
        "required"
    } else {
        "optional"
    };

    serde_json::json!({
        "path": path,
        "checksum": checksum,
        "kind": kind,
        "ownership": ownership,
        "presence": presence,
        "status": "active",
        "initialChecksum": checksum,
        "acceptedChecksum": checksum,
        "generatedChecksum": checksum,
    })
}

fn write_ssealed_repository_manifest_file(
    target_path: &Path,
    content: &str,
) -> Result<(), ProjectFolderError> {
    let manifest_directory = ensure_ssealed_manifest_directory(target_path)?;
    let manifest_path = manifest_directory.join("manifest.json");

    match fs::symlink_metadata(&manifest_path) {
        Ok(metadata) => {
            if metadata_is_link_or_reparse(&metadata) || metadata.is_dir() {
                return Err(ProjectFolderError::Conflict);
            }
        }
        Err(error) if error.kind() == io::ErrorKind::NotFound => {}
        Err(_) => return Err(ProjectFolderError::SsealedScaffoldFailed),
    }

    write_file_atomically(&manifest_path, content)
        .map_err(|_| ProjectFolderError::SsealedScaffoldFailed)
}

fn ensure_ssealed_manifest_directory(target_path: &Path) -> Result<PathBuf, ProjectFolderError> {
    let manifest_directory = target_path.join(".ssealed");

    match fs::symlink_metadata(&manifest_directory) {
        Ok(metadata) => {
            if metadata_is_link_or_reparse(&metadata) || !metadata.is_dir() {
                return Err(ProjectFolderError::Conflict);
            }
        }
        Err(error) if error.kind() == io::ErrorKind::NotFound => {
            fs::create_dir(&manifest_directory)
                .map_err(|_| ProjectFolderError::SsealedScaffoldFailed)?;
        }
        Err(_) => return Err(ProjectFolderError::SsealedScaffoldFailed),
    }

    let normalized_manifest_directory = fs::canonicalize(&manifest_directory)
        .map_err(|_| ProjectFolderError::SsealedScaffoldFailed)?;

    if !normalized_manifest_directory.starts_with(target_path) {
        return Err(ProjectFolderError::SsealedScaffoldFailed);
    }

    Ok(normalized_manifest_directory)
}

fn write_ssealed_repository_apply_journal(
    target_path: &Path,
    journal: &SsealedScaffoldApplyJournal,
) -> Result<PathBuf, ProjectFolderError> {
    let manifest_directory = ensure_ssealed_manifest_directory(target_path)?;
    let journal_path = manifest_directory.join(SSEALED_SCAFFOLD_APPLY_JOURNAL_FILE_NAME);

    match fs::symlink_metadata(&journal_path) {
        Ok(metadata) => {
            if metadata_is_link_or_reparse(&metadata) || metadata.is_dir() {
                return Err(ProjectFolderError::Conflict);
            }
        }
        Err(error) if error.kind() == io::ErrorKind::NotFound => {}
        Err(_) => return Err(ProjectFolderError::SsealedScaffoldFailed),
    }

    let content = serde_json::to_string_pretty(journal)
        .map_err(|_| ProjectFolderError::SsealedScaffoldFailed)?
        + "\n";
    write_file_atomically(&journal_path, &content)
        .map_err(|_| ProjectFolderError::SsealedScaffoldFailed)?;
    Ok(journal_path)
}

fn recover_ssealed_repository_apply_journal(target_path: &Path) -> Result<(), ProjectFolderError> {
    let manifest_directory = target_path.join(".ssealed");
    match fs::symlink_metadata(&manifest_directory) {
        Ok(metadata) => {
            if metadata_is_link_or_reparse(&metadata) || !metadata.is_dir() {
                return Err(ProjectFolderError::Conflict);
            }
        }
        Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(()),
        Err(_) => return Err(ProjectFolderError::SsealedScaffoldFailed),
    }
    let normalized_manifest_directory = fs::canonicalize(&manifest_directory)
        .map_err(|_| ProjectFolderError::SsealedScaffoldFailed)?;
    if !normalized_manifest_directory.starts_with(target_path) {
        return Err(ProjectFolderError::SsealedScaffoldFailed);
    }

    let journal_path = normalized_manifest_directory.join(SSEALED_SCAFFOLD_APPLY_JOURNAL_FILE_NAME);
    let journal_content = match fs::read_to_string(&journal_path) {
        Ok(content) => content,
        Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(()),
        Err(_) => return Err(ProjectFolderError::SsealedScaffoldFailed),
    };
    let journal: SsealedScaffoldApplyJournal = serde_json::from_str(&journal_content)
        .map_err(|_| ProjectFolderError::SsealedScaffoldFailed)?;
    if journal.version != SSEALED_SCAFFOLD_APPLY_JOURNAL_VERSION {
        return Err(ProjectFolderError::SsealedScaffoldFailed);
    }

    let manifest_committed =
        fs::read_to_string(normalized_manifest_directory.join("manifest.json"))
            .map(|content| sha256_checksum(&content) == journal.manifest_checksum)
            .unwrap_or(false);
    if !manifest_committed {
        for file in journal.files.iter().rev() {
            remove_unmodified_ssealed_file(target_path, file)?;
        }
    }

    fs::remove_file(journal_path).map_err(|_| ProjectFolderError::SsealedScaffoldFailed)
}

fn remove_unmodified_ssealed_file(
    target_path: &Path,
    file: &SsealedScaffoldApplyJournalFile,
) -> Result<(), ProjectFolderError> {
    let file_path = resolve_ssealed_scaffold_file_path(target_path, &file.path)?;
    if has_ssealed_repository_scaffold_parent_conflict(target_path, &file.path)? {
        return Err(ProjectFolderError::Conflict);
    }
    let should_remove = match fs::symlink_metadata(&file_path) {
        Ok(metadata) if !metadata_is_link_or_reparse(&metadata) && metadata.is_file() => {
            fs::read_to_string(&file_path)
                .map(|content| sha256_checksum(&content) == file.checksum)
                .unwrap_or(false)
        }
        Ok(_) => false,
        Err(error) if error.kind() == io::ErrorKind::NotFound => false,
        Err(_) => return Err(ProjectFolderError::SsealedScaffoldFailed),
    };
    if should_remove {
        fs::remove_file(file_path).map_err(|_| ProjectFolderError::SsealedScaffoldFailed)?;
    }
    Ok(())
}

fn rollback_ssealed_repository_apply(
    target_path: &Path,
    created_files: &[SsealedScaffoldApplyJournalFile],
    created_directories: &[PathBuf],
) -> Result<(), ProjectFolderError> {
    let mut result = Ok(());
    for file in created_files.iter().rev() {
        if let Err(error) = remove_unmodified_ssealed_file(target_path, file) {
            result = Err(error);
        }
    }
    for directory_path in created_directories.iter().rev() {
        let relative_path = directory_path
            .strip_prefix(target_path)
            .map_err(|_| ProjectFolderError::SsealedScaffoldFailed)?
            .to_string_lossy()
            .replace('\\', "/");
        if has_ssealed_repository_scaffold_parent_conflict(target_path, &relative_path)? {
            return Err(ProjectFolderError::Conflict);
        }
        let metadata = match fs::symlink_metadata(directory_path) {
            Ok(metadata) => metadata,
            Err(error) if error.kind() == io::ErrorKind::NotFound => continue,
            Err(_) => return Err(ProjectFolderError::SsealedScaffoldFailed),
        };
        if metadata_is_link_or_reparse(&metadata) || !metadata.is_dir() {
            return Err(ProjectFolderError::Conflict);
        }
        if let Err(error) = fs::remove_dir(directory_path) {
            if !matches!(
                error.kind(),
                io::ErrorKind::NotFound | io::ErrorKind::DirectoryNotEmpty
            ) {
                result = Err(ProjectFolderError::SsealedScaffoldFailed);
            }
        }
    }
    result
}

pub(super) struct SsealedScaffoldLock {
    path: PathBuf,
    lock_id: String,
    _file: fs::File,
}

impl Drop for SsealedScaffoldLock {
    fn drop(&mut self) {
        let _ = self._file.unlock();
        let owned = fs::read(&self.path)
            .ok()
            .and_then(|content| serde_json::from_slice::<serde_json::Value>(&content).ok())
            .and_then(|metadata| {
                metadata
                    .get("lockId")
                    .and_then(serde_json::Value::as_str)
                    .map(str::to_owned)
            })
            .is_some_and(|lock_id| lock_id == self.lock_id);
        if owned {
            let _ = fs::remove_file(&self.path);
        }
    }
}

fn recover_abandoned_workduck_scaffold_lock(lock_path: &Path) -> Result<bool, ProjectFolderError> {
    if fs::symlink_metadata(lock_path)
        .map(|metadata| metadata_is_link_or_reparse(&metadata) || metadata.is_dir())
        .unwrap_or(false)
    {
        return Err(ProjectFolderError::SsealedScaffoldFailed);
    }

    let mut lock_file = match fs::OpenOptions::new()
        .read(true)
        .write(true)
        .open(lock_path)
    {
        Ok(lock_file) => lock_file,
        Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(true),
        Err(_) => return Err(ProjectFolderError::SsealedScaffoldFailed),
    };
    match lock_file.try_lock() {
        Ok(()) => {}
        Err(fs::TryLockError::WouldBlock) => {
            return Err(ProjectFolderError::SsealedScaffoldLocked);
        }
        Err(_) => return Err(ProjectFolderError::SsealedScaffoldFailed),
    }

    let mut content = Vec::new();
    lock_file
        .read_to_end(&mut content)
        .map_err(|_| ProjectFolderError::SsealedScaffoldFailed)?;
    let metadata: serde_json::Value =
        serde_json::from_slice(&content).map_err(|_| ProjectFolderError::SsealedScaffoldLocked)?;
    let tool = metadata.get("tool").and_then(serde_json::Value::as_str);
    if !matches!(tool, None | Some("workduck")) {
        return Err(ProjectFolderError::SsealedScaffoldLocked);
    }

    fs::remove_file(lock_path).map_err(|error| {
        if error.kind() == io::ErrorKind::NotFound {
            ProjectFolderError::SsealedScaffoldLocked
        } else {
            ProjectFolderError::SsealedScaffoldFailed
        }
    })?;
    Ok(true)
}

pub(super) fn acquire_ssealed_scaffold_lock(
    target_path: &Path,
) -> Result<SsealedScaffoldLock, ProjectFolderError> {
    let lock_path = target_path.join(SSEALED_SCAFFOLD_LOCK_FILE_NAME);
    for _ in 0..2 {
        if fs::symlink_metadata(&lock_path)
            .map(|metadata| metadata_is_link_or_reparse(&metadata) || metadata.is_dir())
            .unwrap_or(false)
        {
            return Err(ProjectFolderError::SsealedScaffoldFailed);
        }

        let mut lock_file = match fs::OpenOptions::new()
            .read(true)
            .write(true)
            .create_new(true)
            .open(&lock_path)
        {
            Ok(lock_file) => lock_file,
            Err(error) if error.kind() == io::ErrorKind::AlreadyExists => {
                recover_abandoned_workduck_scaffold_lock(&lock_path)?;
                continue;
            }
            Err(_) => return Err(ProjectFolderError::SsealedScaffoldFailed),
        };
        lock_file
            .try_lock()
            .map_err(|_| ProjectFolderError::SsealedScaffoldFailed)?;
        let lock_id = unique_token();
        let created_at = OffsetDateTime::now_utc()
            .format(&Rfc3339)
            .unwrap_or_else(|_| "1970-01-01T00:00:00Z".to_owned());
        let lock_metadata = serde_json::json!({
            "tool": "workduck",
            "lockId": lock_id,
            "pid": std::process::id(),
            "createdAt": created_at,
        });
        let lock_content = serde_json::to_vec_pretty(&lock_metadata)
            .map_err(|_| ProjectFolderError::SsealedScaffoldFailed);

        if lock_content
            .and_then(|content| {
                lock_file
                    .write_all(&content)
                    .and_then(|_| lock_file.flush())
                    .and_then(|_| lock_file.sync_all())
                    .map_err(|_| ProjectFolderError::SsealedScaffoldFailed)
            })
            .is_err()
        {
            let _ = lock_file.unlock();
            let _ = fs::remove_file(&lock_path);
            return Err(ProjectFolderError::SsealedScaffoldFailed);
        }

        return Ok(SsealedScaffoldLock {
            path: lock_path,
            lock_id,
            _file: lock_file,
        });
    }

    Err(ProjectFolderError::SsealedScaffoldLocked)
}

fn metadata_is_link_or_reparse(metadata: &fs::Metadata) -> bool {
    if metadata.file_type().is_symlink() {
        return true;
    }

    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        const FILE_ATTRIBUTE_REPARSE_POINT: u32 = 0x0000_0400;
        metadata.file_attributes() & FILE_ATTRIBUTE_REPARSE_POINT != 0
    }

    #[cfg(not(windows))]
    false
}

fn sha256_checksum(content: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(content.as_bytes());
    let digest = hasher.finalize();
    let mut checksum = String::from("sha256:");

    for byte in digest {
        checksum.push_str(&format!("{byte:02x}"));
    }

    checksum
}

#[cfg(test)]
#[path = "project_folder_scaffold_tests.rs"]
mod tests;
