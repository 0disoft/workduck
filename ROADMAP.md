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
- Queue work-order execution is owned by the Rust queue runner used by both the
  desktop app and the CLI, so prompt assembly, voting, report generation,
  response language handling, retry metadata, and partial-failure reports follow
  the same contract in both entry points.
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
- Repository terminal tasks for dependency install, dependency update, dev
  server start, and build create workspace-local run records under `.workduck/`
  with command, repository path, start time, exit code when available, and a
  short output tail.
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
- Export-only adapter profiles for Claude Code, Codex, Cursor, OpenCode, and
  generic Markdown consumers. These profiles describe supported local artifacts
  without calling model SDKs or running external agents.
- AGENTS.md generation from local brief, run, and gate data.
- Local Agent Brief -> Run -> Gate loop helpers compile a brief, summarize the
  run plan, build local run records, and derive gate state from already-loaded
  check data without calling external agents or shell commands.
- Queue result-report, work-order, and proposal JSON contracts in the shared
  core and schema packages.
- Local shell-run JSON contract in the shared core and schema packages, plus
  pure workbench helpers that require explicit approval before a shell command
  record becomes ready. The record captures command text, working directory,
  approval state, blockers, output tail, diff summary, exit code, and timing
  fields without executing the shell command.
- Skills menu with workspace-local Workduck skills stored in
  `<workspace>/.workduck/skills.json` and a built-in proposal writer skill.
- References menu with workspace-local research references stored in
  `<workspace>/.workduck/references.json`.
- Agents menu with workspace-local agent cards that reference `llm` API keys
  from the Environment vault without copying secret values.
- Persona menu with workspace-local personas stored in
  `<workspace>/.workduck/personas.json`; agents are stored in
  `<workspace>/.workduck/agents.json` and may reference persona IDs.

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
