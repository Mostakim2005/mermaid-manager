import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pluginPath = path.resolve(__dirname, '../../drawio/src/main/webapp/plugins/mermaid-visual-editor.js');
const pluginSource = fs.readFileSync(pluginPath, 'utf8');

// Extract the Auto-Fixer engine and TEMPLATES directly from the production plugin
// so tests always exercise the real code with zero drift.
function loadAutoFixerAndTemplates()
{
	const startIdx = pluginSource.indexOf('var MERMAID_FAMILIES = {');
	const endIdx = pluginSource.indexOf('// Run the fixer on the Studio editor');
	assert.ok(startIdx > 0 && endIdx > startIdx, 'Could not locate Auto-Fixer block in plugin');

	const tplStart = pluginSource.indexOf('var TEMPLATES = {');
	const tplEnd = pluginSource.indexOf('// ==========================================\n        // 8. CANVAS HELPERS');
	assert.ok(tplStart > 0 && tplEnd > tplStart, 'Could not locate TEMPLATES block in plugin');

	const snippet = pluginSource.slice(startIdx, endIdx) + '\n' + pluginSource.slice(tplStart, tplEnd) +
		'\n({ mermaidFamily, autoFixSyntaxDetailed, TEMPLATES });';
	return vm.runInNewContext(snippet);
}

const { mermaidFamily, autoFixSyntaxDetailed, TEMPLATES } = loadAutoFixerAndTemplates();

describe('Mermaid Auto-Fixer — Non-Interference on Valid Templates', () =>
{
	for (const [name, code] of Object.entries(TEMPLATES))
	{
		it(`does not alter valid TEMPLATES.${name}`, () =>
		{
			const res = autoFixSyntaxDetailed(code);
			assert.equal(res.changed, false, `TEMPLATES.${name} was unexpectedly modified: ${JSON.stringify(res.notes)}\n${res.code}`);
			assert.equal(res.code, code.trim());
		});
	}
});

describe('Mermaid Auto-Fixer — Family Isolation', () =>
{
	it('leaves sequenceDiagram solid-no-arrow A -> B untouched', () =>
	{
		const seq = 'sequenceDiagram\n    Alice -> Bob: Hello (world)\n    Bob -->> Alice: Hi [ok]';
		const res = autoFixSyntaxDetailed(seq);
		assert.equal(res.family, 'sequence');
		assert.equal(res.changed, false);
		assert.equal(res.code, seq);
	});

	it('leaves classDiagram and stateDiagram-v2 untouched', () =>
	{
		const cls = 'classDiagram\n    Animal <|-- Duck : inherits\n    Duck : +swim(speed: int)';
		assert.equal(autoFixSyntaxDetailed(cls).changed, false);

		const st = 'stateDiagram-v2\n    [*] --> Active\n    Active --> [*]';
		assert.equal(autoFixSyntaxDetailed(st).changed, false);
	});

	it('strips markdown fences from non-flowchart diagrams without corrupting body', () =>
	{
		const fenced = '```mermaid\nsequenceDiagram\n    A -> B: ping\n```';
		const res = autoFixSyntaxDetailed(fenced);
		assert.equal(res.changed, true);
		assert.equal(res.code, 'sequenceDiagram\n    A -> B: ping');
	});
});

describe('Mermaid Auto-Fixer — Flowchart Repairs & Shape Preservation', () =>
{
	it('preserves cylinder, trapezoid, parallelogram, and subroutine shapes', () =>
	{
		const code = [
			'flowchart TD',
			'    DB[(Query Database)] --> Sub[[Core: Routine]]',
			'    Sub --> Trap[/Input (a, b)/]',
			'    Trap --> Para[\\Output: ok\\]'
		].join('\n');
		const res = autoFixSyntaxDetailed(code);
		assert.equal(res.changed, false, `Shapes were mangled:\n${res.code}`);
	});

	it('repairs malformed arrows, unquoted punctuation labels, unclosed brackets, unbalanced quotes, and unclosed subgraphs', () =>
	{
		const broken = [
			'flowchartTD',
			'    subgraph Pipeline',
			'    A[Start (v1)] -> B[Process --> C',
			'    C -- > D["Finish',
		].join('\n');
		const res = autoFixSyntaxDetailed(broken);
		assert.equal(res.changed, true);
		assert.match(res.code, /^flowchart TD/m);
		assert.match(res.code, /A\["Start \(v1\)"\] --> B\["Process"\]\s*--> C/);
		assert.match(res.code, /C --> D\["Finish"/);
		assert.match(res.code, /\n\s*end$/);

		// Notes must never leak internal JS function names
		for (const note of res.notes)
		{
			assert.doesNotMatch(note, /^repair[A-Z]/, `Internal function name leaked in note: ${note}`);
		}

		// Idempotency: running Auto-Fix a second time makes zero changes
		const second = autoFixSyntaxDetailed(res.code);
		assert.equal(second.changed, false, `Auto-Fix is not idempotent:\n${second.code}`);
	});

	it('adds implicit flowchart TD header for bare edge lists', () =>
	{
		const res = autoFixSyntaxDetailed('A --> B\nB --> C');
		assert.equal(res.changed, true);
		assert.equal(res.code, 'flowchart TD\nA --> B\nB --> C');
		assert.equal(autoFixSyntaxDetailed(res.code).changed, false);
	});

	it('detects diagram families accurately', () =>
	{
		assert.equal(mermaidFamily('flowchart LR\n  A --> B'), 'flowchart');
		assert.equal(mermaidFamily('sequenceDiagram\n  A->>B: hi'), 'sequence');
		assert.equal(mermaidFamily('infographic\ntitle Foo'), 'infographic');
		assert.equal(mermaidFamily('@startuml\nA -> B\n@enduml'), 'plantuml');
	});
});
