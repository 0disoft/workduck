import {
  compileAgentBriefPrompt,
  formatEntityRef,
  type AgentBriefPromptInput
} from "@workduck/prompts";
import {
  createWorkbenchLocalRunLoop,
  type WorkbenchGateEvaluation,
  type WorkbenchLocalRunLoop,
  type WorkbenchLocalRunLoopInput
} from "@workduck/workbench-engine";

type AgentRefForMarkdown = Parameters<typeof formatEntityRef>[0];

export const agentBriefPromptExportTargets = [
  "claude-code",
  "codex",
  "cursor",
  "opencode"
] as const;

export type AgentBriefPromptExportTarget = (typeof agentBriefPromptExportTargets)[number];
export type AgentAdapterKind = AgentBriefPromptExportTarget | "generic-markdown";
export type AgentAdapterCapability =
  | "agent-brief-markdown"
  | "agents-md"
  | "local-shell-run-records";
export type AgentAdapterExecutionBoundary = "export-only";

export interface AgentBriefPromptExportProfile {
  readonly target: AgentBriefPromptExportTarget;
  readonly label: string;
  readonly filename: string;
}

export interface AgentAdapterProfile {
  readonly kind: AgentAdapterKind;
  readonly label: string;
  readonly executionBoundary: AgentAdapterExecutionBoundary;
  readonly capabilities: readonly AgentAdapterCapability[];
  readonly briefExportTarget?: AgentBriefPromptExportTarget;
  readonly briefFilename?: string;
}

export interface AgentBriefPromptExportInput extends AgentBriefPromptInput {
  readonly target: AgentBriefPromptExportTarget;
}

export interface AgentBriefPromptExportsInput extends AgentBriefPromptInput {
  readonly targets?: readonly AgentBriefPromptExportTarget[];
}

export interface AgentBriefPromptExport {
  readonly target: AgentBriefPromptExportTarget;
  readonly label: string;
  readonly filename: string;
  readonly mediaType: "text/markdown";
  readonly content: string;
}

export interface AgentsMarkdownInput extends WorkbenchLocalRunLoopInput {
  readonly documentTitle?: string;
  readonly workingRules?: readonly string[];
}

export interface AgentsMarkdownFile {
  readonly filename: "AGENTS.md";
  readonly mediaType: "text/markdown";
  readonly content: string;
  readonly runLoop: WorkbenchLocalRunLoop;
}

export const agentBriefPromptExportProfiles = {
  "claude-code": {
    target: "claude-code",
    label: "Claude Code",
    filename: "claude-code-brief.md"
  },
  codex: {
    target: "codex",
    label: "Codex",
    filename: "codex-brief.md"
  },
  cursor: {
    target: "cursor",
    label: "Cursor",
    filename: "cursor-brief.md"
  },
  opencode: {
    target: "opencode",
    label: "OpenCode",
    filename: "opencode-brief.md"
  }
} satisfies Record<AgentBriefPromptExportTarget, AgentBriefPromptExportProfile>;

export const agentAdapterKinds = [
  "claude-code",
  "codex",
  "cursor",
  "opencode",
  "generic-markdown"
] as const satisfies readonly AgentAdapterKind[];

export const agentAdapterProfiles = {
  "claude-code": createBriefAgentAdapterProfile("claude-code", ["agents-md", "local-shell-run-records"]),
  codex: createBriefAgentAdapterProfile("codex", ["agents-md", "local-shell-run-records"]),
  cursor: createBriefAgentAdapterProfile("cursor", ["agents-md", "local-shell-run-records"]),
  opencode: createBriefAgentAdapterProfile("opencode", ["agents-md", "local-shell-run-records"]),
  "generic-markdown": {
    kind: "generic-markdown",
    label: "Generic Markdown",
    executionBoundary: "export-only",
    capabilities: ["agent-brief-markdown"]
  }
} satisfies Record<AgentAdapterKind, AgentAdapterProfile>;

export function getAgentBriefPromptExportProfile(
  target: AgentBriefPromptExportTarget
): AgentBriefPromptExportProfile {
  return agentBriefPromptExportProfiles[target];
}

export function listAgentAdapterProfiles(): readonly AgentAdapterProfile[] {
  return agentAdapterKinds.map(getAgentAdapterProfile);
}

export function getAgentAdapterProfile(kind: AgentAdapterKind): AgentAdapterProfile {
  return agentAdapterProfiles[kind];
}

export function isAgentAdapterKind(value: string): value is AgentAdapterKind {
  return (agentAdapterKinds as readonly string[]).includes(value);
}

export function compileAgentBriefPromptExport(
  input: AgentBriefPromptExportInput
): AgentBriefPromptExport {
  const profile = getAgentBriefPromptExportProfile(input.target);

  return {
    target: profile.target,
    label: profile.label,
    filename: profile.filename,
    mediaType: "text/markdown",
    content: compileAgentBriefPrompt(input)
  };
}

