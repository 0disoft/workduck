---
mustflow_doc: repo-map
lifecycle: generated
generated_by: mustflow
relative_root: "."
source_policy: anchors_only
privacy_mode: minimal
anchor_count: 67
source_fingerprint: "sha256:a9cd8c34237a8a24ba395a1ae095cde5ae08101ab88ec409ee434befd11be658"
---

# REPO_MAP.md

This file is an agent navigation map for the current mustflow root. It is not a full file listing.
Regenerate it with `mf map --write` instead of editing it by hand.

## How To Use

- Start with `AGENTS.md` and the mustflow files listed in Priority Anchors.
- Use Directory Anchors to find local rules, guides, package manifests, and command adapters.
- Use `git ls-files` or your editor when you need the complete file list.

## Priority Anchors

- `AGENTS.md`: Root agent operating rules. Read this before changing files.
- `.mustflow/docs/agent-workflow.md`: Shared workflow policy for agent work.
- `.mustflow/config/mustflow.toml`: Mustflow read order, authority, document roots, and protected paths.
- `.mustflow/config/commands.toml`: Command intent contract. Check this before running project commands.
- `.mustflow/config/preferences.toml`: Repository-level agent preferences. Treat them as defaults below user instructions and local style.
- `.mustflow/skills/INDEX.md`: Index of available procedural skills.
- `.mustflow/context/INDEX.md`: Task-specific project context router. Read only when context is needed.

## Directory Anchors

### /

- `.gitattributes`: Git text, binary, and line-ending policy. Check before normalizing files.
- `package.json`: Node.js package manifest, binary entry points, and package scripts.
- `ROADMAP.md`: Optional project planning, priority, milestone, and non-goal context.
- `tsconfig.json`: TypeScript compiler configuration.

### .mustflow/context/

- `.mustflow/context/PROJECT.md`: Project goals, non-goals, terms, and repository-wide promises for agents.

### .mustflow/skills/adapter-boundary/

- `.mustflow/skills/adapter-boundary/SKILL.md`: Procedural skill document for a repeatable agent task.

### .mustflow/skills/artifact-integrity-check/

- `.mustflow/skills/artifact-integrity-check/SKILL.md`: Procedural skill document for a repeatable agent task.

### .mustflow/skills/behavior-preserving-refactor/

- `.mustflow/skills/behavior-preserving-refactor/SKILL.md`: Procedural skill document for a repeatable agent task.

### .mustflow/skills/code-review/

- `.mustflow/skills/code-review/SKILL.md`: Procedural skill document for a repeatable agent task.

### .mustflow/skills/codebase-orientation/

- `.mustflow/skills/codebase-orientation/SKILL.md`: Procedural skill document for a repeatable agent task.

### .mustflow/skills/command-pattern/

- `.mustflow/skills/command-pattern/SKILL.md`: Procedural skill document for a repeatable agent task.

### .mustflow/skills/composition-over-inheritance/

- `.mustflow/skills/composition-over-inheritance/SKILL.md`: Procedural skill document for a repeatable agent task.

### .mustflow/skills/contract-sync-check/

- `.mustflow/skills/contract-sync-check/SKILL.md`: Procedural skill document for a repeatable agent task.

### .mustflow/skills/database-change-safety/

- `.mustflow/skills/database-change-safety/SKILL.md`: Procedural skill document for a repeatable agent task.

### .mustflow/skills/date-number-audit/

- `.mustflow/skills/date-number-audit/SKILL.md`: Procedural skill document for a repeatable agent task.

### .mustflow/skills/dependency-injection/

- `.mustflow/skills/dependency-injection/SKILL.md`: Procedural skill document for a repeatable agent task.

### .mustflow/skills/dependency-reality-check/

- `.mustflow/skills/dependency-reality-check/SKILL.md`: Procedural skill document for a repeatable agent task.

### .mustflow/skills/diff-risk-review/

- `.mustflow/skills/diff-risk-review/SKILL.md`: Procedural skill document for a repeatable agent task.

### .mustflow/skills/docs-prose-review/

- `.mustflow/skills/docs-prose-review/SKILL.md`: Procedural skill document for a repeatable agent task.

### .mustflow/skills/docs-update/

- `.mustflow/skills/docs-update/SKILL.md`: Procedural skill document for a repeatable agent task.

### .mustflow/skills/external-prompt-injection-defense/

- `.mustflow/skills/external-prompt-injection-defense/SKILL.md`: Procedural skill document for a repeatable agent task.

### .mustflow/skills/facade-pattern/

- `.mustflow/skills/facade-pattern/SKILL.md`: Procedural skill document for a repeatable agent task.

### .mustflow/skills/failure-triage/

- `.mustflow/skills/failure-triage/SKILL.md`: Procedural skill document for a repeatable agent task.

### .mustflow/skills/instruction-conflict-scope-check/

