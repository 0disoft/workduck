// llmnav/1 module
// id=workduck.queue.folder-contracts
// role=Define native Queue command responses, stable error codes, and known artifact directory and suffix contracts.
// owns=Queue command response shapes|Queue error serialization|Queue artifact path vocabulary
// excludes=file persistence|evaluation delegation rules
// search=native Queue error codes|Queue response serialization|Queue artifact suffixes
// invariant=Existing native command response names, field omission, and error strings remain stable.
// stability=architecture
// /llmnav
pub(super) const QUEUE_DIRECTORY_NAME: &str = "queue";
pub(super) const REPORTS_DIRECTORY_NAME: &str = "reports";
pub(super) const WORK_ORDERS_DIRECTORY_NAME: &str = "work-orders";
pub(super) const PROPOSALS_DIRECTORY_NAME: &str = "proposals";
pub(super) const REPORT_FILE_SUFFIX: &str = ".workduck-report.json";
pub(super) const WORK_ORDER_FILE_SUFFIX: &str = ".workduck-work-order.json";
pub(super) const PROPOSAL_FILE_SUFFIX: &str = ".workduck-proposal.json";
#[derive(Debug, PartialEq, Eq, serde::Serialize)]
pub enum QueueFolderError {
    #[serde(rename = "queue-folder-workspace-required")]
    WorkspaceRequired,
    #[serde(rename = "queue-folder-workspace-not-absolute")]
    WorkspaceNotAbsolute,
    #[serde(rename = "queue-folder-workspace-not-found")]
    WorkspaceNotFound,
    #[serde(rename = "queue-folder-workspace-not-directory")]
    WorkspaceNotDirectory,
    #[serde(rename = "queue-folder-workspace-permission-denied")]
    WorkspacePermissionDenied,
    #[serde(rename = "queue-folder-workspace-unreadable")]
    WorkspaceUnreadable,
    #[serde(rename = "queue-folder-root-invalid")]
    RootInvalid,
    #[serde(rename = "queue-folder-create-failed")]
    CreateFailed,
    #[serde(rename = "queue-folder-open-failed")]
    OpenFailed,
    #[serde(rename = "queue-folder-list-failed")]
    ListFailed,
    #[serde(rename = "queue-folder-file-invalid")]
    FileInvalid,
    #[serde(rename = "queue-folder-file-not-found")]
    FileNotFound,
    #[serde(rename = "queue-folder-file-read-failed")]
    FileReadFailed,
    #[serde(rename = "queue-folder-file-write-failed")]
    FileWriteFailed,
    #[serde(rename = "queue-folder-file-delete-failed")]
    FileDeleteFailed,
    #[serde(rename = "queue-folder-file-already-exists")]
    FileAlreadyExists,
    #[serde(rename = "queue-folder-evaluation-delegation-already-exists")]
    EvaluationDelegationAlreadyExists,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QueueFolderResult {
    pub(super) ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(super) path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(super) relative_path: Option<&'static str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(super) error: Option<QueueFolderError>,
}

#[derive(Clone, Copy, serde::Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum QueueFileKind {
    ResultReport,
    WorkOrder,
    Proposal,
    Unsupported,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QueueFileEntry {
    pub(super) relative_path: String,
    pub(super) file_name: String,
    pub(super) kind: QueueFileKind,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QueueFileListResult {
    pub(super) ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(super) path: Option<String>,
    pub(super) files: Vec<QueueFileEntry>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(super) error: Option<QueueFolderError>,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QueueFileReadResult {
    pub(super) ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(super) relative_path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(super) content: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(super) error: Option<QueueFolderError>,
}

#[derive(Default, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QueueFileStatusCounts {
    pub(super) pending: usize,
    pub(super) running: usize,
    pub(super) completed: usize,
    pub(super) failed: usize,
    pub(super) unknown: usize,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QueueFileSummaryResult {
    pub(super) ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(super) path: Option<String>,
    pub(super) counts: QueueFileStatusCounts,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(super) error: Option<QueueFolderError>,
}
