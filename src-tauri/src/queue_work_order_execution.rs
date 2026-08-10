use std::{
    env, fs,
    fs::{File, OpenOptions},
    io::{self, Read, Seek, Write},
    path::{Path, PathBuf},
};

use serde::Serialize;
use sha2::{Digest, Sha256};

use crate::{
    atomic_file_write::{AtomicFileWriteError, write_file_atomically},
    path_display::display_path,
    queue_execution::{
        QueueExecutionErrorDetail, QueueResultReport, QueueWorkOrder, validate_work_order,
        validate_work_order_execution_limits, write_result_report,
    },
    queue_limits::QUEUE_FILE_MAX_BYTES,
};

const QUEUE_DIRECTORY_NAME: &str = "queue";
const WORK_ORDERS_DIRECTORY_NAME: &str = "work-orders";
const WORK_ORDER_FILE_SUFFIX: &str = ".workduck-work-order.json";
const EXECUTION_LOCK_DIRECTORY_NAME: &str = "workduck-queue-execution-locks";
const EXECUTION_LOCK_MARKER: &str = "workduck.queue-execution-lock/v1\n";

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum QueueWorkOrderCompletion {
    Archive,
    KeepActive,
}

pub struct QueueWorkOrderExecution {
    lock_file: File,
    workspace_path: PathBuf,
    work_order_path: PathBuf,
    work_order: QueueWorkOrder,
    finalized: bool,
}

pub struct QueueWorkOrderExecutionSuccess {
    pub work_order: QueueWorkOrder,
    pub report_path: PathBuf,
    pub report_relative_path: String,
}

impl QueueWorkOrderExecution {
    pub fn work_order(&self) -> &QueueWorkOrder {
        &self.work_order
    }

    pub fn complete(
        mut self,
        report: &QueueResultReport,
        completion: QueueWorkOrderCompletion,
    ) -> Result<QueueWorkOrderExecutionSuccess, QueueExecutionErrorDetail> {
        let report_path = write_result_report(&self.workspace_path, report)?;
        let next_status = match completion {
            QueueWorkOrderCompletion::Archive => "archived",
            QueueWorkOrderCompletion::KeepActive => "active",
        };
        let completed_work_order = self.transition_to(next_status);

        if let Err(error) = write_work_order(&self.work_order_path, &completed_work_order) {
            let _ = fs::remove_file(&report_path);
            return Err(error);
        }

        self.work_order = completed_work_order.clone();
        self.finalized = true;
        clear_lock_marker(&mut self.lock_file);

        Ok(QueueWorkOrderExecutionSuccess {
            work_order: completed_work_order,
            report_relative_path: relative_queue_path(&self.workspace_path, &report_path)?,
            report_path,
        })
    }

    pub fn fail(mut self) -> Result<QueueWorkOrder, QueueExecutionErrorDetail> {
        let failed_work_order = self.transition_to("failed");
        write_work_order(&self.work_order_path, &failed_work_order)?;
        self.work_order = failed_work_order.clone();
        self.finalized = true;
        clear_lock_marker(&mut self.lock_file);
        Ok(failed_work_order)
    }

    fn transition_to(&self, status: &str) -> QueueWorkOrder {
        let mut work_order = self.work_order.clone();
        work_order.status = status.to_string();
        work_order
    }
}

impl Drop for QueueWorkOrderExecution {
    fn drop(&mut self) {
        if self.finalized {
            return;
        }

        let failed_work_order = self.transition_to("failed");
        if write_work_order(&self.work_order_path, &failed_work_order).is_ok() {
            self.work_order = failed_work_order;
            self.finalized = true;
            clear_lock_marker(&mut self.lock_file);
        }
    }
}

pub fn begin_queue_work_order_execution(
    workspace_path: &Path,
    work_order_relative_path: &str,
    requested_id: &str,
) -> Result<QueueWorkOrderExecution, QueueExecutionErrorDetail> {
    let workspace_path = canonicalize_queue_workspace(workspace_path)?;
    let work_order_path = resolve_work_order_path(&workspace_path, work_order_relative_path)?;
    begin_queue_work_order_execution_at(&workspace_path, &work_order_path, requested_id)
}

