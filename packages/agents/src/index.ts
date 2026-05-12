import { compileAgentBriefPrompt, type AgentBriefPromptInput } from "@workduck/prompts";

export const agentBriefPromptExportTargets = [
  "claude-code",
  "codex",
  "cursor",
  "opencode"
] as const;

export type AgentBriefPromptExportTarget = (typeof agentBriefPromptExportTargets)[number];

export interface AgentBriefPromptExportProfile {
  readonly target: AgentBriefPromptExportTarget;
  readonly label: string;
  readonly filename: string;
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

export function getAgentBriefPromptExportProfile(
  target: AgentBriefPromptExportTarget
): AgentBriefPromptExportProfile {
  return agentBriefPromptExportProfiles[target];
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
