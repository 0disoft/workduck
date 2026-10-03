use super::planning::resolve_agent_linked_secret;
use super::*;
use crate::queue_execution_identity::unique_token;
use crate::queue_prompt_builder::{create_work_order_user_prompt_blocks, queue_prompt_labels};
use crate::queue_response_parser::{parse_structured_agent_response, parse_vote_ballot};
use crate::queue_result_report::create_success_report_task;

fn vote_spec() -> QueueVoteSpec {
    QueueVoteSpec {
        question: "Pick a framework".to_string(),
        options: vec![
            QueueVoteOption {
                id: "astro".to_string(),
                label: "Astro".to_string(),
                description: None,
            },
            QueueVoteOption {
                id: "svelte".to_string(),
                label: "Svelte".to_string(),
                description: None,
            },
        ],
        criteria: Vec::new(),
        response_kind: None,
    }
}

#[test]
fn unique_token_adds_sequence_entropy() {
    let mut tokens = std::collections::HashSet::new();

    for _ in 0..1024 {
        assert!(tokens.insert(unique_token()));
    }
}

#[test]
fn vote_parser_prefers_fenced_json_over_prose_braces() {
    let content = r#"I considered option {A}, then chose:
```json
{"choiceId":"svelte","reason":"better fit","risks":["team familiarity"]}
```
"#;

    let ballot = parse_vote_ballot(content, &vote_spec());

    assert_eq!(ballot.parse_status, "parsed");
    assert_eq!(ballot.choice_id, "svelte");
    assert_eq!(ballot.reason, "better fit");
    assert_eq!(ballot.risks, vec!["team familiarity"]);
}

#[test]
fn vote_parser_scans_until_a_valid_choice_object() {
    let content = r#"
{"choiceId":"ember","reason":"not available"}
Final answer:
{"choiceId":"astro","reason":"static content fit","risks":[]}
"#;

    let ballot = parse_vote_ballot(content, &vote_spec());

    assert_eq!(ballot.parse_status, "parsed");
    assert_eq!(ballot.choice_id, "astro");
    assert_eq!(ballot.reason, "static content fit");
}

#[test]
fn vote_parser_keeps_invalid_choice_visible_when_no_valid_choice_exists() {
    let content = r#"{"choiceId":"ember","reason":"unsupported option","risks":[]}"#;

    let ballot = parse_vote_ballot(content, &vote_spec());

    assert_eq!(ballot.parse_status, "invalid-choice");
    assert_eq!(ballot.choice_id, "ember");
}

