#!/usr/bin/env node
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
