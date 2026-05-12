# @workduck/schemas

Framework-neutral schema contracts for Workduck domain data.

This package may import `@workduck/core` domain vocabulary. It must not import
SvelteKit, Tauri, SQLite, filesystem APIs, or agent SDKs.

Current boundary:

- stable schema identifiers
- JSON Schema-compatible plain objects
- schema registries for shared domain shapes

Runtime validation libraries should be added only when a concrete parsing or
validation workflow needs them.
