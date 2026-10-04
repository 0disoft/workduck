// llmnav/1 module
// id=workduck.queue.evaluation-delegation-native
// role=Recognize evaluator work orders and reject a second delegation for the same source report.
// owns=evaluation delegation identity|source report uniqueness|self-update exclusion
// excludes=Queue command responses|general artifact I/O|agent execution
// search=duplicate evaluation delegation|source report evaluator skill|delegation self update
// invariant=A matching evaluator source report may have only one delegation; updating that same file stays allowed.
// stability=architecture
// /llmnav
use std::{fs, path::Path};

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

        let relative_path = format!("{WORK_ORDERS_DIRECTORY_NAME}/{file_name}");

        if current_relative_path == Some(relative_path.as_str()) {
            continue;
        }

        let existing_content =
            fs::read_to_string(entry.path()).map_err(|_| QueueFolderError::FileReadFailed)?;

        if read_evaluation_delegation_source_report_id(&existing_content).as_deref()
            == Some(source_report_id.as_str())
        {
            return Err(QueueFolderError::EvaluationDelegationAlreadyExists);
        }
    }

    Ok(())
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
