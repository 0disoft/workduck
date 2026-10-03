use super::super::{
    apply_ssealed_scaffold_to_repository, create_project_folder, create_project_group_folder,
    preview_ssealed_scaffold_for_repository,
};
use super::*;

#[test]
fn rollback_preserves_a_created_file_edited_after_creation() {
    let repository = tempfile::tempdir().expect("repository");
    let directory = repository.path().join("generated");
    fs::create_dir(&directory).unwrap();
    let modified_path = directory.join("modified.txt");
    let untouched_path = directory.join("untouched.txt");
    fs::write(&modified_path, "generated content").unwrap();
    fs::write(&untouched_path, "generated content").unwrap();
    fs::write(&modified_path, "user edit during scaffold apply").unwrap();

    rollback_ssealed_repository_apply(
        repository.path(),
        &[
            SsealedScaffoldApplyJournalFile {
                path: "generated/modified.txt".to_owned(),
                checksum: sha256_checksum("generated content"),
            },
            SsealedScaffoldApplyJournalFile {
                path: "generated/untouched.txt".to_owned(),
                checksum: sha256_checksum("generated content"),
            },
        ],
        &[directory.clone()],
    )
    .unwrap_or_else(|_| panic!("rollback"));

    assert_eq!(
        fs::read_to_string(&modified_path).expect("preserved user file"),
        "user edit during scaffold apply"
    );
    assert!(!untouched_path.exists());
    assert!(directory.is_dir());
}

#[test]
fn journal_recovery_refuses_a_linked_parent_outside_the_repository() {
    let repository = tempfile::tempdir().expect("repository");
    let external = tempfile::tempdir().expect("external directory");
    let target_path = fs::canonicalize(repository.path()).unwrap();
    let external_path = fs::canonicalize(external.path()).unwrap();
    let external_file = external_path.join("partial.txt");
    let content = "external content matching the generated checksum";
    fs::write(&external_file, content).unwrap();
    let link_path = target_path.join("generated");
    create_directory_link_for_test(&external_path, &link_path);
    let journal = SsealedScaffoldApplyJournal {
        version: SSEALED_SCAFFOLD_APPLY_JOURNAL_VERSION,
        manifest_checksum: "sha256:not-committed".to_owned(),
        files: vec![SsealedScaffoldApplyJournalFile {
            path: "generated/partial.txt".to_owned(),
            checksum: sha256_checksum(content),
        }],
    };
    let journal_path = write_ssealed_repository_apply_journal(&target_path, &journal)
        .unwrap_or_else(|_| panic!("journal write"));

    let result = recover_ssealed_repository_apply_journal(&target_path);

    assert!(matches!(result, Err(ProjectFolderError::Conflict)));
    assert_eq!(fs::read_to_string(&external_file).unwrap(), content);
    assert!(journal_path.is_file());
}

#[cfg(windows)]
fn create_directory_link_for_test(target: &Path, link: &Path) {
    let status = std::process::Command::new("cmd.exe")
        .args(["/D", "/C", "mklink", "/J"])
        .arg(link)
        .arg(target)
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .status()
        .expect("create test junction");
    assert!(status.success(), "create test junction");
}