pub fn begin_queue_work_order_execution_at(
    workspace_path: &Path,
    work_order_path: &Path,
    requested_id: &str,
) -> Result<QueueWorkOrderExecution, QueueExecutionErrorDetail> {
    let workspace_path = canonicalize_queue_workspace(workspace_path)?;
    let work_order_path = canonicalize_work_order_path(&workspace_path, work_order_path)?;
    let (mut lock_file, interrupted_execution_marker) = acquire_execution_lock(&work_order_path)?;
    let mut work_order = read_work_order(&work_order_path)?;

    match validate_work_order(&work_order, requested_id) {
        Ok(()) => {}
        Err(error) if error.code == "work-order-running" && interrupted_execution_marker => {}
        Err(error) => return Err(error),
    }
    validate_work_order_execution_limits(&work_order)?;

    write_lock_marker(&mut lock_file, EXECUTION_LOCK_MARKER)?;
    work_order.status = "running".to_string();
    write_work_order(&work_order_path, &work_order)?;

    Ok(QueueWorkOrderExecution {
        lock_file,
        workspace_path,
        work_order_path,
        work_order,
        finalized: false,
    })
}

fn acquire_execution_lock(
    work_order_path: &Path,
) -> Result<(File, bool), QueueExecutionErrorDetail> {
    let lock_root = env::temp_dir().join(EXECUTION_LOCK_DIRECTORY_NAME);
    fs::create_dir_all(&lock_root).map_err(|error| {
        execution_io_error("work-order-lock-failed", &lock_root, error)
    })?;

    let lock_name = format!("{}.lock", hex_digest(work_order_path.as_os_str().to_string_lossy().as_bytes()));
    let lock_path = lock_root.join(lock_name);
    reject_symlink(&lock_path)?;
    let lock_file = OpenOptions::new()
        .read(true)
        .write(true)
        .create(true)
        .open(&lock_path)
        .map_err(|error| execution_io_error("work-order-lock-failed", &lock_path, error))?;

    match lock_file.try_lock() {
        Ok(()) => {
            let marker = read_lock_marker(&lock_file)?;
            Ok((lock_file, marker == EXECUTION_LOCK_MARKER))
        }
        Err(std::fs::TryLockError::WouldBlock) => Err(
            QueueExecutionErrorDetail::new("work-order-running", "이미 실행 중인 작업 지시서입니다."),
        ),
        Err(std::fs::TryLockError::Error(error)) => Err(execution_io_error(
            "work-order-lock-failed",
            &lock_path,
            error,
        )),
    }
}

fn read_lock_marker(lock_file: &File) -> Result<String, QueueExecutionErrorDetail> {
    let mut lock_file = lock_file.try_clone().map_err(|error| {
        QueueExecutionErrorDetail::new("work-order-lock-failed", error.to_string())
    })?;
    lock_file.seek(io::SeekFrom::Start(0)).map_err(|error| {
        QueueExecutionErrorDetail::new("work-order-lock-failed", error.to_string())
    })?;
    let mut marker = String::new();
    lock_file.read_to_string(&mut marker).map_err(|error| {
        QueueExecutionErrorDetail::new("work-order-lock-failed", error.to_string())
    })?;
    Ok(marker)
}

fn write_lock_marker(
    lock_file: &mut File,
    marker: &str,
) -> Result<(), QueueExecutionErrorDetail> {
    lock_file.set_len(0).map_err(lock_marker_error)?;
    lock_file
        .seek(io::SeekFrom::Start(0))
        .and_then(|_| lock_file.write_all(marker.as_bytes()))
        .and_then(|_| lock_file.sync_all())
        .map_err(lock_marker_error)
}

fn clear_lock_marker(lock_file: &mut File) {
    let _ = lock_file.set_len(0);
    let _ = lock_file.sync_all();
}

fn lock_marker_error(error: io::Error) -> QueueExecutionErrorDetail {
    QueueExecutionErrorDetail::new("work-order-lock-failed", error.to_string())
}

pub(crate) fn canonicalize_queue_workspace(
    workspace_path: &Path,
) -> Result<PathBuf, QueueExecutionErrorDetail> {
    let workspace_path = fs::canonicalize(workspace_path).map_err(|error| {
        execution_io_error("workspace-path-invalid", workspace_path, error)
    })?;

    if !workspace_path.is_dir() {
        return Err(QueueExecutionErrorDetail::new(
            "workspace-path-invalid",
            "워크스페이스 경로가 디렉터리가 아닙니다.",
        ));
    }

    Ok(workspace_path)
}

