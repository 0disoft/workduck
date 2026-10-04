// llmnav/1 module
// id=workduck.queue.evaluation-delegation-native
// role=Recognize evaluator work orders and reject a second delegation for the same source report.
// owns=evaluation delegation identity|bounded duplicate scan|source report uniqueness|self-update exclusion
// excludes=Queue command responses|general artifact I/O|agent execution
// search=duplicate evaluation delegation|source report evaluator skill|delegation self update
// invariant=A matching evaluator source report may have only one delegation; updating that same file stays allowed, and duplicate scans honor Queue file size and count limits.
// stability=architecture
// /llmnav
use std::{fs, io::Read, path::Path};

use crate::queue_limits::{QUEUE_FILE_MAX_BYTES, QUEUE_FOLDER_MAX_FILES};

use super::contracts::{QueueFolderError, WORK_ORDER_FILE_SUFFIX, WORK_ORDERS_DIRECTORY_NAME};

const AGENT_RESPONSE_EVALUATOR_SKILL_ID: &str = "workduck.skill.agent-response-evaluator";

pub(super) fn ensure_unique_evaluation_delegation(
    queue_root: &Path,
    current_relative_path: Option<&str>,
    content: &str,
) -> Result<(), QueueFolderError> {
    let Some(source_report_id) = read_evaluation_delegation_source_report_id(content) else {
        return Ok(());
    };

    let work_orders_dir = queue_root.join(WORK_ORDERS_DIRECTORY_NAME);
    let entries = fs::read_dir(&work_orders_dir).map_err(|_| QueueFolderError::FileReadFailed)?;
    let mut inspected_work_orders = 0;

    for entry in entries {
        let entry = entry.map_err(|_| QueueFolderError::FileReadFailed)?;
        let metadata = entry
            .metadata()
            .map_err(|_| QueueFolderError::FileReadFailed)?;

        if !metadata.is_file() {
            continue;
        }

        let file_name = entry.file_name().to_string_lossy().into_owned();

        if !file_name.ends_with(WORK_ORDER_FILE_SUFFIX) {
            continue;
        }

        inspected_work_orders += 1;
        if inspected_work_orders > QUEUE_FOLDER_MAX_FILES {
            return Err(QueueFolderError::FileReadFailed);
        }

        let relative_path = format!("{WORK_ORDERS_DIRECTORY_NAME}/{file_name}");

        if current_relative_path == Some(relative_path.as_str()) {
            continue;
        }

        let existing_content = read_bounded_work_order(&entry.path())?;

        if read_evaluation_delegation_source_report_id(&existing_content).as_deref()
            == Some(source_report_id.as_str())
        {
            return Err(QueueFolderError::EvaluationDelegationAlreadyExists);
        }
    }

    Ok(())
}

fn read_bounded_work_order(path: &Path) -> Result<String, QueueFolderError> {
    let file = fs::File::open(path).map_err(|_| QueueFolderError::FileReadFailed)?;
    if file
        .metadata()
        .map_err(|_| QueueFolderError::FileReadFailed)?
        .len()
        > QUEUE_FILE_MAX_BYTES
    {
        return Err(QueueFolderError::FileReadFailed);
    }
    let mut content = String::new();
    file.take(QUEUE_FILE_MAX_BYTES + 1)
        .read_to_string(&mut content)
        .map_err(|_| QueueFolderError::FileReadFailed)?;
    if content.len() as u64 > QUEUE_FILE_MAX_BYTES {
        return Err(QueueFolderError::FileReadFailed);
    }
    Ok(content)
}

fn read_evaluation_delegation_source_report_id(content: &str) -> Option<String> {
    let value: serde_json::Value = serde_json::from_str(content).ok()?;
    let source_report = value.get("sourceReport")?.as_object()?;

    if source_report.get("kind")?.as_str()? != "queue-result-report" {
        return None;
    }

    if !work_order_has_evaluator_skill(&value) {
        return None;
    }

    let id = source_report.get("id")?.as_str()?.trim();

    if id.is_empty() {
        return None;
    }

    Some(id.to_string())
}

