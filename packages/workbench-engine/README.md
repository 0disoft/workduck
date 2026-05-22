# @workduck/workbench-engine

Pure orchestration helpers for Workduck workbench data.

This package may import `@workduck/core`, `@workduck/schemas`, and
`@workduck/prompts`. It must not import SvelteKit, Tauri, SQLite, filesystem
APIs, shell execution, or agent SDKs.

Current boundary:

- pure run-plan summarization
- entity reference collection
- schema reference collection
- Agent Brief prompt compilation from run-plan inputs
- local Agent Brief -> Run -> Gate loop assembly from already-loaded data
- local shell-run record assembly with explicit approval blockers, command,
  output tail, diff summary, and exit status fields
- multi-repo project inventory summaries
- project folder to repo grouping helpers

Storage, command execution, model calls, and desktop APIs belong outside this
package. `createWorkbenchLocalShellRun` only creates a record and derives
whether it is blocked, ready, running, succeeded, or failed; it does not execute
the command.