fn resolve_work_order_path(
    workspace_path: &Path,
    work_order_relative_path: &str,
) -> Result<PathBuf, QueueExecutionErrorDetail> {
    let normalized = work_order_relative_path.replace('\\', "/");
    let relative_path = Path::new(&normalized);

    if relative_path.is_absolute()
        || relative_path
            .components()
            .any(|component| !matches!(component, std::path::Component::Normal(_)))
    {
        return Err(invalid_work_order_path());
    }

    canonicalize_work_order_path(workspace_path, &workspace_path.join(QUEUE_DIRECTORY_NAME).join(relative_path))
}

fn canonicalize_work_order_path(
    workspace_path: &Path,
    work_order_path: &Path,
) -> Result<PathBuf, QueueExecutionErrorDetail> {
    reject_symlink(work_order_path)?;
    let work_order_path = fs::canonicalize(work_order_path).map_err(|error| {
        execution_io_error("work-order-file-invalid", work_order_path, error)
    })?;
    let queue_path = workspace_path.join(QUEUE_DIRECTORY_NAME);
    reject_symlink(&queue_path)?;
    let expected_parent = queue_path.join(WORK_ORDERS_DIRECTORY_NAME);
    reject_symlink(&expected_parent)?;
    let expected_parent = fs::canonicalize(&expected_parent).map_err(|error| {
        execution_io_error("work-order-file-invalid", &expected_parent, error)
    })?;

    validate_canonical_work_order_path(workspace_path, &work_order_path, &expected_parent)?;

    Ok(work_order_path)
}

fn validate_canonical_work_order_path(
    workspace_path: &Path,
    work_order_path: &Path,
    expected_parent: &Path,
) -> Result<(), QueueExecutionErrorDetail> {
    let valid_suffix = work_order_path
        .file_name()
        .and_then(|name| name.to_str())
        .is_some_and(|name| name.ends_with(WORK_ORDER_FILE_SUFFIX));

    if !expected_parent.starts_with(workspace_path)
        || work_order_path.parent() != Some(expected_parent)
        || !valid_suffix
    {
        return Err(invalid_work_order_path());
    }

    Ok(())
}

fn read_work_order(path: &Path) -> Result<QueueWorkOrder, QueueExecutionErrorDetail> {
    let metadata = fs::metadata(path)
        .map_err(|error| execution_io_error("work-order-file-read-failed", path, error))?;
    if metadata.len() > QUEUE_FILE_MAX_BYTES {
        return Err(QueueExecutionErrorDetail::new(
            "work-order-file-too-large",
            format!(
                "작업 지시서 파일이 허용 크기인 {}바이트를 초과했습니다: {}",
                QUEUE_FILE_MAX_BYTES,
                display_path(path)
            ),
        ));
    }

    let content = fs::read_to_string(path)
        .map_err(|error| execution_io_error("work-order-file-read-failed", path, error))?;
    serde_json::from_str(&content).map_err(|_| {
        QueueExecutionErrorDetail::new(
            "work-order-invalid",
            format!("작업 지시서 JSON을 해석하지 못했습니다: {}", display_path(path)),
        )
    })
}

fn write_work_order(
    path: &Path,
    work_order: &QueueWorkOrder,
) -> Result<(), QueueExecutionErrorDetail> {
    let content = pretty_json(work_order)?;
    write_file_atomically(path, &content).map_err(|error| {
        let message = match error {
            AtomicFileWriteError::TargetInvalid => "작업 지시서 파일 경로가 올바르지 않습니다.",
            AtomicFileWriteError::TargetAlreadyExists => "작업 지시서 파일을 교체하지 못했습니다.",
            AtomicFileWriteError::WriteFailed => "작업 지시서 상태를 안전하게 저장하지 못했습니다.",
        };
        QueueExecutionErrorDetail::new("work-order-file-write-failed", message)
    })
}

fn pretty_json<T: Serialize>(value: &T) -> Result<String, QueueExecutionErrorDetail> {
    serde_json::to_string_pretty(value)
        .map(|content| format!("{content}\n"))
        .map_err(|_| {
            QueueExecutionErrorDetail::new("json-serialize-failed", "JSON으로 변환하지 못했습니다.")
        })
}