#[cfg(unix)]
fn create_directory_link_for_test(target: &Path, link: &Path) {
    std::os::unix::fs::symlink(target, link).expect("create test directory link");
}
#[test]
fn repository_folder_can_include_ssealed_frontend_scaffold_without_backend_files() {
    let tempdir = tempfile::tempdir().expect("temporary workspace");
    let workspace_path = tempdir.path().to_string_lossy().into_owned();

    assert!(create_project_folder(workspace_path.clone(), "product".to_owned()).ok);
    assert!(
        create_project_group_folder(
            workspace_path.clone(),
            "projects/product".to_owned(),
            "apps".to_owned(),
            None,
            None,
        )
        .ok
    );

    let result = create_project_group_folder(
        workspace_path,
        "projects/product/apps".to_owned(),
        "web-app".to_owned(),
        Some("frontend".to_owned()),
        Some("generic".to_owned()),
    );

    assert!(result.ok);
    assert_eq!(
        result.relative_path.as_deref(),
        Some("projects/product/apps/web-app")
    );

    let repository_path = tempdir.path().join("projects/product/apps/web-app");
    assert!(repository_path.join("AGENTS.md").is_file());
    assert!(
        repository_path
            .join("docs/frontend/FRONTEND_DESIGN.md")
            .is_file()
    );
    assert!(!repository_path.join("docs/backend/README.md").exists());
    assert!(!repository_path.join("api/openapi.yaml").exists());
    assert!(!repository_path.join("db/schema.dbml").exists());

    let manifest_content = fs::read_to_string(repository_path.join(".ssealed/manifest.json"))
        .expect("ssealed manifest");
    let manifest: serde_json::Value =
        serde_json::from_str(&manifest_content).expect("valid manifest json");

    assert_eq!(manifest["tool"], "ssealed");
    assert_eq!(manifest["schemaVersion"], 1);
    assert_eq!(manifest["generatorVersion"], SSEALED_SCAFFOLD_TOOL_VERSION);
    assert_eq!(manifest["version"], SSEALED_SCAFFOLD_TOOL_VERSION);
    assert_eq!(manifest["generatedBy"], "workduck");
    assert_eq!(manifest["scope"], "frontend");
    assert_eq!(manifest["profile"], "generic");
    assert_eq!(manifest["density"], "standard");
    assert_eq!(manifest["runner"], "none");
    assert_eq!(manifest["addons"], serde_json::json!([]));
    assert!(manifest["files"].as_array().is_some_and(|files| {
        files
            .iter()
            .any(|file| file["path"] == "docs/frontend/FRONTEND_DESIGN.md")
            && !files
                .iter()
                .any(|file| file["path"] == "docs/backend/README.md")
            && files.iter().all(is_canonical_ssealed_manifest_file)
    }));
}

#[test]
fn repository_folder_can_include_ssealed_general_scaffold_for_unknown_stack() {
    let tempdir = tempfile::tempdir().expect("temporary workspace");
    let workspace_path = tempdir.path().to_string_lossy().into_owned();

    assert!(create_project_folder(workspace_path.clone(), "product".to_owned()).ok);
    assert!(
        create_project_group_folder(
            workspace_path.clone(),
            "projects/product".to_owned(),
            "apps".to_owned(),
            None,
            None,
        )
        .ok
    );

    let result = create_project_group_folder(
        workspace_path,
        "projects/product/apps".to_owned(),
        "idea".to_owned(),
        Some("general".to_owned()),
        Some("generic".to_owned()),
    );

    assert!(result.ok);

    let repository_path = tempdir.path().join("projects/product/apps/idea");
    assert!(
        repository_path
            .join("docs/product/00-product-brief.md")
            .is_file()
    );
    assert!(
        !repository_path
            .join("docs/frontend/FRONTEND_DESIGN.md")
            .exists()
    );
    assert!(!repository_path.join("api/openapi.yaml").exists());
    assert!(!repository_path.join("db/schema.dbml").exists());

    let manifest_content = fs::read_to_string(repository_path.join(".ssealed/manifest.json"))
        .expect("ssealed manifest");
    let manifest: serde_json::Value =
        serde_json::from_str(&manifest_content).expect("valid manifest json");

    assert_eq!(manifest["scope"], "general");
    assert_eq!(manifest["profile"], "generic");
    assert_eq!(manifest["density"], "standard");
    assert_eq!(manifest["runner"], "none");
}

