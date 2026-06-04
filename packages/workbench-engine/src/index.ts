import type {
  AgentBriefRef,
  ArtifactRef,
  CatalogArtifactRef,
  GateRef,
  ProjectFolderRef,
  ProjectRef,
  RepoRef,
  RunRef,
  ServiceRef,
  ShellRunRef,
  WorkduckGate,
  WorkduckEntityRef,
  WorkduckCatalogArtifact,
  WorkduckProjectFolder,
  WorkduckProjectRepoPlacement,
  WorkduckRecordStatus,
  WorkduckRepo,
  WorkduckRiskLevel,
  WorkduckRun,
  WorkduckService,
  WorkduckShellRun,
  WorkduckShellRunApproval,
  WorkduckShellRunBlockerCode,
  WorkduckShellRunState
} from "@workduck/core";
import { compileAgentBriefPrompt, type AgentBriefPromptInput } from "@workduck/prompts";
import type { WorkduckSchemaId } from "@workduck/schemas";

export type WorkbenchArtifactRole = "source" | "candidate" | "output";
export type WorkbenchGateCheckState = "passed" | "warning" | "failed";
export type WorkbenchGateEvaluationState = "pending" | "passed" | "blocked";

export interface WorkbenchArtifactInput {
  readonly ref: ArtifactRef;
  readonly role: WorkbenchArtifactRole;
  readonly schemaId?: WorkduckSchemaId;
}

export interface WorkbenchGateCheckInput {
  readonly label: string;
  readonly state: WorkbenchGateCheckState;
  readonly details?: string;
}

export interface WorkbenchGateEvaluationInput {
  readonly gate: GateRef;
  readonly checks?: readonly WorkbenchGateCheckInput[];
  readonly riskLevel?: WorkduckRiskLevel;
  readonly status?: WorkduckRecordStatus;
}

export interface WorkbenchGateCheck {
  readonly label: string;
  readonly state: WorkbenchGateCheckState;
  readonly details?: string;
}

export interface WorkbenchGateEvaluation {
  readonly gate: WorkduckGate;
  readonly state: WorkbenchGateEvaluationState;
  readonly checks: readonly WorkbenchGateCheck[];
}

export interface WorkbenchRunPlanInput {
  readonly project: ProjectRef;
  readonly artifacts: readonly WorkbenchArtifactInput[];
  readonly gates: readonly GateRef[];
  readonly brief?: AgentBriefRef;
}

export interface WorkbenchRunBriefInput extends WorkbenchRunPlanInput {
  readonly title: string;
  readonly instructions?: readonly string[];
}

export interface WorkbenchLocalRunLoopInput extends WorkbenchRunBriefInput {
  readonly run: RunRef;
  readonly repoRefs?: readonly RepoRef[];
  readonly runStatus?: WorkduckRecordStatus;
  readonly gateEvaluations?: readonly WorkbenchGateEvaluationInput[];
}

export interface WorkbenchLocalShellRunInput {
  readonly ref: ShellRunRef;
  readonly run: RunRef;
  readonly command: string;
  readonly cwd: string;
  readonly approval: WorkduckShellRunApproval;
  readonly status?: WorkduckRecordStatus;
  readonly outputTail?: string;
  readonly diffSummary?: string;
  readonly exitCode?: number;
  readonly startedAt?: string;
  readonly finishedAt?: string;
}

export interface WorkbenchRunPlanSummary {
  readonly project: ProjectRef;
  readonly entityRefs: readonly WorkduckEntityRef[];
  readonly schemaIds: readonly WorkduckSchemaId[];
  readonly gateRefs: readonly GateRef[];
  readonly brief?: AgentBriefRef;
}

export interface WorkbenchLocalRunLoop {
  readonly briefMarkdown: string;
  readonly plan: WorkbenchRunPlanSummary;
  readonly run: WorkduckRun;
  readonly gateEvaluations: readonly WorkbenchGateEvaluation[];
  readonly state: WorkbenchGateEvaluationState;
}

export interface WorkbenchProjectInventoryInput {
  readonly project: ProjectRef;
  readonly repos: readonly WorkduckRepo[];
  readonly folders: readonly WorkduckProjectFolder[];
  readonly placements: readonly WorkduckProjectRepoPlacement[];
  readonly services: readonly WorkduckService[];
  readonly catalogArtifacts: readonly WorkduckCatalogArtifact[];
}