fn relative_queue_path(
    workspace_path: &Path,
    path: &Path,
) -> Result<String, QueueExecutionErrorDetail> {
    path.strip_prefix(workspace_path.join(QUEUE_DIRECTORY_NAME))
        .map(|relative| relative.to_string_lossy().replace('\\', "/"))
        .map_err(|_| {
            QueueExecutionErrorDetail::new(
                "report-path-invalid",
                "결과 보고서가 워크스페이스 밖에 생성되었습니다.",
            )
        })
}

fn reject_symlink(path: &Path) -> Result<(), QueueExecutionErrorDetail> {
    if fs::symlink_metadata(path)
        .map(|metadata| metadata.file_type().is_symlink())
        .unwrap_or(false)
    {
        return Err(QueueExecutionErrorDetail::new(
            "work-order-file-invalid",
            "심볼릭 링크는 작업 실행 파일로 사용할 수 없습니다.",
        ));
    }
    Ok(())
}

fn invalid_work_order_path() -> QueueExecutionErrorDetail {
    QueueExecutionErrorDetail::new(
        "work-order-file-invalid",
        "작업 지시서 경로가 queue/work-orders 바로 아래 파일이 아닙니다.",
    )
}

fn execution_io_error(code: &'static str, path: &Path, error: io::Error) -> QueueExecutionErrorDetail {
    QueueExecutionErrorDetail::new(code, format!("{}: {error}", display_path(path)))
}