#[test]
fn repository_folder_can_include_ssealed_api_service_profile() {
    let tempdir = tempfile::tempdir().expect("temporary workspace");
    let workspace_path = tempdir.path().to_string_lossy().into_owned();

    assert!(create_project_folder(workspace_path.clone(), "product".to_owned()).ok);
    assert!(
        create_project_group_folder(
            workspace_path.clone(),
            "projects/product".to_owned(),
            "apps".to_owned(),
            None,
            None,
        )
        .ok
    );

    let result = create_project_group_folder(
        workspace_path,
        "projects/product/apps".to_owned(),
        "api".to_owned(),
        Some("backend".to_owned()),
        Some("api-service".to_owned()),
    );

    assert!(result.ok);

    let repository_path = tempdir.path().join("projects/product/apps/api");
    assert!(repository_path.join("docs/backend/README.md").is_file());
    assert!(repository_path.join("docs/api-service/README.md").is_file());
    assert!(
        repository_path
            .join(".agents/skills/api-service/SKILL.md")
            .is_file()
    );
    assert!(!repository_path.join("docs/cli/README.md").exists());

    let manifest_content = fs::read_to_string(repository_path.join(".ssealed/manifest.json"))
        .expect("ssealed manifest");
    let manifest: serde_json::Value =
        serde_json::from_str(&manifest_content).expect("valid manifest json");

    assert_eq!(manifest["scope"], "backend");
    assert_eq!(manifest["profile"], "api-service");
    assert_eq!(manifest["density"], "standard");
    assert!(manifest["files"].as_array().is_some_and(|files| {
        files
            .iter()
            .any(|file| file["path"] == "docs/api-service/README.md")
            && files
                .iter()
                .any(|file| file["path"] == ".agents/skills/api-service/SKILL.md")
    }));
}

#[test]
fn ssealed_scaffold_does_not_write_into_existing_repository_folder() {
    let tempdir = tempfile::tempdir().expect("temporary workspace");
    let workspace_path = tempdir.path().to_string_lossy().into_owned();

    assert!(create_project_folder(workspace_path.clone(), "product".to_owned()).ok);
    assert!(
        create_project_group_folder(
            workspace_path.clone(),
            "projects/product".to_owned(),
            "apps".to_owned(),
            None,
            None,
        )
        .ok
    );
    assert!(
        create_project_group_folder(
            workspace_path.clone(),
            "projects/product/apps".to_owned(),
            "api".to_owned(),
            None,
            None,
        )
        .ok
    );

    let result = create_project_group_folder(
        workspace_path,
        "projects/product/apps".to_owned(),
        "api".to_owned(),
        Some("backend".to_owned()),
        Some("generic".to_owned()),
    );

    assert!(!result.ok);
    assert!(matches!(result.error, Some(ProjectFolderError::Conflict)));
    assert!(
        !tempdir
            .path()
            .join("projects/product/apps/api/.ssealed/manifest.json")
            .exists()
    );
}

