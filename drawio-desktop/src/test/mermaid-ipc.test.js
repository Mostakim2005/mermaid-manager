import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
	MERMAID_MAX_FILE_BYTES,
	reqMermaidName,
	assertMermaidReadExt,
	assertMermaidWriteExt,
	assertMermaidWriteSize,
	resolveNextAssetRedirect
} from '../main/mermaid-ipc.js';

describe('reqMermaidName', () =>
{
	it('accepts valid filenames', () =>
	{
		assert.equal(reqMermaidName('diagram.mmd'), 'diagram.mmd');
		assert.equal(reqMermaidName('Architecture Notes.md'), 'Architecture Notes.md');
		assert.equal(reqMermaidName('v1.2.3-flow.markdown'), 'v1.2.3-flow.markdown');
		assert.equal(reqMermaidName('Subfolder_01'), 'Subfolder_01');
	});

	it('rejects path separators, traversal, null bytes, and trailing dots/spaces', () =>
	{
		for (const bad of ['', '.', '..', '../a.mmd', 'a/b.mmd', 'a\\b.mmd', 'a\0b.mmd', 'a.mmd ', 'a.mmd.', 'a:b.mmd'])
		{
			assert.throws(() => reqMermaidName(bad), /bad (name|arg)/, `expected reject for ${JSON.stringify(bad)}`);
		}
	});

	it('rejects Windows reserved device names including multi-dot variants', () =>
	{
		for (const bad of ['CON', 'con.mmd', 'CON.backup.mmd', 'nul.foo.bar.md', 'COM1.mmd', 'LPT9.drawio', 'AUX.txt'])
		{
			assert.throws(() => reqMermaidName(bad), /bad name/, `expected reject for ${JSON.stringify(bad)}`);
		}
	});

	it('allows names that merely start with a reserved prefix', () =>
	{
		assert.equal(reqMermaidName('connect.mmd'), 'connect.mmd');
		assert.equal(reqMermaidName('auxiliary.md'), 'auxiliary.md');
	});
});

describe('assertMermaidReadExt & assertMermaidWriteExt', () =>
{
	it('enforces read extension allow-list (.mmd, .md, .markdown)', () =>
	{
		assert.equal(assertMermaidReadExt('a.mmd'), 'a.mmd');
		assert.equal(assertMermaidReadExt('a.MD'), 'a.MD');
		assert.equal(assertMermaidReadExt('a.markdown'), 'a.markdown');

		for (const bad of ['.env', 'secret.key', 'config.json', 'diagram.drawio', 'run.exe', 'notes.txt'])
		{
			assert.throws(() => assertMermaidReadExt(bad), /bad extension/, `read should reject ${bad}`);
		}
	});

	it('enforces write/delete extension allow-list (.mmd, .md, .markdown, .drawio)', () =>
	{
		assert.equal(assertMermaidWriteExt('a.mmd'), 'a.mmd');
		assert.equal(assertMermaidWriteExt('a.md'), 'a.md');
		assert.equal(assertMermaidWriteExt('a.markdown'), 'a.markdown');
		assert.equal(assertMermaidWriteExt('a.drawio'), 'a.drawio');

		for (const bad of ['.env', 'report.docx', 'app.exe', 'config.json', 'script.js'])
		{
			assert.throws(() => assertMermaidWriteExt(bad), /bad extension/, `write/delete should reject ${bad}`);
		}
	});
});

describe('assertMermaidWriteSize', () =>
{
	it('accepts payloads within the UTF-8 byte limit', () =>
	{
		assert.doesNotThrow(() => assertMermaidWriteSize('flowchart TD\n  A --> B'));
	});

	it('rejects multi-byte UTF-8 payloads whose byte length exceeds the limit even if UTF-16 length is smaller', () =>
	{
		// Each 3-byte CJK char is 1 UTF-16 code unit but 3 UTF-8 bytes.
		// 2,000,000 chars => .length = 2,000,000 (< 5,242,880) but 6,000,000 UTF-8 bytes (> 5,242,880).
		const bigUtf8 = '\u4e2d'.repeat(2_000_000);
		assert.ok(bigUtf8.length < MERMAID_MAX_FILE_BYTES);
		assert.ok(Buffer.byteLength(bigUtf8, 'utf8') > MERMAID_MAX_FILE_BYTES);
		assert.throws(() => assertMermaidWriteSize(bigUtf8), /content too large/);
	});
});

describe('resolveNextAssetRedirect', () =>
{
	const codeUrl = 'file:///C:/app/drawio/src/main/webapp/';

	it('redirects valid /_next/static/* asset URLs into mermaid-visual-editor/_next/', () =>
	{
		assert.equal(
			resolveNextAssetRedirect('file:///C:/_next/static/chunks/abc123.js', codeUrl),
			'file:///C:/app/drawio/src/main/webapp/mermaid-visual-editor/_next/static/chunks/abc123.js'
		);
		assert.equal(
			resolveNextAssetRedirect('file:///C:/_next/static/chunks/style.css?v=1#top', codeUrl),
			'file:///C:/app/drawio/src/main/webapp/mermaid-visual-editor/_next/static/chunks/style.css'
		);
	});

	it('rejects traversal, encoded dots, backslashes, non-static paths, and duplicate /_next/ segments', () =>
	{
		const badUrls = [
			'file:///C:/_next/static/../../electron.js',
			'file:///C:/_next/static/%2e%2e/%2e%2e/secret.json',
			'file:///C:/_next/static/chunks\\..\\secret.js',
			'file:///C:/_next/static/chunks/a%00b.js',
			'file:///C:/_next/data/secret.json',
			'file:///C:/_next/static/_next/static/a.js',
			'file:///C:/_next/'
		];
		for (const u of badUrls)
		{
			assert.equal(resolveNextAssetRedirect(u, codeUrl), null, `expected null for ${u}`);
		}
	});
});
