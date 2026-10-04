use super::*;
use crate::WORKDUCK_DIRECTORY_NAME;
use std::fs;

fn agent_evaluate_args(workspace_path: &Path, evaluation_key: &str) -> Vec<String> {
    [
        "agent".to_string(),
        "evaluate".to_string(),
        "agent-1".to_string(),
        "--workspace".to_string(),
        workspace_path.to_string_lossy().into_owned(),
        "--evaluation-key".to_string(),
        evaluation_key.to_string(),
        "--problem-understanding".to_string(),
        "5".to_string(),
        "--logical-validity".to_string(),
        "5".to_string(),
        "--practical-feasibility".to_string(),
        "5".to_string(),
        "--creative-insight".to_string(),
        "5".to_string(),
        "--risk-detection".to_string(),
        "5".to_string(),
        "--json".to_string(),
    ]
    .into_iter()
    .collect()
}

#[test]
fn concurrent_agent_evaluations_preserve_both_updates() {
    let workspace = tempfile::tempdir().expect("workspace");
    let workduck_path = workspace.path().join(WORKDUCK_DIRECTORY_NAME);
    fs::create_dir_all(&workduck_path).expect("workduck directory");
    fs::write(
        workduck_path.join("workspace.json"),
        serde_json::to_vec_pretty(&serde_json::json!({ "id": "workspace-1" }))
            .expect("workspace JSON"),
    )
    .expect("workspace write");
    fs::write(
        workduck_path.join(AGENTS_FILE_NAME),
        serde_json::to_vec_pretty(&serde_json::json!({
            "workspaceId": "workspace-1",
            "agents": [{ "id": "agent-1", "name": "Agent 1" }]
        }))
        .expect("agents JSON"),
    )
    .expect("agents write");

    let barrier = std::sync::Arc::new(std::sync::Barrier::new(3));
    let handles = ["evaluation-1", "evaluation-2"].map(|evaluation_key| {
        let barrier = std::sync::Arc::clone(&barrier);
        let args = agent_evaluate_args(workspace.path(), evaluation_key);

        std::thread::spawn(move || {
            barrier.wait();
            run_agent_evaluate_command(args).expect("concurrent evaluation");
        })
    });

    barrier.wait();
    for handle in handles {
        handle.join().expect("evaluation thread");
    }

    let registry: Value = read_json_file(
        &workduck_path.join(AGENTS_FILE_NAME),
        "agent-registry-invalid",
    )
    .expect("updated registry");
    let agent = &registry["agents"][0];

    assert_eq!(agent["evaluationSummary"]["totalCount"], 2);
    assert_eq!(agent["evaluationKeys"].as_array().map(Vec::len), Some(2));
}

fn evaluation_workspace() -> tempfile::TempDir {
    let workspace = tempfile::tempdir().expect("workspace");
    let directory = workspace.path().join(WORKDUCK_DIRECTORY_NAME);
    fs::create_dir_all(&directory).expect("registry directory");
    for (name, value) in [
        ("workspace.json", serde_json::json!({"id": "workspace-1"})),
        (
            AGENTS_FILE_NAME,
            serde_json::json!({
                "workspaceId": "workspace-1", "revision": 0,
                "agents": [{"id": "agent-1", "name": "Agent 1", "personaId": "persona-1"}]
            }),
        ),
        (
            PERSONAS_FILE_NAME,
            serde_json::json!({
                "workspaceId": "workspace-1", "revision": 0,
                "personas": [{"id": "persona-1", "name": "Persona 1"}]
            }),
        ),
    ] {
        fs::write(
            directory.join(name),
            serde_json::to_vec_pretty(&value).unwrap(),
        )
        .unwrap();
    }
    workspace
}

fn registry_bytes(workspace: &Path) -> (Vec<u8>, Vec<u8>) {
    (
        fs::read(workspace_data_path(workspace, AGENTS_FILE_NAME)).unwrap(),
        fs::read(workspace_data_path(workspace, PERSONAS_FILE_NAME)).unwrap(),
    )
}

fn run_evaluation_batch(workspace: &Path, evaluations: Value) -> Result<(), CliError> {
    let input = workspace.join("evaluation-input.json");
    fs::write(
        &input,
        serde_json::to_vec(&serde_json::json!({"evaluations": evaluations})).unwrap(),
    )
    .unwrap();
    run_agent_evaluate_batch_command(vec![
        "agent".into(),
        "evaluate-batch".into(),
        "--workspace".into(),
        workspace.to_string_lossy().into_owned(),
        "--input".into(),
        input.to_string_lossy().into_owned(),
        "--json".into(),
    ])
}

fn batch_item(key: &str, score: u8) -> Value {
    serde_json::json!({
        "agentId": "agent-1", "evaluationKey": key,
        "scores": {
            "problemUnderstanding": score, "logicalValidity": score,
            "practicalFeasibility": score, "creativeInsight": score, "riskDetection": score
        }
    })
}

#[test]
fn duplicate_single_evaluation_does_not_rewrite_registry_files() {
    let workspace = evaluation_workspace();
    run_agent_evaluate_command(agent_evaluate_args(workspace.path(), "same-key")).unwrap();
    let before = registry_bytes(workspace.path());
    run_agent_evaluate_command(agent_evaluate_args(workspace.path(), "same-key")).unwrap();
    assert_eq!(registry_bytes(workspace.path()), before);
}

