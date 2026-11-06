// End-to-end verification: launches the REAL draw.io app (real main process,
// real preload, real blessedPaths store) with a DevTools port, then drives the
// page over CDP: IPC disk actions, hub, visual editor.
//   node _verify3.mjs
import { spawn, execSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import os from 'os'

const ROOT = path.resolve(process.argv[2] || '.')
const PORT = 9333
const TEST_DIR = path.join(ROOT, '..', '_ipctest')

const sleep = (ms) => new Promise(r => setTimeout(r, ms))

// --- fixtures -------------------------------------------------------------
fs.mkdirSync(TEST_DIR, { recursive: true })
fs.writeFileSync(path.join(TEST_DIR, 'hello-flow.mmd'), 'flowchart TD\n  A[Hello] --> B[World]\n')
fs.writeFileSync(path.join(TEST_DIR, 'doc.md'), '# Doc\n\n```mermaid\nflowchart LR\n X --> Y\n```\n')
fs.writeFileSync(path.join(TEST_DIR, 'ignored.txt'), 'not a diagram')
// an unauthorised directory (NOT in blessedPaths)
const DENIED_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'mmd-denied-'))
fs.writeFileSync(path.join(DENIED_DIR, 'secret.mmd'), 'flowchart TD\n Z --> W\n')

// --- launch real app -------------------------------------------------------
const electronCmd = 'node_modules\\.bin\\electron.cmd . --remote-debugging-port=' + PORT
// ELECTRON_RUN_AS_NODE would make Electron start as a plain Node REPL with no
// app and no CDP server; it must never leak into the child.
const childEnv = { ...process.env }
delete childEnv.ELECTRON_RUN_AS_NODE
const child = spawn('cmd.exe', ['/d', '/s', '/c', electronCmd], {
  cwd: ROOT,
  windowsVerbatimArguments: true,
  stdio: ['ignore', 'pipe', 'pipe'],
  detached: false,
  env: childEnv,
})

let ws = null
let msgId = 0
const pending = new Map()

function send(method, params, sessionId) {
  return new Promise((resolve, reject) => {
    const id = ++msgId
    pending.set(id, { resolve, reject })
    ws.send(JSON.stringify({ id, method, params, sessionId }))
  })
}

async function evalInPage(expr) {
  const r = await send('Runtime.evaluate', {
    expression: expr,
    awaitPromise: true,
    returnByValue: true,
  })
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || 'page exception')
  return r.result?.value
}

async function waitForTarget() {
  for (let i = 0; i < 60; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
      const page = list.find(t => t.type === 'page' && /index\.html/.test(t.url) && !/mermaid-visual-editor/.test(t.url))
      if (page) return page
    } catch (e) {}
    await sleep(700)
  }
  throw new Error('app page target never appeared')
}

