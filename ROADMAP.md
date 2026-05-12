# Roadmap

This roadmap records the installation and adoption order for Workduck. It is a
sequencing document, not proof that a dependency is already installed or
declared in this repository.

## Installation Order

### 1. Runtime Scaffold

Create the smallest desktop app that can build and run.

The initial runtime scaffold is in place: static SvelteKit output is loaded by
the Tauri desktop shell, and native calls cross a Rust command boundary.

The frontend should be a static SvelteKit app loaded by Tauri. Do not put core
application logic into SvelteKit server routes.

### 2. UI Foundation

Install only the UI foundation needed for the first daily-use product surface.

The initial UI foundation is in place: Tailwind CSS handles styling utilities,
and Bits UI is declared for headless Svelte primitives when concrete controls
need it.

Defer `shadcn-svelte` until the app has concrete screens that need copied,
owned components. Keep the first UI surface focused on Projects, Artifacts,
Briefs, Runs, Gates, Repos, Catalogs, and Settings.

### 3. Workspace Package Boundaries

Create package boundaries before adding heavier feature dependencies.

The initial workspace package boundaries are in place: core vocabulary, shared
schemas, prompt compilation, and workbench orchestration.

These packages define the initial domain language: Project, Repo, Project
Folder, Artifact, Catalog, Service, Agent Brief, Run, Gate, and later Recipe and
Block.

### 4. Local Data Layer

Add persistence after the runtime scaffold and package boundaries exist.

Before installing SQLite, define the smallest data model for:

1. Project as a multi-repository work unit.
2. Repo as a local Git repository or folder.
3. Project Folder and Project Repo Placement.
4. Service and Catalog Artifact records.
5. Artifact, Brief, Run, and Gate records.

Then add:

1. SQLite.
2. Migrations.
3. WAL configuration.
4. JSON artifact blobs.
5. FTS5 search.

Defer vector search until there is real artifact and run data to search.

### 5. Artifact Editing And Graph Views

Install these only when the matching product surface is being built.

1. CodeMirror for structured artifacts such as Markdown, JSON, YAML, and
   generated briefs.
2. Svelte Flow for artifact dependencies, task graphs, or run handoff graphs.
3. Tiptap only if rich-text narrative documents need a dedicated editor.

Do not install graph or rich-text dependencies before the first artifact and
brief workflows are working.

### 6. Agent And Execution Layer

Add agent integrations after Artifacts, Briefs, Runs, and Gates have real data
models.

1. Claude, Codex, Cursor, and OpenCode prompt export.
2. OpenCode adapter.
3. Local shell runner with explicit approval.
4. AGENTS.md generator.
5. Additional coding-agent adapters only when a real workflow requires them.

Agent systems are adapters or export targets. They are not the Workduck core.

### 7. Integration And Evaluation Layer

Defer these until the local desktop workflow is useful without them.

1. Workduck MCP server.
2. MCP client support.
3. Direct GitHub integration.
4. Direct Figma and Linear integrations.
5. Long-tail SaaS integration through Composio, Pipedream, or Zapier MCP.
6. Local Docker sandbox.
7. E2B or Daytona sandbox adapter.
8. Langfuse or Phoenix observability.
9. Promptfoo evaluation and red-team suites.
10. Trigger.dev or Inngest for durable remote runs.

## Distribution Order

1. GitHub Releases for early desktop installers.
2. Tauri updater metadata served from release artifacts or another static host.
3. npm packages later for CLI, SDK, schemas, or MCP server packages.
4. Microsoft Store only after the Windows desktop build, signing, offline
   installer path, and update story are stable.

## Do Not Install Yet

- Svelte Flow before there is a graph screen.
- CodeMirror before there is an artifact editor.
- Tiptap before rich-text document editing is clearly needed.
- shadcn-svelte before concrete component needs exist.
- SQLite before the first Project, Repo, Catalog, Artifact, Brief, Run, and Gate
  data model is ready to implement.
- Agent adapters before Agent Briefs and Runs exist.
- MCP before local artifacts and briefs can be read and written.
- Observability or evaluation services before local run traces exist.
- Cloud runners or sandboxes before local approval-gated execution works.