#[test]
fn existing_repository_can_apply_missing_ssealed_files_without_overwriting_conflicts() {
    let tempdir = tempfile::tempdir().expect("temporary workspace");
    let workspace_path = tempdir.path().to_string_lossy().into_owned();

    assert!(create_project_folder(workspace_path.clone(), "product".to_owned()).ok);
    assert!(
        create_project_group_folder(
            workspace_path.clone(),
            "projects/product".to_owned(),
            "apps".to_owned(),
            None,
            None,
        )
        .ok
    );
    assert!(
        create_project_group_folder(
            workspace_path.clone(),
            "projects/product/apps".to_owned(),
            "api".to_owned(),
            None,
            None,
        )
        .ok
    );

    let repository_path = tempdir.path().join("projects/product/apps/api");
    fs::write(repository_path.join("AGENTS.md"), "custom instructions\n").expect("custom AGENTS");
    let repository_path_string = repository_path.to_string_lossy().into_owned();

    let preview = preview_ssealed_scaffold_for_repository(
        workspace_path.clone(),
        repository_path_string.clone(),
        "backend".to_owned(),
        Some("generic".to_owned()),
    );

    assert!(preview.ok);
    let preview_plan = preview.plan.expect("preview plan");
    assert!(preview_plan.missing_count > 0);
    assert!(preview_plan.conflict_count > 0);
    assert!(
        preview_plan
            .files
            .iter()
            .any(|file| file.path == "AGENTS.md" && file.status == "conflict")
    );
    assert!(!repository_path.join("docs/backend/README.md").exists());

    let apply = apply_ssealed_scaffold_to_repository(
        workspace_path,
        repository_path_string,
        "backend".to_owned(),
        Some("generic".to_owned()),
    );

    assert!(apply.ok);
    let apply_plan = apply.plan.expect("apply plan");
    assert!(apply_plan.added_count > 0);
    assert_eq!(apply_plan.missing_count, 0);
    assert!(
        apply_plan
            .files
            .iter()
            .any(|file| file.path == "AGENTS.md" && file.status == "conflict")
    );
    assert_eq!(
        fs::read_to_string(repository_path.join("AGENTS.md")).expect("AGENTS content"),
        "custom instructions\n"
    );
    assert!(repository_path.join("docs/backend/README.md").is_file());

    let manifest_content = fs::read_to_string(repository_path.join(".ssealed/manifest.json"))
        .expect("ssealed manifest");
    let manifest: serde_json::Value =
        serde_json::from_str(&manifest_content).expect("valid manifest json");

    assert_eq!(manifest["mode"], "existing-repository-missing-files");
    assert_eq!(manifest["schemaVersion"], 1);
    assert_eq!(manifest["generatorVersion"], SSEALED_SCAFFOLD_TOOL_VERSION);
    assert_eq!(manifest["version"], SSEALED_SCAFFOLD_TOOL_VERSION);
    assert_eq!(manifest["scope"], "backend");
    assert_eq!(manifest["profile"], "generic");
    assert_eq!(manifest["density"], "standard");
    assert_eq!(manifest["runner"], "none");
    assert_eq!(manifest["addons"], serde_json::json!([]));
    assert!(
        manifest["conflicts"]
            .as_array()
            .is_some_and(|conflicts| { conflicts.iter().any(|file| file["path"] == "AGENTS.md") })
    );
    assert!(manifest["files"].as_array().is_some_and(|files| {
        files
            .iter()
            .any(|file| file["path"] == "docs/backend/README.md")
            && files.iter().all(is_canonical_ssealed_manifest_file)
    }));
    assert!(
        !repository_path
            .join(SSEALED_SCAFFOLD_LOCK_FILE_NAME)
            .exists()
    );
}

#[test]
fn existing_repository_preview_and_apply_respect_active_ssealed_lock() {
    let tempdir = tempfile::tempdir().expect("temporary workspace");
    let workspace_path = tempdir.path().to_string_lossy().into_owned();

    assert!(create_project_folder(workspace_path.clone(), "product".to_owned()).ok);
    let repository_path = tempdir.path().join("projects/product");
    let repository_path_string = repository_path.to_string_lossy().into_owned();
    let scaffold_lock = match acquire_ssealed_scaffold_lock(&repository_path) {
        Ok(scaffold_lock) => scaffold_lock,
        Err(_) => panic!("active ssealed lock should be acquired"),
    };
    let preview = preview_ssealed_scaffold_for_repository(
        workspace_path.clone(),
        repository_path_string.clone(),
        "backend".to_owned(),
        Some("generic".to_owned()),
    );
    let apply = apply_ssealed_scaffold_to_repository(
        workspace_path.clone(),
        repository_path_string.clone(),
        "backend".to_owned(),
        Some("generic".to_owned()),
    );

    assert!(!preview.ok);
    assert!(matches!(
        preview.error,
        Some(ProjectFolderError::SsealedScaffoldLocked)
    ));
    assert!(!apply.ok);
    assert!(matches!(
        apply.error,
        Some(ProjectFolderError::SsealedScaffoldLocked)
    ));
    assert!(!repository_path.join(".ssealed/manifest.json").exists());

    drop(scaffold_lock);
    assert!(
        !repository_path
            .join(SSEALED_SCAFFOLD_LOCK_FILE_NAME)
            .exists()
    );

    let apply_after_unlock = apply_ssealed_scaffold_to_repository(
        workspace_path,
        repository_path_string,
        "backend".to_owned(),
        Some("generic".to_owned()),
    );

    assert!(apply_after_unlock.ok);
    assert!(repository_path.join(".ssealed/manifest.json").is_file());
    assert!(
        !repository_path
            .join(SSEALED_SCAFFOLD_LOCK_FILE_NAME)
            .exists()
    );
}

