# Workduck

Workduck is a local-first desktop workbench for managing developer workspaces,
project groups, repositories, artifacts, agent briefs, runs, and gates.

The app is built as a Tauri desktop shell with a static SvelteKit frontend.
Local filesystem, Git, encrypted sync, tray, and SQLite access go through Rust
commands instead of SvelteKit server routes.

## Status

Workduck is still in early development, but the current desktop surface already
includes:

- Workspace management with per-workspace password locking.
- Workspace and project metadata import/export through encrypted sync files.
- Optional Git pull and push for the encrypted sync file.
- Appearance settings for interface and editor font sizing.
- System settings for startup and tray behavior.
- Environment variable vault UI for API keys, tokens, accounts, and passwords.
- Projects board with project, group, and repository cards.
- Project and group descriptions, nested counts, and deletion confirmation.
- Repository folder creation, URL registration, clone, Git init, fetch, pull,
  push, publish, card-level operation status, tags, tag filtering, and
  pull/push-needed filtering.
- Artifact draft editing with CodeMirror for Markdown, JSON, and YAML.
- Agents menu shell without runtime agent execution.
- Custom title bar, sidebar resizing, tray integration, and bundled editor
  fonts.

The main unfinished product boundary is persistence. Project board metadata
currently uses the browser-side registry path, while the Rust SQLite boundary is
already in place for local application data and artifact storage.

Encrypted sync includes project, group, and repository metadata. Repository
local paths are stored relative to the workspace when possible, not as raw
absolute paths.

## Repository Layout

- `src/`: SvelteKit static app code.
- `src/lib/projects/`: project, group, repository, folder, and Git UI logic.
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

1. Move project board metadata from browser storage to the Rust SQLite boundary.
2. Add stronger repository operation status and progress handling.
3. Add a workspace path repair flow for devices where the synced workspace path
   does not exist locally.
4. Connect artifact drafts to the SQLite artifact tables and search index.
5. Build the first Agent Brief, Run, and Gate loop before adding runtime agent
   adapters.

## Agent Workflow

Coding agents should read `AGENTS.md` first and use the configured mustflow
command intents instead of guessing commands from package scripts.

## License

Workduck is licensed under the [0BSD](LICENSE) license.