fn work_order_has_evaluator_skill(value: &serde_json::Value) -> bool {
    value
        .get("tasks")
        .and_then(serde_json::Value::as_array)
        .map(|tasks| {
            tasks.iter().any(|task| {
                task.get("skillIds")
                    .and_then(serde_json::Value::as_array)
                    .map(|skill_ids| {
                        skill_ids.iter().any(|skill_id| {
                            skill_id.as_str() == Some(AGENT_RESPONSE_EVALUATOR_SKILL_ID)
                        })
                    })
                    .unwrap_or(false)
            })
        })
        .unwrap_or(false)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{
        path::PathBuf,
        time::{SystemTime, UNIX_EPOCH},
    };

    #[test]
    fn detects_evaluation_delegation_source_report() {
        let content = evaluation_delegation_content("queue-result-report_source");

        assert_eq!(
            read_evaluation_delegation_source_report_id(&content).as_deref(),
            Some("queue-result-report_source")
        );
    }

    #[test]
    fn ignores_non_evaluator_work_order_with_source_report() {
        let content = r#"{
            "schemaVersion": "workduck.queue-work-order/v1",
            "sourceReport": {
                "id": "queue-result-report_source",
                "kind": "queue-result-report",
                "label": "Source"
            },
            "tasks": [
                {
                    "id": "task_1",
                    "title": "Follow-up",
                    "body": "Do the work.",
                    "skillIds": ["workduck.skill.proposal-writer"]
                }
            ]
        }"#;

        assert_eq!(read_evaluation_delegation_source_report_id(content), None);
    }

    #[test]
    fn blocks_duplicate_evaluation_delegation_for_same_source_report() {
        let queue_root = create_test_queue_root();
        let existing_file = queue_root
            .join(WORK_ORDERS_DIRECTORY_NAME)
            .join("existing.workduck-work-order.json");
        let content = evaluation_delegation_content("queue-result-report_source");

        fs::write(&existing_file, &content).expect("existing evaluation delegation fixture");

        let result = ensure_unique_evaluation_delegation(&queue_root, None, &content);

        fs::remove_dir_all(&queue_root).ok();

        assert_eq!(
            result,
            Err(QueueFolderError::EvaluationDelegationAlreadyExists)
        );
    }

    #[test]
    fn allows_updating_the_existing_evaluation_delegation_file() {
        let queue_root = create_test_queue_root();
        let existing_file = queue_root
            .join(WORK_ORDERS_DIRECTORY_NAME)
            .join("existing.workduck-work-order.json");
        let content = evaluation_delegation_content("queue-result-report_source");

        fs::write(&existing_file, &content).expect("existing evaluation delegation fixture");

        let result = ensure_unique_evaluation_delegation(
            &queue_root,
            Some("work-orders/existing.workduck-work-order.json"),
            &content,
        );

        fs::remove_dir_all(&queue_root).ok();

        assert_eq!(result, Ok(()));
    }

    #[test]
    fn oversized_existing_work_order_blocks_delegation_update_without_changing_target() {
        let workspace = tempfile::tempdir().expect("test workspace");
        let workspace_path = workspace.path().to_string_lossy().into_owned();
        let initial = "{}";
        let target_name = "target.workduck-work-order.json";
        let created = crate::queue_folder::write_queue_work_order_file(
            workspace_path.clone(),
            target_name.into(),
            initial.into(),
        );
        assert!(created.ok);
        let work_orders = workspace
            .path()
            .join("queue")
            .join(WORK_ORDERS_DIRECTORY_NAME);
        let oversized = fs::File::create(work_orders.join("oversized.workduck-work-order.json"))
            .expect("oversized work-order fixture");
        oversized
            .set_len(QUEUE_FILE_MAX_BYTES + 1)
            .expect("oversized fixture length");
        drop(oversized);

        let result = crate::queue_folder::update_queue_work_order_file(
            workspace_path,
            format!("{WORK_ORDERS_DIRECTORY_NAME}/{target_name}"),
            evaluation_delegation_content("source"),
        );

        assert_eq!(result.error, Some(QueueFolderError::FileReadFailed));
        assert_eq!(
            fs::read_to_string(work_orders.join(target_name)).expect("unchanged target"),
            initial
        );
    }

    #[test]
    fn delegation_scan_stops_at_the_work_order_count_limit() {
        let queue_root = create_test_queue_root();
        for index in 0..=QUEUE_FOLDER_MAX_FILES {
            fs::write(
                queue_root
                    .join(WORK_ORDERS_DIRECTORY_NAME)
                    .join(format!("{index}{WORK_ORDER_FILE_SUFFIX}")),
                "{}",
            )
            .expect("work-order count fixture");
        }
        let result = ensure_unique_evaluation_delegation(
            &queue_root,
            None,
            &evaluation_delegation_content("source"),
        );
        fs::remove_dir_all(queue_root).expect("count fixture cleanup");
        assert_eq!(result, Err(QueueFolderError::FileReadFailed));
    }

    #[test]
    fn concurrent_delegation_creates_accept_only_one_source_report() {
        let workspace = tempfile::tempdir().expect("concurrent workspace");
        let workspace_path = workspace.path().to_string_lossy().into_owned();
        assert!(crate::queue_folder::ensure_queue_folder(workspace_path.clone()).ok);
        let barrier = std::sync::Barrier::new(8);
        let results = std::thread::scope(|scope| {
            let handles = (0..8)
                .map(|index| {
                    let workspace_path = &workspace_path;
                    let barrier = &barrier;
                    scope.spawn(move || {
                        barrier.wait();
                        crate::queue_folder::write_queue_work_order_file(
                            workspace_path.clone(),
                            format!("{index}{WORK_ORDER_FILE_SUFFIX}"),
                            evaluation_delegation_content("concurrent-source"),
                        )
                    })
                })
                .collect::<Vec<_>>();
            handles
                .into_iter()
                .map(|handle| handle.join().expect("writer thread"))
                .collect::<Vec<_>>()
        });
        assert_eq!(results.iter().filter(|result| result.ok).count(), 1);
        assert!(results.iter().filter(|result| !result.ok).all(
            |result| result.error == Some(QueueFolderError::EvaluationDelegationAlreadyExists)
        ));
        assert_eq!(
            fs::read_dir(
                workspace
                    .path()
                    .join("queue")
                    .join(WORK_ORDERS_DIRECTORY_NAME)
            )
            .expect("saved work orders")
            .count(),
            1
        );
    }

    #[test]
    fn concurrent_delegation_update_and_create_accept_only_one_source_report() {
        let workspace = tempfile::tempdir().expect("concurrent workspace");
        let workspace_path = workspace.path().to_string_lossy().into_owned();
        assert!(
            crate::queue_folder::write_queue_work_order_file(
                workspace_path.clone(),
                "target.workduck-work-order.json".into(),
                "{}".into(),
            )
            .ok
        );
        let barrier = std::sync::Barrier::new(8);
        let results = std::thread::scope(|scope| {
            let handles = (0..8)
                .map(|index| {
                    let workspace_path = &workspace_path;
                    let barrier = &barrier;
                    scope.spawn(move || {
                        barrier.wait();
                        let content = evaluation_delegation_content("concurrent-source");
                        if index == 0 {
                            crate::queue_folder::update_queue_work_order_file(
                                workspace_path.clone(),
                                "work-orders/target.workduck-work-order.json".into(),
                                content,
                            )
                        } else {
                            crate::queue_folder::write_queue_work_order_file(
                                workspace_path.clone(),
                                format!("{index}{WORK_ORDER_FILE_SUFFIX}"),
                                content,
                            )
                        }
                    })
                })
                .collect::<Vec<_>>();
            handles
                .into_iter()
                .map(|handle| handle.join().expect("writer thread"))
                .collect::<Vec<_>>()
        });
        assert_eq!(results.iter().filter(|result| result.ok).count(), 1);
        let work_orders = workspace
            .path()
            .join("queue")
            .join(WORK_ORDERS_DIRECTORY_NAME);
        let delegated = fs::read_dir(work_orders)
            .expect("saved work orders")
            .map(|entry| {
                fs::read_to_string(entry.expect("work order").path()).expect("work order content")
            })
            .filter(|content| {
                read_evaluation_delegation_source_report_id(content).as_deref()
                    == Some("concurrent-source")
            })
            .count();
        assert_eq!(delegated, 1);
    }

    fn create_test_queue_root() -> PathBuf {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system time")
            .as_nanos();
        let queue_root = std::env::temp_dir().join(format!("workduck-queue-folder-test-{unique}"));

        fs::create_dir_all(queue_root.join(WORK_ORDERS_DIRECTORY_NAME)).expect("work-orders dir");
        fs::canonicalize(&queue_root).expect("canonical queue root")
    }

    fn evaluation_delegation_content(source_report_id: &str) -> String {
        format!(
            r#"{{
                "schemaVersion": "workduck.queue-work-order/v1",
                "sourceReport": {{
                    "id": "{source_report_id}",
                    "kind": "queue-result-report",
                    "label": "Source"
                }},
                "tasks": [
                    {{
                        "id": "task_1",
                        "title": "Evaluation delegation",
                        "body": "workduck agent evaluate-batch --workspace . --input result.json",
                        "skillIds": ["{AGENT_RESPONSE_EVALUATOR_SKILL_ID}"]
                    }}
                ]
            }}"#
        )
    }
}