#[test]
fn ssealed_presence_lock_is_preserved_without_an_os_lock() {
    let repository = tempfile::tempdir().expect("repository");
    let lock_path = repository.path().join(SSEALED_SCAFFOLD_LOCK_FILE_NAME);
    let lock_content = r#"{
  "tool": "ssealed",
  "lockId": "ssealed-owner",
  "pid": 4242,
  "hostname": "another-host",
  "createdAt": "2026-08-11T00:00:00Z"
}"#;
    fs::write(&lock_path, lock_content).expect("ssealed presence lock");

    let result = acquire_ssealed_scaffold_lock(repository.path());

    assert!(matches!(
        result,
        Err(ProjectFolderError::SsealedScaffoldLocked)
    ));
    assert_eq!(
        fs::read_to_string(&lock_path).expect("preserved ssealed lock"),
        lock_content
    );
}

#[test]
fn ssealed_scaffold_lock_release_preserves_a_replacement_owner() {
    let repository = tempfile::tempdir().expect("repository");
    let lock_path = repository.path().join(SSEALED_SCAFFOLD_LOCK_FILE_NAME);
    let lock = acquire_ssealed_scaffold_lock(repository.path())
        .unwrap_or_else(|_| panic!("workduck lock should be acquired"));
    lock._file
        .unlock()
        .expect("release the OS lock for replacement");
    let metadata: serde_json::Value =
        serde_json::from_slice(&fs::read(&lock_path).expect("workduck lock metadata"))
            .expect("valid workduck lock metadata");
    assert_eq!(metadata["tool"], "workduck");
    assert!(
        metadata["lockId"]
            .as_str()
            .is_some_and(|lock_id| !lock_id.is_empty())
    );
    let replacement = r#"{"tool":"ssealed","lockId":"replacement-owner"}"#;
    fs::write(&lock_path, replacement).expect("replacement lock owner");
    drop(lock);

    assert_eq!(
        fs::read_to_string(&lock_path).expect("replacement lock preserved"),
        replacement
    );
}

#[test]
fn ssealed_scaffold_paths_reject_cross_platform_escape_shapes() {
    let root = Path::new("C:/workspace/project");
    for path in [
        "../outside",
        "a/../outside",
        "a/./file",
        "/absolute/file",
        r"C:\absolute\file",
        r"C:drive-relative\file",
        r"\\server\share\file",
        r"\\?\C:\namespace\file",
        r"a\..\outside",
        "CON.txt",
        "folder/trailing. ",
        "folder/name:stream",
    ] {
        assert!(
            resolve_ssealed_scaffold_file_path(root, path).is_err(),
            "unsafe scaffold path should be rejected: {path}"
        );
    }

    assert_eq!(
        resolve_ssealed_scaffold_file_path(root, "docs/backend/README.md")
            .unwrap_or_else(|_| panic!("portable path should resolve")),
        root.join("docs/backend/README.md")
    );
}

