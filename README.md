# Workduck

Workduck is a local-first desktop workbench for managing developer workspaces,
project groups, repositories, agent briefs, runs, and gates.

The app is built as a Tauri desktop shell with a static SvelteKit frontend.
Local filesystem, Git, encrypted sync, tray, and SQLite access go through Rust
commands instead of SvelteKit server routes.

## Status

Workduck is still in early development, but the current desktop surface already
includes:

- Workspace management with per-workspace password locking, session unlock, and
  inactivity auto-lock.
- Workspace path repair when synced workspace metadata points to a folder that
  does not exist on the current device.
- Optional workspace repository bootstrap that creates the workspace folder
  layout, initializes Git, and appends a Workduck `.gitignore` block for new or already registered workspaces.
- Workspace repository bootstrap also installs a Workduck work-order handoff
  block in `AGENTS.md`, so an IDE coding agent that receives only a Workduck
  work-order ID knows to resolve `queue/work-orders/*.workduck-work-order.json`
  before editing.
- Workspace repository actions switch by actual Git state: prepare before
  `.git` exists, publish when Git exists without a remote, and fetch, pull, and
  push after a remote is configured.
- Workspace and project metadata import/export through encrypted sync files.
- Optional Git pull and push for the encrypted sync file.
- Appearance settings for language and interface font sizing.
- Failed native settings initialization can be retried without restarting.
  Concurrent startup requests share one attempt; failed reads or journal replay
  preserve pending writes and block changes to fallback settings until recovery.
  Until initialization succeeds, the main window shows recovery controls instead
  of mounting workspace content. The tray remains available without initializing
  settings. Interface loading failures offer a reload.
- System settings for startup, tray behavior, and workspace inactivity locking.
- Environment variable vault UI for API keys, tokens, accounts, passwords, and
  tags.
- Environment vault entries can be applied to the user's CLI environment by
  deriving safe variable names from saved entries, such as `custom token` to
  `CUSTOM_TOKEN`, while keeping common aliases such as `npm_publish` to
  `NODE_AUTH_TOKEN` and OpenAI, OpenRouter, and DeepSeek API keys compatible
  with existing tools.
- Projects board with project, group, and repository cards.
- GitHub credentials can be selected from Environment token entries tagged
  `github`; projects store only the selected secret ID, not the token value.
- Queue menu that creates workspace `queue/reports`, `queue/work-orders`, and
  `queue/proposals` folders, renders structured result reports, work orders,
  and proposals inside Workduck, and writes follow-up work-order JSON files.
  Repository commit work orders include cleanup and archive instructions so
  completed Codex handoffs do not remain in the pending queue.
- Desktop and CLI queue execution share one OS-backed per-work-order lock. Rust
  owns the durable `running`, `failed`, and `archived` transitions, writes the
  result report before archiving, and treats its own unlocked, marker-backed
  `running` state as an interrupted run that can be retried safely.
- Workspace-owned Workduck metadata folder at `<workspace>/.workduck/` for
  reference, agent, persona, and skill registries that should travel with the
  workspace repository.
- Project and group descriptions, nested counts, and deletion confirmation with
  optional local folder removal under the workspace projects folder.
- Repository folder creation, URL registration, GitHub fork-and-clone with
  upstream remote setup, clone, Git init, fetch, pull, push, publish,
  card-level operation status, tags, tag filtering, and pull/push-needed
  filtering.
- Repository Git operations can use an Environment GitHub token instead of
  depending only on a globally authenticated `gh` or Git credential setup.
- Repository operation records for clone, init, fetch, pull, push, and publish
  stored in SQLite.
- Read-only agent API snapshot command for local automation clients that need
  workspace, project registry, queue, repository task-run, and `.workduck`
  metadata status without decrypting or returning secret values.
- Read-only stdio MCP bridge for the same redacted local snapshot, bound to one
  workspace at startup rather than accepting paths from tool arguments.