export interface WorkbenchProjectFolderRepoGroup {
  readonly folder: WorkduckProjectFolder;
  readonly repos: readonly WorkduckRepo[];
}

export interface WorkbenchProjectInventorySummary {
  readonly project: ProjectRef;
  readonly repoRefs: readonly RepoRef[];
  readonly activeRepoRefs: readonly RepoRef[];
  readonly reservedRepoRefs: readonly RepoRef[];
  readonly folderRefs: readonly ProjectFolderRef[];
  readonly serviceRefs: readonly ServiceRef[];
  readonly catalogArtifactRefs: readonly CatalogArtifactRef[];
  readonly entityRefs: readonly WorkduckEntityRef[];
}

export function compileWorkbenchRunBrief(input: WorkbenchRunBriefInput): string {
  const promptInput: AgentBriefPromptInput = {
    title: input.title,
    project: input.project,
    artifacts: input.artifacts,
    gates: input.gates,
    ...(input.brief === undefined ? {} : { brief: input.brief }),
    ...(input.instructions === undefined ? {} : { instructions: input.instructions })
  };

  return compileAgentBriefPrompt(promptInput);
}

export function createWorkbenchLocalRunLoop(
  input: WorkbenchLocalRunLoopInput
): WorkbenchLocalRunLoop {
  const briefMarkdown = compileWorkbenchRunBrief(input);
  const plan = summarizeWorkbenchRunPlan(input);
  const gateEvaluations = buildGateEvaluations(input);
  const state = evaluateRunLoopState(gateEvaluations);
  const run = buildLocalRun(input);

  return {
    briefMarkdown,
    plan,
    run,
    gateEvaluations,
    state
  };
}

export function createWorkbenchLocalShellRun(input: WorkbenchLocalShellRunInput): WorkduckShellRun {
  const command = input.command.trim();
  const cwd = input.cwd.trim();
  const outputTail = normalizeOptionalText(input.outputTail);
  const diffSummary = normalizeOptionalText(input.diffSummary);
  const startedAt = normalizeOptionalText(input.startedAt);
  const finishedAt = normalizeOptionalText(input.finishedAt);
  const blockers = collectShellRunBlockers({
    command,
    cwd,
    approval: input.approval
  });
  const state = determineShellRunState({
    blockers,
    ...(startedAt === undefined ? {} : { startedAt }),
    ...(input.exitCode === undefined ? {} : { exitCode: input.exitCode })
  });

  return {
    ref: input.ref,
    status: input.status ?? "active",
    run: input.run,
    command,
    cwd,
    approval: normalizeShellRunApproval(input.approval),
    state,
    blockers,
    ...(outputTail === undefined ? {} : { outputTail }),
    ...(diffSummary === undefined ? {} : { diffSummary }),
    ...(input.exitCode === undefined ? {} : { exitCode: input.exitCode }),
    ...(startedAt === undefined ? {} : { startedAt }),
    ...(finishedAt === undefined ? {} : { finishedAt })
  };
}

export function createEntityRefKey(ref: Pick<WorkduckEntityRef, "kind" | "id">): string {
  return `${ref.kind}:${ref.id}`;
}

export function collectProjectRepos(input: {
  readonly project: ProjectRef;
  readonly repos: readonly WorkduckRepo[];
  readonly placements: readonly WorkduckProjectRepoPlacement[];
}): readonly WorkduckRepo[] {
  const placedRepoKeys = new Set(
    input.placements
      .filter((placement) => placement.project.id === input.project.id)
      .map((placement) => createEntityRefKey(placement.repo))
  );

  return input.repos.filter((repo) => placedRepoKeys.has(createEntityRefKey(repo.ref)));
}

