# Roadmap

This roadmap records Workduck's current build order. It should stay grounded in
working product surfaces and should not list speculative dependencies as active
work.

## In Place

### Runtime And Shell

- Static SvelteKit UI loaded by a Tauri 2 desktop shell.
- Rust command boundary for filesystem, Git, sync, tray, window, and SQLite
  operations.
- Custom title bar, resizable sidebar, tray integration, startup setting,
  minimize-to-tray setting, and workspace inactivity lock setting.
- Language and interface font size appearance settings.

### Workspace And Sync

- Workspace profiles with local paths, per-workspace password locking, session
  unlock, unlock retry delay, manual lock, and inactivity auto-lock.
- Workspace path repair for synced workspace metadata that points to a missing
  local folder on the current device.
- Optional workspace repository bootstrap creates the workspace folder layout,
  initializes Git, installs mustflow files, writes minimal mustflow package
  metadata when no `package.json` exists, and appends a Workduck `.gitignore`
  block that ignores `projects/` while keeping `queue/` and `.workduck/`
  trackable. Existing unlocked workspaces can run the same preparation from the
  workspace list.
- Workspace repository controls follow the local Git state: prepare when the
  workspace is not initialized, publish when it has Git but no remote, and
  fetch, pull, and push when a remote exists.
- Settings tabs for appearance, workspaces, encrypted sync, and system options.
- Encrypted workspace, project, group, and repository metadata sync file
  export/import.
- Repository local paths are synced as workspace-relative paths when possible;
  raw repository absolute paths are not written into the sync payload.
- Optional Git pull and push for the selected encrypted sync folder.
- Environment variable vault UI for API keys, tokens, accounts, passwords, and
  tags.
- Queue menu with workspace `queue/reports`, `queue/work-orders`, and
  `queue/proposals` folder creation, queued JSON listing, structured
  result-report review, internal work-order and proposal rendering, and
  follow-up work-order JSON creation.
- Workspace-owned `.workduck/` metadata folder for reference, agent, persona,
  skill, and encrypted Environment vault files. Plaintext secret values are not
  written to `.workduck`.

### Projects And Repositories

- Project board organized as Project -> Group -> Repository.
- Workspace project folders created under `<workspace>/projects/`.
- Project and group descriptions with edit actions.
- Project cards show group and repository counts.
- Group cards show repository counts.
- Delete confirmation can remove metadata only, or also remove the matching
  local folder when it is under `<workspace>/projects/`.
- Repository cards support local Git detection, clone, Git init, fetch, pull,
  push, publish, tags, and folder opening.
- Projects, groups, and repositories can reference GitHub token entries from
  the Environment vault, with repository-level selection overriding group and
  project defaults.
- Repository cards show operation status, preserve failure messages on the
  affected card, and block duplicate clicks during long-running operations.
- Repository operation records for clone, init, fetch, pull, push, and publish
  are stored in SQLite.
- Repository filters for tags, pull-needed repositories, and push-needed
  repositories.
- Project board metadata is stored in SQLite by workspace, with legacy
  browser-stored metadata promoted on first read.

### Data And Packages

- Rust SQLite boundary with WAL, foreign keys, busy timeout, migrations,
  checksum drift protection, JSON artifact blobs, and FTS5 indexing.
- Workspace packages for core vocabulary, shared schemas, prompt compilation,
  agent export, and workbench orchestration.
- Agent Brief Markdown export targets for Claude Code, Codex, Cursor, and
  OpenCode.
- Queue result-report, work-order, and proposal JSON contracts in the shared
  core and schema packages.
- Skills menu with workspace-local Workduck skills stored in
  `<workspace>/.workduck/skills.json` and a built-in proposal writer skill.
- References menu with workspace-local research references stored in
  `<workspace>/.workduck/references.json`.
- Agents menu with workspace-local agent cards that reference `llm` API keys
  from the Environment vault without copying secret values.
- Persona menu with workspace-local personas stored in
  `<workspace>/.workduck/personas.json`; agents are stored in
  `<workspace>/.workduck/agents.json` and may reference persona IDs.

## Next Work

1. Build the first Agent Brief -> Run -> Gate loop using local data only.
2. Add an AGENTS.md generator after the brief/run/gate loop exists.
3. Add a local shell runner with explicit approval after run records can capture
   command, output, diff, and approval state.
4. Add OpenCode and other agent adapters only after the local runner boundary is
   stable.

## Stabilization Backlog

These items are not new product surfaces. They are implementation debts that
should be addressed before the queue runner, repository operations, and
workspace sync become harder to change safely.

### Queue Execution Reliability

1. Harden LLM JSON extraction for voting work orders.
   - Current risk: `src-tauri/src/queue_execution.rs` extracts vote JSON by
     taking the first `{` and the last `}` in the response. That can break when
     an agent returns Markdown fences, prose containing braces, or multiple JSON
     snippets.
   - Target behavior: prefer fenced `json` blocks, then scan for balanced JSON
     object candidates, parse each candidate, and accept the first object that
     satisfies the expected vote schema.
   - Acceptance criteria: a vote response with explanatory prose, a fenced JSON
     block, and unrelated braces still records the intended choice; invalid
     choices remain visible as parse failures instead of being silently coerced.

