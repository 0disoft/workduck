export const workduckEntityKinds = [
  "project",
  "artifact",
  "agent-brief",
  "run",
  "gate"
] as const;

export type WorkduckEntityKind = (typeof workduckEntityKinds)[number];

export type WorkduckId = string;

export interface WorkduckEntityRef {
  readonly id: WorkduckId;
  readonly kind: WorkduckEntityKind;
  readonly label: string;
}

export type ProjectRef = WorkduckEntityRef & { readonly kind: "project" };
export type ArtifactRef = WorkduckEntityRef & { readonly kind: "artifact" };
export type AgentBriefRef = WorkduckEntityRef & { readonly kind: "agent-brief" };
export type RunRef = WorkduckEntityRef & { readonly kind: "run" };
export type GateRef = WorkduckEntityRef & { readonly kind: "gate" };

export function isWorkduckEntityKind(value: string): value is WorkduckEntityKind {
  return (workduckEntityKinds as readonly string[]).includes(value);
}
