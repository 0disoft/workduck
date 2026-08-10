use std::{
    collections::HashMap,
    sync::{Arc, Mutex, OnceLock},
};

use tokio::sync::{OwnedSemaphorePermit, Semaphore};

pub const QUEUE_FILE_MAX_BYTES: u64 = 1024 * 1024;
pub const QUEUE_FOLDER_MAX_FILES: usize = 4096;
pub const QUEUE_WORK_ORDER_MAX_TASKS: usize = 64;
pub const QUEUE_TASK_MAX_AGENTS: usize = 8;
pub const QUEUE_EXECUTION_MAX_RUNS: usize = 128;
pub const QUEUE_EXECUTION_MAX_CONCURRENCY: usize = 4;
pub const QUEUE_PROVIDER_MAX_CONCURRENCY: usize = 2;

static QUEUE_EXECUTION_LIMITER: OnceLock<QueueExecutionLimiter> = OnceLock::new();

#[derive(Debug, PartialEq, Eq)]
pub enum QueueExecutionLimitError {
    StateUnavailable,
    Closed,
}

#[derive(Debug)]
pub struct QueueExecutionPermit {
    _global: OwnedSemaphorePermit,
    _provider: OwnedSemaphorePermit,
}

#[derive(Debug)]
struct QueueExecutionLimiter {
    global: Arc<Semaphore>,
    providers: Mutex<HashMap<String, Arc<Semaphore>>>,
    provider_limit: usize,
}

impl QueueExecutionLimiter {
    fn new(global_limit: usize, provider_limit: usize) -> Self {
        Self {
            global: Arc::new(Semaphore::new(global_limit)),
            providers: Mutex::new(HashMap::new()),
            provider_limit,
        }
    }

    fn provider_semaphore(
        &self,
        provider: &str,
    ) -> Result<Arc<Semaphore>, QueueExecutionLimitError> {
        let provider = provider.trim().to_ascii_lowercase();
        let mut providers = self
            .providers
            .lock()
            .map_err(|_| QueueExecutionLimitError::StateUnavailable)?;

        Ok(providers
            .entry(provider)
            .or_insert_with(|| Arc::new(Semaphore::new(self.provider_limit)))
            .clone())
    }

    async fn acquire(
        &self,
        provider: &str,
    ) -> Result<QueueExecutionPermit, QueueExecutionLimitError> {
        let provider_permit = self
            .provider_semaphore(provider)?
            .acquire_owned()
            .await
            .map_err(|_| QueueExecutionLimitError::Closed)?;
        let global_permit = self
            .global
            .clone()
            .acquire_owned()
            .await
            .map_err(|_| QueueExecutionLimitError::Closed)?;

        Ok(QueueExecutionPermit {
            _global: global_permit,
            _provider: provider_permit,
        })
    }

    #[cfg(test)]
    fn try_acquire(&self, provider: &str) -> Option<QueueExecutionPermit> {
        let provider_permit = self.provider_semaphore(provider).ok()?.try_acquire_owned().ok()?;
        let global_permit = self.global.clone().try_acquire_owned().ok()?;

        Some(QueueExecutionPermit {
            _global: global_permit,
            _provider: provider_permit,
        })
    }
}

pub async fn acquire_queue_execution_permit(
    provider: &str,
) -> Result<QueueExecutionPermit, QueueExecutionLimitError> {
    QUEUE_EXECUTION_LIMITER
        .get_or_init(|| {
            QueueExecutionLimiter::new(
                QUEUE_EXECUTION_MAX_CONCURRENCY,
                QUEUE_PROVIDER_MAX_CONCURRENCY,
            )
        })
        .acquire(provider)
        .await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn execution_limiter_enforces_global_and_provider_capacity() {
        let limiter = QueueExecutionLimiter::new(2, 1);
        let openai = limiter.try_acquire("openai").expect("first provider permit");

        assert!(limiter.try_acquire("openai").is_none());

        let deepseek = limiter
            .try_acquire("deepseek")
            .expect("second global permit");
        assert!(limiter.try_acquire("openrouter").is_none());

        drop(openai);
        assert!(limiter.try_acquire("openai").is_some());
        drop(deepseek);
    }
}