2. Add bounded retry and backoff for transient LLM provider failures.
   - Current risk: one temporary 429, 502, 503, 504, network timeout, or gateway
     hiccup can fail an entire work order.
   - Target behavior: retry only transient failures with a small maximum attempt
     count and jittered backoff; never retry authentication errors, malformed
     requests, unsupported models, or user-cancelled execution.
   - Acceptance criteria: app execution and CLI execution share the same retry
     policy, each failed attempt is recorded in the report metadata, and the
     final report still includes partial agent results when some agents fail.

3. Move fallback model choices out of queue execution code.
   - Current risk: default model IDs such as OpenAI, DeepSeek, and OpenRouter
     fallbacks are embedded in `src-tauri/src/queue_execution.rs`, so model
     churn requires code changes.
   - Target behavior: agent-specific model selection remains the first source
     of truth; provider defaults come from a small local model preset catalog
     that can be updated without touching queue execution logic.
   - Acceptance criteria: adding or replacing a default model changes one
     catalog file, not the runner; old agents without explicit model IDs still
     resolve to a documented fallback.

4. Keep app and CLI queue behavior identical.
   - Current risk: TypeScript and Rust have historically duplicated prompt
     assembly, voting, parsing, report generation, and partial failure policy.
   - Target behavior: shared queue contracts define task type, response
     language, vote options, parsed result shape, report title, validation text,
     and partial failure handling for both app and CLI.
   - Acceptance criteria: the same work order ID produces equivalent report
     structure whether run from the app or the CLI, apart from runtime metadata
     such as timestamps and process identifiers.

### Evaluation And Report Flow

1. Keep evaluation delegation one-to-one with the source report.
   - Current state: the queue UI now blocks repeated evaluation-delegation work
     orders for the same source report.
   - Follow-up: preserve the same rule in CLI and file-import flows so duplicate
     work orders cannot be created outside the visible button.
   - Acceptance criteria: a report can have at most one pending or completed
     evaluation-delegation work order unless the original delegation file is
     deleted intentionally.

2. Separate report review actions by report type.
   - Current risk: voting reports previously showed decision actions such as
     approve, needs work, or rollback, even though those actions belong to
     proposal or implementation review.
   - Target behavior: voting reports show vote totals, source responses, and
     evaluation controls only; proposal or code-review reports show approval
     decisions.
   - Acceptance criteria: no voting report renders proposal-review controls,
     and no proposal report renders vote-specific controls.

3. Make delegated AI evaluation a batch workflow.
   - Current risk: one-response-at-a-time evaluation is tedious and encourages
     inconsistent scoring.
   - Target behavior: an evaluation-delegation work order contains the source
     report path, all response IDs, the five scoring criteria, and instructions
     for Codex or another reviewer to store scores through the same evaluation
     persistence path.
   - Acceptance criteria: one delegated evaluation task can score every agent
     response in a report, and agent summary scores update after the task is
     applied.

### Sync And Secret Compatibility

1. Make encrypted vault KDF parameters backward-compatible.
   - Current risk: vault and sync decryption require exact Argon2 parameter
     matches against current source constants, so strengthening future defaults
     could make older encrypted files unreadable.
   - Target behavior: decryption uses the KDF parameters stored in the envelope
     after validating safe bounds; current constants are defaults for newly
     encrypted files only.
   - Acceptance criteria: fixtures encrypted with the current parameters and a
     future stronger parameter set both decrypt when within allowed bounds;
     unsupported algorithms and unsafe parameter values fail clearly.

2. Strengthen destructive sync save/import confirmation text.
   - Current risk: confirmation dialogs can ask for a generic word such as
     "save", which does not clearly explain what is being overwritten.
   - Target behavior: the dialog names the target file, the direction of the
     operation, and the exact confirmation phrase in the user's interface
     language.
   - Acceptance criteria: saving, loading, exporting, importing, pulling, and
     pushing encrypted sync data each have a distinct confirmation message when
     data may be overwritten.