#[test]
fn ssealed_scaffold_lock_recovers_stale_metadata_without_manual_deletion() {
    let repository = tempfile::tempdir().expect("repository");
    let lock_path = repository.path().join(SSEALED_SCAFFOLD_LOCK_FILE_NAME);
    fs::write(&lock_path, r#"{"pid":999999,"createdAt":"stale"}"#).expect("stale lock metadata");

    let lock = acquire_ssealed_scaffold_lock(repository.path())
        .unwrap_or_else(|_| panic!("stale lock metadata should be recovered"));
    drop(lock);
    assert!(!lock_path.exists());
}

#[test]
fn existing_repository_scaffold_rolls_back_only_new_files_after_mid_commit_failure() {
    let repository = tempfile::tempdir().expect("repository");
    let target_path = fs::canonicalize(repository.path()).expect("canonical repository");
    let scaffold = find_ssealed_scaffold("backend", "generic").expect("backend scaffold");
    let preserved_file = &scaffold.files[0];
    create_ssealed_scaffold_parent_directories(&target_path, preserved_file.path)
        .unwrap_or_else(|_| panic!("preserved file parent should be created"));
    fs::write(
        resolve_ssealed_scaffold_file_path(&target_path, preserved_file.path)
            .unwrap_or_else(|_| panic!("preserved file path")),
        "user-owned content\n",
    )
    .expect("preserved file");
    let plan = create_ssealed_repository_scaffold_plan(
        &target_path,
        scaffold.scope,
        scaffold.profile,
        false,
    )
    .unwrap_or_else(|_| panic!("scaffold plan"));
    let missing_paths = plan
        .files
        .iter()
        .filter(|file| file.status == "missing")
        .map(|file| file.path.clone())
        .collect::<Vec<_>>();

    let result = apply_ssealed_repository_scaffold_plan(&target_path, scaffold, plan, Some(1));

    assert!(result.is_err());
    assert_eq!(
        fs::read_to_string(
            resolve_ssealed_scaffold_file_path(&target_path, preserved_file.path)
                .unwrap_or_else(|_| panic!("preserved file path"))
        )
        .expect("preserved content"),
        "user-owned content\n"
    );
    for missing_path in missing_paths {
        assert!(
            !resolve_ssealed_scaffold_file_path(&target_path, &missing_path)
                .unwrap_or_else(|_| panic!("missing file path"))
                .exists(),
            "new scaffold file should be rolled back: {missing_path}"
        );
    }
    assert!(!target_path.join(".ssealed/manifest.json").exists());
    assert!(
        !target_path
            .join(".ssealed")
            .join(SSEALED_SCAFFOLD_APPLY_JOURNAL_FILE_NAME)
            .exists()
    );
}

#[test]
fn stale_scaffold_apply_journal_removes_matching_partial_files() {
    let repository = tempfile::tempdir().expect("repository");
    let target_path = fs::canonicalize(repository.path()).expect("canonical repository");
    let relative_path = "generated/partial.txt";
    let partial_content = "partial generated content\n";
    create_ssealed_scaffold_parent_directories(&target_path, relative_path)
        .unwrap_or_else(|_| panic!("partial parent"));
    let partial_path = resolve_ssealed_scaffold_file_path(&target_path, relative_path)
        .unwrap_or_else(|_| panic!("partial path"));
    fs::write(&partial_path, partial_content).expect("partial file");
    let journal = SsealedScaffoldApplyJournal {
        version: SSEALED_SCAFFOLD_APPLY_JOURNAL_VERSION,
        manifest_checksum: "sha256:not-committed".to_string(),
        files: vec![SsealedScaffoldApplyJournalFile {
            path: relative_path.to_string(),
            checksum: sha256_checksum(partial_content),
        }],
    };
    let journal_path = write_ssealed_repository_apply_journal(&target_path, &journal)
        .unwrap_or_else(|_| panic!("journal write"));

    recover_ssealed_repository_apply_journal(&target_path)
        .unwrap_or_else(|_| panic!("journal recovery"));

    assert!(!partial_path.exists());
    assert!(!journal_path.exists());
}

fn is_canonical_ssealed_manifest_file(file: &serde_json::Value) -> bool {
    let path = file["path"].as_str().unwrap_or_default();
    let checksum = file["checksum"].as_str().unwrap_or_default();
    let expected_ownership = if path == ".gitignore" || path == "package.json" {
        "block-managed"
    } else {
        "seeded"
    };
    let expected_presence = if expected_ownership == "block-managed" {
        "required"
    } else {
        "optional"
    };

    !path.is_empty()
        && checksum.starts_with("sha256:")
        && file["ownership"] == expected_ownership
        && file["presence"] == expected_presence
        && file["status"] == "active"
        && file["initialChecksum"] == checksum
        && file["acceptedChecksum"] == checksum
        && file["generatedChecksum"] == checksum
}
