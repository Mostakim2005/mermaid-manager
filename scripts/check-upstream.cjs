#!/usr/bin/env node
/**
 * scripts/check-upstream.cjs
 *
 * Checks configured upstream repositories for new commits, tags, and features,
 * and prints diff and cherry-pick instructions to merge changes into the local subdirectories.
 *
 * Usage:
 *   node scripts/check-upstream.cjs
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

function run(cmd, opts = {}) {
  try {
    return execSync(cmd, { cwd: ROOT, encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'], ...opts }).trim();
  } catch (err) {
    return null;
  }
}

console.log('🔍 Checking upstream repositories for updates...\n');

// 1. Check drawio-desktop
const currentDrawioVersion = fs.readFileSync(path.join(ROOT, 'drawio-desktop', 'drawio', 'VERSION'), 'utf8').trim();
console.log(`[1] draw.io Desktop:`);
console.log(`    Current local drawio base version: ${currentDrawioVersion}`);

run('git fetch upstream-drawio --no-tags --depth=10');
const latestDrawioCommits = run('git log upstream-drawio/dev --oneline -n 5');
if (latestDrawioCommits) {
  console.log(`    Latest upstream-drawio/dev commits:`);
  latestDrawioCommits.split('\n').forEach(c => console.log(`      * ${c}`));
} else {
  console.log(`    (Could not fetch or upstream-drawio is up to date)`);
}

// 2. Check mermaid-visual-editor
console.log(`\n[2] Mermaid Visual Editor:`);
run('git fetch upstream-editor --no-tags --depth=10');
const latestEditorCommits = run('git log upstream-editor/master --oneline -n 5');
if (latestEditorCommits) {
  console.log(`    Latest upstream-editor/master commits:`);
  latestEditorCommits.split('\n').forEach(c => console.log(`      * ${c}`));
} else {
  console.log(`    (Could not fetch or upstream-editor is up to date)`);
}

console.log(`\n======================================================`);
console.log(`💡 HOW TO MERGE OR CHERRY-PICK UPSTREAM FEATURES:`);
console.log(`======================================================`);
console.log(`\n• To view diff of a specific file against upstream drawio:`);
console.log(`  git diff upstream-drawio/dev:src/main/electron.js drawio-desktop/src/main/electron.js`);
console.log(`\n• To apply an upstream commit to drawio-desktop:`);
console.log(`  git diff <COMMIT_HASH>^! | git apply --directory=drawio-desktop/`);
console.log(`\n• To apply an upstream commit to mermaid-visual-editor:`);
console.log(`  git diff <COMMIT_HASH>^! | git apply --directory=mermaid-visual-editor/`);
console.log(`\n• To merge all upstream updates into drawio-desktop using subtree strategy:`);
console.log(`  git merge -s recursive -X subtree=drawio-desktop/ upstream-drawio/dev`);
console.log(`\n======================================================\n`);
