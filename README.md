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
  layout, initializes Git, installs mustflow files, and appends a Workduck
  `.gitignore` block for new or already registered workspaces.
- Workspace and project metadata import/export through encrypted sync files.
- Optional Git pull and push for the encrypted sync file.
- Appearance settings for language and interface font sizing.
- System settings for startup, tray behavior, and workspace inactivity locking.
- Environment variable vault UI for API keys, tokens, accounts, passwords, and
  tags.
- Projects board with project, group, and repository cards.
- GitHub credentials can be selected from Environment token entries tagged
  `github`; projects store only the selected secret ID, not the token value.
- Queue menu that creates workspace `queue/reports`, `queue/work-orders`, and
  `queue/proposals` folders, renders structured result reports, work orders,
  and proposals inside Workduck, and writes follow-up work-order JSON files.
- Workspace-owned Workduck metadata folder at `<workspace>/.workduck/` for
  agent, persona, and skill registries that should travel with the workspace
  repository.
- Project and group descriptions, nested counts, and deletion confirmation with
  optional local folder removal under the workspace projects folder.
- Repository folder creation, URL registration, clone, Git init, fetch, pull,
  push, publish, card-level operation status, tags, tag filtering, and
  pull/push-needed filtering.
- Repository Git operations can use an Environment GitHub token instead of
  depending only on a globally authenticated `gh` or Git credential setup.
- Repository operation records for clone, init, fetch, pull, push, and publish
  stored in SQLite.
- Project board metadata stored in the local SQLite database, with legacy
  browser-stored project metadata promoted on first read.
- Skills menu for workspace-local Workduck skills, including a built-in
  proposal-writing skill.
- Agents menu with workspace-local agent cards that reference `llm` API keys
  from the Environment vault without copying secret values.
- Custom title bar, sidebar resizing, and tray integration.

The main unfinished product boundary is now connecting briefs, runs, and gates
to durable local data.

Encrypted sync includes project, group, and repository metadata. Repository
local paths are stored relative to the workspace when possible, not as raw
absolute paths.

When a workspace is used as its own repository, Workduck keeps
`<workspace>/projects/` ignored so nested project repositories are managed
independently. The `<workspace>/queue/` folder remains trackable so reports,
work orders, and proposals can move between devices through the workspace
repository.

Workspace-level Workduck metadata is split by ownership:

- `<workspace>/.workduck/agents.json`, `personas.json`, and `skills.json` are
  workspace-owned metadata and can be versioned with the workspace repository.
- `<workspace>/queue/` contains work orders, result reports, and proposals and
  can also be versioned with the workspace repository.
- `<workspace>/projects/` is ignored by the workspace repository because each
  nested project repository owns its own Git history.
- Environment secret values stay in the encrypted vault. Workspace metadata may
  store a secret ID reference, but it does not copy API keys, tokens, passwords,
  or SSH keys into `.workduck`.
- The encrypted sync folder is for cross-device profile bootstrap and encrypted
  import/export. The workspace repository is the source of truth for
  workspace-owned working metadata.

## Repository Layout

- `src/`: SvelteKit static app code.
- `src/lib/projects/`: project, group, repository, folder, and Git UI logic.
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
- `.mustflow/`: repository-local agent workflow and command contracts.

## Development

Install dependencies:

```sh
bun install
```

Run the desktop app during development:

```sh
bun run desktop:dev
```

Run the configured fast check:

```sh
mf run test_fast
```

Build the static frontend:

```sh
mf run build
```

Check the Tauri Rust crate:

```sh
mf run desktop_check
```

Validate the mustflow workflow:

```sh
mf run mustflow_check
```

## Current Priorities

The next product work should keep the daily workbench path tight:

1. Build the first Agent Brief, Run, and Gate loop before adding runtime agent
   adapters.

## Agent Workflow

Coding agents should read `AGENTS.md` first and use the configured mustflow
command intents instead of guessing commands from package scripts.

## License

Workduck is licensed under the [0BSD](LICENSE) license.
