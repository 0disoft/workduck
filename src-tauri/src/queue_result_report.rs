use crate::{
    queue_execution::{
        AgentRunOutcome, AgentRunOutput, QueueEntityRef, QueueExecutionErrorDetail,
        QueueReportLanguage, QueueResultReport, QueueResultReportTask, QueueStructuredResponse,
        QueueWorkOrder, QueueWorkOrderTask,
    },
    queue_execution_identity::{current_timestamp, slugify, unique_token},
    queue_response_parser::{
        looks_like_tool_call_transcript, parse_structured_agent_response, parse_vote_result,
    },
};

pub fn create_result_report(
    work_order: &QueueWorkOrder,
    outputs: Vec<AgentRunOutcome>,
) -> Result<QueueResultReport, QueueExecutionErrorDetail> {
    let created_at = current_timestamp()?;
    let tasks = outputs
        .iter()
        .map(|output| create_result_report_task(work_order, output))
        .collect();

    Ok(QueueResultReport {
        schema_version: "workduck.queue-result-report/v1",
        r#ref: QueueEntityRef {
            id: format!("queue-result-report_{}", unique_token()),
            kind: "queue-result-report".to_string(),
            label: report_label(
                &work_order.r#ref.label,
                report_language_for_work_order(work_order),
            ),
        },
        status: "active",
        created_at,
        agent_name: outputs
            .iter()
            .map(agent_name_from_outcome)
            .collect::<Vec<_>>()
            .join(", "),
        source_work_order: work_order.r#ref.clone(),
        tasks,
    })
}

fn create_result_report_task(
    work_order: &QueueWorkOrder,
    outcome: &AgentRunOutcome,
) -> QueueResultReportTask {
    match outcome {
        AgentRunOutcome::Success(output) => create_success_report_task(work_order, output),
        AgentRunOutcome::Failure {
            task,
            agent_name,
            code,
            message,
            execution_attempts,
        } => {
            let language = report_language_for_task(task, work_order);

            QueueResultReportTask {
                id: format!("task_{}_{}", slugify(agent_name), unique_token()),
                title: format!("{agent_name}: {}", task.title),
                summary: response_not_received(message, language),
                structured_response: None,
                files_changed: Vec::new(),
                verification: vec![response_failed(agent_name, code, language)],
                risks: vec![response_excluded_risk(language).to_string()],
                execution_attempts: execution_attempts.clone(),
                response_language: task.response_language.clone(),
                response_format: task.response_format.clone(),
                vote: None,
            }
        }
    }
}

pub(crate) fn create_success_report_task(
    work_order: &QueueWorkOrder,
    output: &AgentRunOutput,
) -> QueueResultReportTask {
    let language = report_language_for_task(&output.task, work_order);
    let vote = if output.task.kind.as_deref() == Some("vote") {
        output
            .task
            .vote
            .as_ref()
            .map(|spec| parse_vote_result(&output.content, spec))
    } else {
        None
    };
    let vote_summary = vote
        .as_ref()
        .filter(|result| result.ballot.parse_status == "parsed")
        .map(|result| result.ballot.reason.trim())
        .filter(|reason| !reason.is_empty())
        .map(ToString::to_string);
    let mut verification = vec![response_received(&output.agent_name, language)];
    let mut risks = Vec::new();

    if !output.execution_attempts.is_empty() {
        verification.push(response_retry_succeeded(
            output.execution_attempts.len(),
            language,
        ));
    }

    if let Some(vote) = &vote {
        if vote.ballot.parse_status == "parsed" {
            verification.push(vote_parsed(&vote.ballot.choice_id, language));
        } else {
            verification.push(vote_unmatched(language).to_string());
            risks.push(vote_invalid_choice_risk(language).to_string());
        }

        risks.extend(vote.ballot.risks.clone());
    }

    let expects_structured_response =
        vote.is_none() && output.task.kind.as_deref() != Some("direct-message");
    let structured_response = if expects_structured_response {
        parse_structured_agent_response(&output.content, language)
    } else {
        None
    };
    let structured_summary = structured_response
        .as_ref()
        .map(|response| format_structured_response_summary(response, language));
    let fallback_summary = if expects_structured_response && structured_response.is_none() {
        verification.push(structured_response_unparsed(language).to_string());
        risks.push(structured_response_unparsed_risk(language).to_string());

        if looks_like_tool_call_transcript(&output.content) {
            risks.push(tool_call_transcript_risk(language).to_string());
            tool_call_transcript_summary(language).to_string()
        } else {
            output.content.clone()
        }
    } else {
        output.content.clone()
    };

    QueueResultReportTask {
        id: format!("task_{}_{}", slugify(&output.agent_name), unique_token()),
        title: format!("{}: {}", output.agent_name, output.task.title),
        summary: vote_summary
            .or(structured_summary)
            .unwrap_or(fallback_summary),
        structured_response,
        files_changed: Vec::new(),
        verification,
        risks,
        execution_attempts: output.execution_attempts.clone(),
        response_language: output.task.response_language.clone(),
        response_format: output.task.response_format.clone(),
        vote,
    }
}