try {
  const target = await waitForTarget()
  ws = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej })
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data)
    if (m.id && pending.has(m.id)) {
      const p = pending.get(m.id)
      pending.delete(m.id)
      if (m.error) p.reject(new Error(m.error.message))
      else p.resolve(m.result)
    }
  }
  await send('Runtime.enable')

  // let draw.io finish booting (plugins register after app-load)
  for (let i = 0; i < 20; i++) {
    const ok = await evalInPage(`(typeof EditorUi !== 'undefined' && EditorUi.isElectronApp === true && !!window.__mermaidStudioPluginInitialized)`)
    if (ok) break
    await sleep(700)
  }

  const report = {}

  report.bridge = await evalInPage(`({
    electron: typeof window.electron !== 'undefined' && typeof window.electron.request === 'function',
    isElectronApp: typeof EditorUi !== 'undefined' && EditorUi.isElectronApp === true,
    plugin: !!window.__mermaidStudioPluginInitialized
  })`)

  const req = (expr) => evalInPage(`(async () => {
    function req(msg) { return new Promise((res, rej) => window.electron.request(msg, res, (m) => rej(new Error(m || 'ipc error')))); }
    ${expr}
  })()`)

  // 1. unauthorised folder -> refused
  report.denied = await req(`try { await req({action:'mermaidListFolder', path: ${JSON.stringify(DENIED_DIR)}}); return { FAIL: 'not refused' }; }
    catch (e) { return { refused: /not authorised/i.test(String(e.message)) }; }`)

  // 2. blessed folder -> works
  report.list = await req(`try {
      const out = await req({action:'mermaidListFolder', path: ${JSON.stringify(TEST_DIR)}});
      return { names: out.map(o => o.name).sort() };
    } catch (e) { return { error: String(e.message || e) }; }`)

  // 3. read both file kinds
  report.read = await req(`try {
      const mmd = await req({action:'mermaidReadFile', folder: ${JSON.stringify(TEST_DIR)}, name: 'hello-flow.mmd'});
      const md  = await req({action:'mermaidReadFile', folder: ${JSON.stringify(TEST_DIR)}, name: 'doc.md'});
      return { mmd: mmd.slice(0, 24), mdHasFence: md.includes('flowchart LR') };
    } catch (e) { return { error: String(e.message || e) }; }`)

  // 4. write + delete round trip
  report.writeDelete = await req(`try {
      const w = await req({action:'mermaidWriteFile', folder: ${JSON.stringify(TEST_DIR)}, name: 'probe-out.mmd', data: 'flowchart TD\\n P[written] --> Q[via IPC]'});
      const back = await req({action:'mermaidReadFile', folder: ${JSON.stringify(TEST_DIR)}, name: 'probe-out.mmd'});
      const d = await req({action:'mermaidDeleteFile', folder: ${JSON.stringify(TEST_DIR)}, name: 'probe-out.mmd'});
      return { wrote: w === true, roundTrip: back.includes('via IPC'), deleted: d === true };
    } catch (e) { return { error: String(e.message || e) }; }`)

  // 5. refusals: traversal, bad ext, reserved name
  report.refusals = await req(`const out = {};
    try { await req({action:'mermaidWriteFile', folder: ${JSON.stringify(TEST_DIR)}, name: '..\\\\evil.mmd', data: 'x'}); out.traversal = 'FAIL'; }
    catch (e) { out.traversal = true; }
    try { await req({action:'mermaidWriteFile', folder: ${JSON.stringify(TEST_DIR)}, name: 'evil.exe', data: 'MZ'}); out.badExt = 'FAIL'; }
    catch (e) { out.badExt = true; }
    try { await req({action:'mermaidWriteFile', folder: ${JSON.stringify(TEST_DIR)}, name: 'CON.mmd', data: 'x'}); out.reserved = 'FAIL'; }
    catch (e) { out.reserved = true; }
    return out;`)

  // 6. hub New Folder via in-app dialog
  report.hub = await evalInPage(`(async () => {
    try {
      const btns = document.querySelectorAll('#mermaid-native-toolbar-group button');
      Array.from(btns).find(b => (b.textContent||'').includes('Diagrams')).click();
      await new Promise(r => setTimeout(r, 500));
      const nf = Array.from(document.querySelectorAll('#diagrams-hub-modal button')).find(b => (b.textContent||'').includes('New Folder'));
      nf.click();
      await new Promise(r => setTimeout(r, 400));
      const dlg = document.querySelector('.mermaid-inapp-dialog-overlay');
      if (!dlg) return { dialog: false };
      dlg.querySelector('input').value = 'IPC Verified';
      Array.from(dlg.querySelectorAll('button')).find(b => /Create/.test(b.textContent)).click();
      await new Promise(r => setTimeout(r, 400));
      return { dialog: true, created: Array.from(document.querySelectorAll('#hub-nav-container .hub-nav-item')).some(n => /IPC Verified/.test(n.textContent||'')) };
    } catch (e) { return { error: String(e) }; }
  })()`)

  // 7. visual editor hydrates and buttons work
  report.visualEditor = await evalInPage(`(async () => {
    try {
      document.getElementById('diagrams-hub-modal').style.display = 'none';
      const btns = document.querySelectorAll('#mermaid-native-toolbar-group button');
      Array.from(btns).find(b => (b.textContent||'').includes('2-Way')).click();
      await new Promise(r => setTimeout(r, 5000));
      const ifr = document.querySelector('iframe[src*="mermaid-visual-editor"]');
      if (!ifr) return { error: 'no iframe' };
      const d = ifr.contentDocument;
      const hydrated = Object.keys(d.body).some(k => k.indexOf('react') >= 0);
      const nb = Array.from(d.querySelectorAll('button')).find(b => (b.textContent||'').includes('Node'));
      if (nb) nb.click();
      await new Promise(r => setTimeout(r, 800));
      return { hydrated, nodes: d.querySelectorAll('.react-flow__node').length };
    } catch (e) { return { error: String(e) }; }
  })()`)

  console.log(JSON.stringify(report, null, 2))
} catch (e) {
  console.error('VERIFY FAILED:', e.message)
  process.exitCode = 1
} finally {
  try { ws && ws.close() } catch (e) {}
  try { execSync('taskkill /PID ' + child.pid + ' /T /F', { stdio: 'ignore' }) } catch (e) {}
  try { execSync('taskkill /IM electron.exe /F', { stdio: 'ignore' }) } catch (e) {}
}
