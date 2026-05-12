# @workduck/agents

Pure agent-facing export helpers for Workduck.

This package may import `@workduck/prompts`. It must not import SvelteKit,
Tauri, SQLite, filesystem APIs, shell execution, model SDKs, MCP clients, or
agent adapters.

Current boundary:

- Agent Brief prompt export targets for Claude Code, Codex, Cursor, and
  OpenCode
- deterministic Markdown export records with target labels and filenames

SDK calls, local command execution, permissions, sandboxing, run traces, and
adapter configuration belong outside this package.
