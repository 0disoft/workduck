/* llmnav/1 module
id=workduck.verification.native-sync
role=Verify encrypted workspace sync through an isolated Windows desktop application and durable SQLite restart.
owns=native sync verification lifecycle|isolated verification data|verification evidence
excludes=production profiles|remote synchronization|power loss recovery
search=verify native workspace sync|encrypted restore desktop smoke|isolated SQLite restart
invariant=Fixture writes and restoration run only after the native database is confirmed inside a unique verification directory, and owned processes are cleaned up.
stability=architecture
*/
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { createServer as networkServer } from 'node:net';
import { createServer } from 'vite';

if (process.platform !== 'win32') throw Error('This opt-in native verification currently supports Windows/WebView2 only.');
const playwrightModule = process.env.WORKDUCK_PLAYWRIGHT_MODULE;
let chromium;
try {
  ({ chromium } = await import(playwrightModule ? pathToFileURL(resolve(playwrightModule)).href : 'playwright'));
  if (typeof chromium?.connectOverCDP !== 'function') throw Error('invalid Playwright module');
} catch {
  throw Error('Playwright is required for this opt-in verification. Set WORKDUCK_PLAYWRIGHT_MODULE to an existing Playwright ESM entry file.');
}
const root = fileURLToPath(new URL('../', import.meta.url));
const sourceVersion = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8')).version;
const runnerSha256 = createHash('sha256').update(await readFile(fileURLToPath(import.meta.url))).digest('hex');
const run = resolve(root, 'dist/native-sync-smoke', randomUUID());
await mkdir(run, { recursive: true });
await mkdir(resolve(run, 'workspace/projects/sample/tools/repository'), { recursive: true });
const syncFolder = resolve(run, 'sync-files');
await mkdir(syncFolder, { recursive: true });
await new Promise((done, fail) => {
  const git = spawn('git', ['init', '--quiet', syncFolder], { windowsHide: true, stdio: 'ignore' });
  git.once('error', fail); git.once('exit', code => code === 0 ? done() : fail(Error('isolated git init failed')));
});
const cdpPort = await freePort(), webPort = await freePort();
let vite, child, browser, startupError, stage = 'start', errors = [], password = randomUUID();
let log = '';
function step(value) { stage = value; console.log(JSON.stringify({ stage })); }
const env = { ...process.env, WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${cdpPort}` };
const config = {
  identifier: `com.workduck.restore-smoke-${randomUUID()}`,
  productName: 'Workduck Restore Smoke',
  build: { beforeDevCommand: null, devUrl: `http://127.0.0.1:${webPort}` },
  app: { appDirectoriesOverride: resolve(run, 'app-data'), windows: [{
    label: 'main', title: 'Workduck Restore Smoke', width: 1200, height: 800, visible: false,
  }] },
};
await writeFile(resolve(run, 'config.json'), JSON.stringify(config));
try {
  vite = await createServer({ root, logLevel: 'error', server: { host: '127.0.0.1', port: webPort, strictPort: true } });
  await vite.listen();
  step('compile');
  child = launch(process.env.WORKDUCK_BUN_EXECUTABLE ?? 'bun.exe', ['x', '--no-install', 'tauri', 'dev', '--no-watch', '--config', resolve(run, 'config.json')]);
  const page = await connect();
  const webviewVersion = browser.version();
  step('runtime');
  const runtime = await page.evaluate(async () => {
    const { getTauriInvoke } = await import('/src/lib/tauri/tauri-invoke.ts');
    return getTauriInvoke()('runtime_status');
  });
  assert.equal(runtime.shell, 'tauri');
  const dbPath = await page.evaluate(async () => {
    const { getTauriInvoke } = await import('/src/lib/tauri/tauri-invoke.ts');
    return (await getTauriInvoke()('storage_status')).databasePath;
  });
  assert.ok(resolve(dbPath).startsWith(resolve(run, 'app-data') + '\\'), 'native database must be isolated before any fixture write');
  const executable = resolve(run, 'workduck-smoke.exe');
  await copyFile(resolve(root, 'src-tauri/target/debug/workduck.exe'), executable);
  await page.goto(`http://127.0.0.1:${webPort}/settings?tab=sync`);
  await page.locator('#sync-password').waitFor();
  step('seed');
  const fixture = await page.evaluate(async workspacePath => {
    const workspace = await import('/src/lib/workspaces/workspace-registry.ts');
    const workspaceStorage = await import('/src/lib/workspaces/workspace-storage.ts');
    const projects = await import('/src/lib/projects/project-registry.ts');
    const projectStorage = await import('/src/lib/projects/project-storage.ts');
    const appState = await import('/src/lib/app-state/app-state-storage.ts');
    const { getTauriInvoke } = await import('/src/lib/tauri/tauri-invoke.ts');
    const added = workspace.addWorkspace(workspace.createEmptyWorkspaceRegistry(), { name: 'Restore sample', path: workspacePath });
    if (!added.ok) throw Error('fixture workspace');
    const project = projects.addProjectNode(projects.createEmptyProjectRegistry(added.workspace.id), { kind: 'project', name: 'Sample', path: 'projects/sample' });
    if (!project.ok) throw Error('fixture project');
    const group = projects.addProjectNode(project.registry, { kind: 'group', parentId: project.registry.nodes[0].id, name: 'Tools', path: 'projects/sample/tools' });
    if (!group.ok) throw Error('fixture group');
    const repo = projects.addProjectRepositoryLink(group.registry, { nodeId: group.registry.nodes.at(-1).id, name: 'Repository', path: `${workspacePath}\\projects\\sample\\tools\\repository` });
    if (!repo.ok) throw Error('fixture repository');
    if (!workspaceStorage.writeWorkspaceRegistryToBrowser(added.registry).ok || !await appState.flushWorkduckAppStateWrites()) throw Error('fixture workspace write');
    if (!(await projectStorage.writeProjectRegistries({ [added.workspace.id]: repo.registry })).ok) throw Error('fixture project write');
    const db = await getTauriInvoke()('storage_status');
    const { readAppearanceSettingsFromBrowser } = await import('/src/lib/settings/appearance-storage.ts');
    const { getWorkduckMessages } = await import('/src/lib/i18n/workduck-language.ts');
    const copy = getWorkduckMessages(readAppearanceSettingsFromBrowser().settings.languageId);
    return { workspace: added.registry, projects: repo.registry, dbPath: db.databasePath,
      importConfirmation: copy.settings.sync.confirmations.importData.confirmText,
      sendConfirmation: copy.settings.sync.confirmations.sendSync.confirmText,
      receiveConfirmation: copy.settings.sync.confirmations.receiveSync.confirmText,
      wrongPasswordMessage: copy.settings.sync.errors.passwordMismatch,
      conflictMessage: copy.projects.errors['project-registry-revision-conflict'],
      imported: copy.settings.sync.statuses.received };
  }, resolve(run, 'workspace'));
  assert.ok(resolve(fixture.dbPath).startsWith(resolve(run, 'app-data') + '\\'));
  step('export');
  await page.locator('details').filter({ has: page.locator('#sync-payload') }).locator('summary').click();
  await page.locator('#sync-password').fill(password);
  await page.locator('button[aria-describedby="sync-export-tooltip"]').click();
  await page.waitForFunction(() => document.querySelector('#sync-payload').value.length > 0);
  const encrypted = await page.locator('#sync-payload').inputValue();
  const envelope = JSON.parse(encrypted);
  assert.equal(envelope.cipher.algorithm, 'xchacha20poly1305');
  assert.ok(!encrypted.includes('Restore sample'));
  await page.locator('#sync-folder').fill(syncFolder);
  await page.locator('#sync-file-name').fill('backup.json');
  await page.locator('button[aria-describedby="sync-send-tooltip"]').click();
  await confirmAction(page, fixture.sendConfirmation);
  await page.waitForFunction(() => !document.querySelector('button[aria-describedby="sync-send-tooltip"]').disabled);
  const encryptedFile = await readFile(resolve(syncFolder, 'backup.json'), 'utf8');
  assert.equal(JSON.parse(encryptedFile).cipher.algorithm, 'xchacha20poly1305');
  assert.ok(!encryptedFile.includes('Restore sample'));
  step('clear');
  await page.evaluate(async fixture => {
    const workspace = await import('/src/lib/workspaces/workspace-registry.ts');
    const { restoreWorkspaceSyncData } = await import('/src/lib/projects/project-storage.ts');
    const projects = await import('/src/lib/projects/project-registry.ts');
    const result = await restoreWorkspaceSyncData(workspace.createEmptyWorkspaceRegistry(), {
      [fixture.projects.workspaceId]: projects.createEmptyProjectRegistry(fixture.projects.workspaceId),
    });
    if (!result.ok) throw Error('fixture clear');
  }, fixture);
  await page.locator('#sync-password').fill(password + '-wrong');
  step('wrong-password');
  await importFromUi(page, fixture.receiveConfirmation);
  await page.locator('.workduck-inline-error').waitFor();
  assert.equal(await page.locator('.workduck-inline-error').textContent(), fixture.wrongPasswordMessage);
  const unchanged = await snapshots(page, fixture.projects.workspaceId);
  assert.equal(unchanged.workspace.workspaces.length, 0); assert.equal(unchanged.projects.nodes.length, 0);
  step('conflict');
  // A native-only write leaves this renderer's expected workspace snapshot stale.
  // This tests the actual SQLite guard, without substituting an IPC response.
  const concurrentJson = await page.evaluate(async original => {
    const { serializeWorkspaceRegistry } = await import('/src/lib/workspaces/workspace-registry.ts');
    const { getTauriInvoke } = await import('/src/lib/tauri/tauri-invoke.ts');
    const concurrent = structuredClone(original);
    concurrent.workspaces[0].name = 'Changed outside this renderer';
    const valueJson = serializeWorkspaceRegistry(concurrent);
    const result = await getTauriInvoke()('write_app_state_records', { records: {
      'workspace-registry': { valueJson, updatedAt: new Date().toISOString() },
    } });
    if (!result.ok) throw Error('concurrent fixture write');
    return valueJson;
  }, fixture.workspace);
  await page.locator('#sync-password').fill(password);
  await importFromUi(page, fixture.receiveConfirmation);
  await page.locator('.workduck-inline-error').waitFor();
  assert.equal(await page.locator('.workduck-inline-error').textContent(), fixture.conflictMessage);
  const conflictState = await page.evaluate(async workspaceId => {
    const { getTauriInvoke } = await import('/src/lib/tauri/tauri-invoke.ts');
    const { readWorkspaceRegistryFromBrowser } = await import('/src/lib/workspaces/workspace-storage.ts');
    const { readProjectRegistry } = await import('/src/lib/projects/project-storage.ts');
    const native = await getTauriInvoke()('read_app_state_records', { keys: ['workspace-registry'] });
    const projects = await readProjectRegistry(workspaceId);
    if (!native.ok || !projects.ok) throw Error('conflict state read');
    return { workspaceJson: native.records['workspace-registry'],
      workspaceCache: readWorkspaceRegistryFromBrowser().registry, projects: projects.registry };
  }, fixture.projects.workspaceId);
  assert.equal(conflictState.workspaceJson, concurrentJson);
  assert.deepEqual(conflictState.workspaceCache, unchanged.workspace);
  assert.deepEqual(conflictState.projects, unchanged.projects);
  // Refresh reads the newer authority before an explicit, newly confirmed retry.
  await page.reload(); await page.locator('#sync-password').waitFor();
  step('restore');
  await page.locator('#sync-password').fill(password);
  await importFromUi(page, fixture.receiveConfirmation);
  await page.getByText(fixture.imported, { exact: true }).waitFor({ timeout: 30000 });
  const restored = await snapshots(page, fixture.projects.workspaceId);
  assert.deepEqual(restored.workspace, fixture.workspace);
  assert.deepEqual(restored.projects, fixture.projects);
  step('restart');
  await exitApp(page);
  await browser.close(); browser = null;
  await waitExit(child);
  child = launch(executable, []);
  const reopened = await connect();
  await reopened.goto(`http://127.0.0.1:${webPort}/settings?tab=sync`);
  await reopened.locator('#sync-password').waitFor();
  assert.equal(await reopened.locator('#sync-password').inputValue(), '', 'sync password must not survive restart');
  const restartedDb = await reopened.evaluate(async () => (await (await import('/src/lib/tauri/tauri-invoke.ts')).getTauriInvoke()('storage_status')).databasePath);
  assert.equal(restartedDb, dbPath);
  const persisted = await snapshots(reopened, fixture.projects.workspaceId);
  assert.deepEqual(persisted.workspace, fixture.workspace);
  assert.deepEqual(persisted.projects, fixture.projects);
  assert.deepEqual(errors, []);
  await exitApp(reopened); await browser.close(); browser = null;
  await waitExit(child);
  step('complete');
  await writeFile(resolve(run, 'report.json'), JSON.stringify({ sourceVersion, runnerSha256,
    completedAtUtc: new Date().toISOString(), verified: true, nativeIpc: true,
    realEncryption: true, realSyncFile: true, isolatedSqlite: true, wrongPasswordRejected: true,
    staleRestoreRejected: true, concurrentDataPreserved: true, conflictMessageShown: true,
    workspaceAndProjectRestored: true, workspaceCacheMatchesSqlite: true, survivedRestart: true,
    passwordNotPersisted: true, webviewVersion, pageErrors: errors.length }, null, 2));
  console.log(JSON.stringify({ verified: true, report: resolve(run, 'report.json') }));
} catch (error) {
  await writeFile(resolve(run, 'failure.json'), JSON.stringify({ stage, message: String(error), pageErrors: errors }, null, 2));
  throw error;
} finally {
  password = '';
  await browser?.close().catch(() => {});
  if (child && child.exitCode === null) await killTree(child);
  await vite?.close();
  await writeFile(resolve(run, 'native.log'), log);
}

