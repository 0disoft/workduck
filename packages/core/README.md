# @workduck/core

Framework-neutral domain vocabulary for Workduck.

This package owns stable TypeScript names shared by UI, engine, schemas, and
adapters. It must not import SvelteKit, Tauri, SQLite, filesystem APIs, or agent
SDKs.

Current boundary:

- entity kind names
- lightweight entity references
- multi-repository project model types
- service and catalog artifact vocabulary
- pure helpers for domain vocabulary
