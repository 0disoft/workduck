# @workduck/workbench-engine

Pure orchestration helpers for Workduck workbench data.

This package may import `@workduck/core` and `@workduck/schemas`. It must not
import SvelteKit, Tauri, SQLite, filesystem APIs, shell execution, or agent SDKs.

Current boundary:

- pure run-plan summarization
- entity reference collection
- schema reference collection

Storage, command execution, model calls, and desktop APIs belong outside this
package.
