# @workduck/agents

Pure agent-facing export helpers for Workduck.

This package may import `@workduck/prompts` and `@workduck/workbench-engine`.
It must not import SvelteKit, Tauri, SQLite, filesystem APIs, shell execution,
model SDKs, MCP clients, or agent adapters.

Current boundary:

- Agent Brief prompt export targets for Claude Code, Codex, Cursor, and
  OpenCode
- export-only adapter profiles for Claude Code, Codex, Cursor, OpenCode, and
  generic Markdown consumers
- AGENTS.md Markdown generation from local brief, run, and gate data
- deterministic Markdown export records with target labels and filenames

SDK calls, local command execution, permissions, sandboxing, run traces, and
provider runtime configuration belong outside this package.