3. Audit path normalization at the Tauri IPC boundary.
   - Current risk: Windows canonical paths can expose `\\?\` prefixes in UI or
     terminal prompts when a backend command returns raw filesystem paths.
   - Target behavior: backend responses use display-safe paths for UI fields
     while preserving raw paths only for internal filesystem and Git calls.
   - Acceptance criteria: workspace, sync, repository, terminal, and process
     views do not show `\\?\` prefixes unless the user explicitly opens raw
     diagnostic output.

### Project Registry And Repository Operations

1. Add a registry migration path before the next project schema change.
   - Current risk: an unknown project registry version can fall back to an empty
     registry, which is too destructive once real workspaces depend on it.
   - Target behavior: unsupported versions fail with a recoverable error and a
     backup/export path; known older versions migrate through explicit steps.
   - Acceptance criteria: no readable project data is silently dropped because
     of a version mismatch.

2. Replace the two-level project tree assumption with recursive traversal.
   - Current risk: project tree rows are built around a Project -> Group ->
     Repository shape and will fight future nested grouping.
   - Target behavior: tree rendering and counts operate on recursive nodes
     while preserving the current two-level UI as a presentation choice.
   - Acceptance criteria: adding a third nesting level in registry data does
     not require rewriting tree normalization.

3. Track repository task execution instead of only opening terminals.
   - Current risk: install, update, build, and dev-server commands can exit with
     code 1 in an external terminal while the app only knows that the command was
     launched.
   - Target behavior: repository tasks have a durable execution record with
     command, working directory, started time, exit code when available, and a
     short output tail.
   - Acceptance criteria: a failed dependency install or dev-server command is
     visible on the repository card or task history without requiring the user to
     inspect the terminal manually.

4. Make repository task detection handle mixed-runtime projects.
   - Current risk: `package.json` currently dominates detection, so projects
     with both frontend and Rust, Flutter, Deno, or other runtimes may only run
     one part of the expected task.
   - Target behavior: detection returns all applicable task plans, groups them
     by runtime, and makes multi-runtime commands explicit before execution.
   - Acceptance criteria: a Tauri/Svelte/Rust repository can install, update,
     build, and start development commands for both JavaScript and Rust parts
     where configured.

### Frontend And Adapter Cleanup

1. Consolidate repeated Tauri invoke wrappers.
   - Current risk: multiple TypeScript modules define local `getTauriInvoke`
     helpers, which spreads runtime detection and error behavior across the app.
   - Target behavior: one small adapter owns Tauri invoke discovery, browser
     fallback behavior, and typed error normalization.
   - Acceptance criteria: workspace, sync, password, project, terminal, and
     process modules import the shared adapter instead of repeating the same
     helper.

2. Consolidate repeated object-record guards and JSON normalization helpers.
   - Current risk: `isObjectRecord`-style guards and parse-normalize patterns
     are copied across storage modules.
   - Target behavior: shared parse helpers live in one internal utility module,
     with call sites keeping their domain-specific validation rules.
   - Acceptance criteria: storage modules do not duplicate generic record
     guards, and domain parsers still produce domain-specific error messages.

3. Remove unnecessary serialize-then-parse normalization where a direct helper
   is safer.
   - Current risk: some registry updates normalize data by serializing and
     reparsing, which hides intent and makes error ownership unclear.
   - Target behavior: expose explicit clone-and-normalize helpers for registry
     structures that need deep normalization.
   - Acceptance criteria: normalization remains behaviorally identical but no
     caller depends on a JSON round trip for ordinary in-memory cleanup.

4. Keep large surfaces below the point where they become routing files.
   - Current risk: queue, project, and settings surfaces can regrow after each
     feature because modals, filters, file I/O, execution, evaluation, and
     rendering sit close together.
   - Target behavior: surface files compose focused modules for state loading,
     filters, modals, artifact actions, context menus, and repository task
     actions.
   - Acceptance criteria: new queue task types or repository actions can be
     added by extending a focused module rather than expanding the primary
     Svelte surface.

### Platform And Process Follow-Up

1. Decide the repository terminal portability boundary.
   - Current risk: repository terminal actions are Windows-first, while Tauri
     itself is cross-platform.
   - Target behavior: either implement macOS and Linux terminal launchers or
     make the Windows-only boundary explicit in UI and command errors.
   - Acceptance criteria: non-Windows builds fail with a clear unsupported
     message instead of pretending the action is available.

2. Move heavy process inventory work off the UI-critical path if lag appears.
   - Current risk: Windows process and port discovery can be expensive on busy
     machines.
   - Target behavior: process collection runs through a bounded background task
     or cached snapshot when direct collection proves slow.
   - Acceptance criteria: opening the process menu does not visibly freeze the
     app on a machine with many running processes.

3. Improve Vite strict-port detection only when needed by a real project.
   - Current risk: string matching catches common scripts but not every
     `vite.config.*` setting.
   - Target behavior: keep current behavior until a repository needs config-file
     detection, then add a small parser or documented manual override instead
     of broad command inference.
   - Acceptance criteria: Workduck does not guess long-running dev-server
     commands beyond the repository's declared scripts or configured task plan.

## Deferred Dependencies

- Svelte Flow: wait until task graphs or run handoff graphs are being built.
- Tiptap: wait until rich-text narrative documents need a dedicated editor.
- shadcn-svelte: wait until concrete copied component ownership is useful.
- Runtime agent SDKs: wait until Agent Briefs, Runs, and Gates have real data.
- MCP server/client: wait until local queue items and briefs can be read and
  written through stable commands.
- Observability and evaluation services: wait until local run traces exist.
- Cloud runners and sandboxes: wait until local approval-gated execution works.
- Vector search: wait until there is meaningful report, brief, and run data.

## Distribution Order

1. GitHub Releases for early desktop installers.
2. Tauri updater metadata served from release artifacts or another static host.
3. npm packages later for CLI, SDK, schemas, or MCP server packages.
4. Microsoft Store only after Windows signing, installer, updater, and support
   flow are stable.