- Agent Briefs menu for repository-linked instructions, workspace-local saving,
  editing, archive/restore, and Codex Markdown preview and clipboard export.
  Briefs use stable project/repository IDs and revision-checked atomic writes to
  `<workspace>/.workduck/briefs.json`. Conflicts and unreadable data are reported
  without overwriting the file; a failed save keeps the editor draft open.
  Workspace locking hides the editor but retains its draft in page memory,
  scoped to the workspace ID and path. Unlocking restores the original edit
  revision; a save completed while locked clears the draft. Unsaved drafts are
  not written to disk or browser storage and do not survive a page reload or
  application restart.
- Project board metadata stored in the local SQLite database, with legacy
  browser-stored project metadata promoted on first read.
- Skills menu for workspace-local Workduck skills, including a built-in
  proposal-writing skill.
- Reference and skill editing requires a successful registry load. Native saves
  check revisions so stale edits cannot replace newer workspace files; failed
  saves keep the editor draft and do not replace the displayed registry.
- Agents menu with workspace-local agent cards that reference `llm` API keys
  from the Environment vault without copying secret values.
- Custom title bar, sidebar resizing, and tray integration.

Saved briefs can link existing repository task runs and queue work orders that
explicitly reference the same repository ID. Run links preserve the instructions
at link time in `.workduck/brief-runs.json`; result reports are matched through
their `sourceWorkOrder` ID, not their titles. Refresh reloads the original records,
and unlinking removes only the association. Discovery of new queue associations
is limited to 200 files; partial discovery disables new queue associations.
Saved queue IDs are resolved independently across the complete file listing,
including renamed files and reports beyond that limit. Reads run four at a time
and stop when the panel closes. Unrelated bodies outside discovery are discarded,
while duplicate source/report IDs are rejected. A failed or cancelled lookup is
shown as unavailable rather than missing and leaves its gate unverified.

Each linked run has a derived gate: a completed native build with exit code 0
passes, failed or stopped executions block, and missing or prose-only evidence
remains unverified. Queue reports are scoped to the linked repository's task IDs.
Report verification text and an archived work order cannot prove a passing check.
The gate is recalculated from the original records on refresh; it does not
certify code correctness or authorize a release or another task.

Desktop and MCP task queries refresh process liveness without rewriting
execution-owned records. An interrupted run can remain `running` in its original
JSON while queries report `stopped`; terminal-produced completion and output
remain intact.

Windows task terminals publish their UTF-8 JSON records through synced temporary
files and one Windows name replacement. Sharing conflicts get up to seven 25ms
retry delays. If publication still fails, the terminal exits before another
command can run and the last durable record remains available. Liveness queries
can then project that unfinished record as stopped without inventing completion.

Owned command and terminal process trees are cleaned up when the parent exits,
when termination is requested, or when their owner is dropped. Windows jobs and
Unix process groups are terminated independently of the parent's exit status.
Completed owners retire their registrations so later cleanup does not reuse a
stale process-group identity. Finite command cleanup preserves the parent's
original exit code.

Finite Git and GitHub CLI calls poll stdout, stderr, and parent exit in one
loop without output-reader threads. Captured data keeps at most 128KiB per
stream. The command deadline remains active while output is arriving, and
after parent exit both pipes share a two-second drain deadline. A pipe still
held by an independent writer returns a timeout; read errors return failure.
Partial output is not reported as a successful command result.

Brief editing, export, and run linking do not run agents or shell commands, and
the new stores have no browser-only persistence fallback. Creating a new queue
work order from a brief and manually approving report-based checks remain outside
this first local loop.

Encrypted sync includes project, group, and repository metadata. Repository
local paths are stored relative to the workspace when possible, not as raw
absolute paths.

When a workspace is used as its own repository, Workduck keeps
`<workspace>/projects/` ignored so nested project repositories are managed
independently. The `<workspace>/queue/` folder remains trackable so reports,
work orders, and proposals can move between devices through the workspace
repository.

