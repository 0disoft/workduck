# Roadmap

This roadmap records Workduck's current build order. It should stay grounded in
working product surfaces and should not list speculative dependencies as active
work.

## In Place

### Runtime And Shell

- Static SvelteKit UI loaded by a Tauri 2 desktop shell.
- Rust command boundary for filesystem, Git, sync, tray, window, and SQLite
  operations.
- Custom title bar, resizable sidebar, tray integration, startup setting, and
  minimize-to-tray setting.
- Bundled editor fonts and appearance settings for interface and editor font
  sizes.

### Workspace And Sync

- Workspace profiles with local paths, per-workspace password locking, unlock
  retry delay, and manual lock.
- Settings tabs for appearance, workspaces, encrypted sync, and system options.
- Encrypted workspace, project, group, and repository metadata sync file
  export/import.
- Repository local paths are synced as workspace-relative paths when possible;
  raw repository absolute paths are not written into the sync payload.
- Optional Git pull and push for the selected encrypted sync folder.
- Environment variable vault UI for API keys, tokens, accounts, and passwords.

### Projects And Repositories

- Project board organized as Project -> Group -> Repository.
- Workspace project folders created under `<workspace>/projects/`.
- Project and group descriptions with edit actions.
- Project cards show group and repository counts.
- Group cards show repository counts.
- Repository cards support local Git detection, clone, Git init, fetch, pull,
  push, publish, tags, and folder opening.
- Repository cards show operation status, preserve failure messages on the
  affected card, and block duplicate clicks during long-running operations.
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
- Artifact draft editor powered by CodeMirror for Markdown, JSON, and YAML.
- Agents menu shell without runtime execution.

## Next Work

1. Add persisted operation records for repository actions: clone, init, fetch,
   pull, push, and publish.
2. Add a workspace path repair flow for devices where the synced workspace path
   does not exist locally.
3. Connect artifact drafts to SQLite artifact tables and the FTS5 search index.
4. Build the first Agent Brief -> Run -> Gate loop using local data only.
5. Add an AGENTS.md generator after the brief/run/gate loop exists.
6. Add a local shell runner with explicit approval after run records can capture
   command, output, diff, and approval state.
7. Add OpenCode and other agent adapters only after the local runner boundary is
   stable.

## Deferred Dependencies

- Svelte Flow: wait until artifact dependency graphs, task graphs, or run
  handoff graphs are being built.
- Tiptap: wait until rich-text narrative documents need a dedicated editor.
- shadcn-svelte: wait until concrete copied component ownership is useful.
- Runtime agent SDKs: wait until Agent Briefs, Runs, and Gates have real data.
- MCP server/client: wait until local artifacts and briefs can be read and
  written through stable commands.
- Observability and evaluation services: wait until local run traces exist.
- Cloud runners and sandboxes: wait until local approval-gated execution works.
- Vector search: wait until there is meaningful artifact and run data.

## Distribution Order

1. GitHub Releases for early desktop installers.
2. Tauri updater metadata served from release artifacts or another static host.
3. npm packages later for CLI, SDK, schemas, or MCP server packages.
4. Microsoft Store only after Windows signing, installer, updater, and support
   flow are stable.
