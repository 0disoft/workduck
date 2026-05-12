# @workduck/prompts

Framework-neutral prompt and brief compilation helpers for Workduck.

This package may import `@workduck/core` and `@workduck/schemas`. It must not
import SvelteKit, Tauri, SQLite, filesystem APIs, shell execution, model SDKs,
or agent adapters.

Current boundary:

- deterministic Markdown prompt document compilation
- Agent Brief prompt inputs
- prompt-safe formatting helpers for entity, artifact, schema, and gate refs

Agent-specific prompt export, model calls, shell execution, and adapter
configuration belong outside this package.
