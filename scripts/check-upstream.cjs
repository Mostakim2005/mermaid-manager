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

function hasRemote(name) {
  return run(`git remote get-url ${name}`) !== null;
}

function detectRemoteBranch(remote, preferred) {
  const headRef = run(`git symbolic-ref --short refs/remotes/${remote}/HEAD`);
  if (headRef && headRef.startsWith(`${remote}/`)) {
    return headRef.slice(remote.length + 1);
  }
  for (const branch of preferred) {
    if (run(`git rev-parse --verify refs/remotes/${remote}/${branch}`) !== null) {
      return branch;
    }
  }
  return null;
}

function checkUpstream({ index, label, remote, repoUrl, preferredBranches, extraInfo }) {
  console.log(`${index > 1 ? '\n' : ''}[${index}] ${label}:`);
  if (extraInfo) console.log(`    ${extraInfo}`);

  if (!hasRemote(remote)) {
    console.log(`    ⚠ Remote '${remote}' is not configured.`);
    console.log(`      Run: git remote add ${remote} ${repoUrl}`);
    return;
  }

  // Never fetch upstream tags (TRAP 4: foreign tags pollute auto-bump versioning).
  const fetchOut = run(`git fetch ${remote} --no-tags --depth=10`);
  if (fetchOut === null) {
    console.log(`    ⚠ Failed to fetch '${remote}' (check network or remote URL).`);
    return;
  }

  const branch = detectRemoteBranch(remote, preferredBranches);
  if (!branch) {
    console.log(`    ⚠ Could not detect default branch on '${remote}' (checked: ${preferredBranches.join(', ')}).`);
    return;
  }

  const latestCommits = run(`git log ${remote}/${branch} --oneline -n 5`);
  if (latestCommits) {
    console.log(`    Latest ${remote}/${branch} commits:`);
    latestCommits.split('\n').forEach(c => console.log(`      * ${c}`));
  } else {
    console.log(`    (No commits returned for ${remote}/${branch})`);
  }
}

console.log('🔍 Checking upstream repositories for updates...\n');

const currentDrawioVersion = fs.readFileSync(path.join(ROOT, 'drawio-desktop', 'drawio', 'VERSION'), 'utf8').trim();

checkUpstream({
  index: 1,
  label: 'draw.io Desktop',
  remote: 'upstream-drawio',
  repoUrl: 'https://github.com/jgraph/drawio-desktop.git',
  preferredBranches: ['dev', 'master', 'main'],
  extraInfo: `Current local drawio base version: ${currentDrawioVersion}`,
});

checkUpstream({
  index: 2,
  label: 'draw.io Core Webapp',
  remote: 'upstream-drawio-core',
  repoUrl: 'https://github.com/jgraph/drawio.git',
  preferredBranches: ['dev', 'master', 'main'],
});

checkUpstream({
  index: 3,
  label: 'Mermaid Visual Editor',
  remote: 'upstream-editor',
  repoUrl: 'https://github.com/Mostakim2005/mermaid-visual-editor.git',
  preferredBranches: ['main', 'master'],
});

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