### Queue CLI

The local CLI can execute one queued work order by its stable work-order ID,
write a result report under the workspace `queue/reports` folder, and archive
the work order after the report is written. The desktop app and CLI cannot run
the same work order concurrently on one machine. `--keep-work-order` returns a
successful work order to `active` only after its result report is durable.

Workspace repositories prepared by Workduck include an `AGENTS.md` work-order
handoff block. When a human sends an IDE agent a short request such as
`작업 ID: wo_... 진행해줘`, the agent should resolve that ID through
`queue/work-orders/*.workduck-work-order.json` by an exact `ref.id` match, verify
the work order is active, follow the task body, then archive the JSON file when
the work is complete. Duplicate exact IDs are rejected as ambiguous.

Set `WORKDUCK_VAULT_PASSWORD` to unlock the workspace Environment vault. The CLI
intentionally does not accept vault passwords as command-line arguments because
process arguments may be visible to other local processes and diagnostic tools.
If the vault is not unlocked, the CLI can use provider
environment variables for agents with an explicit provider: `OPENROUTER_API_KEY`
or `OPEN_ROUTER_API_KEY`, `OPENAI_API_KEY`, and `DEEPSEEK_API_KEY`. The CLI does
not print API keys, vault passwords, or the decrypted vault payload.

```powershell
bun run workduck queue run work-order_14a32cf3-029b-425f-b2ba-6c7583313d90 --workspace C:\Users\cherr\Documents\workspace\zerodi-wd1
```

### Agent API Snapshot

The desktop shell exposes `read_agent_api_snapshot` as the first local
automation API boundary. It is read-only and returns the current workspace path,
project registry summary, queue file summary, repository task-run summary, and
workspace metadata file status.

The snapshot intentionally does not expose plaintext secrets, encrypted vault
payloads, secret IDs, repository task command text, terminal output tails, or
terminal input endpoints. The stdio MCP bridge wraps this same safe core rather
than duplicating filesystem reads. HTTP and work-order write APIs remain outside
the current bridge's scope.

### Read-only MCP Bridge

The repository includes a `workduck-mcp` Rust binary and a Node launcher at
`scripts/workduck-mcp.mjs`. Configure the launcher with `serve --workspace`
followed by an absolute workspace path. The launcher uses Cargo and therefore
requires the Rust build toolchain; it is not a standalone installed desktop
command.

The server resolves the workspace before serving and exposes metadata queries
only. Tool calls cannot select paths, mutate work orders, start processes, or
read secret values. If the local Workduck database cannot be discovered, project
and import-attempt data are reported as unavailable; an explicit `--database`
path can select the existing database at startup.
Startup validates only the bound workspace identity. Each MCP call reads the
sections it returns: projects from the registry, queue from the queue listing,
runs from import attempts and task records, and workspace status from metadata.
Project and queue requests do not scan execution records; unknown tool names
are rejected before workspace reads. The desktop Agent API retains its full
snapshot with the same redaction rules.
Task summaries retain the newest 20 records encountered, skip output log files
before opening them, and share an 8MiB read budget across the scan and liveness
rereads. If the budget is exhausted or a record cannot be read, available
records remain in the response with `ok: false`, `incomplete: true`, and an
explicit error. Such a response cannot establish the newest 20 across the
entire history.

### Sync Repository And Workspace Repository

Workduck uses two different Git-backed storage paths:

- The sync repository is the optional folder configured in Settings > Sync. It
  is for moving encrypted profile bootstrap data between devices, such as the
  workspace list and import/export payloads. It is not the source of truth for
  one workspace's day-to-day project board.
- The workspace repository is the selected workspace folder when it is prepared
  as a Git repository. It owns the files a developer expects to keep with that
  workspace: `.workduck/` metadata, `queue/` reports and work orders, and the
  Workduck work-order instructions in `AGENTS.md`.
