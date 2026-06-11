use serde_json::Value;

use crate::queue_execution::{
    QueueReportLanguage, QueueStructuredResponse, QueueVoteBallot, QueueVoteResult,
    QueueVoteSpec,
};

pub(crate) fn parse_structured_agent_response(
    content: &str,
    language: QueueReportLanguage,
) -> Option<QueueStructuredResponse> {
    for candidate in json_object_candidates(content) {
        let Ok(parsed) = serde_json::from_str::<Value>(&candidate) else {
            continue;
        };

        let summary = read_optional_text(parsed.get("summary"));
        let strengths = read_limited_text_array(parsed.get("strengths"), 5);
        let recommendations = read_limited_text_array(parsed.get("recommendations"), 5);
        let cautions = read_limited_text_array(parsed.get("cautions"), 5);

        if summary.trim().is_empty()
            && strengths.is_empty()
            && recommendations.is_empty()
            && cautions.is_empty()
        {
            continue;
        }

        return Some(QueueStructuredResponse {
            summary,
            strengths,
            recommendations,
            cautions,
        });
    }

    parse_labeled_structured_agent_response(content, language)
}

pub(crate) fn looks_like_tool_call_transcript(content: &str) -> bool {
    let normalized = content.to_ascii_lowercase();

    normalized.contains("<tool_call")
        || normalized.contains("<tool_calls_section")
        || normalized.contains("functions.bash")
        || normalized.contains("tool_call_argument")
}

pub(crate) fn parse_vote_result(content: &str, spec: &QueueVoteSpec) -> QueueVoteResult {
    QueueVoteResult {
        question: spec.question.clone(),
        options: spec.options.clone(),
        ballot: parse_vote_ballot(content, spec),
    }
}

