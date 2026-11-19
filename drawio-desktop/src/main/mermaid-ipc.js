// Validation and path-safety helpers for MermaidApp Studio IPC actions and
// bundled Next.js static asset redirection. Kept free of Electron imports so
// they can be unit tested directly with `node --test`.

export const MERMAID_READ_RE = /\.(mmd|md|markdown)$/i;
export const MERMAID_WRITE_RE = /\.(mmd|md|markdown|drawio)$/i;
export const MERMAID_MAX_FILE_BYTES = 5 * 1024 * 1024;
export const MERMAID_MAX_NAME_LEN = 200;
export const MERMAID_MAX_LIST_ENTRIES = 2000;

// CON, NUL etc. are reserved device names on Windows and must never be
// created through the hub (even with multiple dots like CON.backup.mmd),
// and Windows silently strips trailing dots and spaces, so a name ending in
// either is not the name the caller asked for.
export const WINDOWS_RESERVED_NAMES = new Set([
	'CON', 'PRN', 'AUX', 'NUL',
	'COM1', 'COM2', 'COM3', 'COM4', 'COM5', 'COM6', 'COM7', 'COM8', 'COM9',
	'LPT1', 'LPT2', 'LPT3', 'LPT4', 'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9'
]);

export function reqMermaidName(name)
{
	if (typeof name !== 'string' || name.length === 0)
	{
		throw new Error('bad arg: name');
	}

	if (name.length > MERMAID_MAX_NAME_LEN || /[\\/:*?"<>|]/.test(name) ||
		name === '.' || name === '..' || name.includes('\0') ||
		/[. ]$/.test(name))
	{
		throw new Error('bad name');
	}

	// On Windows, CON.backup.mmd still resolves to the CON device; check the
	// first dot-separated stem rather than only stripping the final extension.
	if (WINDOWS_RESERVED_NAMES.has(name.split('.')[0].toUpperCase()))
	{
		throw new Error('bad name');
	}

	return name;
}

export function assertMermaidReadExt(name)
{
	const safeName = reqMermaidName(name);

	if (!MERMAID_READ_RE.test(safeName))
	{
		throw new Error('bad extension (use .mmd, .md or .markdown)');
	}

	return safeName;
}

export function assertMermaidWriteExt(name)
{
	const safeName = reqMermaidName(name);

	if (!MERMAID_WRITE_RE.test(safeName))
	{
		throw new Error('bad extension (use .mmd, .md, .markdown or .drawio)');
	}

	return safeName;
}

export function assertMermaidWriteSize(data)
{
	if (typeof data !== 'string')
	{
		throw new Error('bad arg: data');
	}

	if (Buffer.byteLength(data, 'utf8') > MERMAID_MAX_FILE_BYTES)
	{
		throw new Error('content too large (max ' + (MERMAID_MAX_FILE_BYTES / 1024 / 1024) + ' MB)');
	}
}

// Safely redirect root-relative `/_next/static/...` requests from the bundled
// Next.js visual editor iframe to `<codeUrl>/mermaid-visual-editor/_next/...`.
// Returns a validated file:// redirect URL, or null if the request should be
// cancelled/rejected.
export function resolveNextAssetRedirect(requestUrl, codeUrl)
{
	if (typeof requestUrl !== 'string' || typeof codeUrl !== 'string')
	{
		return null;
	}

	const parts = requestUrl.split('/_next/');

	// Reject missing or multiple `/_next/` segments
	if (parts.length !== 2)
	{
		return null;
	}

	// Strip optional query string or hash before validating the path
	const rawNextPath = parts[1].split(/[?#]/)[0];

	let decodedPath;
	try
	{
		decodedPath = decodeURIComponent(rawNextPath);
	}
	catch (e)
	{
		return null;
	}

	if (!decodedPath || decodedPath.includes('..') || decodedPath.includes('\\') ||
		decodedPath.includes('\0') || !/^static\/[A-Za-z0-9_./-]+$/.test(decodedPath))
	{
		return null;
	}

	const normalizedCodeUrl = codeUrl.endsWith('/') ? codeUrl : codeUrl + '/';
	const expectedPrefix = normalizedCodeUrl + 'mermaid-visual-editor/_next/';
	const redirectUrl = expectedPrefix + decodedPath;

	if (!redirectUrl.startsWith(expectedPrefix))
	{
		return null;
	}

	return redirectUrl;
}
