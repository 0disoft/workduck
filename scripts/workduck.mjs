#!/usr/bin/env node
/* llmnav/1 module
id=workduck.cli.launcher
role=Launch the locked Rust Workduck CLI from the repository while forwarding user arguments and its exit status.
owns=Node CLI shim|Cargo binary invocation|argument forwarding
excludes=CLI command semantics|desktop application startup
search=workduck command launcher|cargo cli shim|repository cli entry
invariant=The launcher executes the locked workduck-cli binary from this repository and preserves its process result.
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
  'workduck-cli',
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
  console.error(`workduck: ${result.error.message}`);
  process.exit(1);
}

process.exit(result.status ?? 1);