fn format_structured_response_summary(
    response: &QueueStructuredResponse,
    language: QueueReportLanguage,
) -> String {
    let labels = match language {
        QueueReportLanguage::Ko => ("요약", "장점/근거", "제안", "주의점"),
        QueueReportLanguage::En => (
            "Summary",
            "Strengths/Evidence",
            "Recommendations",
            "Cautions",
        ),
    };
    let mut sections = Vec::new();

    if !response.summary.trim().is_empty() {
        sections.push(format!("{}: {}", labels.0, response.summary.trim()));
    }

    push_structured_summary_section(&mut sections, labels.1, &response.strengths);
    push_structured_summary_section(&mut sections, labels.2, &response.recommendations);
    push_structured_summary_section(&mut sections, labels.3, &response.cautions);

    sections.join("\n\n")
}

fn push_structured_summary_section(sections: &mut Vec<String>, label: &str, items: &[String]) {
    if items.is_empty() {
        return;
    }

    let body = items
        .iter()
        .map(|item| format!("- {item}"))
        .collect::<Vec<_>>()
        .join("\n");

    sections.push(format!("{label}:\n{body}"));
}

pub fn report_language_for_work_order(work_order: &QueueWorkOrder) -> QueueReportLanguage {
    if let Some(language) = work_order
        .tasks
        .iter()
        .find_map(|task| explicit_report_language(task.response_language.as_deref()))
    {
        return language;
    }

    let text = format!(
        "{} {}",
        work_order.r#ref.label,
        work_order
            .tasks
            .iter()
            .map(|task| task.body.as_str())
            .collect::<Vec<_>>()
            .join(" ")
    );

    if has_hangul(&text) {
        QueueReportLanguage::Ko
    } else {
        QueueReportLanguage::En
    }
}

fn report_language_for_task(
    task: &QueueWorkOrderTask,
    work_order: &QueueWorkOrder,
) -> QueueReportLanguage {
    if let Some(language) = explicit_report_language(task.response_language.as_deref()) {
        return language;
    }

    if has_hangul(&format!("{} {}", task.title, task.body)) {
        QueueReportLanguage::Ko
    } else {
        report_language_for_work_order(work_order)
    }
}

pub(crate) fn explicit_report_language(value: Option<&str>) -> Option<QueueReportLanguage> {
    match value {
        Some("ko") => Some(QueueReportLanguage::Ko),
        Some("en") => Some(QueueReportLanguage::En),
        _ => None,
    }
}

pub(crate) fn has_hangul(value: &str) -> bool {
    value
        .chars()
        .any(|character| ('\u{AC00}'..='\u{D7A3}').contains(&character))
}

fn report_label(work_order_label: &str, language: QueueReportLanguage) -> String {
    match language {
        QueueReportLanguage::Ko => format!("{work_order_label} 결과 보고서"),
        QueueReportLanguage::En => format!("{work_order_label} result report"),
    }
}

fn response_received(agent_name: &str, language: QueueReportLanguage) -> String {
    match language {
        QueueReportLanguage::Ko => format!("{agent_name} 응답 수신"),
        QueueReportLanguage::En => format!("{agent_name} response received"),
    }
}

