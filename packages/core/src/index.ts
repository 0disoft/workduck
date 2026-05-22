export const workduckEntityKinds = [
  "project",
  "repo",
  "project-folder",
  "project-repo-placement",
  "artifact",
  "catalog-artifact",
  "service",
  "agent-brief",
  "run",
  "gate",
  "queue-work-order",
  "queue-result-report",
  "queue-proposal"
] as const;

export type WorkduckEntityKind = (typeof workduckEntityKinds)[number];

export const workduckRecordStatuses = ["reserved", "active", "archived"] as const;

export type WorkduckRecordStatus = (typeof workduckRecordStatuses)[number];

export const workduckRepoKinds = ["git", "folder"] as const;

export type WorkduckRepoKind = (typeof workduckRepoKinds)[number];

export const workduckCatalogArtifactKinds = [
  "repositories",
  "services",
  "datastores",
  "external-providers",
  "cost-budgets",
  "slo-tiers",
  "split-triggers",
  "stack-decisions",
  "service-template"
] as const;

export type WorkduckCatalogArtifactKind = (typeof workduckCatalogArtifactKinds)[number];

export const workduckRiskLevels = ["low", "medium", "high", "critical"] as const;

export type WorkduckRiskLevel = (typeof workduckRiskLevels)[number];

export const workduckServiceLevels = ["critical", "high", "medium", "low", "lab"] as const;

export type WorkduckServiceLevel = (typeof workduckServiceLevels)[number];

export const workduckQueueItemKinds = ["work-order", "result-report", "proposal"] as const;

export type WorkduckQueueItemKind = (typeof workduckQueueItemKinds)[number];

export const workduckQueueReviewDecisions = [
  "pending",
  "approved",
  "needs-work",
  "rollback"
] as const;

export type WorkduckQueueReviewDecision = (typeof workduckQueueReviewDecisions)[number];

export const workduckQueueWorkPriorities = ["low", "normal", "high", "urgent"] as const;

export type WorkduckQueueWorkPriority = (typeof workduckQueueWorkPriorities)[number];

export const workduckQueueTaskKinds = ["instruction", "direct-message", "vote"] as const;

export type WorkduckQueueTaskKind = (typeof workduckQueueTaskKinds)[number];

export const workduckQueueResponseLanguages = ["auto", "ko", "en"] as const;

export type WorkduckQueueResponseLanguage = (typeof workduckQueueResponseLanguages)[number];

export type WorkduckId = string;

export interface WorkduckEntityRef {
  readonly id: WorkduckId;
  readonly kind: WorkduckEntityKind;
  readonly label: string;
}

export type ProjectRef = WorkduckEntityRef & { readonly kind: "project" };
export type RepoRef = WorkduckEntityRef & { readonly kind: "repo" };
export type ProjectFolderRef = WorkduckEntityRef & { readonly kind: "project-folder" };
export type ProjectRepoPlacementRef = WorkduckEntityRef & {
  readonly kind: "project-repo-placement";
};
export type ArtifactRef = WorkduckEntityRef & { readonly kind: "artifact" };
export type CatalogArtifactRef = WorkduckEntityRef & { readonly kind: "catalog-artifact" };
export type ServiceRef = WorkduckEntityRef & { readonly kind: "service" };
export type AgentBriefRef = WorkduckEntityRef & { readonly kind: "agent-brief" };
export type RunRef = WorkduckEntityRef & { readonly kind: "run" };
export type GateRef = WorkduckEntityRef & { readonly kind: "gate" };
export type QueueWorkOrderRef = WorkduckEntityRef & { readonly kind: "queue-work-order" };
export type QueueResultReportRef = WorkduckEntityRef & { readonly kind: "queue-result-report" };
export type QueueProposalRef = WorkduckEntityRef & { readonly kind: "queue-proposal" };

export interface WorkduckComplianceScope {
  readonly pii: boolean;
  readonly payment: boolean;
  readonly crypto: boolean;
  readonly aiUserData: boolean;
  readonly pci: boolean;
}

export interface WorkduckProject {
  readonly ref: ProjectRef;
  readonly status: WorkduckRecordStatus;
  readonly description?: string;
}

export interface WorkduckRepo {
  readonly ref: RepoRef;
  readonly status: WorkduckRecordStatus;
  readonly kind: WorkduckRepoKind;
  readonly localPath: string;
  readonly remoteUrl?: string;
  readonly defaultBranch?: string;
}

export interface WorkduckProjectFolder {
  readonly ref: ProjectFolderRef;
  readonly project: ProjectRef;
  readonly path: string;
  readonly parent?: ProjectFolderRef;
}

export interface WorkduckProjectRepoPlacement {
  readonly ref: ProjectRepoPlacementRef;
  readonly project: ProjectRef;
  readonly folder: ProjectFolderRef;
  readonly repo: RepoRef;
  readonly path: string;
}

export interface WorkduckArtifact {
  readonly ref: ArtifactRef;
  readonly status: WorkduckRecordStatus;
  readonly project?: ProjectRef;
  readonly sourcePath?: string;
}

export interface WorkduckCatalogArtifact {
  readonly ref: CatalogArtifactRef;
  readonly status: WorkduckRecordStatus;
  readonly catalogKind: WorkduckCatalogArtifactKind;
  readonly project?: ProjectRef;
  readonly sourcePath?: string;
}