- `.mustflow/skills/instruction-conflict-scope-check/SKILL.md`: Procedural skill document for a repeatable agent task.

### .mustflow/skills/line-ending-hygiene/

- `.mustflow/skills/line-ending-hygiene/SKILL.md`: Procedural skill document for a repeatable agent task.

### .mustflow/skills/migration-safety-check/

- `.mustflow/skills/migration-safety-check/SKILL.md`: Procedural skill document for a repeatable agent task.

### .mustflow/skills/null-object-pattern/

- `.mustflow/skills/null-object-pattern/SKILL.md`: Procedural skill document for a repeatable agent task.

### .mustflow/skills/pattern-scout/

- `.mustflow/skills/pattern-scout/SKILL.md`: Procedural skill document for a repeatable agent task.

### .mustflow/skills/project-context-authoring/

- `.mustflow/skills/project-context-authoring/SKILL.md`: Procedural skill document for a repeatable agent task.

### .mustflow/skills/pure-core-imperative-shell/

- `.mustflow/skills/pure-core-imperative-shell/SKILL.md`: Procedural skill document for a repeatable agent task.

### .mustflow/skills/readme-authoring/

- `.mustflow/skills/readme-authoring/SKILL.md`: Procedural skill document for a repeatable agent task.

### .mustflow/skills/repo-improvement-loop/

- `.mustflow/skills/repo-improvement-loop/SKILL.md`: Procedural skill document for a repeatable agent task.

### .mustflow/skills/repro-first-debug/

- `.mustflow/skills/repro-first-debug/SKILL.md`: Procedural skill document for a repeatable agent task.

### .mustflow/skills/requirement-regression-guard/

- `.mustflow/skills/requirement-regression-guard/SKILL.md`: Procedural skill document for a repeatable agent task.

### .mustflow/skills/result-option/

- `.mustflow/skills/result-option/SKILL.md`: Procedural skill document for a repeatable agent task.

### .mustflow/skills/security-privacy-review/

- `.mustflow/skills/security-privacy-review/SKILL.md`: Procedural skill document for a repeatable agent task.

### .mustflow/skills/security-regression-tests/

- `.mustflow/skills/security-regression-tests/SKILL.md`: Procedural skill document for a repeatable agent task.

### .mustflow/skills/skill-authoring/

- `.mustflow/skills/skill-authoring/SKILL.md`: Procedural skill document for a repeatable agent task.

### .mustflow/skills/source-freshness-check/

- `.mustflow/skills/source-freshness-check/SKILL.md`: Procedural skill document for a repeatable agent task.

### .mustflow/skills/state-machine-pattern/

- `.mustflow/skills/state-machine-pattern/SKILL.md`: Procedural skill document for a repeatable agent task.

### .mustflow/skills/strategy-pattern/

- `.mustflow/skills/strategy-pattern/SKILL.md`: Procedural skill document for a repeatable agent task.

### .mustflow/skills/structure-discovery-gate/

- `.mustflow/skills/structure-discovery-gate/SKILL.md`: Procedural skill document for a repeatable agent task.

### .mustflow/skills/test-maintenance/

- `.mustflow/skills/test-maintenance/SKILL.md`: Procedural skill document for a repeatable agent task.

### .svelte-kit/

- `.svelte-kit/tsconfig.json`: TypeScript compiler configuration.

### packages/agents/

- `packages/agents/package.json`: Node.js package manifest for this directory.
- `packages/agents/README.md`: Directory guide for this area.
- `packages/agents/tsconfig.json`: TypeScript compiler configuration.

### packages/core/

- `packages/core/package.json`: Node.js package manifest for this directory.
- `packages/core/README.md`: Directory guide for this area.
- `packages/core/tsconfig.json`: TypeScript compiler configuration.

### packages/prompts/

- `packages/prompts/package.json`: Node.js package manifest for this directory.
- `packages/prompts/README.md`: Directory guide for this area.
- `packages/prompts/tsconfig.json`: TypeScript compiler configuration.

### packages/schemas/

- `packages/schemas/package.json`: Node.js package manifest for this directory.
- `packages/schemas/README.md`: Directory guide for this area.
- `packages/schemas/tsconfig.json`: TypeScript compiler configuration.

### packages/workbench-engine/

- `packages/workbench-engine/package.json`: Node.js package manifest for this directory.
- `packages/workbench-engine/README.md`: Directory guide for this area.
- `packages/workbench-engine/tsconfig.json`: TypeScript compiler configuration.

### src-tauri/

- `src-tauri/Cargo.toml`: Rust package manifest and workspace configuration.

## Generated Files

- `REPO_MAP.md`: This generated navigation map. Do not treat it as a complete repository tree.

## Excluded Areas

- `.git/`
- `node_modules/`
- `dist/`, `build/`, and `coverage/`
- cache directories such as `.cache/`, `cache/`, and `.astro/`