fn vote_parsed(choice_id: &str, language: QueueReportLanguage) -> String {
    match language {
        QueueReportLanguage::Ko => format!("투표 응답 해석됨: {choice_id}"),
        QueueReportLanguage::En => format!("Vote parsed: {choice_id}"),
    }
}

fn vote_unmatched(language: QueueReportLanguage) -> &'static str {
    match language {
        QueueReportLanguage::Ko => "투표 응답을 선택지와 연결하지 못했습니다.",
        QueueReportLanguage::En => "Vote response could not be matched to an option.",
    }
}

fn vote_invalid_choice_risk(language: QueueReportLanguage) -> &'static str {
    match language {
        QueueReportLanguage::Ko => "투표 응답에 유효한 choiceId가 없습니다.",
        QueueReportLanguage::En => "The vote response did not contain a valid choiceId.",
    }
}

fn response_not_received(error: &str, language: QueueReportLanguage) -> String {
    match language {
        QueueReportLanguage::Ko => format!("응답을 받지 못했습니다: {error}"),
        QueueReportLanguage::En => format!("Response was not received: {error}"),
    }
}

fn response_failed(agent_name: &str, error: &str, language: QueueReportLanguage) -> String {
    match language {
        QueueReportLanguage::Ko => format!("{agent_name} 응답 실패: {error}"),
        QueueReportLanguage::En => format!("{agent_name} response failed: {error}"),
    }
}

fn response_retry_succeeded(attempt_count: usize, language: QueueReportLanguage) -> String {
    match language {
        QueueReportLanguage::Ko => format!("일시 실패 {attempt_count}회 후 응답 수신"),
        QueueReportLanguage::En => {
            format!("Response received after {attempt_count} transient failure(s)")
        }
    }
}

fn structured_response_unparsed(language: QueueReportLanguage) -> &'static str {
    match language {
        QueueReportLanguage::Ko => "구조화 응답을 해석하지 못했습니다.",
        QueueReportLanguage::En => "Structured response could not be parsed.",
    }
}

fn structured_response_unparsed_risk(language: QueueReportLanguage) -> &'static str {
    match language {
        QueueReportLanguage::Ko => {
            "이 응답은 요청한 형식을 따르지 않아 평가나 비교에서 왜곡될 수 있습니다."
        }
        QueueReportLanguage::En => {
            "This response did not follow the requested format and may distort evaluation or comparison."
        }
    }
}

fn tool_call_transcript_summary(language: QueueReportLanguage) -> &'static str {
    match language {
        QueueReportLanguage::Ko => {
            "응답 형식 위반: 에이전트가 답변 대신 도구 호출 형식의 토큰을 반환했습니다."
        }
        QueueReportLanguage::En => {
            "Response format violation: the agent returned tool-call tokens instead of an answer."
        }
    }
}

fn tool_call_transcript_risk(language: QueueReportLanguage) -> &'static str {
    match language {
        QueueReportLanguage::Ko => {
            "도구 호출 토큰이 포함된 응답은 실제 작업 결과로 신뢰하지 않아야 합니다."
        }
        QueueReportLanguage::En => {
            "A response containing tool-call tokens should not be trusted as a task result."
        }
    }
}

fn response_excluded_risk(language: QueueReportLanguage) -> &'static str {
    match language {
        QueueReportLanguage::Ko => "이 에이전트의 응답은 결과 집계에서 제외해야 합니다.",
        QueueReportLanguage::En => {
            "This agent response should be excluded from result aggregation."
        }
    }
}

pub fn responses_received(agent_names: &str, language: QueueReportLanguage) -> String {
    match language {
        QueueReportLanguage::Ko => format!("응답 수신: {agent_names}"),
        QueueReportLanguage::En => format!("Responses received: {agent_names}"),
    }
}

fn agent_name_from_outcome(outcome: &AgentRunOutcome) -> &str {
    match outcome {
        AgentRunOutcome::Success(output) => &output.agent_name,
        AgentRunOutcome::Failure { agent_name, .. } => agent_name,
    }
}
