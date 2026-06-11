use std::sync::atomic::{AtomicU64, Ordering};

use time::{OffsetDateTime, format_description::well_known::Rfc3339};

use crate::queue_execution::QueueExecutionErrorDetail;

static UNIQUE_TOKEN_COUNTER: AtomicU64 = AtomicU64::new(0);

pub(crate) fn current_timestamp() -> Result<String, QueueExecutionErrorDetail> {
    OffsetDateTime::now_utc().format(&Rfc3339).map_err(|_| {
        QueueExecutionErrorDetail::new("timestamp-format-failed", "현재 시간을 만들지 못했습니다.")
    })
}

pub(crate) fn timestamp_for_file_name() -> Result<String, QueueExecutionErrorDetail> {
    Ok(current_timestamp()?.replace(':', "-").replace('.', "-"))
}

pub(crate) fn unique_token() -> String {
    let timestamp = OffsetDateTime::now_utc().unix_timestamp_nanos();
    let sequence = UNIQUE_TOKEN_COUNTER.fetch_add(1, Ordering::Relaxed);

    format!("{timestamp:x}{sequence:016x}")
}

pub(crate) fn slugify(value: &str) -> String {
    let slug = value
        .trim()
        .to_lowercase()
        .chars()
        .map(|character| {
            if character.is_alphanumeric() || character == '-' || character == '_' {
                character
            } else {
                '-'
            }
        })
        .fold(String::new(), |mut slug, character| {
            if character == '-' && slug.ends_with('-') {
                return slug;
            }

            slug.push(character);
            slug
        });

    slug.trim_matches('-')
        .trim_matches('_')
        .chars()
        .take(80)
        .collect()
}
