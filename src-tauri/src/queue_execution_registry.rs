use std::{
    collections::HashMap,
    path::Path,
    sync::{Mutex, OnceLock},
};

use futures_util::future::AbortHandle;

use crate::queue_execution::QueueExecutionErrorDetail;

static RUNNING_QUEUE_EXECUTIONS: OnceLock<Mutex<HashMap<String, RunningQueueExecution>>> =
    OnceLock::new();

#[derive(Debug)]
pub struct QueueExecutionGuard {
    execution_id: String,
}

#[derive(Debug, Default)]
struct RunningQueueExecution {
    workspace_identity: String,
    work_order_id: String,
    abort_handles: Vec<AbortHandle>,
    cancel_requested: bool,
}

impl Drop for QueueExecutionGuard {
    fn drop(&mut self) {
        if let Ok(mut executions) = running_queue_executions().lock() {
            executions.remove(&self.execution_id);
        }
    }
}

pub fn acquire_queue_execution(
    execution_id: &str,
    workspace_path: &Path,
    work_order_id: &str,
) -> Result<QueueExecutionGuard, QueueExecutionErrorDetail> {
    let execution_id = normalize_execution_id(execution_id)?;
    let work_order_id = normalize_work_order_id(work_order_id)?;
    let workspace_identity = workspace_identity(workspace_path);
    let mut executions = lock_running_queue_executions()?;

    if executions.contains_key(execution_id) {
        return Err(QueueExecutionErrorDetail::new(
            "execution-id-running",
            "이미 사용 중인 실행 ID입니다.",
        ));
    }
    if executions.values().any(|execution| {
        execution.workspace_identity == workspace_identity
            && execution.work_order_id == work_order_id
    }) {
        return Err(QueueExecutionErrorDetail::new(
            "work-order-running",
            "이미 실행 중인 작업 지시서입니다.",
        ));
    }

    executions.insert(
        execution_id.to_string(),
        RunningQueueExecution {
            workspace_identity,
            work_order_id: work_order_id.to_string(),
            ..RunningQueueExecution::default()
        },
    );

    Ok(QueueExecutionGuard {
        execution_id: execution_id.to_string(),
    })
}

pub fn register_queue_execution_abort_handle(
    execution_id: &str,
    abort_handle: AbortHandle,
) -> Result<(), QueueExecutionErrorDetail> {
    let execution_id = normalize_execution_id(execution_id)?;
    let mut executions = lock_running_queue_executions()?;
    let Some(execution) = executions.get_mut(execution_id) else {
        return Err(execution_not_running());
    };

    if execution.cancel_requested {
        abort_handle.abort();
    }
    execution.abort_handles.push(abort_handle);

    Ok(())
}

pub fn cancel_running_queue_execution(
    execution_id: &str,
) -> Result<(), QueueExecutionErrorDetail> {
    let execution_id = normalize_execution_id(execution_id)?;
    let mut executions = lock_running_queue_executions()?;
    let Some(execution) = executions.get_mut(execution_id) else {
        return Err(execution_not_running());
    };

    execution.cancel_requested = true;
    for abort_handle in &execution.abort_handles {
        abort_handle.abort();
    }

    Ok(())
}

pub fn running_queue_work_order_ids(
    workspace_path: &Path,
    work_order_ids: &[String],
) -> Result<Vec<String>, QueueExecutionErrorDetail> {
    let workspace_identity = workspace_identity(workspace_path);
    let executions = lock_running_queue_executions()?;
    let mut running_ids = Vec::new();

    for work_order_id in work_order_ids {
        let work_order_id = work_order_id.trim();
        if work_order_id.is_empty()
            || running_ids.iter().any(|running_id| running_id == work_order_id)
            || !executions.values().any(|execution| {
                execution.workspace_identity == workspace_identity
                    && execution.work_order_id == work_order_id
            })
        {
            continue;
        }

        running_ids.push(work_order_id.to_string());
    }

    Ok(running_ids)
}

fn normalize_execution_id(execution_id: &str) -> Result<&str, QueueExecutionErrorDetail> {
    let execution_id = execution_id.trim();
    let bytes = execution_id.as_bytes();
    let valid = bytes.len() == 36
        && bytes.iter().enumerate().all(|(index, byte)| match index {
            8 | 13 | 18 | 23 => *byte == b'-',
            _ => byte.is_ascii_hexdigit(),
        });

    if !valid {
        return Err(QueueExecutionErrorDetail::new(
            "execution-id-invalid",
            "실행 ID 형식이 올바르지 않습니다.",
        ));
    }

    Ok(execution_id)
}

fn normalize_work_order_id(work_order_id: &str) -> Result<&str, QueueExecutionErrorDetail> {
    let work_order_id = work_order_id.trim();
    if work_order_id.is_empty() {
        return Err(QueueExecutionErrorDetail::new(
            "work-order-invalid",
            "작업 지시서 ID가 비어 있습니다.",
        ));
    }

    Ok(work_order_id)
}

fn workspace_identity(workspace_path: &Path) -> String {
    let identity = workspace_path.as_os_str().to_string_lossy().into_owned();

    #[cfg(windows)]
    {
        identity.to_lowercase()
    }

    #[cfg(not(windows))]
    {
        identity
    }
}

