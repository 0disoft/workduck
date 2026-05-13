# Workduck

Workduck is an early local-first desktop workbench for agent-assisted coding.
It is being built around projects, repositories, artifacts, briefs, runs, and
gates while coding agents remain adapters or export targets.

## Status

This repository is in an early scaffold stage. The current app surface includes
the desktop shell, workspace settings, encrypted workspace sync support, and
basic project and artifact screens. Storage, agent execution, release packaging,
and the full artifact workflow are still under active development.

## Repository Layout

- `src/`: SvelteKit static app code.
- `src-tauri/`: Tauri desktop shell and Rust commands.
- `packages/core/`: shared domain model package.
- `packages/schemas/`: shared schema package.
- `packages/prompts/`: prompt and brief package.
- `packages/agents/`: agent adapter package.
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

## Agent Workflow

Coding agents should read `AGENTS.md` first and use the configured mustflow
command intents instead of guessing commands from package scripts.

## License

Workduck is licensed under the [0BSD](LICENSE) license.
