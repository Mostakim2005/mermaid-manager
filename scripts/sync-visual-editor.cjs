// Syncs the built visual editor into the draw.io webapp bundle.
//
//   node scripts/sync-visual-editor.cjs           # build + sync
//   node scripts/sync-visual-editor.cjs --no-build
//
// The app loads the editor over file:// inside an iframe. electron.js rewrites
// any /_next/ request to <codeUrl>mermaid-visual-editor/_next/, so the export
// MUST keep its absolute /_next/ URLs (rewriting them to ./_next/ breaks the
// Turbopack runtime) and the destination MUST be replaced atomically — a
// partially copied tree is exactly what left the editor rendered but dead.
const { spawnSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const SRC_BUILD = path.join(ROOT, 'mermaid-visual-editor', 'out')
const EDITOR_DIR = path.join(ROOT, 'mermaid-visual-editor')
const DEST = path.join(ROOT, 'drawio-desktop', 'drawio', 'src', 'main', 'webapp', 'mermaid-visual-editor')
const STAGING = DEST + '.staging'
const BACKUP = DEST + '.bak'

const build = !process.argv.includes('--no-build')

function fail(msg) {
  console.error('✖ ' + msg)
  process.exit(1)
}

function rmrf(p) {
  fs.rmSync(p, { recursive: true, force: true })
}

if (build) {
  // Run Next's JS entry through node itself: the install path contains spaces, and
  // going through the .cmd shim on Windows requires cmd.exe quoting that breaks it.
  const nextBin = path.join(EDITOR_DIR, 'node_modules', 'next', 'dist', 'bin', 'next')
  if (!fs.existsSync(nextBin)) fail('next not installed — run `pnpm install` in mermaid-visual-editor')
  console.log('▶ Building mermaid-visual-editor…')
  const res = spawnSync(process.execPath, [nextBin, 'build'], { cwd: EDITOR_DIR, stdio: 'inherit' })
  if (res.status !== 0) fail('next build failed')
}

if (!fs.existsSync(path.join(SRC_BUILD, 'index.html'))) fail('missing build output at ' + SRC_BUILD)

// Verify the export references only files that exist, before touching the app.
const html = fs.readFileSync(path.join(SRC_BUILD, 'index.html'), 'utf8')
const refs = [...new Set([...html.matchAll(/static\/chunks\/([A-Za-z0-9_.-]+\.(?:js|css))/g)].map((m) => m[1]))]
const onDisk = new Set(fs.readdirSync(path.join(SRC_BUILD, '_next', 'static', 'chunks')))
const missing = refs.filter((r) => !onDisk.has(r))
if (missing.length) fail('build references missing chunks: ' + missing.join(', '))

// Stage, swap, then drop the old tree — never copy over a live directory.
rmrf(STAGING)
fs.mkdirSync(STAGING, { recursive: true })
fs.cpSync(SRC_BUILD, STAGING, { recursive: true })
rmrf(BACKUP)
if (fs.existsSync(DEST)) fs.renameSync(DEST, BACKUP)
fs.renameSync(STAGING, DEST)
rmrf(BACKUP)

// Post-check: same chunk set in the destination as in the fresh build.
const destChunks = new Set(fs.readdirSync(path.join(DEST, '_next', 'static', 'chunks')))
const stale = [...destChunks].filter((f) => !onDisk.has(f))
if (stale.length) fail('destination has stale chunks after sync: ' + stale.slice(0, 5).join(', '))

console.log(`✔ Synced ${refs.length} chunk refs into ${path.relative(ROOT, DEST)}`)