export function groupProjectReposByFolder(input: {
  readonly project: ProjectRef;
  readonly repos: readonly WorkduckRepo[];
  readonly folders: readonly WorkduckProjectFolder[];
  readonly placements: readonly WorkduckProjectRepoPlacement[];
}): readonly WorkbenchProjectFolderRepoGroup[] {
  const repoByKey = new Map(input.repos.map((repo) => [createEntityRefKey(repo.ref), repo]));
  const placementsByFolderId = new Map<string, WorkduckProjectRepoPlacement[]>();

  for (const placement of input.placements) {
    if (placement.project.id !== input.project.id) {
      continue;
    }

    const folderPlacements = placementsByFolderId.get(placement.folder.id);

    if (folderPlacements === undefined) {
      placementsByFolderId.set(placement.folder.id, [placement]);
      continue;
    }

    folderPlacements.push(placement);
  }

  return input.folders
    .filter((folder) => folder.project.id === input.project.id)
    .map((folder) => {
      const repos = (placementsByFolderId.get(folder.ref.id) ?? [])
        .map((placement) => repoByKey.get(createEntityRefKey(placement.repo)))
        .filter((repo): repo is WorkduckRepo => repo !== undefined);

      return {
        folder,
        repos
      };
    });
}

export function summarizeProjectInventory(
  input: WorkbenchProjectInventoryInput
): WorkbenchProjectInventorySummary {
  const repos = collectProjectRepos(input);
  const repoKeys = new Set(repos.map((repo) => createEntityRefKey(repo.ref)));
  const placements = input.placements.filter(
    (placement) => placement.project.id === input.project.id
  );
  const services = input.services.filter(
    (service) =>
      service.project?.id === input.project.id ||
      (service.repo !== undefined && repoKeys.has(createEntityRefKey(service.repo)))
  );
  const catalogArtifacts = input.catalogArtifacts.filter(
    (artifact) => artifact.project?.id === input.project.id
  );
  const folderRefs = input.folders
    .filter((folder) => folder.project.id === input.project.id)
    .map((folder) => folder.ref);
  const serviceRefs = services.map((service) => service.ref);
  const catalogArtifactRefs = catalogArtifacts.map((artifact) => artifact.ref);
  const repoRefs = repos.map((repo) => repo.ref);
  const activeRepoRefs = repos
    .filter((repo) => repo.status === "active")
    .map((repo) => repo.ref);
  const reservedRepoRefs = repos
    .filter((repo) => repo.status === "reserved")
    .map((repo) => repo.ref);
  const entityRefs = collectUniqueEntityRefs([
    input.project,
    ...repoRefs,
    ...folderRefs,
    ...placements.map((placement) => placement.ref),
    ...serviceRefs,
    ...catalogArtifactRefs
  ]);

  return {
    project: input.project,
    repoRefs,
    activeRepoRefs,
    reservedRepoRefs,
    folderRefs,
    serviceRefs,
    catalogArtifactRefs,
    entityRefs
  };
}

export function collectUniqueEntityRefs(
  refs: readonly WorkduckEntityRef[]
): readonly WorkduckEntityRef[] {
  const seen = new Set<string>();
  const result: WorkduckEntityRef[] = [];

  for (const ref of refs) {
    const key = createEntityRefKey(ref);

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(ref);
  }

  return result;
}

export function collectArtifactSchemaIds(
  artifacts: readonly WorkbenchArtifactInput[]
): readonly WorkduckSchemaId[] {
  const seen = new Set<WorkduckSchemaId>();
  const result: WorkduckSchemaId[] = [];

  for (const artifact of artifacts) {
    if (artifact.schemaId === undefined || seen.has(artifact.schemaId)) {
      continue;
    }

    seen.add(artifact.schemaId);
    result.push(artifact.schemaId);
  }

  return result;
}

export function summarizeWorkbenchRunPlan(
  input: WorkbenchRunPlanInput
): WorkbenchRunPlanSummary {
  const entityRefs = collectUniqueEntityRefs([
    input.project,
    ...(input.brief === undefined ? [] : [input.brief]),
    ...input.artifacts.map((artifact) => artifact.ref),
    ...input.gates
  ]);

  const summary = {
    project: input.project,
    entityRefs,
    schemaIds: collectArtifactSchemaIds(input.artifacts),
    gateRefs: input.gates
  };

  if (input.brief === undefined) {
    return summary;
  }

  return {
    ...summary,
    brief: input.brief
  };
}

function buildLocalRun(input: WorkbenchLocalRunLoopInput): WorkduckRun {
  const artifactRefs = collectUniqueTypedEntityRefs(
    input.artifacts.map((artifact) => artifact.ref)
  );
  const repoRefs = collectUniqueTypedEntityRefs(input.repoRefs ?? []);
  const runBase = {
    ref: input.run,
    status: input.runStatus ?? "active",
    project: input.project,
    repoRefs,
    artifactRefs,
    gateRefs: input.gates
  };

  if (input.brief === undefined) {
    return runBase;
  }

  return {
    ...runBase,
    brief: input.brief
  };
}