- A private sync repository and a private workspace repository may point to the
  same remote only if the user intentionally wants one combined repository.
  The recommended default is to keep them separate: one small sync repository
  for cross-device bootstrap, and one repository per workspace for actual
  workspace state.
- Secret values are never written as plaintext to either repository. The sync
  repository stores encrypted sync files, and the workspace repository stores
  the encrypted Environment vault at `.workduck/secrets.sync.json`.
- Nested repositories under `<workspace>/projects/` stay outside the workspace
  repository history. They are cloned, fetched, pulled, and pushed through their
  own Git remotes.

Workspace-level Workduck metadata is split by ownership:

- `<workspace>/.workduck/agents.json`, `personas.json`, and `skills.json` are
  workspace-owned metadata and can be versioned with the workspace repository.
- `<workspace>/.workduck/references.json` stores research references that work
  orders can cite without copying notes into each task.
- `<workspace>/.workduck/briefs.json` stores task instructions and their stable
  repository references. It can travel with the workspace repository; do not
  put passwords or API keys in briefs. Clipboard Markdown is an export, not a
  complete registry backup.
- `<workspace>/queue/` contains work orders, result reports, and proposals and
  can also be versioned with the workspace repository.
- `<workspace>/projects/` is ignored by the workspace repository because each
  nested project repository owns its own Git history.
- `<workspace>/.workduck/secrets.sync.json` stores the encrypted Environment
  vault. Workspace metadata may store a secret ID reference, but plaintext API
  keys, tokens, passwords, and SSH keys are not written to `.workduck`.
- The encrypted sync folder is for cross-device profile bootstrap and encrypted
  import/export. The workspace repository is the source of truth for
  workspace-owned working metadata.

## Repository Layout

- `src/`: SvelteKit static app code.
- `src/lib/projects/`: project, group, repository, folder, and Git UI logic.
- `src/lib/references/`: workspace-local reference registry UI and `.workduck`
  storage.
- `src/lib/agents/`: workspace-local agent registry UI and `.workduck` storage.
- `src/lib/skills/`: workspace-local Workduck skill registry UI and `.workduck`
  storage.
- `src/lib/personas/`: workspace-local persona registry UI and `.workduck`
  storage.
- `src/lib/queue/`: queue folder UI, report review, work-order creation, and
  Tauri command adapter.
- `src/lib/settings/`: workspace, sync, appearance, and system settings UI.
- `src/lib/environment/`: environment variable vault UI.
- `src-tauri/`: Tauri desktop shell, Rust commands, migrations, tray, Git,
  sync, workspace password, and SQLite boundaries.
- `src-tauri/migrations/`: ordered SQLite migrations.
- `packages/core/`: shared domain model package.
- `packages/schemas/`: shared schema package.
- `packages/prompts/`: prompt and brief package.
- `packages/agents/`: agent export and adapter package.
- `packages/workbench-engine/`: workbench orchestration package.

## Development

Install dependencies:

```sh
bun install
```

Run the desktop app during development:

```sh
bun run desktop:dev
```

Check Svelte, TypeScript, and the shared packages:

```sh
bun run check
```

Build the static frontend:

```sh
bun run build
```

Run the frontend and Rust tests:

```sh
bun run test
bun run test:rust
```

Run the complete local verification sequence:

```sh
bun run verify
```

## Current Priorities

The next product work should keep the daily workbench path tight:

1. Exercise the saved Brief -> linked Run -> evidence Gate workflow on real
   repository tasks before adding runtime agent adapters or automatic execution.

## Agent Workflow

Coding agents should read this README, `ROADMAP.md`, and `RELEASING.md` before
changing the repository. Use the checked-in package scripts above so local and
GitHub Actions verification stay aligned.

## License

Workduck is licensed under the [0BSD](LICENSE) license.
