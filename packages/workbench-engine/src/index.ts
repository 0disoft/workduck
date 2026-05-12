import type {
  AgentBriefRef,
  ArtifactRef,
  GateRef,
  ProjectRef,
  WorkduckEntityRef
} from "@workduck/core";
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

export interface WorkbenchRunPlanSummary {
  readonly project: ProjectRef;
  readonly entityRefs: readonly WorkduckEntityRef[];
  readonly schemaIds: readonly WorkduckSchemaId[];
  readonly gateRefs: readonly GateRef[];
  readonly brief?: AgentBriefRef;
}

export function createEntityRefKey(ref: Pick<WorkduckEntityRef, "kind" | "id">): string {
  return `${ref.kind}:${ref.id}`;
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