fn running_queue_executions() -> &'static Mutex<HashMap<String, RunningQueueExecution>> {
    RUNNING_QUEUE_EXECUTIONS.get_or_init(|| Mutex::new(HashMap::new()))
}

fn lock_running_queue_executions(
) -> Result<std::sync::MutexGuard<'static, HashMap<String, RunningQueueExecution>>, QueueExecutionErrorDetail>
{
    running_queue_executions().lock().map_err(|_| {
        QueueExecutionErrorDetail::new(
            "agent-execution-failed",
            "작업 실행 상태를 확인하지 못했습니다.",
        )
    })
}

fn execution_not_running() -> QueueExecutionErrorDetail {
    QueueExecutionErrorDetail::new(
        "work-order-not-running",
        "실행 중인 작업 지시서를 찾지 못했습니다.",
    )
}

#[cfg(test)]
mod tests {
    use std::sync::atomic::{AtomicU64, Ordering};

    use super::*;

    static TEST_EXECUTION_SEQUENCE: AtomicU64 = AtomicU64::new(1);

    #[test]
    fn same_work_order_id_can_run_in_different_workspaces() {
        let first_workspace = tempfile::tempdir().expect("first workspace");
        let second_workspace = tempfile::tempdir().expect("second workspace");
        let first = acquire_queue_execution(
            &test_execution_id(),
            first_workspace.path(),
            "wo_shared",
        )
        .expect("first workspace execution");
        let second = acquire_queue_execution(
            &test_execution_id(),
            second_workspace.path(),
            "wo_shared",
        )
        .expect("second workspace execution");

        drop(first);
        drop(second);
    }

    #[test]
    fn same_workspace_and_work_order_rejects_duplicate_execution() {
        let workspace = tempfile::tempdir().expect("workspace");
        let first = acquire_queue_execution(&test_execution_id(), workspace.path(), "wo_shared")
            .expect("first execution");
        let error = acquire_queue_execution(&test_execution_id(), workspace.path(), "wo_shared")
            .expect_err("duplicate work order execution");

        assert_eq!(error.code, "work-order-running");
        drop(first);
    }

    #[test]
    fn cancellation_uses_execution_id_and_aborts_registered_handles() {
        let workspace = tempfile::tempdir().expect("workspace");
        let execution_id = test_execution_id();
        let guard = acquire_queue_execution(&execution_id, workspace.path(), "wo_cancel")
            .expect("execution guard");
        let (abort_handle, _abort_registration) = AbortHandle::new_pair();
        let abort_handle_for_assertion = abort_handle.clone();

        register_queue_execution_abort_handle(&execution_id, abort_handle)
            .expect("register abort handle");
        cancel_running_queue_execution(&execution_id).expect("cancel execution");

        assert!(abort_handle_for_assertion.is_aborted());
        drop(guard);
    }

    #[test]
    fn abort_handle_registered_after_cancel_is_aborted_immediately() {
        let workspace = tempfile::tempdir().expect("workspace");
        let execution_id = test_execution_id();
        let guard = acquire_queue_execution(&execution_id, workspace.path(), "wo_cancel")
            .expect("execution guard");
        let (abort_handle, _abort_registration) = AbortHandle::new_pair();
        let abort_handle_for_assertion = abort_handle.clone();

        cancel_running_queue_execution(&execution_id).expect("cancel execution");
        register_queue_execution_abort_handle(&execution_id, abort_handle)
            .expect("late abort handle registration");

        assert!(abort_handle_for_assertion.is_aborted());
        drop(guard);
    }

    #[test]
    fn released_execution_id_is_not_running() {
        let workspace = tempfile::tempdir().expect("workspace");
        let execution_id = test_execution_id();
        let guard = acquire_queue_execution(&execution_id, workspace.path(), "wo_release")
            .expect("execution guard");
        drop(guard);

        let error = cancel_running_queue_execution(&execution_id)
            .expect_err("released execution must not be cancellable");

        assert_eq!(error.code, "work-order-not-running");
    }

    #[test]
    fn running_lookup_is_scoped_to_workspace() {
        let first_workspace = tempfile::tempdir().expect("first workspace");
        let second_workspace = tempfile::tempdir().expect("second workspace");
        let guard = acquire_queue_execution(
            &test_execution_id(),
            first_workspace.path(),
            "wo_shared",
        )
        .expect("execution guard");
        let requested = vec!["wo_shared".to_string()];

        assert_eq!(
            running_queue_work_order_ids(first_workspace.path(), &requested)
                .expect("first workspace lookup"),
            requested
        );
        assert!(
            running_queue_work_order_ids(second_workspace.path(), &requested)
                .expect("second workspace lookup")
                .is_empty()
        );
        drop(guard);
    }

    #[test]
    fn malformed_execution_id_is_rejected() {
        let workspace = tempfile::tempdir().expect("workspace");
        let error = acquire_queue_execution("wo_not_an_execution", workspace.path(), "wo_shared")
            .expect_err("malformed execution id");

        assert_eq!(error.code, "execution-id-invalid");
    }

    fn test_execution_id() -> String {
        let sequence = TEST_EXECUTION_SEQUENCE.fetch_add(1, Ordering::Relaxed);
        format!("00000000-0000-4000-8000-{sequence:012x}")
    }
}