pub(crate) fn parse_vote_ballot(content: &str, spec: &QueueVoteSpec) -> QueueVoteBallot {
    let Some(record) = parse_vote_json_record(content, spec) else {
        return QueueVoteBallot {
            choice_id: String::new(),
            reason: String::new(),
            risks: Vec::new(),
            parse_status: "unparsed".to_string(),
        };
    };

    let choice_id = read_optional_text(record.get("choiceId"));
    let reason = read_optional_text(record.get("reason"));
    let risks = read_text_array(record.get("risks"));
    let parse_status = if spec.options.iter().any(|option| option.id == choice_id) {
        "parsed"
    } else {
        "invalid-choice"
    };

    QueueVoteBallot {
        choice_id,
        reason,
        risks,
        parse_status: parse_status.to_string(),
    }
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum StructuredResponseSection {
    Summary,
    Strengths,
    Recommendations,
    Cautions,
}

fn parse_labeled_structured_agent_response(
    content: &str,
    language: QueueReportLanguage,
) -> Option<QueueStructuredResponse> {
    let mut summary_lines = Vec::new();
    let mut strengths = Vec::new();
    let mut recommendations = Vec::new();
    let mut cautions = Vec::new();
    let mut current_section: Option<StructuredResponseSection> = None;

    for line in content.lines() {
        let line = normalize_structured_line(line);

        if line.is_empty() {
            continue;
        }

        if let Some((section, inline_text)) = parse_structured_section_heading(&line, language) {
            current_section = Some(section);

            if !inline_text.is_empty() {
                push_structured_section_value(
                    section,
                    &inline_text,
                    &mut summary_lines,
                    &mut strengths,
                    &mut recommendations,
                    &mut cautions,
                );
            }

            continue;
        }

        let Some(section) = current_section else {
            continue;
        };
        let value = normalize_structured_list_item(&line);

        push_structured_section_value(
            section,
            &value,
            &mut summary_lines,
            &mut strengths,
            &mut recommendations,
            &mut cautions,
        );
    }

    let summary = normalize_inline_text(&summary_lines.join(" "));
    strengths.truncate(5);
    recommendations.truncate(5);
    cautions.truncate(5);

    if summary.is_empty()
        && strengths.is_empty()
        && recommendations.is_empty()
        && cautions.is_empty()
    {
        return None;
    }

    Some(QueueStructuredResponse {
        summary,
        strengths,
        recommendations,
        cautions,
    })
}

fn parse_structured_section_heading(
    line: &str,
    language: QueueReportLanguage,
) -> Option<(StructuredResponseSection, String)> {
    let normalized = normalize_structured_heading(line);

    if normalized.is_empty() {
        return None;
    }

    let candidates = structured_heading_candidates(language);

    for (label, section) in candidates {
        let label = label.to_ascii_lowercase();

        if normalized == label {
            return Some((*section, String::new()));
        }

        for separator in [":", "-", "–"] {
            let prefix = format!("{label}{separator}");

            if normalized.starts_with(&prefix) {
                let inline_text = line
                    .split_once(separator)
                    .map(|(_, value)| normalize_inline_text(value))
                    .unwrap_or_default();

                return Some((*section, inline_text));
            }
        }
    }

    None
}

fn structured_heading_candidates(
    language: QueueReportLanguage,
) -> &'static [(&'static str, StructuredResponseSection)] {
    const KO_CANDIDATES: &[(&str, StructuredResponseSection)] = &[
        ("요약", StructuredResponseSection::Summary),
        ("판단", StructuredResponseSection::Summary),
        ("핵심 결론", StructuredResponseSection::Summary),
        ("장점", StructuredResponseSection::Strengths),
        ("장점/근거", StructuredResponseSection::Strengths),
        ("근거", StructuredResponseSection::Strengths),
        ("강점", StructuredResponseSection::Strengths),
        ("확인된 사실", StructuredResponseSection::Strengths),
        ("제안", StructuredResponseSection::Recommendations),
        ("결론", StructuredResponseSection::Recommendations),
        ("권고", StructuredResponseSection::Recommendations),
        ("추천", StructuredResponseSection::Recommendations),
        ("결정 사항", StructuredResponseSection::Recommendations),
        ("다음 행동", StructuredResponseSection::Recommendations),
        ("주의점", StructuredResponseSection::Cautions),
        ("위험", StructuredResponseSection::Cautions),
        ("리스크", StructuredResponseSection::Cautions),
        ("한계", StructuredResponseSection::Cautions),
        ("후속 확인", StructuredResponseSection::Cautions),
    ];
    const EN_CANDIDATES: &[(&str, StructuredResponseSection)] = &[
        ("summary", StructuredResponseSection::Summary),
        ("decision", StructuredResponseSection::Summary),
        ("conclusion", StructuredResponseSection::Summary),
        ("strengths", StructuredResponseSection::Strengths),
        ("pros", StructuredResponseSection::Strengths),
        ("evidence", StructuredResponseSection::Strengths),
        ("confirmed facts", StructuredResponseSection::Strengths),
        (
            "recommendations",
            StructuredResponseSection::Recommendations,
        ),
        ("recommendation", StructuredResponseSection::Recommendations),
        ("next actions", StructuredResponseSection::Recommendations),
        ("next steps", StructuredResponseSection::Recommendations),
        ("cautions", StructuredResponseSection::Cautions),
        ("risks", StructuredResponseSection::Cautions),
        ("limitations", StructuredResponseSection::Cautions),
        ("follow-up checks", StructuredResponseSection::Cautions),
    ];

    match language {
        QueueReportLanguage::Ko => KO_CANDIDATES,
        QueueReportLanguage::En => EN_CANDIDATES,
    }
}

fn push_structured_section_value(
    section: StructuredResponseSection,
    value: &str,
    summary_lines: &mut Vec<String>,
    strengths: &mut Vec<String>,
    recommendations: &mut Vec<String>,
    cautions: &mut Vec<String>,
) {
    let value = normalize_inline_text(value);

    if value.is_empty() {
        return;
    }

    match section {
        StructuredResponseSection::Summary => summary_lines.push(value),
        StructuredResponseSection::Strengths => strengths.push(value),
        StructuredResponseSection::Recommendations => recommendations.push(value),
        StructuredResponseSection::Cautions => cautions.push(value),
    }
}

fn normalize_structured_line(line: &str) -> String {
    line.trim()
        .trim_matches('`')
        .trim_matches('*')
        .trim_matches('#')
        .trim()
        .to_string()
}

fn normalize_structured_heading(line: &str) -> String {
    normalize_structured_list_item(line)
        .trim_matches('*')
        .trim()
        .to_ascii_lowercase()
}