export interface WorkduckService {
  readonly ref: ServiceRef;
  readonly status: WorkduckRecordStatus;
  readonly project?: ProjectRef;
  readonly repo?: RepoRef;
  readonly runtime?: string;
  readonly framework?: string;
  readonly dataClasses: readonly string[];
  readonly datastores: readonly string[];
  readonly queues: readonly string[];
  readonly externalDependencies: readonly string[];
  readonly riskLevel?: WorkduckRiskLevel;
  readonly serviceLevel?: WorkduckServiceLevel;
  readonly complianceScope: WorkduckComplianceScope;
}

export interface WorkduckAgentBrief {
  readonly ref: AgentBriefRef;
  readonly status: WorkduckRecordStatus;
  readonly project: ProjectRef;
  readonly artifactRefs: readonly ArtifactRef[];
  readonly catalogArtifactRefs: readonly CatalogArtifactRef[];
}

export interface WorkduckRun {
  readonly ref: RunRef;
  readonly status: WorkduckRecordStatus;
  readonly project: ProjectRef;
  readonly repoRefs: readonly RepoRef[];
  readonly artifactRefs: readonly ArtifactRef[];
  readonly gateRefs: readonly GateRef[];
  readonly brief?: AgentBriefRef;
}

export interface WorkduckGate {
  readonly ref: GateRef;
  readonly status: WorkduckRecordStatus;
  readonly project?: ProjectRef;
  readonly riskLevel?: WorkduckRiskLevel;
}

export interface WorkduckQueueWorkOrderTask {
  readonly id: WorkduckId;
  readonly kind?: WorkduckQueueTaskKind;
  readonly title: string;
  readonly body: string;
  readonly priority?: WorkduckQueueWorkPriority;
  readonly responseLanguage?: WorkduckQueueResponseLanguage;
  readonly projectIds?: readonly WorkduckId[];
  readonly skillIds?: readonly WorkduckId[];
  readonly agentIds?: readonly WorkduckId[];
  readonly referenceIds?: readonly WorkduckId[];
  readonly sourceReportTaskId?: WorkduckId;
  readonly decision?: Exclude<WorkduckQueueReviewDecision, "pending" | "approved">;
}

export interface WorkduckQueueWorkOrder {
  readonly schemaVersion: "workduck.queue-work-order/v1";
  readonly ref: QueueWorkOrderRef;
  readonly status: WorkduckRecordStatus;
  readonly createdAt: string;
  readonly agentName?: string;
  readonly sourceReport?: QueueResultReportRef;
  readonly tasks: readonly WorkduckQueueWorkOrderTask[];
}

export interface WorkduckQueueResultReportTask {
  readonly id: WorkduckId;
  readonly title: string;
  readonly summary: string;
  readonly filesChanged: readonly string[];
  readonly verification: readonly string[];
  readonly risks: readonly string[];
  readonly responseLanguage?: WorkduckQueueResponseLanguage;
}

export interface WorkduckQueueResultReport {
  readonly schemaVersion: "workduck.queue-result-report/v1";
  readonly ref: QueueResultReportRef;
  readonly status: WorkduckRecordStatus;
  readonly createdAt: string;
  readonly agentName?: string;
  readonly tasks: readonly WorkduckQueueResultReportTask[];
}

export interface WorkduckQueueProposalOption {
  readonly id: WorkduckId;
  readonly name: string;
  readonly summary: string;
  readonly strengths: readonly string[];
  readonly risks: readonly string[];
}

export interface WorkduckQueueProposalRecommendation {
  readonly optionId: WorkduckId;
  readonly reason: string;
}

export interface WorkduckQueueProposal {
  readonly schemaVersion: "workduck.queue-proposal/v1";
  readonly ref: QueueProposalRef;
  readonly status: WorkduckRecordStatus;
  readonly createdAt: string;
  readonly agentName?: string;
  readonly question: string;
  readonly summary: string;
  readonly options: readonly WorkduckQueueProposalOption[];
  readonly recommendation: WorkduckQueueProposalRecommendation | null;
  readonly nextWorkOrders: readonly WorkduckQueueWorkOrderTask[];
}

export function isWorkduckEntityKind(value: string): value is WorkduckEntityKind {
  return (workduckEntityKinds as readonly string[]).includes(value);
}

export function isWorkduckRecordStatus(value: string): value is WorkduckRecordStatus {
  return (workduckRecordStatuses as readonly string[]).includes(value);
}

export function isWorkduckRepoKind(value: string): value is WorkduckRepoKind {
  return (workduckRepoKinds as readonly string[]).includes(value);
}

export function isWorkduckCatalogArtifactKind(
  value: string
): value is WorkduckCatalogArtifactKind {
  return (workduckCatalogArtifactKinds as readonly string[]).includes(value);
}

export function isWorkduckRiskLevel(value: string): value is WorkduckRiskLevel {
  return (workduckRiskLevels as readonly string[]).includes(value);
}

export function isWorkduckServiceLevel(value: string): value is WorkduckServiceLevel {
  return (workduckServiceLevels as readonly string[]).includes(value);
}

export function isWorkduckQueueItemKind(value: string): value is WorkduckQueueItemKind {
  return (workduckQueueItemKinds as readonly string[]).includes(value);
}

export function isWorkduckQueueReviewDecision(
  value: string
): value is WorkduckQueueReviewDecision {
  return (workduckQueueReviewDecisions as readonly string[]).includes(value);
}
