import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

const launcher = readFileSync(new URL('./workduck-mcp.mjs', import.meta.url), 'utf8');

describe('workduck MCP launcher', () => {
  test('runs the locked Rust MCP binary with inherited stdio', () => {
    expect(launcher).toContain("'workduck-mcp'");
    expect(launcher).toContain("'--locked'");
    expect(launcher).toContain("stdio: 'inherit'");
  });
});