#[test]
fn duplicate_evaluation_without_a_persona_registry_keeps_the_agent_snapshot() {
    let workspace = evaluation_workspace();
    fs::remove_file(workspace_data_path(workspace.path(), PERSONAS_FILE_NAME)).unwrap();
    run_agent_evaluate_command(agent_evaluate_args(workspace.path(), "same-key")).unwrap();
    let path = workspace_data_path(workspace.path(), AGENTS_FILE_NAME);
    let before = fs::read(&path).unwrap();
    run_agent_evaluate_command(agent_evaluate_args(workspace.path(), "same-key")).unwrap();
    assert!(fs::read(&path).unwrap() == before);
}

#[test]
fn duplicate_evaluation_repairs_a_stale_persona_without_advancing_agent_revision() {
    let workspace = evaluation_workspace();
    run_agent_evaluate_command(agent_evaluate_args(workspace.path(), "same-key")).unwrap();
    let agents_before = registry_bytes(workspace.path()).0;
    let personas_path = workspace_data_path(workspace.path(), PERSONAS_FILE_NAME);
    let mut personas: Value = read_json_file(&personas_path, "persona-registry-invalid").unwrap();
    personas["personas"][0]["evaluationSummary"] = serde_json::json!({});
    fs::write(&personas_path, serde_json::to_vec(&personas).unwrap()).unwrap();
    run_agent_evaluate_command(agent_evaluate_args(workspace.path(), "same-key")).unwrap();
    let personas: Value = read_json_file(&personas_path, "persona-registry-invalid").unwrap();
    assert!(registry_bytes(workspace.path()).0 == agents_before);
    assert_eq!(personas["revision"], 2);
    assert_eq!(
        personas["personas"][0]["evaluationSummary"]["totalCount"],
        1
    );
}

#[test]
fn duplicate_batch_does_not_rewrite_but_new_evaluations_commit_once() {
    let workspace = evaluation_workspace();
    run_evaluation_batch(
        workspace.path(),
        serde_json::json!([batch_item("existing", 5)]),
    )
    .unwrap();
    let before = registry_bytes(workspace.path());
    run_evaluation_batch(
        workspace.path(),
        serde_json::json!([batch_item("existing", 5)]),
    )
    .unwrap();
    assert_eq!(registry_bytes(workspace.path()), before);
    run_evaluation_batch(
        workspace.path(),
        serde_json::json!([batch_item("existing", 5), batch_item("new", 6)]),
    )
    .unwrap();
    let (agents, personas) = registry_bytes(workspace.path());
    let agents: Value = serde_json::from_slice(&agents).unwrap();
    let personas: Value = serde_json::from_slice(&personas).unwrap();
    assert_eq!(agents["revision"], 2);
    assert_eq!(personas["revision"], 2);
    assert_eq!(agents["agents"][0]["evaluationSummary"]["totalCount"], 2);
    assert_eq!(
        personas["personas"][0]["evaluationSummary"]["criteria"]["riskDetection"]["scoreSum"],
        11
    );
}

#[test]
fn an_invalid_later_batch_item_keeps_both_registries_unchanged() {
    let workspace = evaluation_workspace();
    let before = registry_bytes(workspace.path());
    let error = run_evaluation_batch(
        workspace.path(),
        serde_json::json!([batch_item("valid", 5), batch_item("invalid", 0)]),
    )
    .unwrap_err();
    assert_eq!(error.code, "agent-evaluation-score-invalid");
    assert_eq!(registry_bytes(workspace.path()), before);
}

#[test]
fn maximum_summary_counts_normalize_without_panicking() {
    let summary = serde_json::json!({
        "totalCount": u64::MAX,
        "criteria": {"riskDetection": {"count": u64::MAX, "scoreSum": u64::MAX}}
    });
    let normalized = read_evaluation_summary_snapshot(Some(&summary));
    assert_eq!(normalized.total_count, u64::MAX);
    assert_eq!(normalized.score_sums[4], u64::MAX);
}

#[test]
fn saturated_agent_summary_returns_an_error_without_writing() {
    for summary in [
        serde_json::json!({"totalCount": u64::MAX}),
        serde_json::json!({"criteria": {"riskDetection": {"count": u64::MAX}}}),
        serde_json::json!({"criteria": {"riskDetection": {"scoreSum": u64::MAX}}}),
    ] {
        let workspace = evaluation_workspace();
        let agents_path = workspace_data_path(workspace.path(), AGENTS_FILE_NAME);
        let mut registry: Value = read_json_file(&agents_path, "agent-registry-invalid").unwrap();
        registry["agents"][0]["evaluationSummary"] = summary;
        fs::write(&agents_path, serde_json::to_vec(&registry).unwrap()).unwrap();
        let before = registry_bytes(workspace.path());
        let error = run_agent_evaluate_command(agent_evaluate_args(workspace.path(), "overflow"))
            .unwrap_err();
        assert_eq!(error.code, "agent-registry-invalid");
        assert!(registry_bytes(workspace.path()) == before);
    }
}

#[test]
fn overflowing_persona_totals_return_an_error_without_mutating_personas() {
    let agents = serde_json::json!({
        "workspaceId": "workspace-1", "agents": [
            {"id": "first", "personaId": "persona-1", "evaluationSummary": {"totalCount": u64::MAX}},
            {"id": "second", "personaId": "persona-1", "evaluationSummary": {"totalCount": 1}}
        ]
    });
    let mut personas = serde_json::json!({
        "workspaceId": "workspace-1", "personas": [{"id": "persona-1"}]
    });
    let before = personas.clone();
    let error =
        sync_persona_evaluation_summaries_from_agents(&mut personas, &agents, "workspace-1")
            .unwrap_err();
    assert_eq!(error.code, "agent-registry-invalid");
    assert_eq!(personas, before);
}