function launch(executable, args) {
  startupError = null;
  const process = spawn(executable, args, { cwd: root, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  process.once('error', error => { startupError = error; });
  process.stdout.on('data', chunk => { log += chunk; }); process.stderr.on('data', chunk => { log += chunk; });
  return process;
}
async function connect() {
  const deadline = Date.now() + 600000;
  while (Date.now() < deadline) {
    if (startupError) throw Error('The owned native application process could not start.');
    if (child.exitCode !== null) throw Error(`native process ended before CDP (${child.exitCode})`);
    try {
      browser = await chromium.connectOverCDP(`http://127.0.0.1:${cdpPort}`, { timeout: 1000 });
      const page = browser.contexts().flatMap(context => context.pages())
        .find(candidate => candidate.url().startsWith(`http://127.0.0.1:${webPort}/`));
      if (page) { page.on('pageerror', error => errors.push(error.message)); await page.waitForFunction(() => window.__TAURI_INTERNALS__, undefined, { timeout: 10000 }); return page; }
      await browser.close(); browser = null;
    } catch { await browser?.close().catch(() => {}); browser = null; await delay(1000); }
  }
  throw Error('native CDP endpoint did not become ready');
}
async function snapshots(page, workspaceId) {
  const result = await page.evaluate(async id => {
    const workspace = await import('/src/lib/workspaces/workspace-storage.ts');
    const projects = await import('/src/lib/projects/project-storage.ts');
    const { WORKDUCK_WORKSPACE_REGISTRY_APP_STATE_KEY } = await import('/src/lib/app-state/app-state-storage.ts');
    const { getTauriInvoke } = await import('/src/lib/tauri/tauri-invoke.ts');
    const native = await getTauriInvoke()('read_app_state_records', { keys: [WORKDUCK_WORKSPACE_REGISTRY_APP_STATE_KEY] });
    const json = native.records?.[WORKDUCK_WORKSPACE_REGISTRY_APP_STATE_KEY];
    if (!native.ok || typeof json !== 'string') throw Error('native workspace read failed');
    const loaded = await projects.readProjectRegistry(id);
    if (!loaded.ok) throw Error('native project read failed');
    return { workspace: JSON.parse(json), workspaceCache: workspace.readWorkspaceRegistryFromBrowser().registry, projects: loaded.registry };
  }, workspaceId);
  assert.deepEqual(result.workspaceCache, result.workspace, 'renderer workspace cache must match SQLite');
  return { workspace: result.workspace, projects: result.projects };
}
async function importFromUi(page, confirm) {
  await page.locator('button[aria-describedby="sync-receive-tooltip"]').click();
  await confirmAction(page, confirm);
}
async function confirmAction(page, confirm) {
  await page.locator('#sync-danger-confirm-input').fill(confirm);
  await page.getByRole('dialog').locator('.workduck-button-danger').click();
}
async function exitApp(page) {
  await page.evaluate(async () => {
    const { getTauriInvoke } = await import('/src/lib/tauri/tauri-invoke.ts');
    return getTauriInvoke()('exit_workduck');
  }).catch(() => {});
}
async function waitExit(process) {
  for (let attempt = 0; attempt < 100; attempt++) { if (process.exitCode !== null) return; await delay(100); }
  throw Error('native process did not exit');
}
async function killTree(process) {
  if (!Number.isSafeInteger(process.pid)) return;
  await new Promise(resolve => { const killer = spawn('taskkill', ['/PID', String(process.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' }); killer.once('exit', resolve); });
}
async function freePort() {
  const server = networkServer(); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port; await new Promise(resolve => server.close(resolve)); return port;
}
