# Read-only MCP bridge

Workduck exposes one workspace through a local stdio Model Context Protocol server. The server wraps the same redacted Agent API Snapshot core used by the desktop command. It does not maintain a second filesystem reader and it does not decrypt the Environment vault.

## Start the server

From the Workduck repository:

```powershell
bun run mcp -- serve --workspace C:\Users\you\Documents\workspace\my-workspace
```

`--workspace` must be an absolute readable directory. The server reads the workspace ID from `<workspace>/.workduck/workspace.json` when available, then falls back to the workspace folder name. Override that value with `--workspace-id` when the SQLite registry uses another ID.

Workduck looks for its desktop SQLite database in the platform application-data directory for `com.workduck.desktop`. Use `--database` when the database lives elsewhere:

```powershell
bun run mcp -- serve `
  --workspace C:\Users\you\Documents\workspace\my-workspace `
  --workspace-id workspace_123 `
  --database "$env:LOCALAPPDATA\com.workduck.desktop\workduck.sqlite3"
```

The same values can be supplied through `WORKDUCK_WORKSPACE`, `WORKDUCK_WORKSPACE_ID`, and `WORKDUCK_DATABASE_PATH`.

When no database is found, the server still exposes workspace status, Queue metadata, and repository task-run metadata. Project registry and repository import-attempt sections return their existing closed read-failure status instead of silently inventing an empty database.

## MCP client configuration

Point an MCP client at the checked-in launcher. Replace both paths with absolute local paths:

```json
{
  "mcpServers": {
    "workduck": {
      "command": "node",
      "args": [
        "C:\\src\\workduck\\scripts\\workduck-mcp.mjs",
        "serve",
        "--workspace",
        "C:\\Users\\you\\Documents\\workspace\\my-workspace"
      ]
    }
  }
}
```

The launcher runs the locked `workduck-mcp` Rust binary and attaches stdin, stdout, and stderr directly. Cargo must be available on `PATH` when the source launcher is used.

## Tools

`workspace_status` returns the bound workspace identity, read-only capability declaration, and redacted `.workduck` metadata counts.

`list_projects` returns project, group, and repository metadata from the Workduck SQLite registry. Credential references are represented only by `hasGithubCredential` booleans.

`list_queue` returns Queue file names, workspace-relative paths, kinds, and counts. It does not read work-order, proposal, or report bodies.

`list_runs` returns repository import attempts and task-run metadata. Task records expose `hasCommand` and `hasOutputTail`, never the command or output text.

All four tools use an empty input schema with `additionalProperties: false`. A model cannot select another workspace path, database path, or secret ID during a tool call. Those resources are fixed by the host process before MCP messages are accepted.

## Protocol and transport limits

The server supports MCP `2026-07-28` discovery as well as legacy initialization for `2025-11-25`, `2025-06-18`, `2025-03-26`, and `2024-11-05` clients. Messages use newline-delimited JSON-RPC over stdio. Input frames are capped at 1 MiB, stdout contains only protocol messages, and diagnostic text goes to stderr.

The SQLite connection is opened with read-only flags. A database with a schema version newer than the running Workduck build is rejected at startup. There are no MCP write methods, terminal-input methods, network transports, or runtime model-provider calls in this boundary.
