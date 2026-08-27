#!/usr/bin/env node
/* llmnav/1 module
id=workduck.mcp.launcher
role=Launch the locked Rust Workduck MCP stdio server from the repository while preserving its streams and exit status.
owns=Node MCP shim|Cargo MCP binary invocation|argument forwarding
excludes=MCP protocol semantics|workspace discovery
search=workduck MCP launcher|cargo MCP shim|stdio server command
invariant=The launcher keeps stdin, stdout, and stderr directly attached and executes the locked workduck-mcp binary from this repository.
stability=contract
*/

import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = dirname(scriptDirectory);
const manifestPath = join(repositoryRoot, 'src-tauri', 'Cargo.toml');
const args = [
  'run',
  '--manifest-path',
  manifestPath,
  '--bin',
  'workduck-mcp',
  '--locked',
  '--quiet',
  '--',
  ...process.argv.slice(2)
];
const result = spawnSync('cargo', args, {
  cwd: repositoryRoot,
  env: process.env,
  stdio: 'inherit',
  windowsHide: true
});

if (result.error) {
  console.error(`workduck-mcp: ${result.error.message}`);
  process.exit(1);
}

process.exit(result.status ?? 1);
