pub(crate) struct QueueModelFallback {
    pub(crate) provider: &'static str,
    pub(crate) profile_hint: Option<&'static str>,
    pub(crate) model_id: &'static str,
}

pub(crate) const QUEUE_MODEL_FALLBACKS: &[QueueModelFallback] = &[
    QueueModelFallback {
        provider: "deepseek",
        profile_hint: None,
        model_id: "deepseek-v4-pro",
    },
    QueueModelFallback {
        provider: "openai",
        profile_hint: None,
        model_id: "gpt-5.4-mini",
    },
    QueueModelFallback {
        provider: "openrouter",
        profile_hint: Some("deepseek"),
        model_id: "deepseek/deepseek-v4-pro",
    },
    QueueModelFallback {
        provider: "openrouter",
        profile_hint: None,
        model_id: "openrouter/auto",
    },
];

pub(crate) fn resolve_queue_model_fallback(
    provider: &str,
    normalized_profile_text: &str,
) -> Option<&'static str> {
    QUEUE_MODEL_FALLBACKS
        .iter()
        .find(|fallback| {
            fallback.provider == provider
                && fallback
                    .profile_hint
                    .is_none_or(|hint| normalized_profile_text.contains(hint))
        })
        .map(|fallback| fallback.model_id)
}

#[cfg(test)]
mod tests {
    use super::resolve_queue_model_fallback;

    #[test]
    fn resolves_provider_defaults() {
        assert_eq!(
            resolve_queue_model_fallback("deepseek", ""),
            Some("deepseek-v4-pro")
        );
        assert_eq!(
            resolve_queue_model_fallback("openai", ""),
            Some("gpt-5.4-mini")
        );
        assert_eq!(
            resolve_queue_model_fallback("openrouter", ""),
            Some("openrouter/auto")
        );
    }

    #[test]
    fn resolves_profile_specific_openrouter_default_first() {
        assert_eq!(
            resolve_queue_model_fallback("openrouter", "teamdeepseekagent"),
            Some("deepseek/deepseek-v4-pro")
        );
    }

    #[test]
    fn rejects_unsupported_provider() {
        assert_eq!(resolve_queue_model_fallback("unknown", ""), None);
    }
}
