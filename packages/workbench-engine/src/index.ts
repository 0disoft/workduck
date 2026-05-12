import type {
  AgentBriefRef,
  ArtifactRef,
  CatalogArtifactRef,
  GateRef,
  ProjectFolderRef,
  ProjectRef,
  RepoRef,
  ServiceRef,
  WorkduckEntityRef,
  WorkduckCatalogArtifact,
  WorkduckProjectFolder,
  WorkduckProjectRepoPlacement,
  WorkduckRepo,
  WorkduckService
} from "@workduck/core";
import { compileAgentBriefPrompt, type AgentBriefPromptInput } from "@workduck/prompts";
import type { WorkduckSchemaId } from "@workduck/schemas";

export type WorkbenchArtifactRole = "source" | "candidate" | "output";

export interface WorkbenchArtifactInput {
  readonly ref: ArtifactRef;
  readonly role: WorkbenchArtifactRole;
  readonly schemaId?: WorkduckSchemaId;
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

export interface WorkbenchRunPlanSummary {
  readonly project: ProjectRef;
  readonly entityRefs: readonly WorkduckEntityRef[];
  readonly schemaIds: readonly WorkduckSchemaId[];
  readonly gateRefs: readonly GateRef[];
  readonly brief?: AgentBriefRef;
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

  return input.folders
    .filter((folder) => folder.project.id === input.project.id)
    .map((folder) => {
      const repos = input.placements
        .filter(
          (placement) =>
            placement.project.id === input.project.id && placement.folder.id === folder.ref.id
        )
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