fn hex_digest(value: &[u8]) -> String {
    let digest = Sha256::digest(value);
    digest.iter().map(|byte| format!("{byte:02x}")).collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::queue_execution::QueueEntityRef;

    #[test]
    fn execution_lock_blocks_a_second_owner_and_releases_on_drop() {
        let fixture = WorkOrderFixture::new("active");
        let first = begin_queue_work_order_execution_at(
            fixture.workspace.path(),
            &fixture.work_order_path,
            "wo_test",
        )
        .expect("first execution");

        let duplicate = match begin_queue_work_order_execution_at(
            fixture.workspace.path(),
            &fixture.work_order_path,
            "wo_test",
        ) {
            Ok(_) => panic!("duplicate execution must be rejected"),
            Err(error) => error,
        };
        assert_eq!(duplicate.code, "work-order-running");

        drop(first);

        let retry = begin_queue_work_order_execution_at(
            fixture.workspace.path(),
            &fixture.work_order_path,
            "wo_test",
        )
        .expect("released execution can be retried");
        drop(retry);
    }

    #[test]
    fn canonical_work_order_parent_must_remain_inside_workspace() {
        let workspace = tempfile::tempdir().expect("workspace");
        let external = tempfile::tempdir().expect("external directory");
        let external_work_orders = external.path().join(WORK_ORDERS_DIRECTORY_NAME);
        fs::create_dir_all(&external_work_orders).expect("external work-orders directory");
        let work_order_path = external_work_orders.join("outside.workduck-work-order.json");
        fs::write(&work_order_path, "{}").expect("external work order");

        let workspace_path = fs::canonicalize(workspace.path()).expect("canonical workspace");
        let work_order_path = fs::canonicalize(work_order_path).expect("canonical work order");
        let expected_parent =
            fs::canonicalize(external_work_orders).expect("canonical external parent");
        let error = validate_canonical_work_order_path(
            &workspace_path,
            &work_order_path,
            &expected_parent,
        )
        .expect_err("external canonical parent must be rejected");

        assert_eq!(error.code, "work-order-file-invalid");
    }

    #[test]
    fn oversized_work_order_is_rejected_before_json_parsing() {
        let tempdir = tempfile::tempdir().expect("temporary workspace");
        let work_order_path = tempdir.path().join("oversized.workduck-work-order.json");
        fs::write(&work_order_path, vec![b' '; 1_048_577]).expect("oversized work order fixture");

        let error = match read_work_order(&work_order_path) {
            Ok(_) => panic!("oversized work order must fail"),
            Err(error) => error,
        };

        assert_eq!(error.code, "work-order-file-too-large");
    }

    #[test]
    fn interrupted_execution_is_persisted_as_failed() {
        let fixture = WorkOrderFixture::new("active");
        let execution = begin_queue_work_order_execution_at(
            fixture.workspace.path(),
            &fixture.work_order_path,
            "wo_test",
        )
        .expect("execution starts");
        assert_eq!(fixture.read().status, "running");

        drop(execution);

        assert_eq!(fixture.read().status, "failed");
    }

    #[test]
    fn a_stale_running_state_is_recovered_when_no_process_holds_the_lock() {
        let fixture = WorkOrderFixture::new("running");
        let canonical_work_order_path = fs::canonicalize(&fixture.work_order_path)
            .expect("canonical work order path");
        let (mut lock_file, _) = acquire_execution_lock(&canonical_work_order_path)
            .expect("interrupted execution lock");
        write_lock_marker(&mut lock_file, EXECUTION_LOCK_MARKER)
            .expect("interrupted execution marker");
        drop(lock_file);
        let execution = begin_queue_work_order_execution_at(
            fixture.workspace.path(),
            &fixture.work_order_path,
            "wo_test",
        )
        .expect("stale running execution is recovered");

        assert_eq!(execution.work_order().status, "running");
        drop(execution);
        assert_eq!(fixture.read().status, "failed");
    }

    #[test]
    fn legacy_running_state_without_a_lock_marker_is_not_stolen() {
        let fixture = WorkOrderFixture::new("running");

        let error = match begin_queue_work_order_execution_at(
            fixture.workspace.path(),
            &fixture.work_order_path,
            "wo_test",
        ) {
            Ok(_) => panic!("unmarked running state must remain owned"),
            Err(error) => error,
        };

        assert_eq!(error.code, "work-order-running");
        assert_eq!(fixture.read().status, "running");
    }

    #[test]
    fn successful_execution_writes_the_report_before_archiving_the_work_order() {
        let fixture = WorkOrderFixture::new("active");
        let execution = begin_queue_work_order_execution_at(
            fixture.workspace.path(),
            &fixture.work_order_path,
            "wo_test",
        )
        .expect("execution starts");
        let report = test_report();

        let success = execution
            .complete(&report, QueueWorkOrderCompletion::Archive)
            .expect("execution completes");

        assert_eq!(success.work_order.status, "archived");
        assert_eq!(fixture.read().status, "archived");
        assert!(success.report_path.is_file());
        assert!(success.report_relative_path.starts_with("reports/"));
    }

    #[test]
    fn keep_active_completion_preserves_explicit_cli_rerun_behavior() {
        let fixture = WorkOrderFixture::new("active");
        let execution = begin_queue_work_order_execution_at(
            fixture.workspace.path(),
            &fixture.work_order_path,
            "wo_test",
        )
        .expect("execution starts");

        execution
            .complete(&test_report(), QueueWorkOrderCompletion::KeepActive)
            .expect("execution completes");

        assert_eq!(fixture.read().status, "active");
    }

    fn test_report() -> QueueResultReport {
        QueueResultReport {
            schema_version: "workduck.queue-result-report/v1",
            r#ref: QueueEntityRef {
                id: "report_test".to_string(),
                kind: "queue-result-report".to_string(),
                label: "Test report".to_string(),
            },
            status: "active",
            created_at: "2026-07-13T00:00:00Z".to_string(),
            agent_name: "Test agent".to_string(),
            source_work_order: QueueEntityRef {
                id: "wo_test".to_string(),
                kind: "queue-work-order".to_string(),
                label: "Test".to_string(),
            },
            tasks: Vec::new(),
        }
    }

    struct WorkOrderFixture {
        workspace: tempfile::TempDir,
        work_order_path: PathBuf,
    }

    impl WorkOrderFixture {
        fn new(status: &str) -> Self {
            let workspace = tempfile::tempdir().expect("workspace");
            let work_orders = workspace.path().join("queue").join("work-orders");
            fs::create_dir_all(&work_orders).expect("work-orders directory");
            let work_order_path = work_orders.join("test.workduck-work-order.json");
            let work_order = QueueWorkOrder {
                schema_version: "workduck.queue-work-order/v1".to_string(),
                r#ref: QueueEntityRef {
                    id: "wo_test".to_string(),
                    kind: "queue-work-order".to_string(),
                    label: "Test".to_string(),
                },
                status: status.to_string(),
                created_at: "2026-07-13T00:00:00Z".to_string(),
                tasks: Vec::new(),
            };
            write_work_order(&work_order_path, &work_order).expect("fixture work order");
            Self {
                workspace,
                work_order_path,
            }
        }

        fn read(&self) -> QueueWorkOrder {
            read_work_order(&self.work_order_path).expect("work order")
        }
    }
}