function buildGateEvaluations(
  input: WorkbenchLocalRunLoopInput
): readonly WorkbenchGateEvaluation[] {
  const evaluationByGateKey = new Map(
    (input.gateEvaluations ?? []).map((evaluation) => [
      createEntityRefKey(evaluation.gate),
      evaluation
    ])
  );

  return input.gates.map((gate) => {
    const evaluation = evaluationByGateKey.get(createEntityRefKey(gate));
    const checks = normalizeGateChecks(evaluation?.checks ?? []);

    return {
      gate: {
        ref: gate,
        status: evaluation?.status ?? "active",
        project: input.project,
        ...(evaluation?.riskLevel === undefined ? {} : { riskLevel: evaluation.riskLevel })
      },
      state: evaluateGateState(checks),
      checks
    };
  });
}

function normalizeGateChecks(
  checks: readonly WorkbenchGateCheckInput[]
): readonly WorkbenchGateCheck[] {
  return checks
    .map((check) => {
      const label = check.label.trim();
      const details = check.details?.trim();

      return {
        label,
        state: check.state,
        ...(details === undefined || details.length === 0 ? {} : { details })
      };
    })
    .filter((check) => check.label.length > 0);
}

function evaluateGateState(
  checks: readonly WorkbenchGateCheck[]
): WorkbenchGateEvaluationState {
  if (checks.length === 0) {
    return "pending";
  }

  if (checks.some((check) => check.state === "failed")) {
    return "blocked";
  }

  if (checks.every((check) => check.state === "passed")) {
    return "passed";
  }

  return "pending";
}

function evaluateRunLoopState(
  gateEvaluations: readonly WorkbenchGateEvaluation[]
): WorkbenchGateEvaluationState {
  if (gateEvaluations.length === 0) {
    return "pending";
  }

  if (gateEvaluations.some((evaluation) => evaluation.state === "blocked")) {
    return "blocked";
  }

  if (gateEvaluations.every((evaluation) => evaluation.state === "passed")) {
    return "passed";
  }

  return "pending";
}

function collectShellRunBlockers(input: {
  readonly command: string;
  readonly cwd: string;
  readonly approval: WorkduckShellRunApproval;
}): readonly WorkduckShellRunBlockerCode[] {
  const blockers: WorkduckShellRunBlockerCode[] = [];

  if (input.command.length === 0) {
    blockers.push("missing-command");
  }

  if (input.cwd.length === 0) {
    blockers.push("missing-cwd");
  }

  if (input.approval.state === "pending") {
    blockers.push("approval-pending");
  }

  if (input.approval.state === "rejected") {
    blockers.push("approval-rejected");
  }

  return blockers;
}

function determineShellRunState(input: {
  readonly blockers: readonly WorkduckShellRunBlockerCode[];
  readonly startedAt?: string;
  readonly exitCode?: number;
}): WorkduckShellRunState {
  if (input.blockers.length > 0) {
    return "blocked";
  }

  if (input.exitCode !== undefined) {
    return input.exitCode === 0 ? "succeeded" : "failed";
  }

  if (input.startedAt !== undefined) {
    return "running";
  }

  return "ready";
}

function normalizeShellRunApproval(approval: WorkduckShellRunApproval): WorkduckShellRunApproval {
  const approvedBy = normalizeOptionalText(approval.approvedBy);
  const approvedAt = normalizeOptionalText(approval.approvedAt);
  const reason = normalizeOptionalText(approval.reason);

  return {
    state: approval.state,
    ...(approvedBy === undefined ? {} : { approvedBy }),
    ...(approvedAt === undefined ? {} : { approvedAt }),
    ...(reason === undefined ? {} : { reason })
  };
}

function normalizeOptionalText(value: string | undefined): string | undefined {
  const normalized = value?.trim();

  if (normalized === undefined || normalized.length === 0) {
    return undefined;
  }

  return normalized;
}

function collectUniqueTypedEntityRefs<T extends WorkduckEntityRef>(
  refs: readonly T[]
): readonly T[] {
  const seen = new Set<string>();
  const result: T[] = [];

  for (const ref of refs) {
    const key = createEntityRefKey(ref);

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(ref);
  }

  return result;
}