export function compileAgentBriefPromptExports(
  input: AgentBriefPromptExportsInput
): readonly AgentBriefPromptExport[] {
  const { targets = agentBriefPromptExportTargets, ...promptInput } = input;

  return targets.map((target) => compileAgentBriefPromptExport({ ...promptInput, target }));
}

export function compileAgentsMarkdown(input: AgentsMarkdownInput): string {
  return compileAgentsMarkdownFromLoop(input, createWorkbenchLocalRunLoop(input));
}

export function compileAgentsMarkdownFile(input: AgentsMarkdownInput): AgentsMarkdownFile {
  const runLoop = createWorkbenchLocalRunLoop(input);

  return {
    filename: "AGENTS.md",
    mediaType: "text/markdown",
    content: compileAgentsMarkdownFromLoop(input, runLoop),
    runLoop
  };
}

function compileAgentsMarkdownFromLoop(
  input: AgentsMarkdownInput,
  runLoop: WorkbenchLocalRunLoop
): string {
  const title = normalizeMarkdownText(input.documentTitle) ?? "AGENTS.md";

  return [
    `# ${title}`,
    compileRunSection(runLoop),
    compileBriefSection(runLoop.briefMarkdown),
    compileGateSection(runLoop.gateEvaluations),
    compileWorkingRulesSection(input.workingRules)
  ]
    .filter((section) => section.length > 0)
    .join("\n\n")
    .concat("\n");
}

function createBriefAgentAdapterProfile(
  target: AgentBriefPromptExportTarget,
  extraCapabilities: readonly AgentAdapterCapability[] = []
): AgentAdapterProfile {
  const profile = getAgentBriefPromptExportProfile(target);

  return {
    kind: target,
    label: profile.label,
    executionBoundary: "export-only",
    capabilities: ["agent-brief-markdown", ...extraCapabilities],
    briefExportTarget: profile.target,
    briefFilename: profile.filename
  };
}

function compileRunSection(runLoop: WorkbenchLocalRunLoop): string {
  return [
    "## Run",
    formatMarkdownList([
      `Project: ${formatEntityRef(runLoop.run.project)}`,
      `Run: ${formatEntityRef(runLoop.run.ref)}`,
      `Run status: ${runLoop.run.status}`,
      `Gate state: ${runLoop.state}`,
      ...formatOptionalRefs("Repositories", runLoop.run.repoRefs),
      ...formatOptionalRefs("Artifacts", runLoop.run.artifactRefs)
    ])
  ].join("\n");
}

function compileBriefSection(briefMarkdown: string): string {
  const body = shiftMarkdownHeadings(briefMarkdown.trim(), 2);

  if (body.length === 0) {
    return "";
  }

  return ["## Agent Brief", body].join("\n\n");
}

function compileGateSection(gateEvaluations: readonly WorkbenchGateEvaluation[]): string {
  if (gateEvaluations.length === 0) {
    return "";
  }

  return [
    "## Gates",
    gateEvaluations
      .map((evaluation) => {
        const checks = evaluation.checks.map((check) => {
          const details = check.details === undefined ? "" : ` - ${check.details}`;

          return `  - ${check.state}: ${check.label}${details}`;
        });

        return [
          `- ${evaluation.state}: ${formatEntityRef(evaluation.gate.ref)}`,
          ...checks
        ].join("\n");
      })
      .join("\n")
  ].join("\n");
}

function compileWorkingRulesSection(workingRules: readonly string[] | undefined): string {
  const rules = [
    "Use the local brief, run, artifacts, and gates as the source of truth for this run.",
    "Treat blocked gates as blockers until the caller supplies new local evidence.",
    "Do not claim file changes, command execution, or external agent work unless the caller provides verified evidence.",
    "Follow the nearest repository instructions and configured verification contract before reporting completion.",
    ...(workingRules ?? [])
  ]
    .map((rule) => rule.trim())
    .filter((rule) => rule.length > 0);

  return ["## Working Rules", formatMarkdownList(rules)].join("\n");
}

function formatOptionalRefs(
  label: string,
  refs: readonly AgentRefForMarkdown[]
): readonly string[] {
  if (refs.length === 0) {
    return [];
  }

  return [`${label}: ${refs.map(formatEntityRef).join(", ")}`];
}

function formatMarkdownList(items: readonly string[]): string {
  return items.map((item) => `- ${item}`).join("\n");
}

function normalizeMarkdownText(value: string | undefined): string | undefined {
  const normalized = value?.trim();

  return normalized === undefined || normalized.length === 0 ? undefined : normalized;
}

function shiftMarkdownHeadings(markdown: string, levels: number): string {
  const prefix = "#".repeat(levels);

  return markdown
    .split("\n")
    .map((line) => (line.startsWith("#") ? `${prefix}${line}` : line))
    .join("\n");
}
