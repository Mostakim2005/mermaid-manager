# Third-Party Notices

MermaidApp Studio (`mermaid-manager`) is licensed under the GNU General Public License v3.0 (GPL-3.0-only) as defined in the root [`LICENSE`](LICENSE), harmonizing with the upstream GPL-3.0 license of draw.io Desktop.

The vendored subprojects and dependencies retain their respective open-source licenses:

- `drawio-desktop/LICENSE` — GPL-3.0-only
- `drawio-desktop/drawio/LICENSE` — Apache-2.0
- `mermaid-visual-editor/LICENSE` — MIT

## Ships inside the app

These components are packaged into the portable `.exe` (directly or inside `app.asar`).

| Component | Version | License | Upstream |
|---|---|---|---|
| draw.io Desktop (Electron host) | 32.6.1 | GPL-3.0-only | https://github.com/jgraph/drawio-desktop |
| draw.io core webapp / mxGraph | 32.6.1 | Apache-2.0 | https://github.com/jgraph/drawio |
| Electron | 44.x | MIT | https://github.com/electron/electron |
| electron-context-menu | 5.x | MIT | https://github.com/sindresorhus/electron-context-menu |
| electron-log | 5.x | MIT | https://github.com/megahertz/electron-log |
| electron-store | 11.x | MIT | https://github.com/sindresorhus/electron-store |
| electron-updater | 6.x | MIT | https://github.com/electron-userland/electron-builder |
| @cantoo/pdf-lib | 2.x | MIT | https://github.com/cantoo-scribe/pdf-lib |
| buffer | 6.x | MIT | https://github.com/feross/buffer |
| compression | 1.8.x | MIT | https://github.com/expressjs/compression |
| crc | 4.x | MIT | https://github.com/alexgorbatchev/crc |
| tslib | 2.x | 0BSD | https://github.com/microsoft/tslib |
| mermaid-visual-editor | 0.1.0 | MIT | https://github.com/saketkattu/mermaid-visual-editor |
| React / React DOM | 19.x | MIT | https://github.com/facebook/react |
| @xyflow/react (React Flow) | 12.x | MIT | https://github.com/xyflow/xyflow |
| Zustand | 5.x | MIT | https://github.com/pmndrs/zustand |
| Mermaid.js | 11.x | MIT | https://github.com/mermaid-js/mermaid |
| @dagrejs/dagre | 2.x | MIT | https://github.com/dagrejs/dagre |
| Next.js (static export runtime) | 16.x | MIT | https://github.com/vercel/next.js |
| serve | 14.x | MIT | https://github.com/vercel/serve |

## Build / test only — not shipped

These are used to compile, package, or test the app and are not part of the installed
application payload.

| Component | Version | License | Upstream |
|---|---|---|---|
| electron-builder | 26.x | MIT | https://github.com/electron-userland/electron-builder |
| @electron/fuses | 2.x | MIT | https://github.com/electron/fuses |
| @electron/notarize | 3.x | MIT | https://github.com/electron/notarize |
| quicklookjs | 1.x | MIT | https://github.com/cooljeanius/quicklookjs |
| dotenv | 17.x | BSD-2-Clause | https://github.com/motdotla/dotenv |
| sumchecker | 3.x | Apache-2.0 | https://github.com/electron/sumchecker |
| TypeScript | 5.x | Apache-2.0 | https://github.com/microsoft/TypeScript |
| ESLint | 9.x | MIT | https://github.com/eslint/eslint |
| eslint-config-next | 16.x | MIT | https://github.com/vercel/next.js |
| Tailwind CSS | 4.x | MIT | https://github.com/tailwindlabs/tailwindcss |
| @tailwindcss/postcss | 4.x | MIT | https://github.com/tailwindlabs/tailwindcss |
| PostCSS | 8.x | MIT | https://github.com/postcss/postcss |
| Node.js built-in test runner | 22.x+ | MIT | https://github.com/nodejs/node |
