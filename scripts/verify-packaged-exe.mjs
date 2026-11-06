// Verify the PACKAGED portable exe: launch with CDP, assert hub + editor + IPC.
import { spawn, execSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import os from 'os'

const ROOT = path.resolve(process.argv[2])
const PORT = 9444
const EXE = path.join(ROOT, 'MermaidApp-draw.io-v32.6.1-Portable.exe')
const TEST_DIR = path.join(os.tmpdir(), 'mmd-packaged-test')

const sleep = (ms) => new Promise(r => setTimeout(r, ms))
fs.rmSync(TEST_DIR, { recursive: true, force: true })
fs.mkdirSync(TEST_DIR, { recursive: true })
fs.writeFileSync(path.join(TEST_DIR, 'packaged.mmd'), 'flowchart TD\n  P[Packed] --> Q[Test]\n')

const child = spawn(EXE, [`--remote-debugging-port=${PORT}`], { stdio: 'ignore', detached: false })
let msgId = 0
const pending = new Map()
let ws

function send(method, params) {
  return new Promise((resolve, reject) => {
    const id = ++msgId
    pending.set(id, { resolve, reject })
    ws.send(JSON.stringify({ id, method, params }))
  })
}
async function evalInPage(expr) {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || 'page exception')
  return r.result?.value
}

try {
  let target = null
  for (let i = 0; i < 70; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
      target = list.find(t => t.type === 'page' && /index\.html/.test(t.url) && !/mermaid-visual-editor/.test(t.url))
      if (target) break
    } catch (e) {}
    await sleep(800)
  }
  if (!target) throw new Error('packaged app page never appeared')

  ws = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej })
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data)
    if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result) }
  }
  await send('Runtime.enable')

  for (let i = 0; i < 25; i++) {
    if (await evalInPage(`!!window.__mermaidStudioPluginInitialized`)) break
    await sleep(700)
  }

  const report = {}
  report.bridge = await evalInPage(`({ electron: typeof window.electron !== 'undefined', plugin: !!window.__mermaidStudioPluginInitialized })`)

  // IPC round trip on the packaged build
  report.ipc = await evalInPage(`(async () => {
    function req(msg) { return new Promise((res, rej) => window.electron.request(msg, res, (m) => rej(new Error(m || 'ipc error')))); }
    const dir = ${JSON.stringify(TEST_DIR)};
    try {
      const list = await req({action:'mermaidListFolder', path: dir});
      const code = await req({action:'mermaidReadFile', folder: dir, name: 'packaged.mmd'});
      return { listed: list.map(o => o.name), read: code.slice(0, 30) };
    } catch (e) { return { error: String(e.message || e) }; }
  })()`)

  // hub new-folder dialog
  report.hub = await evalInPage(`(async () => {
    const btns = document.querySelectorAll('#mermaid-native-toolbar-group button');
    Array.from(btns).find(b => (b.textContent||'').includes('Diagrams')).click();
    await new Promise(r => setTimeout(r, 600));
    const nf = Array.from(document.querySelectorAll('#diagrams-hub-modal button')).find(b => (b.textContent||'').includes('New Folder'));
    nf.click();
    await new Promise(r => setTimeout(r, 400));
    const dlg = document.querySelector('.mermaid-inapp-dialog-overlay');
    if (!dlg) return { dialog: false };
    dlg.querySelector('input').value = 'Packaged Check';
    Array.from(dlg.querySelectorAll('button')).find(b => /Create/.test(b.textContent)).click();
    await new Promise(r => setTimeout(r, 400));
    return { dialog: true, created: Array.from(document.querySelectorAll('#hub-nav-container .hub-nav-item')).some(n => /Packaged Check/.test(n.textContent||'')) };
  })()`)

  // visual editor
  report.visualEditor = await evalInPage(`(async () => {
    document.getElementById('diagrams-hub-modal').style.display = 'none';
    const btns = document.querySelectorAll('#mermaid-native-toolbar-group button');
    Array.from(btns).find(b => (b.textContent||'').includes('2-Way')).click();
    await new Promise(r => setTimeout(r, 5000));
    const ifr = document.querySelector('iframe[src*="mermaid-visual-editor"]');
    const d = ifr.contentDocument;
    const hydrated = Object.keys(d.body).some(k => k.indexOf('react') >= 0);
    const nb = Array.from(d.querySelectorAll('button')).find(b => (b.textContent||'').includes('Node'));
    if (nb) nb.click();
    await new Promise(r => setTimeout(r, 800));
    return { hydrated, nodes: d.querySelectorAll('.react-flow__node').length };
  })()`)

  console.log(JSON.stringify(report, null, 2))
} catch (e) {
  console.error('PACKAGED VERIFY FAILED:', e.message)
  process.exitCode = 1
} finally {
  try { ws && ws.close() } catch (e) {}
  try { execSync('taskkill /PID ' + child.pid + ' /T /F', { stdio: 'ignore' }) } catch (e) {}
  try { execSync('taskkill /IM MermaidApp-draw.io.exe /F', { stdio: 'ignore' }) } catch (e) {}
}
