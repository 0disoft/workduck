import type {
  AgentBriefRef,
  ArtifactRef,
  GateRef,
  ProjectRef,
  WorkduckEntityRef
} from "@workduck/core";
import type { WorkduckSchemaId } from "@workduck/schemas";

const promptBlockSeparator = "\n\n";

export type PromptSectionRole =
  | "artifact"
  | "constraint"
  | "context"
  | "gate"
  | "instruction"
  | "output";

export interface PromptSectionInput {
  readonly title: string;
  readonly body: string | readonly string[];
  readonly role?: PromptSectionRole;
}

export interface PromptDocumentInput {
  readonly title: string;
  readonly sections: readonly PromptSectionInput[];
}

export interface AgentBriefArtifactInput {
  readonly ref: ArtifactRef;
  readonly role: "candidate" | "output" | "source";
  readonly schemaId?: WorkduckSchemaId;
}

export interface AgentBriefPromptInput {
  readonly title: string;
  readonly project: ProjectRef;
  readonly artifacts: readonly AgentBriefArtifactInput[];
  readonly gates: readonly GateRef[];
  readonly brief?: AgentBriefRef;
  readonly instructions?: readonly string[];
}

export function compilePromptDocument(input: PromptDocumentInput): string {
  return [
    formatPromptHeading(input.title, 1),
    ...input.sections.map(compilePromptSection)
  ]
    .filter((block) => block.length > 0)
    .join(promptBlockSeparator)
    .concat("\n");
}

export function compileAgentBriefPrompt(input: AgentBriefPromptInput): string {
  return compilePromptDocument({
    title: input.title,
    sections: buildAgentBriefSections(input)
  });
}

export function formatEntityRef(ref: WorkduckEntityRef): string {
  return `${ref.kind}:${ref.id} - ${ref.label}`;
}

function buildAgentBriefSections(input: AgentBriefPromptInput): readonly PromptSectionInput[] {
  return [
    {
      title: "Project",
      role: "context",
      body: formatEntityRef(input.project)
    },
    ...optionalSection(input.brief, (brief) => ({
      title: "Agent Brief",
      role: "context" as const,
      body: formatEntityRef(brief)
    })),
    ...optionalListSection("Instructions", "instruction", input.instructions),
    ...optionalListSection(
      "Artifacts",
      "artifact",
      input.artifacts.map(formatAgentBriefArtifact)
    ),
    ...optionalListSection("Gates", "gate", input.gates.map(formatEntityRef))
  ];
}

function compilePromptSection(input: PromptSectionInput): string {
  const title = input.role === undefined ? input.title : `${input.title} (${input.role})`;
  const body = formatPromptBody(input.body);

  if (body.length === 0) {
    return "";
  }

  return [formatPromptHeading(title, 2), body].join("\n");
}

function formatPromptHeading(value: string, level: 1 | 2): string {
  return `${"#".repeat(level)} ${value.trim()}`;
}

function formatPromptBody(body: string | readonly string[]): string {
  if (typeof body === "string") {
    return body.trim();
  }

  return body.map((item) => `- ${item.trim()}`).filter((item) => item !== "- ").join("\n");
}

function formatAgentBriefArtifact(artifact: AgentBriefArtifactInput): string {
  const schemaSuffix =
    artifact.schemaId === undefined ? "" : ` [schema: ${artifact.schemaId}]`;

  return `${artifact.role}: ${formatEntityRef(artifact.ref)}${schemaSuffix}`;
}

function optionalListSection(
  title: string,
  role: PromptSectionRole,
  items: readonly string[] | undefined
): readonly PromptSectionInput[] {
  const body = items?.filter((item) => item.trim().length > 0) ?? [];

  if (body.length === 0) {
    return [];
  }

  return [
    {
      title,
      role,
      body
    }
  ];
}

function optionalSection<T>(
  value: T | undefined,
  build: (value: T) => PromptSectionInput
): readonly PromptSectionInput[] {
  return value === undefined ? [] : [build(value)];
}