#[test]
fn work_order_prompt_includes_a_structured_response_format() {
    let task = QueueWorkOrderTask {
        id: "task_1".to_string(),
        kind: None,
        title: "에이전트 참모진들 의견참고".to_string(),
        body: "플랫폼 대안을 검토해줘".to_string(),
        priority: Some("normal".to_string()),
        response_language: Some("ko".to_string()),
        response_format: Some("pros-cons".to_string()),
        project_ids: Vec::new(),
        agent_ids: Vec::new(),
        skill_ids: Vec::new(),
        reference_ids: Vec::new(),
        vote: None,
    };

    let prompt =
        create_work_order_user_prompt_blocks(&task, queue_prompt_labels(QueueReportLanguage::Ko))
            .join("\n");

    assert!(prompt.contains("응답 형식:"));
    assert!(prompt.contains("형식: 장단점 분석"));
    assert!(prompt.contains(r#""summary""#));
    assert!(prompt.contains(r#""strengths""#));
    assert!(prompt.contains(r#""recommendations""#));
    assert!(prompt.contains(r#""cautions""#));
    assert!(prompt.contains("첫 문자는 여는 중괄호(`{`), 마지막 문자는 닫는 중괄호(`}`)"));
    assert!(prompt.contains("응답 형식 위반"));
    assert!(prompt.contains("<tool_call>"));
    assert!(prompt.contains("세 개의 백틱 뒤에 json"));
}

#[test]
fn work_order_system_prompt_disallows_fake_tool_use() {
    let run = AgentExecutionRun {
        task: QueueWorkOrderTask {
            id: "task_1".to_string(),
            kind: None,
            title: "릴리스 판단".to_string(),
            body: "파일명을 판단해줘".to_string(),
            priority: Some("normal".to_string()),
            response_language: Some("ko".to_string()),
            response_format: Some("decision-memo".to_string()),
            project_ids: Vec::new(),
            agent_ids: Vec::new(),
            skill_ids: Vec::new(),
            reference_ids: Vec::new(),
            vote: None,
        },
        agent: AgentRecord {
            id: "agent_1".to_string(),
            name: "테스트 에이전트".to_string(),
            environment_secret_id: None,
            persona_id: None,
            execution_provider: Some("openrouter".to_string()),
            model_id: Some("test/model".to_string()),
        },
        secret: ResolvedSecret {
            name: "OPENROUTER_API_KEY".to_string(),
            tags: Vec::new(),
            value: "secret".to_string(),
        },
        persona: None,
        provider: "openrouter".to_string(),
        model: "test/model".to_string(),
        skills: Vec::new(),
        references: Vec::new(),
    };
    let prompt_plan = create_agent_prompt_plan(&run.task);
    let prompt = create_system_prompt(&run, &prompt_plan);

    assert!(prompt.contains("cannot run commands"));
    assert!(prompt.contains("Use only the task text and selected context"));
    assert!(prompt.contains("Do not pretend to call tools"));
}

#[test]
fn prompt_previews_share_selected_context_without_resolving_secrets() {
    let work_order = QueueWorkOrder {
        schema_version: "workduck.queue-work-order/v1".to_string(),
        r#ref: QueueEntityRef {
            id: "work_order_1".to_string(),
            kind: "queue-work-order".to_string(),
            label: "릴리스 판단".to_string(),
        },
        status: "active".to_string(),
        created_at: "2026-05-27T00:00:00Z".to_string(),
        tasks: vec![QueueWorkOrderTask {
            id: "task_1".to_string(),
            kind: None,
            title: "릴리스 판단".to_string(),
            body: "릴리스해도 되는지 검토해줘".to_string(),
            priority: Some("normal".to_string()),
            response_language: Some("ko".to_string()),
            response_format: Some("decision-memo".to_string()),
            project_ids: Vec::new(),
            agent_ids: vec!["agent_1".to_string(), "agent_2".to_string()],
            skill_ids: vec!["skill_1".to_string()],
            reference_ids: vec!["reference_1".to_string()],
            vote: None,
        }],
    };
    let first_agent = AgentRecord {
        id: "agent_1".to_string(),
        name: "검토 에이전트".to_string(),
        environment_secret_id: Some("missing-secret".to_string()),
        persona_id: Some("persona_1".to_string()),
        execution_provider: Some("openrouter".to_string()),
        model_id: Some("test/model".to_string()),
    };
    let second_agent = AgentRecord {
        id: "agent_2".to_owned(),
        name: "추가 검토 에이전트".to_owned(),
        ..first_agent.clone()
    };
    let agents = vec![first_agent, second_agent];
    let personas = vec![PersonaRecord {
        id: "persona_1".to_string(),
        description: "꼼꼼한 리뷰어".to_string(),
        instructions: "근거를 먼저 확인한다.".to_string(),
        styles: Value::Null,
        spectrums: Value::Null,
    }];
    let skills = vec![SkillRecord {
        id: "skill_1".to_string(),
        name: "Release review".to_string(),
        instructions: "릴리스 위험을 확인한다.".to_string(),
    }];
    let references = vec![ReferenceRecord {
        id: "reference_1".to_string(),
        title: "Release notes".to_string(),
        content: "변경 사항 요약".to_string(),
        source_url: "https://example.com/release".to_string(),
        tags: vec!["release".to_string()],
    }];

    let (previews, estimate) =
        create_prompt_preview_plan(&work_order, &agents, &personas, &skills, &references)
            .expect("prompt previews");

    assert_eq!(previews.len(), 2);
    assert_eq!(estimate.request_count, 2);
    assert_eq!(estimate.maximum_provider_attempt_count, 6);
    assert!(estimate.estimated_input_tokens > 0);
    assert_eq!(
        estimate.maximum_estimated_input_tokens,
        estimate.estimated_input_tokens * 3
    );
    assert_eq!(estimate.confirmation_token.len(), 64);
    assert_eq!(previews[0].agent_name, "검토 에이전트");
    assert!(previews[0].system_prompt.contains("검토 에이전트"));
    assert!(previews[0].system_prompt.contains("근거를 먼저 확인한다."));
    assert!(
        previews[0]
            .user_prompt
            .contains("릴리스해도 되는지 검토해줘")
    );
    assert!(previews[0].user_prompt.contains("Release review"));
    assert!(previews[0].user_prompt.contains("변경 사항 요약"));
    assert!(!previews[0].system_prompt.contains("missing-secret"));
    assert!(!previews[0].user_prompt.contains("missing-secret"));
    assert_eq!(previews[1].agent_name, "추가 검토 에이전트");
    assert!(previews[1].system_prompt.contains("추가 검토 에이전트"));
    assert!(previews[1].system_prompt.contains("근거를 먼저 확인한다."));
    assert_eq!(previews[1].user_prompt, previews[0].user_prompt);
    assert!(!previews[1].system_prompt.contains("missing-secret"));
}

#[test]
fn prompt_preview_reports_missing_agent() {
    let work_order = QueueWorkOrder {
        schema_version: "workduck.queue-work-order/v1".to_string(),
        r#ref: QueueEntityRef {
            id: "work_order_1".to_string(),
            kind: "queue-work-order".to_string(),
            label: "릴리스 판단".to_string(),
        },
        status: "active".to_string(),
        created_at: "2026-05-27T00:00:00Z".to_string(),
        tasks: vec![QueueWorkOrderTask {
            id: "task_1".to_string(),
            kind: None,
            title: "릴리스 판단".to_string(),
            body: "릴리스해도 되는지 검토해줘".to_string(),
            priority: Some("normal".to_string()),
            response_language: Some("ko".to_string()),
            response_format: Some("decision-memo".to_string()),
            project_ids: Vec::new(),
            agent_ids: vec!["agent_missing".to_string()],
            skill_ids: Vec::new(),
            reference_ids: Vec::new(),
            vote: None,
        }],
    };

    let error = create_prompt_previews(&work_order, &[], &[], &[], &[]).expect_err("missing agent");

    assert_eq!(error.code, "agent-not-found");
}

#[test]
fn linked_secret_resolution_keeps_unlinked_agents_on_environment_fallback_path() {
    let agent = AgentRecord {
        id: "agent_1".to_string(),
        name: "Env fallback agent".to_string(),
        environment_secret_id: None,
        persona_id: None,
        execution_provider: Some("openrouter".to_string()),
        model_id: Some("openrouter/auto".to_string()),
    };

    let linked_secret = resolve_agent_linked_secret(&agent, None).expect("unlinked agent is valid");

    assert!(linked_secret.is_none());
}

#[test]
fn execution_run_rejects_missing_linked_secret_before_environment_fallback() {
    let work_order = QueueWorkOrder {
        schema_version: "workduck.queue-work-order/v1".to_string(),
        r#ref: QueueEntityRef {
            id: "work_order_1".to_string(),
            kind: "queue-work-order".to_string(),
            label: "Secret lookup".to_string(),
        },
        status: "active".to_string(),
        created_at: "2026-06-20T00:00:00Z".to_string(),
        tasks: vec![QueueWorkOrderTask {
            id: "task_1".to_string(),
            kind: None,
            title: "Secret lookup".to_string(),
            body: "Run with the linked key".to_string(),
            priority: Some("normal".to_string()),
            response_language: Some("en".to_string()),
            response_format: Some("general".to_string()),
            project_ids: Vec::new(),
            agent_ids: vec!["agent_1".to_string()],
            skill_ids: Vec::new(),
            reference_ids: Vec::new(),
            vote: None,
        }],
    };
    let agents = vec![AgentRecord {
        id: "agent_1".to_string(),
        name: "Linked secret agent".to_string(),
        environment_secret_id: Some("missing-secret".to_string()),
        persona_id: None,
        execution_provider: Some("openrouter".to_string()),
        model_id: Some("openrouter/auto".to_string()),
    }];
    let vault = EnvironmentVault {
        workspace_id: "workspace_1".to_string(),
        secrets: Vec::new(),
    };

    let error = match create_execution_runs(&work_order, &agents, Some(&vault), &[], &[], &[]) {
        Ok(_) => panic!("missing linked secret should not fall back to environment variables"),
        Err(error) => error,
    };

    assert_eq!(error.code, "agent-secret-not-found");
}

#[test]
fn work_order_prompt_accepts_bug_analysis_response_format() {
    let task = QueueWorkOrderTask {
        id: "task_1".to_string(),
        kind: None,
        title: "버그 분석".to_string(),
        body: "오류 원인을 분석해줘".to_string(),
        priority: Some("normal".to_string()),
        response_language: Some("ko".to_string()),
        response_format: Some("bug-analysis".to_string()),
        project_ids: Vec::new(),
        agent_ids: Vec::new(),
        skill_ids: Vec::new(),
        reference_ids: Vec::new(),
        vote: None,
    };

    let prompt =
        create_work_order_user_prompt_blocks(&task, queue_prompt_labels(QueueReportLanguage::Ko))
            .join("\n");

    assert!(prompt.contains("형식: 버그 분석"));
    assert!(prompt.contains("재현 조건 또는 회귀 위험"));
}

#[test]
fn structured_response_parser_prefers_json_over_wrapping_text() {
    let content = r#"
Here is my answer:
```json
{"summary":"Astro fits best","strengths":["Static content"],"recommendations":["Prototype Astro"],"cautions":["Team familiarity"]}
```
"#;

    let response = parse_structured_agent_response(content, QueueReportLanguage::En)
        .expect("structured response");

    assert_eq!(response.summary, "Astro fits best");
    assert_eq!(response.strengths, vec!["Static content"]);
    assert_eq!(response.recommendations, vec!["Prototype Astro"]);
    assert_eq!(response.cautions, vec!["Team familiarity"]);
}

#[test]
fn structured_response_parser_accepts_korean_section_response() {
    let content = r#"
판단
en-US 표기는 한국어 지원 앱을 영어 전용처럼 보이게 합니다.

장점
- 일반 사용자의 오해 가능성을 줄일 수 있습니다.
- 주 다운로드 대상을 명확히 할 수 있습니다.

결론
- setup.exe를 기본 다운로드로 안내하세요.

위험
- 기존 링크를 확인해야 합니다.
"#;

    let response = parse_structured_agent_response(content, QueueReportLanguage::Ko)
        .expect("structured response");

    assert_eq!(
        response.summary,
        "en-US 표기는 한국어 지원 앱을 영어 전용처럼 보이게 합니다."
    );
    assert_eq!(
        response.strengths,
        vec![
            "일반 사용자의 오해 가능성을 줄일 수 있습니다.",
            "주 다운로드 대상을 명확히 할 수 있습니다."
        ]
    );
    assert_eq!(
        response.recommendations,
        vec!["setup.exe를 기본 다운로드로 안내하세요."]
    );
    assert_eq!(response.cautions, vec!["기존 링크를 확인해야 합니다."]);
}

#[test]
fn malformed_tool_call_response_is_marked_as_unparsed() {
    let work_order = QueueWorkOrder {
        schema_version: "workduck.queue-work-order/v1".to_string(),
        r#ref: QueueEntityRef {
            id: "wo_1".to_string(),
            kind: "queue-work-order".to_string(),
            label: "릴리스 판단".to_string(),
        },
        status: "active".to_string(),
        created_at: "2026-05-24T00:00:00Z".to_string(),
        tasks: Vec::new(),
    };
    let output = AgentRunOutput {
        task: QueueWorkOrderTask {
            id: "task_1".to_string(),
            kind: None,
            title: "릴리스 판단".to_string(),
            body: "파일명을 판단해줘".to_string(),
            priority: Some("normal".to_string()),
            response_language: Some("ko".to_string()),
            response_format: Some("decision-memo".to_string()),
            project_ids: Vec::new(),
            agent_ids: Vec::new(),
            skill_ids: Vec::new(),
            reference_ids: Vec::new(),
            vote: None,
        },
        agent_name: "키미K2.6".to_string(),
        content: "<tool_call_begin> functions.Bash:0 <tool_call_end>".to_string(),
        execution_attempts: Vec::new(),
    };

    let task = create_success_report_task(&work_order, &output);

    assert!(task.structured_response.is_none());
    assert!(task.summary.contains("도구 호출"));
    assert!(
        task.verification
            .iter()
            .any(|item| item.contains("구조화 응답"))
    );
    assert!(
        task.risks
            .iter()
            .any(|item| item.contains("신뢰하지 않아야"))
    );
}

#[test]
fn vote_prompt_keeps_json_only_response_format() {
    let task = QueueWorkOrderTask {
        id: "task_1".to_string(),
        kind: Some("vote".to_string()),
        title: "프레임워크 선정".to_string(),
        body: "하나를 골라줘".to_string(),
        priority: Some("normal".to_string()),
        response_language: Some("ko".to_string()),
        response_format: Some("general".to_string()),
        project_ids: Vec::new(),
        agent_ids: Vec::new(),
        skill_ids: Vec::new(),
        reference_ids: Vec::new(),
        vote: Some(vote_spec()),
    };

    let prompt =
        create_work_order_user_prompt_blocks(&task, queue_prompt_labels(QueueReportLanguage::Ko))
            .join("\n");

    assert!(prompt.contains("JSON 객체 하나만 반환하세요."));
    assert!(!prompt.contains("응답 형식:"));
}

#[test]
fn result_report_file_slug_preserves_unicode_segments() {
    assert_eq!(
        slugify("커밋 정리: workduck 결과 보고서"),
        "커밋-정리-workduck-결과-보고서"
    );
    assert_eq!(slugify("GPT5.4미니"), "gpt5-4미니");
    assert_eq!(slugify("결과 보고서"), "결과-보고서");
}

#[test]
fn validate_work_order_allows_failed_retry_but_rejects_running_and_archived() {
    let mut work_order = QueueWorkOrder {
        schema_version: "workduck.queue-work-order/v1".to_string(),
        r#ref: QueueEntityRef {
            id: "wo_retry".to_string(),
            kind: "queue-work-order".to_string(),
            label: "재시도".to_string(),
        },
        status: "failed".to_string(),
        created_at: "2026-05-31T00:00:00Z".to_string(),
        tasks: vec![QueueWorkOrderTask {
            id: "task_1".to_string(),
            kind: None,
            title: "재시도".to_string(),
            body: "다시 실행".to_string(),
            priority: Some("normal".to_string()),
            response_language: Some("ko".to_string()),
            response_format: Some("general".to_string()),
            project_ids: Vec::new(),
            agent_ids: vec!["agent_1".to_string()],
            skill_ids: Vec::new(),
            reference_ids: Vec::new(),
            vote: None,
        }],
    };

    assert!(validate_work_order(&work_order, "wo_retry").is_ok());

    work_order.status = "running".to_string();
    let running_error =
        validate_work_order(&work_order, "wo_retry").expect_err("running is blocked");
    assert_eq!(running_error.code, "work-order-running");

    work_order.status = "archived".to_string();
    let archived_error =
        validate_work_order(&work_order, "wo_retry").expect_err("archived is blocked");
    assert_eq!(archived_error.code, "work-order-archived");
}

#[test]
fn execution_runs_reject_work_orders_above_the_task_limit_before_agent_resolution() {
    let work_order = work_order_with_shape(65, 1);

    let error = match create_execution_runs(&work_order, &[], None, &[], &[], &[]) {
        Ok(_) => panic!("oversized task list must be rejected"),
        Err(error) => error,
    };

    assert_eq!(error.code, "work-order-task-limit");
}

#[test]
fn execution_runs_reject_tasks_above_the_agent_limit_before_agent_resolution() {
    let work_order = work_order_with_shape(1, 9);

    let error = match create_execution_runs(&work_order, &[], None, &[], &[], &[]) {
        Ok(_) => panic!("oversized agent list must be rejected"),
        Err(error) => error,
    };

    assert_eq!(error.code, "work-order-agent-limit");
}

#[test]
fn execution_runs_reject_total_runs_above_the_hard_cap_before_agent_resolution() {
    let work_order = work_order_with_shape(17, 8);

    let error = match create_execution_runs(&work_order, &[], None, &[], &[], &[]) {
        Ok(_) => panic!("oversized execution fanout must be rejected"),
        Err(error) => error,
    };

    assert_eq!(error.code, "work-order-execution-limit");
}

fn work_order_with_shape(task_count: usize, agents_per_task: usize) -> QueueWorkOrder {
    QueueWorkOrder {
        schema_version: "workduck.queue-work-order/v1".to_string(),
        r#ref: QueueEntityRef {
            id: "wo_limits".to_string(),
            kind: "queue-work-order".to_string(),
            label: "Limits".to_string(),
        },
        status: "active".to_string(),
        created_at: "2026-08-10T00:00:00Z".to_string(),
        tasks: (0..task_count)
            .map(|task_index| QueueWorkOrderTask {
                id: format!("task_{task_index}"),
                kind: None,
                title: format!("Task {task_index}"),
                body: "Bound execution fanout".to_string(),
                priority: Some("normal".to_string()),
                response_language: Some("en".to_string()),
                response_format: Some("general".to_string()),
                project_ids: Vec::new(),
                agent_ids: (0..agents_per_task)
                    .map(|agent_index| format!("agent_{agent_index}"))
                    .collect(),
                skill_ids: Vec::new(),
                reference_ids: Vec::new(),
                vote: None,
            })
            .collect(),
    }
}

#[test]
fn local_abort_handles_abort_all_handles_when_execution_scope_ends() {
    let (first_handle, _first_registration) = AbortHandle::new_pair();
    let (second_handle, _second_registration) = AbortHandle::new_pair();
    let first_assertion = first_handle.clone();
    let second_assertion = second_handle.clone();

    {
        let mut handles = LocalAbortHandles::default();
        handles.push(first_handle);
        handles.push(second_handle);
    }

    assert!(first_assertion.is_aborted());
    assert!(second_assertion.is_aborted());
}

#[test]
fn write_json_file_does_not_clobber_an_existing_report() {
    let temp_dir = tempfile::tempdir().expect("temporary report directory");
    let report_path = temp_dir.path().join("existing.workduck-report.json");
    fs::write(&report_path, "existing report").expect("existing report fixture");

    let error = write_json_file(&report_path, &serde_json::json!({ "replacement": true }))
        .expect_err("existing report must not be replaced");

    assert_eq!(error.code, "file-write-failed");
    assert_eq!(
        fs::read_to_string(report_path).expect("preserved report"),
        "existing report"
    );
}