fn normalize_structured_list_item(line: &str) -> String {
    line.trim()
        .trim_start_matches(|character| matches!(character, '-' | '*' | '•' | '·'))
        .trim()
        .to_string()
}

fn parse_vote_json_record(content: &str, spec: &QueueVoteSpec) -> Option<Value> {
    let mut first_record = None;

    for candidate in json_object_candidates(content) {
        let Ok(parsed) = serde_json::from_str::<Value>(&candidate) else {
            continue;
        };

        if !parsed.is_object() {
            continue;
        }

        if first_record.is_none() {
            first_record = Some(parsed.clone());
        }

        let choice_id = read_optional_text(parsed.get("choiceId"));

        if spec.options.iter().any(|option| option.id == choice_id) {
            return Some(parsed);
        }
    }

    first_record
}

fn json_object_candidates(content: &str) -> Vec<String> {
    let fenced_candidates = fenced_json_object_candidates(content);
    let balanced_candidates = balanced_json_object_candidates(content);

    if fenced_candidates.is_empty() {
        return balanced_candidates;
    }

    let mut candidates = fenced_candidates;

    for candidate in balanced_candidates {
        if !candidates.iter().any(|existing| existing == &candidate) {
            candidates.push(candidate);
        }
    }

    candidates
}

fn fenced_json_object_candidates(content: &str) -> Vec<String> {
    let mut candidates = Vec::new();
    let mut remainder = content;

    while let Some(fence_start) = remainder.find("```") {
        remainder = &remainder[fence_start + 3..];
        let Some(line_end) = remainder.find('\n') else {
            break;
        };

        let info = remainder[..line_end].trim().to_ascii_lowercase();
        remainder = &remainder[line_end + 1..];
        let Some(fence_end) = remainder.find("```") else {
            break;
        };

        if info.is_empty() || info == "json" {
            let fenced_body = remainder[..fence_end].trim();
            candidates.extend(balanced_json_object_candidates(fenced_body));
        }

        remainder = &remainder[fence_end + 3..];
    }

    candidates
}

fn balanced_json_object_candidates(content: &str) -> Vec<String> {
    let mut candidates = Vec::new();

    for (start_index, character) in content.char_indices() {
        if character != '{' {
            continue;
        }

        if let Some(end_index) = find_balanced_json_object_end(content, start_index) {
            let candidate = content[start_index..=end_index].trim().to_string();

            if !candidates.iter().any(|existing| existing == &candidate) {
                candidates.push(candidate);
            }
        }
    }

    candidates
}

fn find_balanced_json_object_end(content: &str, start_index: usize) -> Option<usize> {
    let mut depth = 0usize;
    let mut in_string = false;
    let mut is_escaped = false;

    for (offset, character) in content[start_index..].char_indices() {
        let index = start_index + offset;

        if in_string {
            if is_escaped {
                is_escaped = false;
            } else if character == '\\' {
                is_escaped = true;
            } else if character == '"' {
                in_string = false;
            }

            continue;
        }

        match character {
            '"' => in_string = true,
            '{' => depth += 1,
            '}' => {
                depth = depth.saturating_sub(1);

                if depth == 0 {
                    return Some(index);
                }
            }
            _ => {}
        }
    }

    None
}

fn read_limited_text_array(value: Option<&Value>, limit: usize) -> Vec<String> {
    read_text_array(value)
        .into_iter()
        .map(|item| item.trim().to_string())
        .filter(|item| !item.is_empty())
        .take(limit)
        .collect()
}

fn read_optional_text(value: Option<&Value>) -> String {
    value
        .and_then(Value::as_str)
        .map(normalize_inline_text)
        .unwrap_or_default()
}

fn read_text_array(value: Option<&Value>) -> Vec<String> {
    let Some(items) = value.and_then(Value::as_array) else {
        return Vec::new();
    };

    items
        .iter()
        .filter_map(Value::as_str)
        .map(normalize_inline_text)
        .filter(|item| !item.is_empty())
        .collect()
}

fn normalize_inline_text(value: &str) -> String {
    value.split_whitespace().collect::<Vec<_>>().join(" ")
}
