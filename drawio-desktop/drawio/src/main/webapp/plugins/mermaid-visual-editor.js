/**
 * Universal "Paste Code -> Auto-Detect & Render" Studio, Two-Way Visual Editor
 * and Visual Diagrams & Folders Workspace Hub for Draw.io.
 * Combines React Flow drag-and-drop, native Mermaid.js, PlantUML, Radar/Spider Charts,
 * and Publication-Grade Infographics into Draw.io.
 */
(function() {
    // Global theme helper
    function isDarkMode() {
        return document.body.classList.contains('geDarkMode') ||
               document.documentElement.getAttribute('data-theme') === 'dark' ||
               (typeof ui !== 'undefined' && ui.editor && ui.editor.isDarkMode && ui.editor.isDarkMode());
    }

    // SVG CSS light-dark helper (prevents white-on-white text inversion in exported/previewed SVGs)
    //
    // draw.io emits `color-scheme: dark` plus `light-dark(a, b)` pairs computed from the
    // current theme. Resolving those guided by color-scheme is what went wrong: with the
    // OS in dark mode and a light preview canvas, light-dark() picked the dark value
    // (white/dark-grey text and near-black bars on a white or navy panel). We therefore
    // resolve every pair explicitly for the theme being drawn onto and pin color-scheme.
    //
    // Note: the light value may itself contain commas (rgb(236, 236, 255)), so the split
    // has to respect parentheses — a naive /([^,]+),([^)]+)/ split mangles these.
    function splitLightDarkArgs(args) {
        var depth = 0;
        var parts = [];
        var cur = '';
        for (var i = 0; i < args.length; i++) {
            var ch = args[i];
            if (ch === '(') depth++;
            else if (ch === ')') depth--;
            if (ch === ',' && depth === 0) { parts.push(cur); cur = ''; continue; }
            cur += ch;
        }
        parts.push(cur);
        return parts.length === 2 ? parts : null;
    }

    function resolveLightDarkCss(svgStr, mode) {
        if (!svgStr) return '';
        var wantDark = mode === 'dark';

        // 1. Expand every light-dark(light, dark) into the value for this canvas.
        //    Values like rgb(236, 236, 255) nest one level of parentheses.
        var out = svgStr.replace(/light-dark\(((?:[^()]|\([^()]*\))*)\)/g, function(whole, args) {
            var parts = splitLightDarkArgs(args);
            if (!parts) return whole;
            return (wantDark ? parts[1] : parts[0]).trim();
        });

        // 2. Pin color-scheme so the browser cannot re-invert forms/scrollbars/controls.
        out = out.replace(/color-scheme\s*:\s*[^;"']+/g, 'color-scheme: ' + (wantDark ? 'dark' : 'light'));

        return out;
    }

    // Plain colour maths for the app-wide theme check.
    function parseCssColor(c) {
        if (!c) return null;
        c = String(c).trim();
        var hex = c.match(/^#([0-9a-f]{3,8})$/i);
        if (hex) {
            var h = hex[1];
            if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
            return [parseInt(h.substr(0, 2), 16), parseInt(h.substr(2, 2), 16), parseInt(h.substr(4, 2), 16)];
        }
        var rgb = c.match(/^rgba?\(([^)]+)\)$/i);
        if (rgb) {
            var p = rgb[1].split(/[,\s/]+/).filter(Boolean).map(parseFloat);
            return [p[0] || 0, p[1] || 0, p[2] || 0];
        }
        return null;
    }

    function relativeLuminance(rgb) {
        var a = rgb.map(function(v) {
            v /= 255;
            return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
        });
        return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2];
    }

    function contrastRatio(fg, bg) {
        var l1 = relativeLuminance(fg);
        var l2 = relativeLuminance(bg);
        return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
    }

    // HTML escape helper
    function escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    // ==========================================
    // 0a. IN-APP DIALOGS
    // Electron disables window.prompt() (silently returning / throwing
    // "Uncaught Error: prompt() is not supported."), and confirm() blocks the
    // whole renderer. Everything here is DOM-based so it works in the packaged app.
    // ==========================================
    function inAppDialog(opts) {
        // opts: { title, message, value, placeholder, confirmLabel, cancelLabel, danger, kind: 'prompt'|'confirm' }
        return new Promise(function(resolve) {
            var dark = isDarkMode();
            var kind = opts.kind || 'prompt';
            var parent = document.fullscreenElement || document.body;

            var overlay = document.createElement('div');
            overlay.className = 'mermaid-inapp-dialog-overlay';
            overlay.style.cssText = 'position:fixed;inset:0;z-index:20000;display:flex;align-items:center;justify-content:center;' +
                'background:' + (dark ? 'rgba(2,6,23,0.72)' : 'rgba(15,23,42,0.45)') + ';backdrop-filter:blur(3px);';

            var panel = document.createElement('div');
            panel.style.cssText = 'width:min(420px,92vw);border-radius:14px;padding:20px 22px;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;' +
                'background:' + (dark ? '#18191c' : '#ffffff') + ';color:' + (dark ? '#f8fafc' : '#0f172a') + ';' +
                'border:1px solid ' + (dark ? '#33363d' : '#e2e8f0') + ';box-shadow:0 24px 60px -12px rgba(0,0,0,0.5);';

            var h = document.createElement('div');
            h.textContent = opts.title || (kind === 'prompt' ? 'Enter a value' : 'Confirm');
            h.style.cssText = 'font-size:15px;font-weight:650;margin-bottom:' + (opts.message ? '8px' : '16px') + ';';
            panel.appendChild(h);

            if (opts.message) {
                var msg = document.createElement('div');
                msg.textContent = opts.message;
                msg.style.cssText = 'font-size:12.5px;line-height:1.5;margin-bottom:16px;color:' + (dark ? '#94a3b8' : '#475569') + ';';
                panel.appendChild(msg);
            }

            var input = null;
            if (kind === 'prompt') {
                input = document.createElement('input');
                input.type = 'text';
                input.value = opts.value || '';
                input.placeholder = opts.placeholder || '';
                input.spellcheck = false;
                input.style.cssText = 'width:100%;box-sizing:border-box;padding:9px 11px;font-size:13px;border-radius:8px;outline:none;' +
                    'background:' + (dark ? '#0f1116' : '#ffffff') + ';color:inherit;border:1px solid ' + (dark ? '#44474e' : '#cbd5e1') + ';';
                panel.appendChild(input);
            }

            var row = document.createElement('div');
            row.style.cssText = 'display:flex;justify-content:flex-end;gap:8px;margin-top:18px;';

            function mkBtn(label, primary, danger) {
                var b = document.createElement('button');
                b.type = 'button';
                b.textContent = label;
                var bg = '#ffffff', fg = dark ? '#e2e8f0' : '#334155', bd = dark ? '#44474e' : '#cbd5e1';
                if (primary) {
                    bg = danger ? '#dc2626' : '#2563eb';
                    fg = '#ffffff';
                    bd = danger ? '#b91c1c' : '#1d4ed8';
                } else if (dark) {
                    bg = '#25262b';
                }
                b.style.cssText = 'padding:8px 15px;font-size:12.5px;font-weight:600;border-radius:8px;cursor:pointer;' +
                    'background:' + bg + ';color:' + fg + ';border:1px solid ' + bd + ';';
                return b;
            }

            var done = false;
            function close(val) {
                if (done) return;
                done = true;
                document.removeEventListener('keydown', onKey, true);
                if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
                resolve(val);
            }

            var cancel = mkBtn(opts.cancelLabel || 'Cancel', false, false);
            cancel.onclick = function() { close(kind === 'prompt' ? null : false); };
            row.appendChild(cancel);

            var ok = mkBtn(opts.confirmLabel || (kind === 'prompt' ? 'Create' : 'Delete'), true, !!opts.danger);
            ok.onclick = function() {
                if (kind === 'prompt') {
                    var v = (input.value || '').trim();
                    if (!v) { input.focus(); input.style.borderColor = '#ef4444'; return; }
                    close(v);
                } else {
                    close(true);
                }
            };
            row.appendChild(ok);
            panel.appendChild(row);

            function onKey(e) {
                // Stop the keys leaking into draw.io's canvas shortcuts
                e.stopPropagation();
                if (e.key === 'Escape') { e.preventDefault(); cancel.onclick(); }
                else if (e.key === 'Enter' && kind === 'prompt') { e.preventDefault(); ok.onclick(); }
            }
            document.addEventListener('keydown', onKey, true);

            overlay.addEventListener('mousedown', function(e) {
                if (e.target === overlay) cancel.onclick();
            });

            overlay.appendChild(panel);
            parent.appendChild(overlay);
            setTimeout(function() {
                if (input) { input.focus(); input.select(); }
                else ok.focus();
            }, 0);
        });
    }

    function appPrompt(title, value, message) {
        return inAppDialog({ kind: 'prompt', title: title, value: value || '', message: message });
    }

    function appConfirm(title, message, danger) {
        return inAppDialog({ kind: 'confirm', title: title, message: message, danger: danger !== false });
    }

    // Relative timestamp helper
    function timeAgo(ts) {
        if (!ts) return 'Just now';
        var diff = Math.max(0, Math.floor((Date.now() - ts) / 1000));
        if (diff < 60) return 'Just now';
        if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
        if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
        if (diff < 604800) return Math.floor(diff / 86400) + 'd ago';
        return new Date(ts).toLocaleDateString();
    }

    // ==========================================
    // 0. INJECT NATIVE COMPONENT STYLES
    // ==========================================
    function injectCustomStyles() {
        if (document.getElementById('mermaid-studio-injected-styles')) return;
        var styleEl = document.createElement('style');
        styleEl.id = 'mermaid-studio-injected-styles';
        styleEl.textContent = [
            '/* Native toolbar buttons */',
            '.mermaid-tb-btn {',
            '    background: #ffffff;',
            '    color: #1e293b;',
            '    border: 1px solid #cbd5e1;',
            '    border-radius: 5px;',
            '    height: 26px;',
            '    padding: 0 10px;',
            '    font-size: 12px;',
            '    font-weight: 500;',
            '    font-family: inherit;',
            '    cursor: pointer;',
            '    display: inline-flex;',
            '    align-items: center;',
            '    gap: 5px;',
            '    box-shadow: 0 1px 2px rgba(0,0,0,0.04);',
            '    transition: all 0.15s ease;',
            '    user-select: none;',
            '    white-space: nowrap;',
            '}',
            '.mermaid-tb-btn:hover {',
            '    background: #f1f5f9;',
            '    border-color: #94a3b8;',
            '}',
            '.mermaid-tb-btn.primary {',
            '    background: #eff6ff;',
            '    color: #1d4ed8;',
            '    border: 1px solid #93c5fd;',
            '    font-weight: 600;',
            '}',
            '.mermaid-tb-btn.primary:hover {',
            '    background: #dbeafe;',
            '    border-color: #60a5fa;',
            '}',
            '.geDarkMode .mermaid-tb-btn, [data-theme="dark"] .mermaid-tb-btn {',
            '    background: #2a2b2e;',
            '    color: #e2e8f0;',
            '    border: 1px solid #44474e;',
            '    box-shadow: 0 1px 2px rgba(0,0,0,0.25);',
            '}',
            '.geDarkMode .mermaid-tb-btn:hover, [data-theme="dark"] .mermaid-tb-btn:hover {',
            '    background: #35373c;',
            '    border-color: #64748b;',
            '}',
            '.geDarkMode .mermaid-tb-btn.primary, [data-theme="dark"] .mermaid-tb-btn.primary {',
            '    background: #1e293b;',
            '    color: #60a5fa;',
            '    border: 1px solid #3b82f6;',
            '}',
            '.geDarkMode .mermaid-tb-btn.primary:hover, [data-theme="dark"] .mermaid-tb-btn.primary:hover {',
            '    background: #2563eb;',
            '    color: #ffffff;',
            '}',
            '/* Side panel collapsers */',
            '#left-panel-collapse-btn {',
            '    position: fixed;',
            '    z-index: 950;',
            '    width: 22px;',
            '    height: 44px;',
            '    border-radius: 0 6px 6px 0;',
            '    background: #ffffff;',
            '    border: 1px solid #cbd5e1;',
            '    border-left: none;',
            '    color: #475569;',
            '    font-size: 14px;',
            '    font-weight: bold;',
            '    cursor: pointer;',
            '    display: flex;',
            '    align-items: center;',
            '    justify-content: center;',
            '    box-shadow: 2px 0 6px rgba(0,0,0,0.06);',
            '    transition: left 0.2s ease, background 0.15s ease, color 0.15s ease;',
            '    user-select: none;',
            '    top: 105px;',
            '}',
            '#left-panel-collapse-btn:hover {',
            '    background: #f8fafc;',
            '    color: #1e293b;',
            '    box-shadow: 3px 0 8px rgba(0,0,0,0.1);',
            '}',
            '.geDarkMode #left-panel-collapse-btn, [data-theme="dark"] #left-panel-collapse-btn {',
            '    background: #232529;',
            '    border-color: #44474e;',
            '    color: #cbd5e1;',
            '    box-shadow: 2px 0 6px rgba(0,0,0,0.35);',
            '}',
            '.geDarkMode #left-panel-collapse-btn:hover, [data-theme="dark"] #left-panel-collapse-btn:hover {',
            '    background: #2e3035;',
            '    color: #ffffff;',
            '}',
            '#right-panel-collapse-btn {',
            '    position: fixed;',
            '    z-index: 950;',
            '    width: 22px;',
            '    height: 44px;',
            '    border-radius: 6px 0 0 6px;',
            '    background: #ffffff;',
            '    border: 1px solid #cbd5e1;',
            '    border-right: none;',
            '    color: #475569;',
            '    font-size: 14px;',
            '    font-weight: bold;',
            '    cursor: pointer;',
            '    display: flex;',
            '    align-items: center;',
            '    justify-content: center;',
            '    box-shadow: -2px 0 6px rgba(0,0,0,0.06);',
            '    transition: right 0.2s ease, background 0.15s ease, color 0.15s ease;',
            '    user-select: none;',
            '    top: 105px;',
            '}',
            '#right-panel-collapse-btn:hover {',
            '    background: #f8fafc;',
            '    color: #1e293b;',
            '    box-shadow: -3px 0 8px rgba(0,0,0,0.1);',
            '}',
            '.geDarkMode #right-panel-collapse-btn, [data-theme="dark"] #right-panel-collapse-btn {',
            '    background: #232529;',
            '    border-color: #44474e;',
            '    color: #cbd5e1;',
            '    box-shadow: -2px 0 6px rgba(0,0,0,0.35);',
            '}',
            '.geDarkMode #right-panel-collapse-btn:hover, [data-theme="dark"] #right-panel-collapse-btn:hover {',
            '    background: #2e3035;',
            '    color: #ffffff;',
            '}',
            '/* Hub components */',
            '.hub-card {',
            '    background: #ffffff;',
            '    border: 1px solid #e2e8f0;',
            '    border-radius: 12px;',
            '    overflow: hidden;',
            '    box-shadow: 0 1px 3px rgba(0,0,0,0.05);',
            '    transition: transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease;',
            '    display: flex;',
            '    flex-direction: column;',
            '}',
            '.hub-card:hover {',
            '    transform: translateY(-2px);',
            '    box-shadow: 0 6px 16px rgba(0,0,0,0.08);',
            '    border-color: #cbd5e1;',
            '}',
            '.geDarkMode .hub-card, [data-theme="dark"] .hub-card {',
            '    background: #18191c;',
            '    border-color: #33363d;',
            '    box-shadow: 0 1px 3px rgba(0,0,0,0.3);',
            '}',
            '.geDarkMode .hub-card:hover, [data-theme="dark"] .hub-card:hover {',
            '    box-shadow: 0 6px 20px rgba(0,0,0,0.5);',
            '    border-color: #44474e;',
            '}',
            '.hub-btn {',
            '    display: inline-flex;',
            '    align-items: center;',
            '    gap: 6px;',
            '    padding: 6px 12px;',
            '    font-size: 12px;',
            '    font-weight: 500;',
            '    border-radius: 6px;',
            '    cursor: pointer;',
            '    border: 1px solid #cbd5e1;',
            '    background: #ffffff;',
            '    color: #1e293b;',
            '    transition: all 0.15s ease;',
            '}',
            '.hub-btn:hover {',
            '    background: #f1f5f9;',
            '    border-color: #94a3b8;',
            '}',
            '.hub-btn.primary {',
            '    background: #2563eb;',
            '    color: #ffffff;',
            '    border: 1px solid #1d4ed8;',
            '    font-weight: 600;',
            '}',
            '.hub-btn.primary:hover {',
            '    background: #1d4ed8;',
            '}',
            '.geDarkMode .hub-btn, [data-theme="dark"] .hub-btn {',
            '    background: #25262b;',
            '    color: #e2e8f0;',
            '    border-color: #44474e;',
            '}',
            '.geDarkMode .hub-btn:hover, [data-theme="dark"] .hub-btn:hover {',
            '    background: #313338;',
            '}',
            '.geDarkMode .hub-btn.primary, [data-theme="dark"] .hub-btn.primary {',
            '    background: #3b82f6;',
            '    color: #ffffff;',
            '    border-color: #2563eb;',
            '}',
            '.geDarkMode .hub-btn.primary:hover, [data-theme="dark"] .hub-btn.primary:hover {',
            '    background: #2563eb;',
            '}',
            '.hub-nav-item {',
            '    display: flex;',
            '    align-items: center;',
            '    justify-content: space-between;',
            '    padding: 8px 12px;',
            '    border-radius: 6px;',
            '    font-size: 13px;',
            '    font-weight: 500;',
            '    color: #475569;',
            '    cursor: pointer;',
            '    margin-bottom: 2px;',
            '    transition: background 0.15s, color 0.15s;',
            '    user-select: none;',
            '}',
            '.hub-nav-item:hover {',
            '    background: #f1f5f9;',
            '    color: #0f172a;',
            '}',
            '.hub-nav-item.active {',
            '    background: #eff6ff;',
            '    color: #1d4ed8;',
            '    font-weight: 600;',
            '}',
            '.geDarkMode .hub-nav-item, [data-theme="dark"] .hub-nav-item {',
            '    color: #94a3b8;',
            '}',
            '.geDarkMode .hub-nav-item:hover, [data-theme="dark"] .hub-nav-item:hover {',
            '    background: #23252a;',
            '    color: #f8fafc;',
            '}',
            '.geDarkMode .hub-nav-item.active, [data-theme="dark"] .hub-nav-item.active {',
            '    background: #1e293b;',
            '    color: #60a5fa;',
            '}'
        ].join('\n');
        document.head.appendChild(styleEl);
    }

    function initMermaidStudioPlugin(ui) {
        // Requirement 1: Idempotent initialization check
        if (window.__mermaidStudioPluginInitialized) return;
        if (!ui || !ui.editor || !ui.editor.graph) return;
        window.__mermaidStudioPluginInitialized = true;

        var graph = ui.editor.graph;
        injectCustomStyles();

        // Register translations / resources
        try {
            mxResources.parse('visualMermaid=Visual Mermaid Editor (Two-Way)...');
            mxResources.parse('syncFromMermaid=Sync from Visual Editor');
            mxResources.parse('openVisualMermaid=Open in Visual Drag & Drop');
            mxResources.parse('universalStudio=Universal Code-to-Diagram Studio (Ctrl+Shift+M)...');
            mxResources.parse('diagramsHub=Visual Diagrams & Folders Hub (Ctrl+Shift+D)...');
        } catch (e) {}

        var visualEditorWindow = null;
        var editorIframe = null;
        var activeTargetCell = null;

        // Current Studio State
        var currentRenderedSvg = '';
        var currentRenderedXml = '';
        var currentDetectedType = { id: 'empty', label: 'Waiting for Code...' };
        var studioModal = null;
        var previewInner = null;
        var previewContainer = null;
        var codeEditor = null;
        var autoDetectBadge = null;
        var statusBar = null;
        var quickFixBtn = null;
        var zoomLevel = 1.0;
        var panOffsetX = 0;
        var panOffsetY = 0;
        var bgMode = 0; // 0: crisp light canvas (default), 1: dark canvas, 2: plain white
        var renderDebounceTimer = null;
        var isLeftPaneCollapsed = false;
        var studioLeftPane = null;
        var studioBoxEl = null;
        var lastResizedEditorWidth = 440;

        // Hub State
        var hubModal = null;
        var hubCurrentFolder = 'all';
        var hubIsFavorites = false;
        var hubSearchQuery = '';
        var hubSortMode = 'updated';
        var hubViewMode = 'grid'; // 'grid' | 'list'

        // ==========================================
        // 1. AST & SYNTAX AUTO-FIXER ENGINE
        // ==========================================
        // Each repairRule runs only where it is safe for the detected diagram family.
        // Repairs report what they changed so the UI can explain the result instead of
        // silently rewriting the user's code.
        var MERMAID_FAMILIES = {
            flowchart: '^(flowchart|graph)\\b',
            sequence: '^sequenceDiagram\\b',
            classDiagram: '^classDiagram(-v2)?\\b',
            state: '^stateDiagram(-v2)?\\b',
            er: '^erDiagram\\b',
            gantt: '^gantt\\b',
            pie: '^pie\\b',
            mindmap: '^mindmap\\b',
            timeline: '^timeline\\b',
            git: '^gitGraph\\b',
            quadrant: '^quadrantChart\\b',
            xychart: '^xychart(-beta)?\\b',
            sankey: '^sankey(-beta)?\\b',
            journey: '^(journey|userJourney)\\b',
            c4: '^(C4Context|C4Container|C4Component|C4Dynamic|C4Deployment)\\b',
            block: '^block-beta\\b',
            architecture: '^architecture-beta\\b',
            packet: '^packet(-beta)?\\b',
            radar: '^(radar|spider)\\b'
        };

        function mermaidFamily(code) {
            var head = (code || '').trim();
            for (var key in MERMAID_FAMILIES) {
                if (new RegExp(MERMAID_FAMILIES[key], 'm').test(head)) return key;
            }
            return 'flowchart'; // bare edge lists are treated as flowcharts
        }

        // Smart quotes, non-breaking spaces and full-width punctuation pasted from docs.
        function repairUnicode(code) {
            var before = code;
            code = code.replace(/[\u201C\u201D\u2033]/g, '"')
                       .replace(/[\u2018\u2019\u2032]/g, "'")
                       .replace(/\u00A0/g, ' ')
                       // en-dash runs stand in for Mermaid's -- / --- operators
                       .replace(/\u2014/g, '---')
                       .replace(/\u2013\u2013\u2013/g, '---')
                       .replace(/\u2013\u2013/g, '--')
                       .replace(/\u2013(?=\s*>)/g, '--');
            return { code: code, changed: code !== before };
        }

        // Arrows typed with stray spaces or a single dash: A -> B, A -- > B, A -. > B
        function repairArrows(code) {
            var before = code;
            code = code.replace(/--\s+>/g, '-->')
                       .replace(/-\.\s+>/g, '-.->')
                       .replace(/==\s+>/g, '==>')
                       .replace(/(^|[^-<>=|.])->(?![->])/g, '$1-->')
                       .replace(/(^|[^-<>=|.])--\s+([|]|[A-Za-z0-9])/g, '$1-- $2');
            return { code: code, changed: code !== before };
        }

        // Labels containing (), :, ; or commas break the unquoted [] parser.
        function repairUnquotedLabels(code) {
            var before = code;
            code = code.replace(/([A-Za-z0-9_.-]+)\s*\[(?!\[)([^\]"\n]*[():\u002c][^\]"\n]*)\]/g, function(match, id, label) {
                if (/^\s*$/.test(label)) return match;
                return id + '["' + label.trim().replace(/"/g, '&quot;') + '"]';
            });
            return { code: code, changed: code !== before };
        }

        // Brackets opened but never closed (e.g. `A[Start --> B`).
        // Only the last unclosed label segment on a line is repaired, and only when
        // it would otherwise run to end-of-line.
        function repairUnclosedBrackets(code) {
            var before = code;
            code = code.split('\n').map(function(line) {
                var trimmed = line.trim();
                if (!trimmed || /^%%/.test(trimmed)) return line;
                if ((line.match(/\[/g) || []).length <= (line.match(/\]/g) || []).length) return line;
                var open = line.lastIndexOf('[');
                var tail = line.slice(open + 1);
                // Stop at a node-type opener or a link that follows the unterminated label.
                var cut = tail.search(/(-->|---|==>|-\.->|--\s|\[)/);
                var label = (cut >= 0 ? tail.slice(0, cut) : tail).trim();
                // A label holding another bracket is a structural error, not a missing ].
                if (!label || /[\[\]"]/.test(label)) return line;
                var rest = cut >= 0 ? tail.slice(cut) : '';
                return line.slice(0, open) + '["' + label + '"]' + rest;
            }).join('\n');
            return { code: code, changed: code !== before };
        }

        // flowchart: count subgraph/end tokens outside quoted strings and comments.
        function countTokens(code, token) {
            var n = 0;
            code.split('\n').forEach(function(line) {
                if (/^\s*%%/.test(line)) return;
                var stripped = line.replace(/"[^"]*"/g, '""').replace(/'[^']*'/g, "''");
                var re = new RegExp('(^|\\s)' + token + '(\\s|$)', 'g');
                while (re.exec(stripped)) n++;
            });
            return n;
        }

        function repairSubgraphs(code) {
            if (mermaidFamily(code) !== 'flowchart') return { code: code, changed: false };
            var opens = countTokens(code, 'subgraph');
            var ends = countTokens(code, 'end');
            if (opens <= ends) return { code: code, changed: false };
            var out = code;
            for (var i = 0; i < opens - ends; i++) out += '\n    end';
            return { code: out, changed: true, note: 'closed ' + (opens - ends) + ' unclosed subgraph' + (opens - ends > 1 ? 's' : '') };
        }

        // Unbalanced principle: odd number of double quotes on a line.
        function repairUnbalancedQuotes(code) {
            var before = code;
            var lines = code.split('\n');
            var fixed = 0;
            for (var i = 0; i < lines.length; i++) {
                var line = lines[i];
                if (/^\s*%%/.test(line)) continue;
                var q = (line.match(/"/g) || []).length;
                if (q % 2 === 1) { lines[i] = line + '"'; fixed++; }
            }
            return { code: lines.join('\n'), changed: fixed > 0, note: fixed ? 'balanced ' + fixed + ' unterminated quote' + (fixed > 1 ? 's' : '') : '' };
        }

        // A diagram header other than `graph`: ensure the family keyword is on its own line.
        function repairHeaderSpacing(code) {
            var before = code;
            code = code.replace(/^(flowchart|graph)\s*(TD|TB|BT|LR|RL)\b/i, function(m, kind, dir) {
                return kind.toLowerCase() + ' ' + dir.toUpperCase();
            });
            return { code: code, changed: code !== before };
        }

        function repairCaseKeywords(code) {
            var before = code;
            code = code.replace(/^flowchart\b/i, 'flowchart').replace(/^graph\b/i, 'graph');
            return { code: code, changed: code !== before };
        }

        // Unquoted edge labels containing spaces: A -- Hello World --> B
        function repairEdgeLabels(code) {
            if (mermaidFamily(code) !== 'flowchart') return { code: code, changed: false };
            var before = code;
            code = code.replace(/\s--\s+([A-Za-z0-9][^|\n"<>-]*?\s+[^|\n"<>-]*?)\s+-->/g, function(m, label) {
                return ' -- "' + label.trim() + '" -->';
            });
            return { code: code, changed: code !== before };
        }

        // Ordered, idempotent pipeline. Each pass only touches what it can prove is wrong.
        function autoFixSyntaxDetailed(rawCode) {
            var original = rawCode == null ? '' : String(rawCode);
            var notes = [];

            var code = original;
            // Strip a fenced block if the whole payload is fenced.
            var fence = code.match(/^\s*```[a-zA-Z0-9_-]*\s*\n([\s\S]*?)\n?\s*```\s*$/);
            if (fence) {
                code = fence[1];
                notes.push('removed markdown code fence');
            }
            code = code.replace(/^\s*```[a-zA-Z0-9_-]*\s*\n?/gm, '').replace(/\n?\s*```\s*$/gm, '');

            var steps = [
                ['normalised quotes and dashes', repairUnicode],
                ['fixed malformed arrows', repairArrows],
                ['quoted labels containing punctuation', repairUnquotedLabels],
                ['closed unclosed brackets', repairUnclosedBrackets],
                ['closed unclosed subgraph', repairSubgraphs],
                ['balanced quotes', repairUnbalancedQuotes],
                ['fixed header spacing', repairHeaderSpacing],
                ['fixed keyword case', repairCaseKeywords],
                ['quoted edge labels', repairEdgeLabels]
            ];

            var family = mermaidFamily(code);
            steps.forEach(function(step) {
                var res = step[1](code);
                if (res && res.changed) {
                    code = res.code;
                    notes.push(res.note ? step[1].name + ': ' + res.note : step[0]);
                }
            });

            // Bare statements with edges but no header need an implicit flowchart header.
            var trimmed = code.trim();
            if (family === 'flowchart' && !/^(flowchart|graph)\b/.test(trimmed) &&
                /-->|==>|-\.->|---/.test(trimmed)) {
                code = 'flowchart TD\n' + trimmed;
                notes.push('added "flowchart TD" header');
                trimmed = code.trim();
            }

            var result = code.trim();
            return {
                code: result,
                changed: result !== original.trim(),
                notes: notes,
                family: family
            };
        }

        // Backwards-compatible shim used by the Studio buttons.
        function autoFixSyntax(rawCode) {
            return autoFixSyntaxDetailed(rawCode).code;
        }

        // Run the fixer on the Studio editor and report the repairs that were applied.
        function applyAutoFixAndReport() {
            if (!codeEditor) return;
            var res = autoFixSyntaxDetailed(codeEditor.value);
            if (!res.changed) {
                setStatus(true, 'No syntax problems found — nothing to fix');
                return;
            }
            codeEditor.value = res.code;
            var summary = res.notes.length ? res.notes.join('; ') : 'applied syntax repairs';
            setStatus(true, 'Auto-fixed: ' + summary);
            renderCurrentCode();
        }

        // ==========================================
        // 2. UNIVERSAL AUTO-DETECTION ENGINE
        // ==========================================
        function detectDiagramType(code) {
            var trimmed = (code || '').trim();
            if (!trimmed) return { id: 'empty', label: 'Waiting for Code...' };

            if (/^@start/i.test(trimmed)) {
                return { id: 'plantuml', label: 'PlantUML Diagram' };
            }

            if (/^(radar|spider)\b/i.test(trimmed) || (trimmed.includes('axes ') && trimmed.includes('series '))) {
                return { id: 'radar', label: 'Spider / Radar Chart' };
            }
            if (trimmed.startsWith('{') && (trimmed.includes('"axes"') || trimmed.includes('"radar"'))) {
                return { id: 'radar', label: 'Spider / Radar Chart (JSON)' };
            }

            if (/^infographic\b/i.test(trimmed) || (trimmed.includes('kpi ') && trimmed.includes('step '))) {
                return { id: 'infographic', label: 'Infographic KPI & Flow Funnel' };
            }
            if (trimmed.startsWith('{') && (trimmed.includes('"kpis"') || trimmed.includes('"steps"'))) {
                return { id: 'infographic', label: 'Infographic (JSON)' };
            }

            if (/^(flowchart|graph)\b/m.test(trimmed)) {
                return { id: 'mermaid-flowchart', label: 'Mermaid Flowchart' };
            }
            if (/^sequenceDiagram\b/m.test(trimmed)) {
                return { id: 'mermaid-sequence', label: 'Mermaid Sequence Diagram' };
            }
            if (/^mindmap\b/m.test(trimmed)) {
                return { id: 'mermaid-mindmap', label: 'Mermaid Mindmap' };
            }
            if (/^architecture-beta\b/m.test(trimmed)) {
                return { id: 'mermaid-architecture', label: 'Mermaid Cloud Architecture' };
            }
            if (/^erDiagram\b/m.test(trimmed)) {
                return { id: 'mermaid-er', label: 'Mermaid ER Diagram' };
            }
            if (/^stateDiagram(-v2)?\b/m.test(trimmed)) {
                return { id: 'mermaid-state', label: 'Mermaid State Machine' };
            }
            if (/^classDiagram(-v2)?\b/m.test(trimmed)) {
                return { id: 'mermaid-class', label: 'Mermaid Class Diagram' };
            }
            if (/^timeline\b/m.test(trimmed)) {
                return { id: 'mermaid-timeline', label: 'Mermaid Timeline' };
            }
            if (/^gantt\b/m.test(trimmed)) {
                return { id: 'mermaid-gantt', label: 'Mermaid Gantt' };
            }
            if (/^xychart-beta\b/m.test(trimmed)) {
                return { id: 'mermaid-xychart', label: 'Mermaid XY Bar/Line Chart' };
            }
            if (/^sankey-beta\b/m.test(trimmed)) {
                return { id: 'mermaid-sankey', label: 'Mermaid Sankey Diagram' };
            }
            if (/^pie\b/m.test(trimmed)) {
                return { id: 'mermaid-pie', label: 'Mermaid Pie Chart' };
            }
            if (/^quadrantChart\b/m.test(trimmed)) {
                return { id: 'mermaid-quadrant', label: 'Mermaid Quadrant Chart' };
            }
            if (/^gitGraph\b/m.test(trimmed)) {
                return { id: 'mermaid-git', label: 'Mermaid Git Graph' };
            }

            // Markdown outline
            if (/^(#{1,6}\s+|- |\* |\d+\.\s+)/m.test(trimmed)) {
                return { id: 'markdown-outline', label: 'Markdown Outline ➔ Mindmap' };
            }

            // Implicit flowchart
            if (/-->|==>|-\.->|--\s*\|/.test(trimmed)) {
                return { id: 'mermaid-flowchart', label: 'Mermaid Flowchart (Implicit)' };
            }

            return { id: 'mermaid-flowchart', label: 'Mermaid Diagram' };
        }

        // ==========================================
        // 3. MARKDOWN OUTLINE ➔ MINDMAP CONVERTER
        // ==========================================
        function markdownToMindmap(md) {
            var lines = md.split('\n');
            var root = '';
            var nodes = [];

            for (var idx = 0; idx < lines.length; idx++) {
                var rawLine = lines[idx];
                var line = rawLine.trimEnd();
                if (!line.trim()) continue;

                var level = 1;
                var text = '';

                if (/^#{1,6}\s+/.test(line)) {
                    var matchHeading = line.match(/^(#{1,6})\s+(.*)$/);
                    level = matchHeading[1].length;
                    text = matchHeading[2].trim();
                } else if (/^(\s*)[-*+]\s+/.test(rawLine)) {
                    var matchBullet = rawLine.match(/^(\s*)[-*+]\s+(.*)$/);
                    level = Math.floor(matchBullet[1].length / 2) + 2;
                    text = matchBullet[2].trim();
                } else if (/^(\s*)\d+\.\s+/.test(rawLine)) {
                    var matchNum = rawLine.match(/^(\s*)\d+\.\s+(.*)$/);
                    level = Math.floor(matchNum[1].length / 2) + 2;
                    text = matchNum[2].trim();
                } else {
                    text = line.trim();
                }

                text = text.replace(/["`]/g, '').trim();
                if (!text) continue;

                if (!root) {
                    root = text;
                } else {
                    nodes.push({ level: Math.max(1, level - 1), text: text });
                }
            }

            if (!root) root = "Concept Root";

            var out = 'mindmap\n  root(("' + root + '"))\n';
            for (var nIdx = 0; nIdx < nodes.length; nIdx++) {
                var node = nodes[nIdx];
                var ind = '';
                for (var s = 0; s < node.level + 1; s++) ind += '  ';
                out += ind + node.text + '\n';
            }
            return out.trim();
        }

        // ==========================================
        // 4. RADAR & SPIDER SVG ENGINE
        // ==========================================
        function renderRadarSvg(code, isDark) {
            var dark = (isDark != null) ? isDark : false;
            var title = "System Architecture Evaluation";
            var axes = [];
            var seriesList = [];
            var colors = ['#3b82f6', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#06b6d4'];

            if (code.trim().startsWith('{')) {
                try {
                    var data = JSON.parse(code);
                    title = data.title || title;
                    axes = data.axes || [];
                    seriesList = (data.series || []).map(function(s, idx) {
                        return {
                            name: s.name || ('Series ' + (idx + 1)),
                            values: s.values || [],
                            color: s.color || colors[idx % colors.length]
                        };
                    });
                } catch (e) {}
            } else {
                var lines = code.split('\n');
                for (var i = 0; i < lines.length; i++) {
                    var line = lines[i].trim();
                    if (line.toLowerCase().startsWith('title ')) {
                        title = line.substring(6).trim();
                    } else if (line.toLowerCase().startsWith('axes ')) {
                        axes = line.substring(5).split(',').map(function(s) { return s.trim(); }).filter(Boolean);
                    } else if (line.toLowerCase().startsWith('series ')) {
                        var match = line.match(/^series\s+["']?([^"':]+)["']?\s*:\s*(.+)$/i);
                        if (match) {
                            var sName = match[1].trim();
                            var sVals = match[2].split(',').map(function(v) { return parseFloat(v.trim()) || 0; });
                            seriesList.push({
                                name: sName,
                                values: sVals,
                                color: colors[seriesList.length % colors.length]
                            });
                        }
                    }
                }
            }

            if (axes.length < 3) axes = ['Performance', 'Security', 'Scalability', 'Usability', 'Maintainability', 'Cost Efficiency'];
            if (seriesList.length === 0) {
                seriesList = [
                    { name: 'Current Stack', values: [72, 68, 75, 80, 65, 70], color: '#3b82f6' },
                    { name: 'Target Stack', values: [94, 92, 96, 88, 90, 85], color: '#10b981' }
                ];
            }

            var width = 760;
            var height = 580;
            var cx = 380;
            var cy = 280;
            var maxR = 185;
            var N = axes.length;

            var bg = dark ? '#0f172a' : '#ffffff';
            var ringStroke = dark ? '#334155' : '#cbd5e1';
            var axisStroke = dark ? '#475569' : '#94a3b8';
            var titleFill = dark ? '#f8fafc' : '#0f172a';
            var labelFill = dark ? '#e2e8f0' : '#1e293b';
            var legFill = dark ? '#cbd5e1' : '#475569';

            var svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + width + ' ' + height + '" width="' + width + '" height="' + height + '" style="background:' + bg + '; border-radius:12px; font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,sans-serif;">\n';
            svg += '  <defs>\n    <filter id="radar-glow" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="3" result="blur"/><feComposite in="SourceGraphic" in2="blur" operator="over"/></filter>\n  </defs>\n';
            svg += '  <text x="' + cx + '" y="38" font-size="20" font-weight="700" fill="' + titleFill + '" text-anchor="middle">' + escapeHtml(title) + '</text>\n';

            // Web rings at 20, 40, 60, 80, 100
            var rings = [0.2, 0.4, 0.6, 0.8, 1.0];
            for (var r = 0; r < rings.length; r++) {
                var rFactor = rings[r];
                var ringR = maxR * rFactor;
                var pts = [];
                for (var a = 0; a < N; a++) {
                    var angle = -Math.PI / 2 + (2 * Math.PI * a / N);
                    var x = cx + ringR * Math.cos(angle);
                    var y = cy + ringR * Math.sin(angle);
                    pts.push(x.toFixed(1) + ',' + y.toFixed(1));
                }
                svg += '  <polygon points="' + pts.join(' ') + '" fill="none" stroke="' + ringStroke + '" stroke-width="1.2" stroke-dasharray="' + (rFactor < 1 ? '3,3' : 'none') + '"/>\n';
                var labelY = cy - ringR;
                svg += '  <text x="' + (cx + 6) + '" y="' + (labelY + 12).toFixed(1) + '" font-size="10" fill="' + (dark ? '#64748b' : '#94a3b8') + '" font-weight="500">' + Math.round(rFactor * 100) + '%</text>\n';
            }

            // Radial axes & labels
            for (var ax = 0; ax < N; ax++) {
                var aAngle = -Math.PI / 2 + (2 * Math.PI * ax / N);
                var cos = Math.cos(aAngle);
                var sin = Math.sin(aAngle);
                var axX = cx + maxR * cos;
                var axY = cy + maxR * sin;
                svg += '  <line x1="' + cx + '" y1="' + cy + '" x2="' + axX.toFixed(1) + '" y2="' + axY.toFixed(1) + '" stroke="' + axisStroke + '" stroke-width="1.2"/>\n';

                var lblR = maxR + 26;
                var lblX = cx + lblR * cos;
                var lblY = cy + lblR * sin + 4;
                var anchor = Math.abs(cos) < 0.25 ? 'middle' : (cos > 0 ? 'start' : 'end');
                svg += '  <text x="' + lblX.toFixed(1) + '" y="' + lblY.toFixed(1) + '" font-size="12" font-weight="600" fill="' + labelFill + '" text-anchor="' + anchor + '">' + escapeHtml(axes[ax]) + '</text>\n';
            }

            // Series polygons
            for (var s = 0; s < seriesList.length; s++) {
                var curSeries = seriesList[s];
                var sPts = [];
                var dots = [];
                for (var p = 0; p < N; p++) {
                    var val = Math.max(0, Math.min(100, curSeries.values[p] != null ? curSeries.values[p] : 50));
                    var pR = maxR * (val / 100);
                    var pAngle = -Math.PI / 2 + (2 * Math.PI * p / N);
                    var px = cx + pR * Math.cos(pAngle);
                    var py = cy + pR * Math.sin(pAngle);
                    sPts.push(px.toFixed(1) + ',' + py.toFixed(1));
                    dots.push({ x: px, y: py, val: val });
                }
                svg += '  <polygon points="' + sPts.join(' ') + '" fill="' + curSeries.color + '" fill-opacity="0.30" stroke="' + curSeries.color + '" stroke-width="2.5" filter="url(#radar-glow)"/>\n';
                for (var d = 0; d < dots.length; d++) {
                    var dot = dots[d];
                    svg += '  <circle cx="' + dot.x.toFixed(1) + '" cy="' + dot.y.toFixed(1) + '" r="4" fill="' + curSeries.color + '" stroke="#ffffff" stroke-width="1.5"/>\n';
                    svg += '  <text x="' + dot.x.toFixed(1) + '" y="' + (dot.y - 7).toFixed(1) + '" font-size="10" font-weight="700" fill="' + curSeries.color + '" text-anchor="middle">' + dot.val + '</text>\n';
                }
            }

            // Legend at bottom
            var legY = height - 28;
            var itemW = 150;
            var totalLegW = seriesList.length * itemW;
            var startX = cx - (totalLegW / 2);
            for (var l = 0; l < seriesList.length; l++) {
                var itemX = startX + l * itemW;
                svg += '  <rect x="' + itemX + '" y="' + (legY - 10) + '" width="14" height="14" rx="3" fill="' + seriesList[l].color + '"/>\n';
                svg += '  <text x="' + (itemX + 20) + '" y="' + (legY + 2) + '" font-size="12" font-weight="500" fill="' + legFill + '">' + escapeHtml(seriesList[l].name) + '</text>\n';
            }

            svg += '</svg>';
            return svg;
        }

        // ==========================================
        // 5. INFOGRAPHIC & FLOW FUNNEL SVG ENGINE
        // ==========================================
        function renderInfographicSvg(code, isDark) {
            var dark = (isDark != null) ? isDark : false;
            var title = "Product Engineering & Delivery Funnel";
            var subtitle = "Q4 Performance Metrics and Conversion Pipeline";
            var kpis = [];
            var steps = [];

            if (code.trim().startsWith('{')) {
                try {
                    var data = JSON.parse(code);
                    title = data.title || title;
                    subtitle = data.subtitle || subtitle;
                    kpis = data.kpis || [];
                    steps = data.steps || [];
                } catch (e) {}
            } else {
                var lines = code.split('\n');
                for (var i = 0; i < lines.length; i++) {
                    var line = lines[i].trim();
                    if (line.toLowerCase().startsWith('title ')) {
                        title = line.substring(6).trim();
                    } else if (line.toLowerCase().startsWith('subtitle ')) {
                        subtitle = line.substring(9).trim();
                    } else if (line.toLowerCase().startsWith('kpi ')) {
                        var parts = line.substring(4).split('|').map(function(s) { return s.trim().replace(/^["']|["']$/g, ''); });
                        if (parts.length >= 2) {
                            kpis.push({
                                label: parts[0],
                                value: parts[1],
                                delta: parts[2] || '',
                                color: parts[3] || '#3b82f6'
                            });
                        }
                    } else if (line.toLowerCase().startsWith('step ')) {
                        var stepParts = line.substring(5).split('|').map(function(s) { return s.trim().replace(/^["']|["']$/g, ''); });
                        if (stepParts.length >= 2) {
                            steps.push({
                                title: stepParts[0],
                                desc: stepParts[1],
                                color: stepParts[2] || '#10b981'
                            });
                        }
                    }
                }
            }

            if (kpis.length === 0) {
                kpis = [
                    { label: 'System Uptime', value: '99.98%', delta: '+0.12% vs Q3', color: '#10b981' },
                    { label: 'API Latency', value: '42ms', delta: '-15ms faster', color: '#3b82f6' },
                    { label: 'Active Users', value: '248.5K', delta: '+18.4% MoM', color: '#8b5cf6' },
                    { label: 'Error Budget', value: '82.4%', delta: 'Healthy', color: '#06b6d4' }
                ];
            }

            if (steps.length === 0) {
                steps = [
                    { title: '1. Code Commit', desc: '1,420 PRs merged across 14 services', color: '#3b82f6' },
                    { title: '2. CI Automation', desc: '98.4% automated unit & integration pass rate', color: '#6366f1' },
                    { title: '3. Staging Canary', desc: '10% traffic canary validation for 30 mins', color: '#8b5cf6' },
                    { title: '4. Zero-Downtime Prod', desc: 'Global rolling deployment across 5 regions', color: '#10b981' }
                ];
            }

            var width = 860;
            var height = 550;

            var bg = dark ? '#0f172a' : '#ffffff';
            var border = dark ? '#334155' : '#e2e8f0';
            var cardBg = dark ? '#1e293b' : '#f8fafc';
            var cardBorder = dark ? '#334155' : '#e2e8f0';
            var textPrimary = dark ? '#f8fafc' : '#0f172a';
            var textSecondary = dark ? '#94a3b8' : '#64748b';

            var svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + width + ' ' + height + '" width="' + width + '" height="' + height + '" style="background:' + bg + '; border-radius:16px; font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,sans-serif;">\n';
            svg += '  <rect width="' + width + '" height="' + height + '" rx="16" fill="' + bg + '" stroke="' + border + '" stroke-width="1.5"/>\n';

            // Header banner
            svg += '  <g transform="translate(36, 42)">\n';
            svg += '    <rect x="0" y="-18" width="8" height="42" rx="4" fill="#3b82f6"/>\n';
            svg += '    <text x="20" y="4" font-size="22" font-weight="700" fill="' + textPrimary + '">' + escapeHtml(title) + '</text>\n';
            svg += '    <text x="20" y="24" font-size="13" fill="' + textSecondary + '">' + escapeHtml(subtitle) + '</text>\n';
            svg += '  </g>\n';

            // KPI Grid Cards
            svg += '  <text x="36" y="118" font-size="12" font-weight="700" fill="' + (dark ? '#64748b' : '#94a3b8') + '" letter-spacing="0.08em">KEY PERFORMANCE INDICATORS</text>\n';
            var kpiCount = kpis.length;
            var kpiGap = 16;
            var totalKpiW = width - 72;
            var kpiW = (totalKpiW - (kpiCount - 1) * kpiGap) / kpiCount;
            var kpiH = 100;
            var kpiY = 132;

            for (var k = 0; k < kpiCount; k++) {
                var kx = 36 + k * (kpiW + kpiGap);
                var item = kpis[k];
                svg += '  <g transform="translate(' + kx + ', ' + kpiY + ')">\n';
                svg += '    <rect width="' + kpiW + '" height="' + kpiH + '" rx="12" fill="' + cardBg + '" stroke="' + cardBorder + '" stroke-width="1.2"/>\n';
                svg += '    <text x="16" y="28" font-size="11" font-weight="600" fill="' + textSecondary + '" letter-spacing="0.04em">' + escapeHtml(item.label.toUpperCase()) + '</text>\n';
                svg += '    <text x="16" y="60" font-size="24" font-weight="800" fill="' + textPrimary + '">' + escapeHtml(item.value) + '</text>\n';
                if (item.delta) {
                    svg += '    <rect x="16" y="72" width="105" height="20" rx="6" fill="' + item.color + '" fill-opacity="0.18" stroke="' + item.color + '" stroke-opacity="0.4"/>\n';
                    svg += '    <text x="22" y="86" font-size="10" font-weight="700" fill="' + item.color + '">' + escapeHtml(item.delta) + '</text>\n';
                }
                svg += '  </g>\n';
            }

            // Steps section
            svg += '  <text x="36" y="280" font-size="12" font-weight="700" fill="' + (dark ? '#64748b' : '#94a3b8') + '" letter-spacing="0.08em">EXECUTION PIPELINE & LIFECYCLE</text>\n';
            var stepCount = steps.length;
            var stepGap = 16;
            var totalStepW = width - 72;
            var stepW = (totalStepW - (stepCount - 1) * stepGap) / stepCount;
            var stepH = 195;
            var stepY = 300;

            for (var sIdx = 0; sIdx < stepCount; sIdx++) {
                var sx = 36 + sIdx * (stepW + stepGap);
                var st = steps[sIdx];
                svg += '  <g transform="translate(' + sx + ', ' + stepY + ')">\n';
                svg += '    <rect width="' + stepW + '" height="' + stepH + '" rx="14" fill="' + cardBg + '" stroke="' + cardBorder + '" stroke-width="1.2"/>\n';
                svg += '    <path d="M 0 14 Q 0 0 14 0 L ' + (stepW - 14) + ' 0 Q ' + stepW + ' 0 ' + stepW + ' 14 L ' + stepW + ' 6 L 0 6 Z" fill="' + st.color + '"/>\n';
                svg += '    <circle cx="28" cy="38" r="14" fill="' + st.color + '" fill-opacity="0.2" stroke="' + st.color + '" stroke-width="1.5"/>\n';
                svg += '    <text x="28" y="42" font-size="12" font-weight="800" fill="' + st.color + '" text-anchor="middle">0' + (sIdx + 1) + '</text>\n';
                svg += '    <text x="16" y="82" font-size="14" font-weight="700" fill="' + textPrimary + '">' + escapeHtml(st.title) + '</text>\n';

                var descWords = st.desc.split(' ');
                var mid = Math.ceil(descWords.length / 2);
                var l1 = descWords.slice(0, mid).join(' ');
                var l2 = descWords.slice(mid).join(' ');
                svg += '    <text x="16" y="112" font-size="12" fill="' + textSecondary + '">' + escapeHtml(l1) + '</text>\n';
                if (l2) svg += '    <text x="16" y="132" font-size="12" fill="' + textSecondary + '">' + escapeHtml(l2) + '</text>\n';
                svg += '  </g>\n';

                if (sIdx < stepCount - 1) {
                    var arrX = sx + stepW + 4;
                    var arrY = stepY + (stepH / 2);
                    svg += '  <path d="M ' + arrX + ' ' + (arrY - 6) + ' L ' + (arrX + 8) + ' ' + arrY + ' L ' + arrX + ' ' + (arrY + 6) + '" fill="none" stroke="' + (dark ? '#64748b' : '#94a3b8') + '" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>\n';
                }
            }

            svg += '</svg>';
            return svg;
        }

        // ==========================================
        // 6. STARTER SVG PREVIEWS
        // ==========================================
        var STARTER_SVGS = {
            flowchart: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 380" width="100%" height="100%" style="background:#ffffff; font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,sans-serif;"><defs><marker id="arr1" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 1 L 10 5 L 0 9 z" fill="#3b82f6"/></marker></defs><rect x="220" y="20" width="160" height="40" rx="20" fill="#eff6ff" stroke="#3b82f6" stroke-width="2"/><text x="300" y="45" font-size="13" font-weight="600" fill="#1e40af" text-anchor="middle">User Request</text><path d="M 300 60 L 300 95" stroke="#3b82f6" stroke-width="2" marker-end="url(#arr1)"/><polygon points="300,100 380,140 300,180 220,140" fill="#fef3c7" stroke="#f59e0b" stroke-width="2"/><text x="300" y="144" font-size="12" font-weight="600" fill="#92400e" text-anchor="middle">Authenticated?</text><path d="M 380 140 L 460 140 L 460 210" stroke="#f59e0b" stroke-width="2" marker-end="url(#arr1)"/><text x="415" y="132" font-size="11" fill="#b45309" font-weight="600">No</text><rect x="400" y="215" width="120" height="42" rx="6" fill="#fee2e2" stroke="#ef4444" stroke-width="1.5"/><text x="460" y="240" font-size="11" font-weight="600" fill="#991b1b" text-anchor="middle">Prompt Login</text><path d="M 300 180 L 300 215" stroke="#10b981" stroke-width="2" marker-end="url(#arr1)"/><text x="312" y="202" font-size="11" fill="#047857" font-weight="600">Yes</text><polygon points="300,220 375,255 300,290 225,255" fill="#f0fdf4" stroke="#10b981" stroke-width="2"/><text x="300" y="259" font-size="12" font-weight="600" fill="#065f46" text-anchor="middle">Cache Hit?</text><path d="M 375 255 L 450 255 L 450 315" stroke="#10b981" stroke-width="2" marker-end="url(#arr1)"/><rect x="390" y="320" width="120" height="42" rx="6" fill="#eff6ff" stroke="#3b82f6" stroke-width="1.5"/><text x="450" y="345" font-size="11" font-weight="600" fill="#1e40af" text-anchor="middle">Serve Cache</text><path d="M 225 255 L 150 255 L 150 315" stroke="#6366f1" stroke-width="2" marker-end="url(#arr1)"/><rect x="90" y="320" width="120" height="42" rx="6" fill="#f5f3ff" stroke="#8b5cf6" stroke-width="1.5"/><text x="150" y="345" font-size="11" font-weight="600" fill="#5b21b6" text-anchor="middle">Query Database</text></svg>',
            mindmap: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 360" width="100%" height="100%" style="background:#ffffff; font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,sans-serif;"><ellipse cx="300" cy="180" rx="95" ry="36" fill="#dbeafe" stroke="#2563eb" stroke-width="2.5"/><text x="300" y="185" font-size="13" font-weight="700" fill="#1e40af" text-anchor="middle">Full-Stack System</text><path d="M 205 170 Q 140 120 100 100" stroke="#3b82f6" stroke-width="2.5" fill="none"/><rect x="30" y="80" width="120" height="34" rx="17" fill="#eff6ff" stroke="#3b82f6" stroke-width="1.5"/><text x="90" y="102" font-size="11" font-weight="600" fill="#1e40af" text-anchor="middle">Frontend (Next.js)</text><path d="M 205 190 Q 140 240 100 260" stroke="#8b5cf6" stroke-width="2.5" fill="none"/><rect x="30" y="245" width="120" height="34" rx="17" fill="#f5f3ff" stroke="#8b5cf6" stroke-width="1.5"/><text x="90" y="267" font-size="11" font-weight="600" fill="#5b21b6" text-anchor="middle">API & Microservices</text><path d="M 395 170 Q 460 120 500 100" stroke="#10b981" stroke-width="2.5" fill="none"/><rect x="450" y="80" width="125" height="34" rx="17" fill="#f0fdf4" stroke="#10b981" stroke-width="1.5"/><text x="512" y="102" font-size="11" font-weight="600" fill="#065f46" text-anchor="middle">PostgreSQL / Cache</text><path d="M 395 190 Q 460 240 500 260" stroke="#f59e0b" stroke-width="2.5" fill="none"/><rect x="450" y="245" width="125" height="34" rx="17" fill="#fffbeb" stroke="#f59e0b" stroke-width="1.5"/><text x="512" y="267" font-size="11" font-weight="600" fill="#92400e" text-anchor="middle">K8s & CI/CD Cloud</text></svg>',
            architecture: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 360" width="100%" height="100%" style="background:#ffffff; font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,sans-serif;"><defs><marker id="arrArch" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 1 L 10 5 L 0 9 z" fill="#6366f1"/></marker></defs><rect x="30" y="30" width="240" height="130" rx="12" fill="#eff6ff" stroke="#bfdbfe" stroke-width="1.5" stroke-dasharray="4,4"/><text x="45" y="52" font-size="11" font-weight="700" fill="#1e40af">CLOUD API TIER</text><rect x="50" y="65" width="95" height="40" rx="6" fill="#ffffff" stroke="#3b82f6" stroke-width="1.5"/><text x="97" y="90" font-size="11" font-weight="600" fill="#1e40af" text-anchor="middle">API Gateway</text><rect x="160" y="65" width="95" height="40" rx="6" fill="#ffffff" stroke="#3b82f6" stroke-width="1.5"/><text x="207" y="90" font-size="11" font-weight="600" fill="#1e40af" text-anchor="middle">Auth Service</text><rect x="330" y="30" width="240" height="130" rx="12" fill="#f5f3ff" stroke="#ddd6fe" stroke-width="1.5" stroke-dasharray="4,4"/><text x="345" y="52" font-size="11" font-weight="700" fill="#5b21b6">CORE MICROSERVICES</text><rect x="350" y="65" width="95" height="40" rx="6" fill="#ffffff" stroke="#8b5cf6" stroke-width="1.5"/><text x="397" y="90" font-size="11" font-weight="600" fill="#5b21b6" text-anchor="middle">Order Engine</text><rect x="460" y="65" width="95" height="40" rx="6" fill="#ffffff" stroke="#8b5cf6" stroke-width="1.5"/><text x="507" y="90" font-size="11" font-weight="600" fill="#5b21b6" text-anchor="middle">Payment GW</text><path d="M 255 85 L 345 85" stroke="#6366f1" stroke-width="2" marker-end="url(#arrArch)"/><rect x="180" y="200" width="240" height="120" rx="12" fill="#f0fdf4" stroke="#bbf7d0" stroke-width="1.5" stroke-dasharray="4,4"/><text x="195" y="222" font-size="11" font-weight="700" fill="#065f46">PERSISTENCE CLUSTER</text><rect x="200" y="240" width="95" height="40" rx="6" fill="#ffffff" stroke="#10b981" stroke-width="1.5"/><text x="247" y="265" font-size="11" font-weight="600" fill="#065f46" text-anchor="middle">Postgres DB</text><rect x="310" y="240" width="95" height="40" rx="6" fill="#ffffff" stroke="#10b981" stroke-width="1.5"/><text x="357" y="265" font-size="11" font-weight="600" fill="#065f46" text-anchor="middle">Redis Cache</text><path d="M 397 105 L 397 180 L 357 235" stroke="#6366f1" stroke-width="2" marker-end="url(#arrArch)"/></svg>',
            state: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 340" width="100%" height="100%" style="background:#ffffff; font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,sans-serif;"><defs><marker id="arrSt" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 1 L 10 5 L 0 9 z" fill="#475569"/></marker></defs><circle cx="50" cy="170" r="14" fill="#0f172a"/><path d="M 64 170 L 110 170" stroke="#475569" stroke-width="2" marker-end="url(#arrSt)"/><rect x="115" y="145" width="90" height="50" rx="10" fill="#eff6ff" stroke="#3b82f6" stroke-width="2"/><text x="160" y="175" font-size="13" font-weight="600" fill="#1e40af" text-anchor="middle">Idle</text><path d="M 205 170 L 260 170" stroke="#475569" stroke-width="2" marker-end="url(#arrSt)"/><rect x="265" y="145" width="100" height="50" rx="10" fill="#fef3c7" stroke="#f59e0b" stroke-width="2"/><text x="315" y="175" font-size="13" font-weight="600" fill="#92400e" text-anchor="middle">Processing</text><path d="M 365 170 L 420 170" stroke="#475569" stroke-width="2" marker-end="url(#arrSt)"/><rect x="425" y="145" width="90" height="50" rx="10" fill="#f0fdf4" stroke="#10b981" stroke-width="2"/><text x="470" y="175" font-size="13" font-weight="600" fill="#065f46" text-anchor="middle">Settled</text><path d="M 515 170 L 550 170" stroke="#475569" stroke-width="2" marker-end="url(#arrSt)"/><circle cx="565" cy="170" r="14" fill="none" stroke="#0f172a" stroke-width="2"/><circle cx="565" cy="170" r="9" fill="#0f172a"/></svg>'
        };

        // ==========================================
        // 7. RICH 1-CLICK SAMPLE TEMPLATES PRESETS
        // ==========================================
        var TEMPLATES = {
            flowchart: 'flowchart TD\n    Start([User Request]) --> Auth{Authenticated?}\n    Auth -- No --> Login[Prompt OAuth / Credentials]\n    Login --> Auth\n    Auth -- Yes --> CacheCheck{Cache Hit?}\n    CacheCheck -- Yes --> ReturnCache[Serve Cached Response]\n    CacheCheck -- No --> QueryDB[(Query Database)]\n    QueryDB --> ProcessData[Transform & Enrich Data]\n    ProcessData --> UpdateCache[Write to Redis Cache]\n    UpdateCache --> Deliver([200 OK Response])\n    ReturnCache --> Deliver',
            sequence: 'sequenceDiagram\n    autonumber\n    actor Client\n    participant Gateway as API Gateway\n    participant Auth as Auth Service\n    participant Orders as Order Service\n    participant DB as Postgres DB\n\n    Client->>Gateway: POST /orders {items, token}\n    Gateway->>Auth: Validate JWT Token\n    Auth-->>Gateway: Token Valid (User 4821)\n    Gateway->>Orders: CreateOrder(items, user)\n    Orders->>DB: INSERT INTO orders VALUES (...)\n    DB-->>Orders: Order ID #98214 Created\n    Orders-->>Gateway: 201 Created {id: 98214}\n    Gateway-->>Client: 201 Created Response',
            mindmap: 'mindmap\n  root((Full-Stack System Architecture))\n    Frontend\n      React / Next.js\n      Tailwind CSS\n      State Management\n        Zustand\n        React Query\n    Backend API\n      Node.js Microservices\n      GraphQL Gateway\n      Auth & RBAC\n    Data Tier\n      PostgreSQL [(Primary OLTP)]\n      Redis [(In-Memory Cache)]\n      ClickHouse [(Analytics)]\n    DevOps & Infra\n      Kubernetes\n      Docker Containers\n      CI/CD Pipelines\n      Prometheus / Grafana',
            radar: 'radar\ntitle System Architecture Evaluation\naxes Performance, Security, Scalability, Usability, Maintainability, Cost Efficiency\nseries "Current Stack": 72, 68, 75, 80, 65, 70\nseries "Target Stack": 94, 92, 96, 88, 90, 85',
            infographic: 'infographic\ntitle Product Engineering & Delivery Funnel\nsubtitle Q4 Performance Metrics and Conversion Pipeline\nkpi "System Uptime" | 99.98% | +0.12% vs Q3 | #10b981\nkpi "API Latency" | 42ms | -15ms faster | #3b82f6\nkpi "Active Users" | 248.5K | +18.4% MoM | #8b5cf6\nkpi "Error Budget" | 82.4% | Healthy | #06b6d4\nstep "1. Code Commit" | 1,420 PRs merged across 14 services | #3b82f6\nstep "2. CI Automation" | 98.4% automated unit & integration pass rate | #6366f1\nstep "3. Staging Canary" | 10% traffic canary validation for 30 mins | #8b5cf6\nstep "4. Zero-Downtime Prod" | Global rolling deployment across 5 regions | #10b981',
            architecture: 'architecture-beta\n    group api(cloud)[API Cloud Tier]\n    service gw(server)[API Gateway] in api\n    service auth(server)[Auth Service] in api\n\n    group core(cloud)[Core Services]\n    service orders(server)[Order Processor] in core\n    service pay(server)[Payment Gateway] in core\n\n    group data(database)[Persistence Cluster]\n    service pg(database)[Postgres Master] in data\n    service redis(database)[Redis Cache] in data\n\n    gw:R -- L:auth\n    gw:B -- T:orders\n    orders:R -- L:pay\n    orders:B -- T:pg\n    orders:R -- T:redis',
            er: 'erDiagram\n    CUSTOMER ||--o{ ORDER : places\n    ORDER ||--|{ LINE-ITEM : contains\n    CUSTOMER }|..|{ DELIVERY-ADDRESS : uses\n    ORDER {\n        int orderNumber PK\n        string status\n        decimal totalPrice\n        date createdAt\n    }\n    CUSTOMER {\n        string customerId PK\n        string fullName\n        string email\n        string tier\n    }\n    LINE-ITEM {\n        int itemId PK\n        int orderId FK\n        string productSku\n        int quantity\n        decimal unitPrice\n    }',
            state: 'stateDiagram-v2\n    [*] --> Idle\n    Idle --> Processing : Submit Payment\n    Processing --> Authorizing : Contact Gateway\n    Authorizing --> Settled : Payment Approved\n    Authorizing --> Failed : Insufficient Funds\n    Failed --> Retrying : Exponential Backoff\n    Retrying --> Authorizing : Retry Attempt < 3\n    Retrying --> Cancelled : Max Retries Exceeded\n    Settled --> Dispatched : Fulfillment\n    Dispatched --> Completed : Delivered\n    Completed --> [*]\n    Cancelled --> [*]',
            timeline: 'timeline\n    title Platform Engineering Roadmap 2026\n    section Q1 Foundation\n        Monorepo Setup : Turborepo Migration : Core Tooling\n        Auth Overhaul : OAuth2 & Passkeys : MFA\n    section Q2 Scalability\n        Multi-Region Deployment : Latency Optimization\n        Database Sharding : Read Replicas\n    section Q3 Intelligence\n        AI Model Integration : RAG Knowledge Base\n        Automated Code Reviews : Self-Healing CI\n    section Q4 Enterprise\n        SOC2 Type II Compliance : Zero Trust Security\n        Custom Analytics Dashboard : Public API Release',
            xychart: 'xychart-beta\n    title "Monthly Active Users vs API Requests (2026)"\n    x-axis [Jan, Feb, Mar, Apr, May, Jun, Jul, Aug, Sep, Oct, Nov, Dec]\n    y-axis "Requests (Millions)" 0 --> 120\n    bar [15, 22, 34, 45, 52, 68, 74, 82, 90, 98, 105, 114]\n    line [10, 18, 28, 38, 48, 60, 68, 75, 82, 91, 100, 110]'
        };

        // ==========================================
        // 8. CANVAS HELPERS
        // ==========================================
        function getSelectedMermaidText() {
            var cell = graph.getSelectionCell();
            if (!cell) return null;

            var value = cell.value;
            if (value && typeof value === 'object') {
                var dataAttr = value.getAttribute ? value.getAttribute('mermaidData') : null;
                if (dataAttr) {
                    try {
                        var parsed = JSON.parse(dataAttr);
                        if (parsed && parsed.data) return parsed.data;
                    } catch (e) {}
                }
            }

            var style = graph.getCurrentCellStyle(cell);
            if (style && style['mermaidData']) {
                try {
                    var parsedStyle = JSON.parse(style['mermaidData']);
                    if (parsedStyle && parsedStyle.data) return parsedStyle.data;
                } catch (e) {}
            }

            if (typeof value === 'string') {
                var trimVal = value.trim();
                if (trimVal.startsWith('flowchart') || trimVal.startsWith('graph') ||
                    trimVal.startsWith('sequenceDiagram') || trimVal.startsWith('classDiagram') ||
                    trimVal.startsWith('mindmap') || trimVal.startsWith('radar') ||
                    trimVal.startsWith('infographic') || trimVal.startsWith('@start') ||
                    trimVal.startsWith('architecture-beta') || trimVal.startsWith('stateDiagram') ||
                    trimVal.startsWith('erDiagram') || trimVal.startsWith('timeline') ||
                    trimVal.startsWith('xychart-beta')) {
                    return trimVal;
                }
            }
            return null;
        }

        function insertSvgAsImageCell(svgString) {
            if (!svgString) return;
            var dataUri = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgString);
            var converted = (typeof ui.convertDataUri === 'function') ? ui.convertDataUri(dataUri) : dataUri;

            var w = 720, h = 540;
            var matchW = svgString.match(/width="(\\d+)"/);
            var matchH = svgString.match(/height="(\\d+)"/);
            if (matchW) w = parseInt(matchW[1], 10);
            if (matchH) h = parseInt(matchH[1], 10);

            graph.getModel().beginUpdate();
            try {
                var pt = graph.getFreeInsertPoint();
                var cell = graph.insertVertex(
                    graph.getDefaultParent(), null, '',
                    Math.max(20, pt.x), Math.max(20, pt.y),
                    w, h,
                    'shape=image;noLabel=1;verticalAlign=top;imageAspect=1;image=' + converted + ';'
                );
                graph.setSelectionCells([cell]);
            } finally {
                graph.getModel().endUpdate();
            }

            if (ui.showStatus) ui.showStatus('✓ Inserted crisp vector diagram', 2500);
        }

        function applyMermaidToCanvas(syntax) {
            if (!syntax || !syntax.trim()) return;

            if (ui.spinner && ui.spinner.spin) {
                ui.spinner.spin(document.body, 'Syncing diagram to canvas...');
            }

            ui.parseMermaidDiagram(syntax, null, function(xml) {
                if (ui.spinner && ui.spinner.stop) ui.spinner.stop();

                graph.getModel().beginUpdate();
                try {
                    var insertXml = (typeof mxMermaidToDrawio !== 'undefined' && mxMermaidToDrawio.wrapGroup) ?
                        mxMermaidToDrawio.wrapGroup(xml, syntax, EditorUi.getInsertMermaidConfig()) : xml;

                    if (activeTargetCell && graph.getModel().contains(activeTargetCell)) {
                        if (typeof ui.replaceLockedGroupChildren === 'function') {
                            ui.replaceLockedGroupChildren(activeTargetCell, xml, syntax, EditorUi.getInsertMermaidConfig());
                        } else if (typeof ui.replaceMermaidCell === 'function') {
                            ui.replaceMermaidCell(activeTargetCell, insertXml);
                        } else {
                            var pt = new mxPoint(activeTargetCell.geometry.x, activeTargetCell.geometry.y);
                            graph.removeCells([activeTargetCell]);
                            var inserted = ui.importXml(insertXml, pt.x, pt.y, true);
                            graph.setSelectionCells(inserted);
                            activeTargetCell = inserted[0];
                        }
                    } else {
                        var pt2 = graph.getFreeInsertPoint();
                        var inserted2 = ui.importXml(insertXml, Math.max(20, pt2.x), Math.max(20, pt2.y), true);
                        graph.setSelectionCells(inserted2);
                        if (inserted2 && inserted2.length > 0) {
                            activeTargetCell = inserted2[0];
                        }
                    }
                } finally {
                    graph.getModel().endUpdate();
                }

                if (ui.showStatus) {
                    ui.showStatus('✓ Diagram synced to Draw.io canvas', 2500);
                }
            }, function(err) {
                if (ui.spinner && ui.spinner.stop) ui.spinner.stop();
                ui.handleError(err);
            });
        }

        // Global message listener for iframe
        window.addEventListener('message', function(event) {
            if (!event.data) return;
            if (event.data.type === 'MERMAID_SYNC' && typeof event.data.syntax === 'string') {
                applyMermaidToCanvas(event.data.syntax);
            } else if (event.data.type === 'MERMAID_EDITOR_READY') {
                var code = getSelectedMermaidText();
                if (code && editorIframe && editorIframe.contentWindow) {
                    editorIframe.contentWindow.postMessage({ type: 'LOAD_MERMAID', syntax: code }, '*');
                }
            }
        });

        // ==========================================
        // 9. 2-WAY VISUAL DRAG & DROP EDITOR WINDOW
        // ==========================================
        function openVisualMermaidEditor(initialCode) {
            activeTargetCell = graph.getSelectionCell();

            if (visualEditorWindow != null) {
                visualEditorWindow.show();
                if (initialCode && editorIframe && editorIframe.contentWindow) {
                    editorIframe.contentWindow.postMessage({ type: 'LOAD_MERMAID', syntax: initialCode }, '*');
                }
                return;
            }

            var isDark = isDarkMode();
            var container = document.createElement('div');
            container.style.position = 'relative';
            container.style.width = '100%';
            container.style.height = '100%';
            container.style.display = 'flex';
            container.style.flexDirection = 'column';
            container.style.background = isDark ? '#0f172a' : '#f8fafc';
            container.style.overflow = 'hidden';

            var controlBar = document.createElement('div');
            controlBar.style.height = '42px';
            controlBar.style.background = isDark ? '#1e293b' : '#f8fafc';
            controlBar.style.display = 'flex';
            controlBar.style.alignItems = 'center';
            controlBar.style.justifyContent = 'space-between';
            controlBar.style.padding = '0 14px';
            controlBar.style.borderBottom = isDark ? '1px solid #334155' : '1px solid #e2e8f0';
            controlBar.style.color = isDark ? '#f8fafc' : '#0f172a';
            controlBar.style.fontSize = '12px';
            controlBar.style.fontFamily = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';

            var titleSpan = document.createElement('div');
            titleSpan.style.display = 'flex';
            titleSpan.style.alignItems = 'center';
            titleSpan.style.gap = '8px';
            titleSpan.innerHTML = '<span style="color:' + (isDark ? '#60a5fa' : '#2563eb') + ';font-weight:700;">⚡ 2-Way Visual Mermaid Editor</span> <span style="color:' + (isDark ? '#94a3b8' : '#64748b') + ';font-size:11px;">(Click shapes or double-click canvas to add nodes • Drag handles to connect • Live .mmd sync)</span>';
            controlBar.appendChild(titleSpan);

            var actionsDiv = document.createElement('div');
            actionsDiv.style.display = 'flex';
            actionsDiv.style.gap = '8px';

            var btnPasteCode = document.createElement('button');
            btnPasteCode.className = 'mermaid-tb-btn';
            btnPasteCode.style.height = '28px';
            btnPasteCode.textContent = '📋 Paste Mermaid Code';
            btnPasteCode.title = 'Paste Flowchart / Mermaid code from clipboard into the Visual Editor';
            btnPasteCode.onclick = function() {
                if (navigator.clipboard && navigator.clipboard.readText) {
                    navigator.clipboard.readText().then(function(clipText) {
                        if (clipText && clipText.trim() && editorIframe && editorIframe.contentWindow) {
                            editorIframe.contentWindow.postMessage({ type: 'LOAD_MERMAID', syntax: clipText.trim() }, '*');
                        }
                    }).catch(function() {});
                }
            };
            actionsDiv.appendChild(btnPasteCode);

            var btnPull = document.createElement('button');
            btnPull.className = 'mermaid-tb-btn';
            btnPull.style.height = '28px';
            btnPull.textContent = '📥 Load from Selected Cell';
            btnPull.onclick = function() {
                var code = getSelectedMermaidText();
                if (code) {
                    activeTargetCell = graph.getSelectionCell();
                    if (editorIframe && editorIframe.contentWindow) {
                        editorIframe.contentWindow.postMessage({ type: 'LOAD_MERMAID', syntax: code }, '*');
                    }
                } else {
                    ui.showError(mxResources.get('error'), 'No Mermaid diagram is currently selected on the canvas. Select a Mermaid shape first or write directly in the visual editor.', mxResources.get('ok'));
                }
            };
            actionsDiv.appendChild(btnPull);

            var btnApply = document.createElement('button');
            btnApply.className = 'mermaid-tb-btn primary';
            btnApply.style.height = '28px';
            btnApply.textContent = '⚡ Apply to Draw.io Canvas';
            btnApply.onclick = function() {
                if (editorIframe && editorIframe.contentWindow) {
                    editorIframe.contentWindow.postMessage({ type: 'GET_MERMAID' }, '*');
                }
            };
            actionsDiv.appendChild(btnApply);

            controlBar.appendChild(actionsDiv);
            container.appendChild(controlBar);

            editorIframe = document.createElement('iframe');
            editorIframe.src = 'mermaid-visual-editor/index.html';
            editorIframe.style.flex = '1';
            editorIframe.style.width = '100%';
            editorIframe.style.border = 'none';
            container.appendChild(editorIframe);

            var w = Math.min(1080, (window.innerWidth || document.documentElement.clientWidth || 1200) - 80);
            var h = Math.min(700, (window.innerHeight || document.documentElement.clientHeight || 800) - 80);
            var x = Math.max(40, ((window.innerWidth || 1200) - w) / 2);
            var y = Math.max(40, ((window.innerHeight || 800) - h) / 2);

            visualEditorWindow = new mxWindow('Visual Mermaid Drag & Drop Editor', container, x, y, w, h, true, true);
            visualEditorWindow.destroyOnClose = false;
            visualEditorWindow.setMaximizable(true);
            visualEditorWindow.setResizable(true);
            visualEditorWindow.setClosable(true);
            visualEditorWindow.setVisible(true);

            editorIframe.onload = function() {
                var code = initialCode || getSelectedMermaidText();
                if (code) {
                    setTimeout(function() {
                        try {
                            editorIframe.contentWindow.postMessage({ type: 'LOAD_MERMAID', syntax: code }, '*');
                        } catch (e) {}
                    }, 400);
                }
            };
        }

        // ==========================================
        // 10. WORKSPACE & DIAGRAMS HUB STORAGE ENGINE
        // ==========================================
        var WORKSPACE_STORAGE_KEY = 'mermaidApp_workspace_v1';
        var DISK_FOLDER_KIND = 'disk';
        var DISK_FOLDER_ICON = String.fromCodePoint(0x1F5C6); // heavy folder glyph used for disk-backed folders

        // Disk folders are read and written through Electron IPC: the folder the user
        // picked in the native dialog is authorized in the main process ("blessed
        // paths") and that grant persists across launches.
        function isDiskFolder(folder) {
            return !!folder && folder.kind === DISK_FOLDER_KIND;
        }

        function getDefaultFolderId(data) {
            var settings = (data && data.settings) || {};
            var candidates = [settings.defaultFolderId, 'personal', 'all'];
            for (var i = 0; i < candidates.length; i++) {
                var id = candidates[i];
                if (!id) continue;
                if (id === 'all') {
                    // "All" is a view, not a destination — fall back to the first real folder.
                    var first = data.folders.filter(function(f) { return f.id !== 'all' && isDiskFolder(f) === false; })[0];
                    if (first) return first.id;
                    continue;
                }
                if (data.folders.some(function(f) { return f.id === id; })) return id;
            }
            return 'personal';
        }

        function getFolderById(data, id) {
            return (data.folders || []).filter(function(f) { return f.id === id; })[0] || null;
        }

        // Extract ```mermaid fenced blocks (or the whole text when it is bare Mermaid).
        function extractMermaidBlocks(text) {
            var out = [];
            var fenceRe = /```(?:mermaid|mmd)?\s*\n([\s\S]*?)```/gi;
            var m;
            while ((m = fenceRe.exec(text)) !== null) {
                var body = m[1].trim();
                // A bare fence with no language still only counts when it parses as Mermaid.
                if (body && (/```mermaid/i.test(m[0]) || !/^#/.test(body))) out.push(body);
            }
            if (out.length === 0) {
                var stripped = text.trim().replace(/^---[\s\S]*?---\s*/, '');
                if (/^(flowchart|graph|sequenceDiagram|classDiagram|stateDiagram|erDiagram|journey|gantt|pie|mindmap|timeline|quadrantChart|gitGraph|xychart-beta|sankey-beta|architecture-beta|block-beta|packet-beta|requirementDiagram)\b/.test(stripped)) {
                    out.push(stripped);
                }
            }
            return out;
        }

        function titleFromFilename(name) {
            return String(name || 'Untitled')
                .replace(/\.(mmd|md|markdown)$/i, '')
                .replace(/^#+\s*/, '')
                .replace(/[-_]+/g, ' ')
                .trim() || 'Untitled';
        }

        // Scan a picked / dropped directory for .mmd and .md files holding Mermaid code.
        function collectDiagramFiles(fileList) {
            var files = Array.prototype.slice.call(fileList || []);
            var found = [];
            files.forEach(function(file) {
                var rel = file.webkitRelativePath || file.name || '';
                var base = rel.split('/').pop();
                if (!/\.(mmd|md|markdown)$/i.test(base)) return;
                found.push({ file: file, relPath: rel });
            });
            return found;
        }

        function readDiagramFiles(entries, folderId) {
            return Promise.all(entries.map(function(entry) {
                return new Promise(function(resolve) {
                    var reader = new FileReader();
                    reader.onload = function() {
                        var text = String(reader.result || '');
                        var blocks = /\.mmd$/i.test(entry.file.name) ? [text.trim()] : extractMermaidBlocks(text);
                        blocks = blocks.filter(Boolean);
                        if (blocks.length === 0) { resolve(null); return; }
                        resolve({
                            id: 'disk_' + folderId + '_' + entry.relPath.replace(/[^A-Za-z0-9_.-]/g, '_'),
                            title: titleFromFilename(entry.file.name) + (blocks.length > 1 ? '' : ''),
                            folderId: folderId,
                            relPath: entry.relPath,
                            fileName: entry.file.name,
                            size: entry.file.size,
                            mtime: entry.file.lastModified || 0,
                            code: blocks[0],
                            blocks: blocks,
                            typeLabel: detectDiagramType(blocks[0]).label,
                            updatedAt: entry.file.lastModified || Date.now(),
                            starred: false,
                            fromDisk: true
                        });
                    };
                    reader.onerror = function() { resolve(null); };
                    reader.readAsText(entry.file);
                });
            })).then(function(list) {
                return list.filter(Boolean);
            });
        }

        function getWorkspaceData() {
            try {
                var raw = localStorage.getItem(WORKSPACE_STORAGE_KEY);
                if (raw) {
                    var parsed = JSON.parse(raw);
                    if (parsed && Array.isArray(parsed.folders) && Array.isArray(parsed.diagrams)) {
                        parsed.settings = parsed.settings || {};
                        return parsed;
                    }
                }
            } catch (e) {}

            var initialData = {
                settings: { defaultFolderId: 'personal' },
                folders: [
                    { id: 'all', name: 'All Diagrams', icon: '🏠', system: true },
                    { id: 'personal', name: 'Personal', icon: '📁' },
                    { id: 'pipeline', name: 'Novel Pipeline & Architecture', icon: '📁' },
                    { id: 'analytics', name: 'Radar & Infographics', icon: '📁' }
                ],
                diagrams: [
                    {
                        id: 'diag_1',
                        title: 'User Authentication & Cache Architecture',
                        folderId: 'pipeline',
                        typeLabel: 'Mermaid Flowchart',
                        code: TEMPLATES.flowchart,
                        svgPreview: STARTER_SVGS.flowchart,
                        updatedAt: Date.now() - 3600000,
                        starred: true
                    },
                    {
                        id: 'diag_2',
                        title: 'System Architecture Evaluation',
                        folderId: 'analytics',
                        typeLabel: 'Radar / Spider Chart',
                        code: TEMPLATES.radar,
                        svgPreview: renderRadarSvg(TEMPLATES.radar, false),
                        updatedAt: Date.now() - 7200000,
                        starred: true
                    },
                    {
                        id: 'diag_3',
                        title: 'Product Engineering & Delivery Funnel',
                        folderId: 'analytics',
                        typeLabel: 'Infographic KPI & Funnel',
                        code: TEMPLATES.infographic,
                        svgPreview: renderInfographicSvg(TEMPLATES.infographic, false),
                        updatedAt: Date.now() - 86400000,
                        starred: false
                    },
                    {
                        id: 'diag_4',
                        title: 'Full-Stack System Architecture',
                        folderId: 'personal',
                        typeLabel: 'Mermaid Mindmap',
                        code: TEMPLATES.mindmap,
                        svgPreview: STARTER_SVGS.mindmap,
                        updatedAt: Date.now() - 172800000,
                        starred: false
                    },
                    {
                        id: 'diag_5',
                        title: 'Cloud Microservices & Persistence Cluster',
                        folderId: 'pipeline',
                        typeLabel: 'Mermaid Cloud Architecture',
                        code: TEMPLATES.architecture,
                        svgPreview: STARTER_SVGS.architecture,
                        updatedAt: Date.now() - 250000000,
                        starred: true
                    },
                    {
                        id: 'diag_6',
                        title: 'Order Lifecycle & Payment Flow',
                        folderId: 'personal',
                        typeLabel: 'Mermaid State Machine',
                        code: TEMPLATES.state,
                        svgPreview: STARTER_SVGS.state,
                        updatedAt: Date.now() - 340000000,
                        starred: false
                    }
                ]
            };
            saveWorkspaceData(initialData);
            return initialData;
        }

        function saveWorkspaceData(data) {
            try {
                localStorage.setItem(WORKSPACE_STORAGE_KEY, JSON.stringify(data));
            } catch (e) {
                console.warn('Failed to save to localStorage:', e);
            }
        }

        // ==========================================
        // 10a. DISK ACCESS VIA ELECTRON IPC
        // The hub talks to the main process for real folder access. The folder is
        // authorized once by the user picking it in the native dialog ("blessed
        // paths"), and that grant persists across launches.
        // ==========================================
        function isElectronHost() {
            return typeof window.electron !== 'undefined' && typeof window.electron.request === 'function';
        }

        function ipcRequest(msg) {
            return new Promise(function(resolve, reject) {
                if (!isElectronHost()) { reject(new Error('not electron')); return; }
                try {
                    window.electron.request(msg, function(data) { resolve(data); }, function(err) { reject(new Error(err || 'IPC error')); });
                } catch (e) { reject(e); }
            });
        }

        // Native directory picker + persistent authorization. Returns {path, name} or null.
        async function pickDiskFolder() {
            var docs = null;
            try { docs = await ipcRequest({ action: 'getDocumentsFolder' }); } catch (e) {}
            var paths = await ipcRequest({
                action: 'showOpenDialog',
                defaultPath: docs || null,
                properties: ['openDirectory']
            });
            if (!paths || !paths.length) return null;
            var p = paths[0];
            return { path: p, name: p.split(/[\\/]/).filter(Boolean).pop() || 'Folder' };
        }

        // List .mmd/.md files of a blessed folder through the main process.
        async function ipcListDiskFolder(folderPath) {
            return ipcRequest({ action: 'mermaidListFolder', path: folderPath });
        }

        async function ipcReadDiskFile(folderPath, name) {
            return ipcRequest({ action: 'mermaidReadFile', folder: folderPath, name: name });
        }

        async function ipcWriteDiskFile(folderPath, name, data) {
            return ipcRequest({ action: 'mermaidWriteFile', folder: folderPath, name: name, data: data });
        }

        // Pick a directory with the native dialog, authorize it persistently and
        // register it as a hub folder backed by real disk access.
        async function addDiskFolder() {
            if (!isElectronHost()) {
                // Non-Electron fallback (e.g. browser dev) keeps the old in-page picker.
                addDiskFolderFallback();
                return;
            }

            var picked;
            try {
                picked = await pickDiskFolder();
            } catch (e) {
                if (ui && ui.showError) ui.showError(mxResources.get('error'), 'Could not open the folder picker: ' + (e.message || e), mxResources.get('ok'));
                return;
            }
            if (!picked) return; // user cancelled

            var folderPath = picked.path;
            var data = getWorkspaceData();

            // One app folder = one hub folder; re-adding re-syncs instead of duplicating.
            var existing = data.folders.filter(function(f) { return isDiskFolder(f) && f.diskPath === folderPath; })[0];
            var folderId = existing ? existing.id : 'disk_' + picked.name.replace(/[^A-Za-z0-9_-]/g, '_') + '_' + Date.now();

            var diags;
            try {
                diags = await scanDiskFolder(folderPath, folderId);
            } catch (e) {
                if (ui && ui.showError) ui.showError(mxResources.get('error'), 'Could not read "' + picked.name + '": ' + (e.message || e), mxResources.get('ok'));
                return;
            }

            if (diags.length === 0) {
                if (ui && ui.showError) ui.showError(mxResources.get('error'),
                    'No Mermaid files found in "' + picked.name + '".\n\nAdd .mmd files or .md files containing ```mermaid blocks.',
                    mxResources.get('ok'));
                return;
            }

            if (!existing) {
                data.folders.push({
                    id: folderId,
                    name: picked.name,
                    icon: DISK_FOLDER_ICON,
                    kind: DISK_FOLDER_KIND,
                    diskPath: folderPath,
                    lastScan: Date.now()
                });
            } else {
                existing.lastScan = Date.now();
            }
            data.diagrams = data.diagrams.filter(function(d) { return d.folderId !== folderId; }).concat(diags);
            saveWorkspaceData(data);
            hubCurrentFolder = folderId;
            hubIsFavorites = false;
            renderHubView();
            if (ui.showStatus) {
                ui.showStatus('✓ Added "' + picked.name + '" with ' + diags.length + ' Mermaid diagram' +
                    (diags.length === 1 ? '' : 's'), 3000);
            }
        }

        // Scan a blessed folder over IPC and build hub diagram cards.
        async function scanDiskFolder(folderPath, folderId) {
            var entries = await ipcListDiskFolder(folderPath);
            var diags = [];

            for (var i = 0; i < entries.length; i++) {
                var entry = entries[i];
                try {
                    var text = await ipcReadDiskFile(folderPath, entry.name);
                    var blocks = /\.md|\.markdown$/i.test(entry.name) ? extractMermaidBlocks(text) : [String(text).trim()];
                    blocks = (blocks || []).filter(Boolean);
                    if (blocks.length === 0) continue;

                    diags.push({
                        id: 'disk_' + folderId + '_' + entry.name.replace(/[^A-Za-z0-9_.-]/g, '_'),
                        title: titleFromFilename(entry.name),
                        folderId: folderId,
                        diskPath: folderPath,
                        fileName: entry.name,
                        size: entry.size,
                        mtime: entry.mtime,
                        code: blocks[0],
                        blocks: blocks,
                        typeLabel: detectDiagramType(blocks[0]).label,
                        updatedAt: entry.mtime || Date.now(),
                        starred: false,
                        fromDisk: true
                    });
                } catch (e) {} // Skipped unreadable/escaping file
            }

            return diags;
        }

        // Legacy in-page picker for contexts without the Electron bridge.
        function addDiskFolderFallback() {
            var input = document.createElement('input');
            input.type = 'file';
            input.setAttribute('webkitdirectory', '');
            input.setAttribute('directory', '');
            input.style.display = 'none';

            input.addEventListener('change', function() {
                var files = input.files;
                document.body.removeChild(input);
                if (!files || files.length === 0) return;

                var firstRel = files[0].webkitRelativePath || '';
                var rootName = firstRel.split('/')[0] || 'PC Folder';

                var data = getWorkspaceData();
                var folderId = 'disk_' + rootName.replace(/[^A-Za-z0-9_-]/g, '_') + '_' + Date.now();

                var entries = collectDiagramFiles(files);
                if (entries.length === 0) {
                    ui.showError(mxResources.get('error'),
                        'No Mermaid files found in "' + rootName + '".\n\nAdd .mmd files or .md files containing ```mermaid blocks.',
                        mxResources.get('ok'));
                    return;
                }

                readDiagramFiles(entries, folderId).then(function(diags) {
                    if (diags.length === 0) {
                        ui.showError(mxResources.get('error'),
                            'Found ' + entries.length + ' file(s) in "' + rootName + '" but none contained Mermaid code.',
                            mxResources.get('ok'));
                        return;
                    }
                    data.folders.push({
                        id: folderId,
                        name: rootName,
                        icon: DISK_FOLDER_ICON,
                        kind: DISK_FOLDER_KIND,
                        diskName: rootName,
                        relativePaths: entries.map(function(e) { return e.relPath; }),
                        lastScan: Date.now()
                    });
                    data.diagrams = data.diagrams.concat(diags);
                    if (!data.settings || !data.settings.defaultFolderId) {
                        data.settings = data.settings || {};
                        data.settings.defaultFolderId = 'personal';
                    }
                    saveWorkspaceData(data);
                    hubCurrentFolder = folderId;
                    hubIsFavorites = false;
                    renderHubView();
                    if (ui.showStatus) {
                        ui.showStatus('✓ Added "' + rootName + '" with ' + diags.length + ' Mermaid diagram' +
                            (diags.length === 1 ? '' : 's'), 3000);
                    }
                });
            });

            document.body.appendChild(input);
            input.click();
        }

        // Re-scan a disk folder. In Electron this is fully automatic (the folder
        // stays authorized); otherwise it falls back to re-picking the directory.
        async function refreshDiskFolder(folderId) {
            var data = getWorkspaceData();
            var folder = getFolderById(data, folderId);
            if (!folder || !isDiskFolder(folder)) return;

            if (isElectronHost() && folder.diskPath) {
                var diags;
                try {
                    diags = await scanDiskFolder(folder.diskPath, folderId);
                } catch (e) {
                    if (ui && ui.showError) ui.showError(mxResources.get('error'), 'Could not rescan "' + folder.name + '": ' + (e.message || e), mxResources.get('ok'));
                    return;
                }
                var fresh = getWorkspaceData();
                fresh.diagrams = fresh.diagrams.filter(function(d) { return d.folderId !== folderId; }).concat(diags);
                var f = getFolderById(fresh, folderId);
                if (f) f.lastScan = Date.now();
                saveWorkspaceData(fresh);
                renderHubView();
                if (ui.showStatus) ui.showStatus('✓ Rescanned "' + folder.name + '" — ' + diags.length + ' diagrams', 2500);
                return;
            }

            addDiskFolderFallback();
        }

        // ==========================================
        // 11. DIAGRAMS & FOLDERS WORKSPACE HUB MODAL
        // ==========================================
        function openDiagramsHub() {
            var isDark = isDarkMode();

            if (hubModal != null) {
                hubModal.style.display = 'flex';
                renderHubView();
                return;
            }

            // Create Hub Backdrop
            hubModal = document.createElement('div');
            hubModal.id = 'diagrams-hub-modal';
            hubModal.style.position = 'fixed';
            hubModal.style.inset = '0';
            hubModal.style.background = isDark ? 'rgba(2, 6, 23, 0.75)' : 'rgba(15, 23, 42, 0.55)';
            hubModal.style.backdropFilter = 'blur(6px)';
            hubModal.style.zIndex = '10000';
            hubModal.style.display = 'flex';
            hubModal.style.alignItems = 'center';
            hubModal.style.justifyContent = 'center';
            hubModal.style.fontFamily = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';

            // Hub Box
            var hubBox = document.createElement('div');
            hubBox.id = 'diagrams-hub-box';
            hubBox.style.width = '92vw';
            hubBox.style.height = '88vh';
            hubBox.style.maxWidth = '1420px';
            hubBox.style.maxHeight = '900px';
            hubBox.style.background = isDark ? '#141518' : '#ffffff';
            hubBox.style.color = isDark ? '#f8fafc' : '#0f172a';
            hubBox.style.border = isDark ? '1px solid #2e3035' : '1px solid #e2e8f0';
            hubBox.style.borderRadius = '14px';
            hubBox.style.boxShadow = '0 25px 60px -15px rgba(0, 0, 0, 0.45)';
            hubBox.style.display = 'flex';
            hubBox.style.flexDirection = 'column';
            hubBox.style.overflow = 'hidden';
            hubModal.appendChild(hubBox);

            // Hub Top Header
            var hubHeader = document.createElement('div');
            hubHeader.style.height = '50px';
            hubHeader.style.background = isDark ? '#1a1b1f' : '#f8fafc';
            hubHeader.style.borderBottom = isDark ? '1px solid #2e3035' : '1px solid #e2e8f0';
            hubHeader.style.display = 'flex';
            hubHeader.style.alignItems = 'center';
            hubHeader.style.justifyContent = 'space-between';
            hubHeader.style.padding = '0 18px';
            hubHeader.style.flexShrink = '0';

            var headerTitle = document.createElement('div');
            headerTitle.style.display = 'flex';
            headerTitle.style.alignItems = 'center';
            headerTitle.style.gap = '10px';
            headerTitle.innerHTML = '<span style="font-size:16px;">📁</span><span style="font-size:14px;font-weight:700;">Diagrams & Folders Workspace Hub</span><span style="font-size:11px;background:' + (isDark ? '#2e3035' : '#eff6ff') + ';color:' + (isDark ? '#94a3b8' : '#1d4ed8') + ';padding:2px 8px;border-radius:9999px;font-weight:600;">Workspace Boards</span>';
            hubHeader.appendChild(headerTitle);

            var closeBtn = document.createElement('button');
            closeBtn.innerHTML = '✕';
            closeBtn.style.background = 'transparent';
            closeBtn.style.border = 'none';
            closeBtn.style.color = isDark ? '#94a3b8' : '#64748b';
            closeBtn.style.fontSize = '16px';
            closeBtn.style.cursor = 'pointer';
            closeBtn.style.padding = '4px 8px';
            closeBtn.style.borderRadius = '6px';
            closeBtn.title = 'Close Hub (Esc)';
            closeBtn.onclick = function() { hubModal.style.display = 'none'; };
            hubHeader.appendChild(closeBtn);

            hubBox.appendChild(hubHeader);

            // Split Layout (Left: 240px Navigation, Right: Main Area)
            var hubBody = document.createElement('div');
            hubBody.style.flex = '1';
            hubBody.style.display = 'flex';
            hubBody.style.overflow = 'hidden';

            // 1. Left Sidebar
            var hubSidebar = document.createElement('div');
            hubSidebar.style.width = '240px';
            hubSidebar.style.borderRight = isDark ? '1px solid #2e3035' : '1px solid #e2e8f0';
            hubSidebar.style.background = isDark ? '#18191d' : '#f8fafc';
            hubSidebar.style.display = 'flex';
            hubSidebar.style.flexDirection = 'column';
            hubSidebar.style.padding = '12px 10px';
            hubSidebar.style.boxSizing = 'border-box';
            hubSidebar.style.flexShrink = '0';

            // Real-time Search Bar
            var searchInput = document.createElement('input');
            searchInput.type = 'text';
            searchInput.placeholder = '🔍 Search anything...';
            searchInput.style.width = '100%';
            searchInput.style.boxSizing = 'border-box';
            searchInput.style.padding = '8px 10px';
            searchInput.style.fontSize = '12px';
            searchInput.style.borderRadius = '6px';
            searchInput.style.border = isDark ? '1px solid #3e4149' : '1px solid #cbd5e1';
            searchInput.style.background = isDark ? '#23252a' : '#ffffff';
            searchInput.style.color = isDark ? '#f8fafc' : '#0f172a';
            searchInput.style.outline = 'none';
            searchInput.style.marginBottom = '14px';
            searchInput.oninput = function() {
                hubSearchQuery = searchInput.value.trim();
                renderHubGallery();
            };
            hubSidebar.appendChild(searchInput);

            // Folder & Nav Container
            var navContainer = document.createElement('div');
            navContainer.id = 'hub-nav-container';
            navContainer.style.flex = '1';
            navContainer.style.overflowY = 'auto';
            hubSidebar.appendChild(navContainer);

            hubBody.appendChild(hubSidebar);

            // 2. Right Main Area
            var hubMain = document.createElement('div');
            hubMain.style.flex = '1';
            hubMain.style.display = 'flex';
            hubMain.style.flexDirection = 'column';
            hubMain.style.overflow = 'hidden';
            hubMain.style.background = isDark ? '#141518' : '#ffffff';

            // Main Toolbar & Breadcrumb Bar
            var mainToolbar = document.createElement('div');
            mainToolbar.style.padding = '10px 18px';
            mainToolbar.style.borderBottom = isDark ? '1px solid #2e3035' : '1px solid #e2e8f0';
            mainToolbar.style.display = 'flex';
            mainToolbar.style.alignItems = 'center';
            mainToolbar.style.justifyContent = 'space-between';
            mainToolbar.style.flexShrink = '0';
            mainToolbar.style.flexWrap = 'wrap';
            mainToolbar.style.gap = '10px';

            var breadcrumbEl = document.createElement('div');
            breadcrumbEl.id = 'hub-breadcrumb';
            breadcrumbEl.style.fontSize = '13px';
            breadcrumbEl.style.fontWeight = '700';
            breadcrumbEl.style.color = isDark ? '#f8fafc' : '#0f172a';
            breadcrumbEl.style.display = 'flex';
            breadcrumbEl.style.alignItems = 'center';
            breadcrumbEl.style.gap = '6px';
            mainToolbar.appendChild(breadcrumbEl);

            var mainActions = document.createElement('div');
            mainActions.style.display = 'flex';
            mainActions.style.alignItems = 'center';
            mainActions.style.gap = '8px';

            // "+ New Diagram" button
            var btnNewDiagram = document.createElement('button');
            btnNewDiagram.className = 'hub-btn primary';
            btnNewDiagram.innerHTML = '<span>+</span> New Diagram';
            btnNewDiagram.title = 'Create a new diagram in Code-to-Diagram Studio';
            btnNewDiagram.onclick = function() {
                hubModal.style.display = 'none';
                openUniversalStudio(TEMPLATES.flowchart);
            };
            mainActions.appendChild(btnNewDiagram);

            // "Save Current Canvas Diagram Here" button
            var btnSaveCanvas = document.createElement('button');
            btnSaveCanvas.className = 'hub-btn';
            btnSaveCanvas.innerHTML = '💾 Save Canvas Diagram';
            btnSaveCanvas.title = 'Capture the current Draw.io canvas diagram into the active folder';
            btnSaveCanvas.onclick = function() {
                appPrompt('Save canvas diagram', 'Canvas Diagram ' + (getWorkspaceData().diagrams.length + 1),
                    'The current Draw.io diagram is captured into the selected folder.').then(function(title) {
                    if (!title) return;

                var xml = '';
                try {
                    xml = mxUtils.getXml(ui.editor.getGraphXml());
                } catch (e) {}

                var svgStr = '';
                try {
                    var svgRoot = ui.editor.graph.getSvg('#ffffff', 1, 10, false, null, true);
                    if (svgRoot) {
                        svgStr = resolveLightDarkCss(mxUtils.getXml(svgRoot), 'light');
                    }
                } catch (e) {}
                if (!svgStr && xml) {
                    try {
                        var svgNode = ui.getSvgForXml(xml, 20, 'light');
                        if (svgNode) svgStr = resolveLightDarkCss(mxUtils.getXml(svgNode), 'light');
                    } catch (e) {}
                }

                var code = getSelectedMermaidText() || '';
                var data = getWorkspaceData();
                // Prefer the folder currently open in the hub; otherwise the configured default.
                var targetFolder = (hubCurrentFolder && hubCurrentFolder !== 'all') ? hubCurrentFolder : getDefaultFolderId(data);
                var newDiag = {
                    id: 'diag_' + Date.now(),
                    title: title.trim(),
                    folderId: targetFolder,
                    code: code,
                    xml: xml,
                    typeLabel: code ? detectDiagramType(code).label : 'Draw.io Diagram',
                    svgPreview: svgStr || STARTER_SVGS.flowchart,
                    updatedAt: Date.now(),
                    starred: false
                };
                data.diagrams.unshift(newDiag);
                saveWorkspaceData(data);
                renderHubView();
                if (ui.showStatus) ui.showStatus('✓ Saved canvas diagram to folder', 2500);
                });
            };
            mainActions.appendChild(btnSaveCanvas);

            // "New Folder" button
            var btnNewFolder = document.createElement('button');
            btnNewFolder.className = 'hub-btn';
            btnNewFolder.innerHTML = '📁 New Folder';
            btnNewFolder.title = 'Create a new organized diagram folder';
            btnNewFolder.onclick = function() {
                appPrompt('New folder', '', 'Create an organized folder for your diagrams.').then(function(folderName) {
                    if (!folderName) return;
                    var data = getWorkspaceData();
                    var newId = 'folder_' + Date.now();
                    data.folders.push({
                        id: newId,
                        name: folderName,
                        icon: '📁'
                    });
                    saveWorkspaceData(data);
                    hubCurrentFolder = newId;
                    hubIsFavorites = false;
                    renderHubView();
                });
            };
            mainActions.appendChild(btnNewFolder);

            // Separator
            var sep = document.createElement('div');
            sep.style.width = '1px';
            sep.style.height = '18px';
            sep.style.background = isDark ? '#3e4149' : '#cbd5e1';
            sep.style.margin = '0 4px';
            mainActions.appendChild(sep);

            // Sort Selector
            var sortSelect = document.createElement('select');
            sortSelect.style.padding = '5px 8px';
            sortSelect.style.fontSize = '12px';
            sortSelect.style.borderRadius = '6px';
            sortSelect.style.border = isDark ? '1px solid #3e4149' : '1px solid #cbd5e1';
            sortSelect.style.background = isDark ? '#23252a' : '#ffffff';
            sortSelect.style.color = isDark ? '#f8fafc' : '#0f172a';
            sortSelect.style.cursor = 'pointer';
            sortSelect.innerHTML = '<option value="updated">Last modified</option><option value="title">Alphabetical</option>';
            sortSelect.onchange = function() {
                hubSortMode = sortSelect.value;
                renderHubGallery();
            };
            mainActions.appendChild(sortSelect);

            // View Mode Toggle (Grid vs List)
            var viewToggleContainer = document.createElement('div');
            viewToggleContainer.style.display = 'inline-flex';
            viewToggleContainer.style.border = isDark ? '1px solid #3e4149' : '1px solid #cbd5e1';
            viewToggleContainer.style.borderRadius = '6px';
            viewToggleContainer.style.overflow = 'hidden';

            var btnGrid = document.createElement('button');
            btnGrid.innerHTML = '⊞';
            btnGrid.title = 'Grid View';
            btnGrid.style.border = 'none';
            btnGrid.style.padding = '5px 9px';
            btnGrid.style.fontSize = '13px';
            btnGrid.style.cursor = 'pointer';
            btnGrid.style.background = (hubViewMode === 'grid') ? (isDark ? '#3b82f6' : '#eff6ff') : 'transparent';
            btnGrid.style.color = (hubViewMode === 'grid') ? (isDark ? '#ffffff' : '#1d4ed8') : 'inherit';

            var btnList = document.createElement('button');
            btnList.innerHTML = '☰';
            btnList.title = 'List View';
            btnList.style.border = 'none';
            btnList.style.padding = '5px 9px';
            btnList.style.fontSize = '13px';
            btnList.style.cursor = 'pointer';
            btnList.style.background = (hubViewMode === 'list') ? (isDark ? '#3b82f6' : '#eff6ff') : 'transparent';
            btnList.style.color = (hubViewMode === 'list') ? (isDark ? '#ffffff' : '#1d4ed8') : 'inherit';

            btnGrid.onclick = function() {
                hubViewMode = 'grid';
                btnGrid.style.background = isDark ? '#3b82f6' : '#eff6ff';
                btnGrid.style.color = isDark ? '#ffffff' : '#1d4ed8';
                btnList.style.background = 'transparent';
                btnList.style.color = 'inherit';
                renderHubGallery();
            };

            btnList.onclick = function() {
                hubViewMode = 'list';
                btnList.style.background = isDark ? '#3b82f6' : '#eff6ff';
                btnList.style.color = isDark ? '#ffffff' : '#1d4ed8';
                btnGrid.style.background = 'transparent';
                btnGrid.style.color = 'inherit';
                renderHubGallery();
            };

            viewToggleContainer.appendChild(btnGrid);
            viewToggleContainer.appendChild(btnList);
            mainActions.appendChild(viewToggleContainer);

            mainToolbar.appendChild(mainActions);
            hubMain.appendChild(mainToolbar);

            // Gallery Container (Scrollable)
            var galleryContainer = document.createElement('div');
            galleryContainer.id = 'hub-gallery-container';
            galleryContainer.style.flex = '1';
            galleryContainer.style.overflowY = 'auto';
            galleryContainer.style.padding = '18px';
            galleryContainer.style.boxSizing = 'border-box';
            hubMain.appendChild(galleryContainer);

            hubBody.appendChild(hubMain);
            hubBox.appendChild(hubBody);

            document.body.appendChild(hubModal);

            renderHubView();
        }

        function renderHubView() {
            var data = getWorkspaceData();
            var isDark = isDarkMode();
            var navContainer = document.getElementById('hub-nav-container');
            if (!navContainer) return;
            navContainer.innerHTML = '';

            // Section: Your Space
            var secTitle1 = document.createElement('div');
            secTitle1.style.fontSize = '11px';
            secTitle1.style.fontWeight = '700';
            secTitle1.style.color = isDark ? '#64748b' : '#94a3b8';
            secTitle1.style.letterSpacing = '0.06em';
            secTitle1.style.marginBottom = '6px';
            secTitle1.style.padding = '0 4px';
            secTitle1.textContent = 'YOUR SPACE';
            navContainer.appendChild(secTitle1);

            // Item: Dashboard (All Diagrams)
            var itemAll = document.createElement('div');
            itemAll.className = 'hub-nav-item' + (!hubIsFavorites && hubCurrentFolder === 'all' ? ' active' : '');
            itemAll.innerHTML = '<span>🏠 Dashboard</span><span style="font-size:11px;opacity:0.75;">' + data.diagrams.length + '</span>';
            itemAll.onclick = function() {
                hubCurrentFolder = 'all';
                hubIsFavorites = false;
                renderHubView();
            };
            navContainer.appendChild(itemAll);

            // Item: Favorites
            var favCount = data.diagrams.filter(function(d) { return d.starred; }).length;
            var itemFav = document.createElement('div');
            itemFav.className = 'hub-nav-item' + (hubIsFavorites ? ' active' : '');
            itemFav.innerHTML = '<span>⭐ Favorites</span><span style="font-size:11px;opacity:0.75;">' + favCount + '</span>';
            itemFav.onclick = function() {
                hubIsFavorites = true;
                renderHubView();
            };
            navContainer.appendChild(itemFav);

            // Section: Folders
            var folderHeader = document.createElement('div');
            folderHeader.style.display = 'flex';
            folderHeader.style.alignItems = 'center';
            folderHeader.style.justifyContent = 'space-between';
            folderHeader.style.marginTop = '18px';
            folderHeader.style.marginBottom = '6px';
            folderHeader.style.padding = '0 4px';

            var secTitle2 = document.createElement('div');
            secTitle2.style.fontSize = '11px';
            secTitle2.style.fontWeight = '700';
            secTitle2.style.color = isDark ? '#64748b' : '#94a3b8';
            secTitle2.style.letterSpacing = '0.06em';
            secTitle2.textContent = 'FOLDERS';
            folderHeader.appendChild(secTitle2);

            var addFolderBtn = document.createElement('button');
            addFolderBtn.textContent = '+';
            addFolderBtn.title = 'Add New Folder';
            addFolderBtn.style.border = 'none';
            addFolderBtn.style.background = 'transparent';
            addFolderBtn.style.color = isDark ? '#94a3b8' : '#64748b';
            addFolderBtn.style.fontSize = '16px';
            addFolderBtn.style.cursor = 'pointer';
            addFolderBtn.style.padding = '0 4px';
            addFolderBtn.onclick = function(e) {
                e.stopPropagation();
                appPrompt('New folder', '', 'Create an organized folder for your diagrams.').then(function(fName) {
                    if (!fName) return;
                    var nId = 'folder_' + Date.now();
                    data.folders.push({ id: nId, name: fName, icon: '📁' });
                    saveWorkspaceData(data);
                    hubCurrentFolder = nId;
                    hubIsFavorites = false;
                    renderHubView();
                });
            };

            var folderHeaderActions = document.createElement('div');
            folderHeaderActions.style.display = 'flex';
            folderHeaderActions.style.alignItems = 'center';
            folderHeaderActions.style.gap = '2px';

            var addDiskBtn = document.createElement('button');
            addDiskBtn.textContent = '🖿';
            addDiskBtn.title = 'Add a folder from this PC (.mmd / .md Mermaid files)';
            addDiskBtn.style.border = 'none';
            addDiskBtn.style.background = 'transparent';
            addDiskBtn.style.color = isDark ? '#94a3b8' : '#64748b';
            addDiskBtn.style.fontSize = '14px';
            addDiskBtn.style.cursor = 'pointer';
            addDiskBtn.style.padding = '0 4px';
            addDiskBtn.onclick = function(e) {
                e.stopPropagation();
                addDiskFolder();
            };
            folderHeaderActions.appendChild(addDiskBtn);
            folderHeaderActions.appendChild(addFolderBtn);
            folderHeader.appendChild(folderHeaderActions);
            navContainer.appendChild(folderHeader);

            // Folders List
            data.folders.forEach(function(folder) {
                if (folder.id === 'all') return;
                var fCount = data.diagrams.filter(function(d) { return d.folderId === folder.id; }).length;
                var fItem = document.createElement('div');
                fItem.className = 'hub-nav-item' + (!hubIsFavorites && hubCurrentFolder === folder.id ? ' active' : '');

                var fLabel = document.createElement('span');
                fLabel.style.display = 'flex';
                fLabel.style.alignItems = 'center';
                fLabel.style.gap = '6px';
                fLabel.style.overflow = 'hidden';
                fLabel.style.textOverflow = 'ellipsis';
                fLabel.style.whiteSpace = 'nowrap';
                fLabel.innerHTML = (folder.icon || '📁') + ' ' + escapeHtml(folder.name);
                fItem.appendChild(fLabel);

                var fRight = document.createElement('div');
                fRight.style.display = 'flex';
                fRight.style.alignItems = 'center';
                fRight.style.gap = '6px';

                var badge = document.createElement('span');
                badge.style.fontSize = '11px';
                badge.style.opacity = '0.75';
                badge.textContent = fCount;
                fRight.appendChild(badge);

                if (!folder.system) {
                    if (isDiskFolder(folder)) {
                        var scanBtn = document.createElement('span');
                        scanBtn.innerHTML = '⟳';
                        scanBtn.title = 'Rescan this PC folder for changed .mmd / .md files';
                        scanBtn.style.fontSize = '13px';
                        scanBtn.style.cursor = 'pointer';
                        scanBtn.style.opacity = '0.7';
                        scanBtn.onclick = function(ev) {
                            ev.stopPropagation();
                            refreshDiskFolder(folder.id);
                        };
                        fRight.appendChild(scanBtn);
                    }
                    var delBtn = document.createElement('span');
                    delBtn.innerHTML = '×';
                    delBtn.title = 'Delete folder';
                    delBtn.style.fontSize = '14px';
                    delBtn.style.cursor = 'pointer';
                    delBtn.style.opacity = '0.6';
                    delBtn.onclick = function(ev) {
                        ev.stopPropagation();
                        appConfirm('Delete folder', isDiskFolder(folder)
                            ? 'Remove "' + folder.name + '" from the hub? The files on disk are NOT deleted.'
                            : 'Delete folder "' + folder.name + '"? Diagrams inside it will be moved to Personal.').then(function(ok) {
                            if (!ok) return;
                            data.folders = data.folders.filter(function(f) { return f.id !== folder.id; });
                            if (isDiskFolder(folder)) {
                                data.diagrams = data.diagrams.filter(function(d) { return d.folderId !== folder.id; });
                            } else {
                                data.diagrams.forEach(function(d) { if (d.folderId === folder.id) d.folderId = 'personal'; });
                            }
                            if (data.settings && data.settings.defaultFolderId === folder.id) data.settings.defaultFolderId = 'personal';
                            saveWorkspaceData(data);
                            if (hubCurrentFolder === folder.id) hubCurrentFolder = 'all';
                            renderHubView();
                        });
                    };
                    fRight.appendChild(delBtn);
                }

                fItem.appendChild(fRight);

                fItem.onclick = function() {
                    hubCurrentFolder = folder.id;
                    hubIsFavorites = false;
                    renderHubView();
                };
                navContainer.appendChild(fItem);
            });

            // Section: Default save location
            var defSec = document.createElement('div');
            defSec.style.marginTop = '18px';
            defSec.style.padding = '10px 8px 0';
            defSec.style.borderTop = '1px solid ' + (isDark ? '#2e3035' : '#e2e8f0');

            var defLabel = document.createElement('div');
            defLabel.style.fontSize = '11px';
            defLabel.style.fontWeight = '700';
            defLabel.style.letterSpacing = '0.06em';
            defLabel.style.color = isDark ? '#64748b' : '#94a3b8';
            defLabel.style.marginBottom = '6px';
            defLabel.textContent = '⚙ DEFAULT SAVE FOLDER';
            defSec.appendChild(defLabel);

            var defSelect = document.createElement('select');
            defSelect.style.width = '100%';
            defSelect.style.padding = '6px 8px';
            defSelect.style.fontSize = '12px';
            defSelect.style.borderRadius = '6px';
            defSelect.style.cursor = 'pointer';
            defSelect.style.border = isDark ? '1px solid #3e4149' : '1px solid #cbd5e1';
            defSelect.style.background = isDark ? '#23252a' : '#ffffff';
            defSelect.style.color = isDark ? '#f8fafc' : '#0f172a';
            var currentDefault = getDefaultFolderId(data);
            data.folders.forEach(function(f) {
                if (f.id === 'all') return;
                var opt = document.createElement('option');
                opt.value = f.id;
                opt.textContent = (f.kind === DISK_FOLDER_KIND ? DISK_FOLDER_ICON + ' ' : '📁 ') + f.name;
                if (f.id === currentDefault) opt.selected = true;
                defSelect.appendChild(opt);
            });
            defSelect.onchange = function() {
                var fresh = getWorkspaceData();
                fresh.settings = fresh.settings || {};
                fresh.settings.defaultFolderId = defSelect.value;
                saveWorkspaceData(fresh);
                if (ui.showStatus) ui.showStatus('✓ Default save folder updated', 2000);
            };
            defSec.appendChild(defSelect);
            navContainer.appendChild(defSec);

            // Update Breadcrumb
            var bcEl = document.getElementById('hub-breadcrumb');
            if (bcEl) {
                if (hubIsFavorites) {
                    bcEl.innerHTML = '<span style="color:#64748b;">Dashboard /</span> ⭐ Favorites';
                } else if (hubCurrentFolder === 'all') {
                    bcEl.innerHTML = '<span style="color:#64748b;">Dashboard /</span> 🏠 All Diagrams';
                } else {
                    var curF = data.folders.find(function(f) { return f.id === hubCurrentFolder; });
                    var fName = curF ? curF.name : 'Folder';
                    bcEl.innerHTML = '<span style="color:#64748b;">Folders /</span> 📁 ' + escapeHtml(fName);
                }
            }

            renderHubGallery();
        }

        function renderHubGallery() {
            var data = getWorkspaceData();
            var isDark = isDarkMode();
            var gallery = document.getElementById('hub-gallery-container');
            if (!gallery) return;
            gallery.innerHTML = '';

            // Filter diagrams
            var list = data.diagrams.filter(function(d) {
                if (hubIsFavorites && !d.starred) return false;
                if (!hubIsFavorites && hubCurrentFolder !== 'all' && d.folderId !== hubCurrentFolder) return false;
                if (hubSearchQuery) {
                    var q = hubSearchQuery.toLowerCase();
                    var matchTitle = d.title && d.title.toLowerCase().indexOf(q) !== -1;
                    var matchType = d.typeLabel && d.typeLabel.toLowerCase().indexOf(q) !== -1;
                    var matchCode = d.code && d.code.toLowerCase().indexOf(q) !== -1;
                    if (!matchTitle && !matchType && !matchCode) return false;
                }
                return true;
            });

            // Sort diagrams
            if (hubSortMode === 'title') {
                list.sort(function(a, b) { return (a.title || '').localeCompare(b.title || ''); });
            } else {
                list.sort(function(a, b) { return (b.updatedAt || 0) - (a.updatedAt || 0); });
            }

            // Empty state
            if (list.length === 0) {
                var emptyBox = document.createElement('div');
                emptyBox.style.padding = '60px 20px';
                emptyBox.style.textAlign = 'center';
                emptyBox.style.color = isDark ? '#94a3b8' : '#64748b';
                emptyBox.innerHTML = '<div style="font-size:42px;margin-bottom:12px;">📂</div>' +
                    '<div style="font-size:16px;font-weight:700;color:' + (isDark ? '#f8fafc' : '#0f172a') + ';margin-bottom:6px;">No Diagrams in this view</div>' +
                    '<div style="font-size:13px;max-width:380px;margin:0 auto 18px auto;">Paste code in Studio or click "Save Canvas Diagram" above to store your visual boards here.</div>';

                var emptyBtn = document.createElement('button');
                emptyBtn.className = 'hub-btn primary';
                emptyBtn.textContent = '+ Create Diagram in Studio';
                emptyBtn.onclick = function() {
                    hubModal.style.display = 'none';
                    openUniversalStudio(TEMPLATES.flowchart);
                };
                emptyBox.appendChild(emptyBtn);
                gallery.appendChild(emptyBox);
                return;
            }

            // Grid View
            if (hubViewMode === 'grid') {
                var grid = document.createElement('div');
                grid.style.display = 'grid';
                grid.style.gridTemplateColumns = 'repeat(auto-fill, minmax(285px, 1fr))';
                grid.style.gap = '18px';

                list.forEach(function(d) {
                    var card = document.createElement('div');
                    card.className = 'hub-card';

                    // SVG Preview Box
                    var previewBox = document.createElement('div');
                    previewBox.style.height = '170px';
                    previewBox.style.background = isDark ? '#18191c' : '#ffffff';
                    previewBox.style.backgroundImage = isDark ? 'radial-gradient(#2d3039 1.2px, transparent 1.2px)' : 'radial-gradient(#e2e8f0 1.2px, transparent 1.2px)';
                    previewBox.style.backgroundSize = '14px 14px';
                    previewBox.style.borderBottom = isDark ? '1px solid #2e3035' : '1px solid #e2e8f0';
                    previewBox.style.position = 'relative';
                    previewBox.style.overflow = 'hidden';
                    previewBox.style.display = 'flex';
                    previewBox.style.alignItems = 'center';
                    previewBox.style.justifyContent = 'center';
                    previewBox.style.padding = '8px';
                    previewBox.style.boxSizing = 'border-box';
                    previewBox.style.cursor = 'pointer';

                    // Insert SVG preview content
                    var svgContent = d.svgPreview || STARTER_SVGS.flowchart;
                    var svgWrapper = document.createElement('div');
                    svgWrapper.style.width = '100%';
                    svgWrapper.style.height = '100%';
                    svgWrapper.style.display = 'flex';
                    svgWrapper.style.alignItems = 'center';
                    svgWrapper.style.justifyContent = 'center';
                    svgWrapper.style.pointerEvents = 'none';
                    svgWrapper.innerHTML = svgContent;
                    previewBox.appendChild(svgWrapper);

                    // Favorite Star Toggle
                    var starBtn = document.createElement('button');
                    starBtn.innerHTML = d.starred ? '⭐' : '☆';
                    starBtn.title = d.starred ? 'Favorited' : 'Add to Favorites';
                    starBtn.style.position = 'absolute';
                    starBtn.style.top = '8px';
                    starBtn.style.right = '8px';
                    starBtn.style.background = isDark ? 'rgba(30, 31, 35, 0.85)' : 'rgba(255, 255, 255, 0.85)';
                    starBtn.style.border = isDark ? '1px solid #3e4149' : '1px solid #cbd5e1';
                    starBtn.style.borderRadius = '6px';
                    starBtn.style.width = '28px';
                    starBtn.style.height = '28px';
                    starBtn.style.display = 'flex';
                    starBtn.style.alignItems = 'center';
                    starBtn.style.justifyContent = 'center';
                    starBtn.style.cursor = 'pointer';
                    starBtn.style.fontSize = '14px';
                    starBtn.onclick = function(ev) {
                        ev.stopPropagation();
                        d.starred = !d.starred;
                        saveWorkspaceData(data);
                        renderHubView();
                    };
                    previewBox.appendChild(starBtn);

                    // Clicking preview opens on canvas
                    previewBox.onclick = function() {
                        openDiagramOnCanvas(d);
                    };

                    card.appendChild(previewBox);

                    // Card Meta Body
                    var metaBody = document.createElement('div');
                    metaBody.style.padding = '12px 14px';
                    metaBody.style.display = 'flex';
                    metaBody.style.flexDirection = 'column';
                    metaBody.style.gap = '8px';

                    var titleRow = document.createElement('div');
                    titleRow.style.fontSize = '13px';
                    titleRow.style.fontWeight = '700';
                    titleRow.style.color = isDark ? '#f8fafc' : '#0f172a';
                    titleRow.style.whiteSpace = 'nowrap';
                    titleRow.style.overflow = 'hidden';
                    titleRow.style.textOverflow = 'ellipsis';
                    titleRow.textContent = d.title || 'Untitled Diagram';
                    titleRow.title = d.title;
                    metaBody.appendChild(titleRow);

                    var badgeRow = document.createElement('div');
                    badgeRow.style.display = 'flex';
                    badgeRow.style.alignItems = 'center';
                    badgeRow.style.justifyContent = 'space-between';
                    badgeRow.innerHTML = '<span style="background:' + (isDark ? '#1e293b' : '#eff6ff') + ';color:' + (isDark ? '#60a5fa' : '#1d4ed8') + ';border:1px solid ' + (isDark ? '#3b82f6' : '#bfdbfe') + ';border-radius:9999px;padding:2px 8px;font-size:10px;font-weight:600;">' + escapeHtml(d.typeLabel || 'Diagram') + '</span>' +
                        '<span style="color:#64748b;font-size:11px;">' + timeAgo(d.updatedAt) + '</span>';
                    metaBody.appendChild(badgeRow);

                    // Folder Selector Dropdown
                    var folderSelect = document.createElement('select');
                    folderSelect.style.width = '100%';
                    folderSelect.style.boxSizing = 'border-box';
                    folderSelect.style.padding = '4px 6px';
                    folderSelect.style.fontSize = '11px';
                    folderSelect.style.borderRadius = '5px';
                    folderSelect.style.border = isDark ? '1px solid #3e4149' : '1px solid #cbd5e1';
                    folderSelect.style.background = isDark ? '#1e1f23' : '#f8fafc';
                    folderSelect.style.color = isDark ? '#cbd5e1' : '#334155';
                    folderSelect.style.cursor = 'pointer';

                    data.folders.forEach(function(f) {
                        if (f.id === 'all') return;
                        var opt = document.createElement('option');
                        opt.value = f.id;
                        opt.textContent = 'Folder: ' + f.name;
                        if (f.id === d.folderId) opt.selected = true;
                        folderSelect.appendChild(opt);
                    });

                    folderSelect.onchange = function() {
                        d.folderId = folderSelect.value;
                        d.updatedAt = Date.now();
                        saveWorkspaceData(data);
                        renderHubView();
                    };
                    metaBody.appendChild(folderSelect);

                    // Actions Bar
                    var actionsBar = document.createElement('div');
                    actionsBar.style.display = 'flex';
                    actionsBar.style.alignItems = 'center';
                    actionsBar.style.gap = '6px';
                    actionsBar.style.marginTop = '4px';

                    var btnOpen = document.createElement('button');
                    btnOpen.className = 'hub-btn primary';
                    btnOpen.style.flex = '1';
                    btnOpen.style.justifyContent = 'center';
                    btnOpen.style.padding = '5px 8px';
                    btnOpen.style.fontSize = '11px';
                    btnOpen.textContent = 'Open on Canvas';
                    btnOpen.onclick = function() {
                        openDiagramOnCanvas(d);
                    };
                    actionsBar.appendChild(btnOpen);

                    var btnEdit = document.createElement('button');
                    btnEdit.className = 'hub-btn';
                    btnEdit.style.padding = '5px 8px';
                    btnEdit.style.fontSize = '11px';
                    btnEdit.textContent = 'Edit in Studio';
                    btnEdit.onclick = function() {
                        hubModal.style.display = 'none';
                        openUniversalStudio(d.code || TEMPLATES.flowchart);
                    };
                    actionsBar.appendChild(btnEdit);

                    var btnDel = document.createElement('button');
                    btnDel.className = 'hub-btn';
                    btnDel.style.padding = '5px 7px';
                    btnDel.style.fontSize = '11px';
                    btnDel.style.color = '#ef4444';
                    btnDel.innerHTML = '🗑️';
                    btnDel.title = 'Delete Diagram';
                    btnDel.onclick = function() {
                        appConfirm('Delete diagram', 'Delete "' + d.title + '" from the workspace? This cannot be undone.').then(function(ok) {
                            if (!ok) return;
                            data.diagrams = data.diagrams.filter(function(item) { return item.id !== d.id; });
                            saveWorkspaceData(data);
                            renderHubView();
                        });
                    };
                    actionsBar.appendChild(btnDel);

                    metaBody.appendChild(actionsBar);
                    card.appendChild(metaBody);
                    grid.appendChild(card);
                });

                gallery.appendChild(grid);
            } else {
                // List View
                var table = document.createElement('table');
                table.style.width = '100%';
                table.style.borderCollapse = 'collapse';
                table.style.fontSize = '12px';

                table.innerHTML = '<thead style="border-bottom:1px solid ' + (isDark ? '#2e3035' : '#e2e8f0') + ';color:' + (isDark ? '#94a3b8' : '#64748b') + ';text-align:left;">' +
                    '<tr><th style="padding:8px;">Preview</th><th style="padding:8px;">Title & Type</th><th style="padding:8px;">Folder</th><th style="padding:8px;">Modified</th><th style="padding:8px;text-align:right;">Actions</th></tr></thead>' +
                    '<tbody></tbody>';

                var tbody = table.querySelector('tbody');

                list.forEach(function(d) {
                    var tr = document.createElement('tr');
                    tr.style.borderBottom = isDark ? '1px solid #23252a' : '1px solid #f1f5f9';

                    var tdThumb = document.createElement('td');
                    tdThumb.style.padding = '8px';
                    tdThumb.style.width = '64px';
                    var miniPreview = document.createElement('div');
                    miniPreview.style.width = '56px';
                    miniPreview.style.height = '42px';
                    miniPreview.style.borderRadius = '4px';
                    miniPreview.style.overflow = 'hidden';
                    miniPreview.style.background = '#ffffff';
                    miniPreview.style.border = '1px solid #cbd5e1';
                    miniPreview.style.display = 'flex';
                    miniPreview.style.alignItems = 'center';
                    miniPreview.style.justifyContent = 'center';
                    miniPreview.style.cursor = 'pointer';
                    miniPreview.innerHTML = d.svgPreview || STARTER_SVGS.flowchart;
                    miniPreview.onclick = function() { openDiagramOnCanvas(d); };
                    tdThumb.appendChild(miniPreview);
                    tr.appendChild(tdThumb);

                    var tdTitle = document.createElement('td');
                    tdTitle.style.padding = '8px';
                    tdTitle.innerHTML = '<div style="font-weight:700;color:' + (isDark ? '#f8fafc' : '#0f172a') + ';">' + escapeHtml(d.title) + '</div>' +
                        '<div style="font-size:11px;color:' + (isDark ? '#60a5fa' : '#2563eb') + ';margin-top:2px;">' + escapeHtml(d.typeLabel || 'Diagram') + '</div>';
                    tr.appendChild(tdTitle);

                    var tdFolder = document.createElement('td');
                    tdFolder.style.padding = '8px';
                    var fObj = data.folders.find(function(f) { return f.id === d.folderId; });
                    tdFolder.textContent = fObj ? fObj.name : 'Personal';
                    tr.appendChild(tdFolder);

                    var tdTime = document.createElement('td');
                    tdTime.style.padding = '8px';
                    tdTime.style.color = '#64748b';
                    tdTime.textContent = timeAgo(d.updatedAt);
                    tr.appendChild(tdTime);

                    var tdActions = document.createElement('td');
                    tdActions.style.padding = '8px';
                    tdActions.style.textAlign = 'right';
                    tdActions.innerHTML = '<button class="hub-btn primary" style="padding:4px 8px;font-size:11px;margin-right:6px;">Open</button>' +
                        '<button class="hub-btn" style="padding:4px 8px;font-size:11px;margin-right:6px;">Studio</button>' +
                        '<button class="hub-btn" style="padding:4px 6px;font-size:11px;color:#ef4444;">🗑️</button>';

                    var btns = tdActions.querySelectorAll('button');
                    btns[0].onclick = function() { openDiagramOnCanvas(d); };
                    btns[1].onclick = function() {
                        hubModal.style.display = 'none';
                        openUniversalStudio(d.code || TEMPLATES.flowchart);
                    };
                    btns[2].onclick = function() {
                        appConfirm('Delete diagram', 'Delete "' + d.title + '" from the workspace? This cannot be undone.').then(function(ok) {
                            if (!ok) return;
                            data.diagrams = data.diagrams.filter(function(item) { return item.id !== d.id; });
                            saveWorkspaceData(data);
                            renderHubView();
                        });
                    };
                    tr.appendChild(tdActions);

                    tbody.appendChild(tr);
                });

                gallery.appendChild(table);
            }
        }

        function openDiagramOnCanvas(d) {
            hubModal.style.display = 'none';
            if (d.xml) {
                graph.getModel().beginUpdate();
                try {
                    var pt = graph.getFreeInsertPoint();
                    var cells = ui.importXml(d.xml, Math.max(20, pt.x), Math.max(20, pt.y), true);
                    graph.setSelectionCells(cells);
                } finally {
                    graph.getModel().endUpdate();
                }
                if (ui.showStatus) ui.showStatus('✓ Loaded diagram onto canvas', 2500);
                return;
            }

            if (d.code) {
                var detected = detectDiagramType(d.code);
                if (detected.id === 'radar') {
                    insertSvgAsImageCell(renderRadarSvg(d.code, false));
                    return;
                }
                if (detected.id === 'infographic') {
                    insertSvgAsImageCell(renderInfographicSvg(d.code, false));
                    return;
                }
                applyMermaidToCanvas(d.code);
                return;
            }

            if (d.svgPreview) {
                insertSvgAsImageCell(d.svgPreview);
            }
        }

        // ==========================================
        // 12. UNIVERSAL CODE-TO-DIAGRAM STUDIO MODAL
        // ==========================================
        function updateTransform() {
            if (previewInner) {
                previewInner.style.transform = 'translate(' + panOffsetX + 'px, ' + panOffsetY + 'px) scale(' + zoomLevel + ')';
            }
        }

        function setStatus(isOk, message) {
            if (!statusBar) return;
            if (isOk) {
                statusBar.innerHTML = '<span style="color:#10b981;font-weight:600;display:flex;align-items:center;gap:6px;">✓ ' + escapeHtml(message) + '</span>';
                if (quickFixBtn) quickFixBtn.style.display = 'none';
            } else {
                statusBar.innerHTML = '<span style="color:#f87171;font-weight:500;display:flex;align-items:center;gap:6px;">⚠ ' + escapeHtml(message) + '</span>';
                if (quickFixBtn) quickFixBtn.style.display = 'inline-flex';
            }
        }

        function renderCurrentCode() {
            if (!codeEditor) return;
            var raw = codeEditor.value;
            var trimmed = raw.trim();

            if (!trimmed) {
                currentDetectedType = { id: 'empty', label: 'Waiting for Code...' };
                if (autoDetectBadge) autoDetectBadge.textContent = 'Auto-Detected: Waiting for Code...';
                if (previewInner) previewInner.innerHTML = '<div style="color:#64748b;font-size:14px;text-align:center;padding:40px;">Paste or type diagram code on the left to auto-detect and render preview.</div>';
                setStatus(true, 'Ready');
                return;
            }

            // Auto-detect type
            var detected = detectDiagramType(raw);
            currentDetectedType = detected;
            if (autoDetectBadge) {
                autoDetectBadge.textContent = 'Auto-Detected: ' + detected.label;
            }

            // If markdown outline, convert on the fly for rendering
            var codeToRender = raw;
            if (detected.id === 'markdown-outline') {
                codeToRender = markdownToMindmap(raw);
            }

            // Active preview theme
            var previewTheme = (bgMode === 1) ? 'dark' : 'light';

            // Engine A: Radar / Spider
            if (detected.id === 'radar') {
                try {
                    var radarSvg = renderRadarSvg(codeToRender, bgMode === 1);
                    currentRenderedSvg = radarSvg;
                    currentRenderedXml = '';
                    if (previewInner) previewInner.innerHTML = radarSvg;
                    setStatus(true, 'Rendered high-precision Radar / Spider web chart');
                } catch (e) {
                    setStatus(false, 'Radar parse error: ' + (e.message || e));
                }
                return;
            }

            // Engine B: Infographic DSL
            if (detected.id === 'infographic') {
                try {
                    var infoSvg = renderInfographicSvg(codeToRender, bgMode === 1);
                    currentRenderedSvg = infoSvg;
                    currentRenderedXml = '';
                    if (previewInner) previewInner.innerHTML = infoSvg;
                    setStatus(true, 'Rendered publication-grade Infographic card');
                } catch (e) {
                    setStatus(false, 'Infographic parse error: ' + (e.message || e));
                }
                return;
            }

            // Engine C: PlantUML
            if (detected.id === 'plantuml') {
                if (typeof ui.parsePlantUmlDiagram === 'function') {
                    ui.parsePlantUmlDiagram(codeToRender, null, function(xml) {
                        currentRenderedXml = xml;
                        try {
                            var svgNode = ui.getSvgForXml(xml, 20, previewTheme);
                            if (svgNode) {
                                svgNode.style.colorScheme = previewTheme;
                                var rawSvgP = mxUtils.getXml(svgNode);
                                var resolvedSvgP = resolveLightDarkCss(rawSvgP, previewTheme);
                                currentRenderedSvg = resolvedSvgP;
                                if (previewInner) {
                                    previewInner.innerHTML = resolvedSvgP;
                                }
                                setStatus(true, 'Rendered PlantUML diagram');
                                return;
                            }
                        } catch (e) {}
                        setStatus(false, 'PlantUML SVG conversion failed');
                    }, function(err) {
                        setStatus(false, 'PlantUML syntax error: ' + (err ? (err.message || err) : 'Check syntax'));
                    });
                } else {
                    setStatus(false, 'PlantUML engine not available in this build');
                }
                return;
            }

            // Engine D: All Mermaid Diagrams (Requirement 5 Contrast Fix)
            if (typeof ui.parseMermaidDiagram === 'function') {
                ui.parseMermaidDiagram(codeToRender, null, function(xml) {
                    currentRenderedXml = xml;
                    try {
                        var svgNode = ui.getSvgForXml(xml, 20, previewTheme);
                        if (svgNode) {
                            svgNode.style.colorScheme = previewTheme;
                            var rawSvgM = mxUtils.getXml(svgNode);
                            var resolvedSvgM = resolveLightDarkCss(rawSvgM, previewTheme);
                            currentRenderedSvg = resolvedSvgM;
                            if (previewInner) {
                                previewInner.innerHTML = resolvedSvgM;
                            }
                            setStatus(true, 'Rendered ' + detected.label + ' successfully');
                            return;
                        }
                    } catch (e) {
                        console.warn('SVG render error:', e);
                    }
                    setStatus(false, 'Could not produce SVG from diagram XML');
                }, function(err) {
                    var msg = err ? (err.message || String(err)) : 'Syntax error in Mermaid code';
                    setStatus(false, msg);
                });
                return;
            }

            setStatus(false, 'Draw.io Mermaid parser is initializing, please wait...');
        }

        function triggerDebouncedRender() {
            if (renderDebounceTimer) clearTimeout(renderDebounceTimer);
            renderDebounceTimer = setTimeout(renderCurrentCode, 250);
        }

        function openUniversalStudio(initialCode) {
            var isDark = isDarkMode();

            if (studioModal != null) {
                studioModal.style.display = 'flex';
                if (initialCode && codeEditor) {
                    codeEditor.value = initialCode;
                    renderCurrentCode();
                }
                return;
            }

            // Create Backdrop Modal Overlay
            studioModal = document.createElement('div');
            studioModal.id = 'universal-studio-modal';
            studioModal.style.position = 'fixed';
            studioModal.style.inset = '0';
            studioModal.style.background = isDark ? 'rgba(2, 6, 23, 0.75)' : 'rgba(15, 23, 42, 0.55)';
            studioModal.style.backdropFilter = 'blur(6px)';
            studioModal.style.zIndex = '10000';
            studioModal.style.display = 'flex';
            studioModal.style.alignItems = 'center';
            studioModal.style.justifyContent = 'center';
            studioModal.style.fontFamily = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';

            // Studio Window Box (Requirement 5 Native Light/Dark UI)
            studioBoxEl = document.createElement('div');
            studioBoxEl.id = 'universal-studio-box';
            studioBoxEl.style.width = '94vw';
            studioBoxEl.style.height = '90vh';
            studioBoxEl.style.maxWidth = '1400px';
            studioBoxEl.style.maxHeight = '900px';
            studioBoxEl.style.background = isDark ? '#0f172a' : '#ffffff';
            studioBoxEl.style.color = isDark ? '#f8fafc' : '#0f172a';
            studioBoxEl.style.border = isDark ? '1px solid #334155' : '1px solid #cbd5e1';
            studioBoxEl.style.borderRadius = '16px';
            studioBoxEl.style.boxShadow = '0 25px 60px -15px rgba(0, 0, 0, 0.45)';
            studioBoxEl.style.display = 'flex';
            studioBoxEl.style.flexDirection = 'column';
            studioBoxEl.style.overflow = 'hidden';
            studioModal.appendChild(studioBoxEl);

            // A. Header Bar
            var header = document.createElement('div');
            header.style.height = '48px';
            header.style.background = isDark ? '#0b1120' : '#f8fafc';
            header.style.borderBottom = isDark ? '1px solid #1e293b' : '1px solid #e2e8f0';
            header.style.display = 'flex';
            header.style.alignItems = 'center';
            header.style.justifyContent = 'space-between';
            header.style.padding = '0 16px';
            header.style.flexShrink = '0';

            var headerLeft = document.createElement('div');
            headerLeft.style.display = 'flex';
            headerLeft.style.alignItems = 'center';
            headerLeft.style.gap = '12px';

            var titleEl = document.createElement('span');
            titleEl.style.fontSize = '14px';
            titleEl.style.fontWeight = '700';
            titleEl.style.color = isDark ? '#f8fafc' : '#0f172a';
            titleEl.textContent = '✨ Universal Code-to-Diagram Studio';
            headerLeft.appendChild(titleEl);

            autoDetectBadge = document.createElement('span');
            autoDetectBadge.id = 'universal-auto-detect-badge';
            autoDetectBadge.style.background = isDark ? 'rgba(59, 130, 246, 0.15)' : '#eff6ff';
            autoDetectBadge.style.border = isDark ? '1px solid #3b82f6' : '1px solid #93c5fd';
            autoDetectBadge.style.color = isDark ? '#60a5fa' : '#1d4ed8';
            autoDetectBadge.style.borderRadius = '9999px';
            autoDetectBadge.style.padding = '2px 10px';
            autoDetectBadge.style.fontSize = '11px';
            autoDetectBadge.style.fontWeight = '600';
            autoDetectBadge.textContent = 'Auto-Detected: Waiting for Code...';
            headerLeft.appendChild(autoDetectBadge);

            header.appendChild(headerLeft);

            var closeBtn = document.createElement('button');
            closeBtn.innerHTML = '✕';
            closeBtn.style.background = 'transparent';
            closeBtn.style.border = 'none';
            closeBtn.style.color = isDark ? '#94a3b8' : '#64748b';
            closeBtn.style.fontSize = '16px';
            closeBtn.style.cursor = 'pointer';
            closeBtn.style.padding = '4px 8px';
            closeBtn.style.borderRadius = '6px';
            closeBtn.title = 'Close Studio (Esc)';
            closeBtn.onclick = function() { studioModal.style.display = 'none'; };
            header.appendChild(closeBtn);

            studioBoxEl.appendChild(header);

            // B. Sample Templates Ribbon
            var ribbon = document.createElement('div');
            ribbon.style.background = isDark ? '#0f172a' : '#ffffff';
            ribbon.style.borderBottom = isDark ? '1px solid #1e293b' : '1px solid #e2e8f0';
            ribbon.style.padding = '8px 16px';
            ribbon.style.display = 'flex';
            ribbon.style.alignItems = 'center';
            ribbon.style.gap = '6px';
            ribbon.style.overflowX = 'auto';
            ribbon.style.whiteSpace = 'nowrap';
            ribbon.style.flexShrink = '0';

            var ribbonLabel = document.createElement('span');
            ribbonLabel.style.fontSize = '11px';
            ribbonLabel.style.fontWeight = '700';
            ribbonLabel.style.color = isDark ? '#64748b' : '#94a3b8';
            ribbonLabel.style.textTransform = 'uppercase';
            ribbonLabel.style.letterSpacing = '0.05em';
            ribbonLabel.style.marginRight = '4px';
            ribbonLabel.textContent = 'Presets:';
            ribbon.appendChild(ribbonLabel);

            var presets = [
                { key: 'flowchart', label: 'Flowchart' },
                { key: 'sequence', label: 'Sequence' },
                { key: 'mindmap', label: 'Mindmap' },
                { key: 'radar', label: '🕸️ Spider / Radar' },
                { key: 'infographic', label: '📊 Infographic KPI' },
                { key: 'architecture', label: '☁️ Cloud Architecture' },
                { key: 'er', label: 'ER Diagram' },
                { key: 'state', label: 'State Machine' },
                { key: 'timeline', label: 'Timeline' },
                { key: 'xychart', label: 'XY Bar/Line Chart' }
            ];

            presets.forEach(function(item) {
                var pBtn = document.createElement('button');
                pBtn.textContent = item.label;
                pBtn.style.background = isDark ? '#1e293b' : '#f1f5f9';
                pBtn.style.color = isDark ? '#cbd5e1' : '#334155';
                pBtn.style.border = isDark ? '1px solid #334155' : '1px solid #cbd5e1';
                pBtn.style.borderRadius = '6px';
                pBtn.style.padding = '4px 10px';
                pBtn.style.fontSize = '11px';
                pBtn.style.fontWeight = '500';
                pBtn.style.cursor = 'pointer';
                pBtn.onclick = function() {
                    if (codeEditor && TEMPLATES[item.key]) {
                        codeEditor.value = TEMPLATES[item.key];
                        renderCurrentCode();
                    }
                };
                ribbon.appendChild(pBtn);
            });

            studioBoxEl.appendChild(ribbon);

            // C. Visual Controls & Auto-Fix Toolbar
            var toolbar = document.createElement('div');
            toolbar.style.background = isDark ? '#0d1526' : '#f8fafc';
            toolbar.style.borderBottom = isDark ? '1px solid #1e293b' : '1px solid #e2e8f0';
            toolbar.style.padding = '6px 16px';
            toolbar.style.display = 'flex';
            toolbar.style.alignItems = 'center';
            toolbar.style.justifyContent = 'space-between';
            toolbar.style.flexShrink = '0';
            toolbar.style.gap = '12px';

            var tbLeft = document.createElement('div');
            tbLeft.style.display = 'flex';
            tbLeft.style.alignItems = 'center';
            tbLeft.style.gap = '8px';

            // Direction Selector
            var dirSelect = document.createElement('select');
            dirSelect.id = 'universal-direction-select';
            dirSelect.style.background = isDark ? '#1e293b' : '#ffffff';
            dirSelect.style.color = isDark ? '#e2e8f0' : '#1e293b';
            dirSelect.style.border = isDark ? '1px solid #334155' : '1px solid #cbd5e1';
            dirSelect.style.borderRadius = '6px';
            dirSelect.style.padding = '4px 8px';
            dirSelect.style.fontSize = '11px';
            dirSelect.style.cursor = 'pointer';
            dirSelect.innerHTML = '<option value="TD">Top ➔ Down (TD)</option><option value="LR">Left ➔ Right (LR)</option><option value="BT">Bottom ➔ Top (BT)</option><option value="RL">Right ➔ Left (RL)</option>';
            dirSelect.onchange = function() {
                var newDir = dirSelect.value;
                if (!codeEditor) return;
                var code = codeEditor.value;
                if (/^(flowchart|graph)\s+(TD|TB|LR|BT|RL)\b/m.test(code)) {
                    codeEditor.value = code.replace(/^(flowchart|graph)\s+(TD|TB|LR|BT|RL)\b/m, '$1 ' + newDir);
                } else if (/^(flowchart|graph)\b/m.test(code)) {
                    codeEditor.value = code.replace(/^(flowchart|graph)\b/m, '$1 ' + newDir);
                }
                renderCurrentCode();
            };
            tbLeft.appendChild(dirSelect);

            // Layout Engine Selector (Dagre vs ELK)
            var layoutSelect = document.createElement('select');
            layoutSelect.style.background = isDark ? '#1e293b' : '#ffffff';
            layoutSelect.style.color = isDark ? '#e2e8f0' : '#1e293b';
            layoutSelect.style.border = isDark ? '1px solid #334155' : '1px solid #cbd5e1';
            layoutSelect.style.borderRadius = '6px';
            layoutSelect.style.padding = '4px 8px';
            layoutSelect.style.fontSize = '11px';
            layoutSelect.style.cursor = 'pointer';
            layoutSelect.innerHTML = '<option value="dagre">Layout: Hierarchical (Dagre)</option><option value="elk">Layout: Adaptive Orthogonal (ELK)</option>';
            layoutSelect.onchange = function() {
                var target = layoutSelect.value;
                if (!codeEditor) return;
                var code = codeEditor.value;
                if (/layout:\s*(dagre|elk)/i.test(code)) {
                    codeEditor.value = code.replace(/layout:\s*(dagre|elk)/gi, 'layout: ' + target);
                } else {
                    codeEditor.value = '---\nconfig:\n  layout: ' + target + '\n---\n' + code;
                }
                renderCurrentCode();
            };
            tbLeft.appendChild(layoutSelect);

            // Auto-Fix Button
            var fixBtn = document.createElement('button');
            fixBtn.innerHTML = '🔧 Auto-Fix Syntax';
            fixBtn.style.background = 'linear-gradient(135deg, #10b981, #059669)';
            fixBtn.style.color = '#ffffff';
            fixBtn.style.border = 'none';
            fixBtn.style.borderRadius = '6px';
            fixBtn.style.padding = '4px 10px';
            fixBtn.style.fontSize = '11px';
            fixBtn.style.fontWeight = '600';
            fixBtn.style.cursor = 'pointer';
            fixBtn.title = 'Strips fences, straightens quotes, fixes arrows and unclosed subgraphs';
            fixBtn.onclick = function() {
                applyAutoFixAndReport();
            };
            tbLeft.appendChild(fixBtn);

            // Paste Clipboard Button
            var pasteBtn = document.createElement('button');
            pasteBtn.innerHTML = '📋 Paste Clipboard';
            pasteBtn.style.background = isDark ? '#1e293b' : '#ffffff';
            pasteBtn.style.color = isDark ? '#e2e8f0' : '#1e293b';
            pasteBtn.style.border = isDark ? '1px solid #334155' : '1px solid #cbd5e1';
            pasteBtn.style.borderRadius = '6px';
            pasteBtn.style.padding = '4px 10px';
            pasteBtn.style.fontSize = '11px';
            pasteBtn.style.fontWeight = '500';
            pasteBtn.style.cursor = 'pointer';
            pasteBtn.onclick = function() {
                if (navigator.clipboard && navigator.clipboard.readText) {
                    navigator.clipboard.readText().then(function(text) {
                        if (codeEditor && text) {
                            codeEditor.value = text;
                            renderCurrentCode();
                        }
                    }).catch(function() {
                        try {
                            var electron = require('electron');
                            var clipText = electron.clipboard.readText();
                            if (codeEditor && clipText) {
                                codeEditor.value = clipText;
                                renderCurrentCode();
                            }
                        } catch (e) {}
                    });
                }
            };
            tbLeft.appendChild(pasteBtn);

            toolbar.appendChild(tbLeft);

            var tbRight = document.createElement('div');
            tbRight.style.display = 'flex';
            tbRight.style.alignItems = 'center';
            tbRight.style.gap = '6px';

            // Zoom controls
            var zoomOutBtn = document.createElement('button');
            zoomOutBtn.textContent = '−';
            zoomOutBtn.style.background = isDark ? '#1e293b' : '#ffffff';
            zoomOutBtn.style.color = isDark ? '#cbd5e1' : '#1e293b';
            zoomOutBtn.style.border = isDark ? '1px solid #334155' : '1px solid #cbd5e1';
            zoomOutBtn.style.borderRadius = '6px';
            zoomOutBtn.style.width = '26px';
            zoomOutBtn.style.height = '26px';
            zoomOutBtn.style.cursor = 'pointer';
            zoomOutBtn.onclick = function() { zoomLevel = Math.max(0.2, zoomLevel / 1.25); updateTransform(); };
            tbRight.appendChild(zoomOutBtn);

            var zoomResetBtn = document.createElement('button');
            zoomResetBtn.textContent = '100%';
            zoomResetBtn.style.background = isDark ? '#1e293b' : '#ffffff';
            zoomResetBtn.style.color = isDark ? '#cbd5e1' : '#1e293b';
            zoomResetBtn.style.border = isDark ? '1px solid #334155' : '1px solid #cbd5e1';
            zoomResetBtn.style.borderRadius = '6px';
            zoomResetBtn.style.height = '26px';
            zoomResetBtn.style.padding = '0 6px';
            zoomResetBtn.style.fontSize = '10px';
            zoomResetBtn.style.cursor = 'pointer';
            zoomResetBtn.onclick = function() { zoomLevel = 1.0; panOffsetX = 0; panOffsetY = 0; updateTransform(); };
            tbRight.appendChild(zoomResetBtn);

            var zoomInBtn = document.createElement('button');
            zoomInBtn.textContent = '+';
            zoomInBtn.style.background = isDark ? '#1e293b' : '#ffffff';
            zoomInBtn.style.color = isDark ? '#cbd5e1' : '#1e293b';
            zoomInBtn.style.border = isDark ? '1px solid #334155' : '1px solid #cbd5e1';
            zoomInBtn.style.borderRadius = '6px';
            zoomInBtn.style.width = '26px';
            zoomInBtn.style.height = '26px';
            zoomInBtn.style.cursor = 'pointer';
            zoomInBtn.onclick = function() { zoomLevel = Math.min(5.0, zoomLevel * 1.25); updateTransform(); };
            tbRight.appendChild(zoomInBtn);

            // Toggle background button
            var bgBtn = document.createElement('button');
            bgBtn.textContent = '🎨 Grid / Theme';
            bgBtn.style.background = isDark ? '#1e293b' : '#ffffff';
            bgBtn.style.color = isDark ? '#cbd5e1' : '#1e293b';
            bgBtn.style.border = isDark ? '1px solid #334155' : '1px solid #cbd5e1';
            bgBtn.style.borderRadius = '6px';
            bgBtn.style.height = '26px';
            bgBtn.style.padding = '0 8px';
            bgBtn.style.fontSize = '11px';
            bgBtn.style.cursor = 'pointer';
            bgBtn.onclick = function() {
                bgMode = (bgMode + 1) % 3;
                if (!previewContainer) return;
                if (bgMode === 0) {
                    // Requirement 5: Light Canvas with subtle dot grid
                    previewContainer.style.background = '#ffffff';
                    previewContainer.style.backgroundImage = 'radial-gradient(circle, #cbd5e1 1.2px, transparent 1.2px)';
                    previewContainer.style.backgroundSize = '20px 20px';
                } else if (bgMode === 1) {
                    // Dark Canvas
                    previewContainer.style.background = '#0f172a';
                    previewContainer.style.backgroundImage = 'radial-gradient(circle, #1e293b 1.2px, transparent 1.2px)';
                    previewContainer.style.backgroundSize = '20px 20px';
                } else {
                    // Plain White
                    previewContainer.style.background = '#ffffff';
                    previewContainer.style.backgroundImage = 'none';
                }
                renderCurrentCode();
            };
            tbRight.appendChild(bgBtn);

            // Fullscreen Preview Toggle Button
            var splitToggleBtn = document.createElement('button');
            splitToggleBtn.id = 'studio-fullscreen-toggle-btn';
            splitToggleBtn.innerHTML = '⛶ Fullscreen Preview';
            splitToggleBtn.style.background = isDark ? '#1e293b' : '#ffffff';
            splitToggleBtn.style.color = isDark ? '#cbd5e1' : '#1e293b';
            splitToggleBtn.style.border = isDark ? '1px solid #334155' : '1px solid #cbd5e1';
            splitToggleBtn.style.borderRadius = '6px';
            splitToggleBtn.style.height = '26px';
            splitToggleBtn.style.padding = '0 8px';
            splitToggleBtn.style.fontSize = '11px';
            splitToggleBtn.style.cursor = 'pointer';
            splitToggleBtn.onclick = function() {
                toggleStudioCodeEditor();
            };
            tbRight.appendChild(splitToggleBtn);

            toolbar.appendChild(tbRight);
            studioBoxEl.appendChild(toolbar);

            // D. Split-Pane Layout (Left: Code Editor, Resizer, Right: Live Preview)
            var splitPane = document.createElement('div');
            splitPane.id = 'studio-split-pane';
            splitPane.style.flex = '1';
            splitPane.style.display = 'flex';
            splitPane.style.overflow = 'hidden';
            splitPane.style.position = 'relative';

            // Left Pane (Code Input)
            studioLeftPane = document.createElement('div');
            studioLeftPane.id = 'studio-code-pane';
            studioLeftPane.style.width = lastResizedEditorWidth + 'px';
            studioLeftPane.style.minWidth = '180px';
            studioLeftPane.style.borderRight = isDark ? '1px solid #1e293b' : '1px solid #e2e8f0';
            studioLeftPane.style.display = 'flex';
            studioLeftPane.style.flexDirection = 'column';
            studioLeftPane.style.background = isDark ? '#090d16' : '#ffffff';

            var codeHeader = document.createElement('div');
            codeHeader.style.padding = '8px 12px';
            codeHeader.style.borderBottom = isDark ? '1px solid #1e293b' : '1px solid #e2e8f0';
            codeHeader.style.background = isDark ? '#0b1120' : '#f8fafc';
            codeHeader.style.fontSize = '11px';
            codeHeader.style.fontWeight = '700';
            codeHeader.style.color = isDark ? '#94a3b8' : '#475569';
            codeHeader.style.display = 'flex';
            codeHeader.style.alignItems = 'center';
            codeHeader.style.justifyContent = 'space-between';

            var codeHeaderLeft = document.createElement('div');
            codeHeaderLeft.style.display = 'flex';
            codeHeaderLeft.style.alignItems = 'center';
            codeHeaderLeft.style.gap = '6px';
            codeHeaderLeft.innerHTML = '<span>SOURCE CODE EDITOR</span><span style="font-size:10px;color:#94a3b8;">(250ms live preview)</span>';
            codeHeader.appendChild(codeHeaderLeft);

            // Requirement 5: Inline « Collapse Button in Header
            var collapseBtn = document.createElement('button');
            collapseBtn.id = 'studio-collapse-editor-btn';
            collapseBtn.innerHTML = '« Collapse';
            collapseBtn.title = 'Collapse code editor to show 100% full preview';
            collapseBtn.style.background = isDark ? '#1e293b' : '#eff6ff';
            collapseBtn.style.color = isDark ? '#60a5fa' : '#1d4ed8';
            collapseBtn.style.border = isDark ? '1px solid #3b82f6' : '1px solid #93c5fd';
            collapseBtn.style.borderRadius = '4px';
            collapseBtn.style.padding = '2px 8px';
            collapseBtn.style.fontSize = '11px';
            collapseBtn.style.fontWeight = '700';
            collapseBtn.style.cursor = 'pointer';
            collapseBtn.onclick = function() {
                toggleStudioCodeEditor(true);
            };
            codeHeader.appendChild(collapseBtn);

            studioLeftPane.appendChild(codeHeader);

            codeEditor = document.createElement('textarea');
            codeEditor.id = 'universal-code-input';
            codeEditor.style.flex = '1';
            codeEditor.style.width = '100%';
            codeEditor.style.boxSizing = 'border-box';
            codeEditor.style.background = isDark ? '#090d16' : '#ffffff';
            codeEditor.style.color = isDark ? '#38bdf8' : '#0f172a';
            codeEditor.style.border = 'none';
            codeEditor.style.outline = 'none';
            codeEditor.style.padding = '14px';
            codeEditor.style.fontFamily = 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';
            codeEditor.style.fontSize = '13px';
            codeEditor.style.lineHeight = '1.6';
            codeEditor.style.resize = 'none';
            codeEditor.style.whiteSpace = 'pre';
            codeEditor.setAttribute('spellcheck', 'false');
            codeEditor.placeholder = 'Paste any Mermaid, Flowchart, Mindmap, Radar/Spider, Infographic, or PlantUML code here...';
            codeEditor.oninput = triggerDebouncedRender;
            codeEditor.onpaste = function() { setTimeout(triggerDebouncedRender, 50); };
            studioLeftPane.appendChild(codeEditor);

            // Left status bar
            var statusContainer = document.createElement('div');
            statusContainer.style.padding = '8px 12px';
            statusContainer.style.background = isDark ? '#070b12' : '#f8fafc';
            statusContainer.style.borderTop = isDark ? '1px solid #1e293b' : '1px solid #e2e8f0';
            statusContainer.style.display = 'flex';
            statusContainer.style.alignItems = 'center';
            statusContainer.style.justifyContent = 'space-between';
            statusContainer.style.fontSize = '11px';

            statusBar = document.createElement('div');
            statusBar.innerHTML = '<span style="color:#10b981;">✓ Ready</span>';
            statusContainer.appendChild(statusBar);

            quickFixBtn = document.createElement('button');
            quickFixBtn.textContent = 'Auto-Fix Now';
            quickFixBtn.style.display = 'none';
            quickFixBtn.style.background = '#ef4444';
            quickFixBtn.style.color = '#ffffff';
            quickFixBtn.style.border = 'none';
            quickFixBtn.style.borderRadius = '4px';
            quickFixBtn.style.padding = '2px 8px';
            quickFixBtn.style.fontSize = '10px';
            quickFixBtn.style.fontWeight = 'bold';
            quickFixBtn.style.cursor = 'pointer';
            quickFixBtn.onclick = function() {
                applyAutoFixAndReport();
            };
            statusContainer.appendChild(quickFixBtn);

            studioLeftPane.appendChild(statusContainer);
            splitPane.appendChild(studioLeftPane);

            // Requirement 5: Draggable Vertical Splitter Resizer
            var splitterResizer = document.createElement('div');
            splitterResizer.id = 'studio-split-resizer';
            splitterResizer.style.width = '10px';
            splitterResizer.style.cursor = 'col-resize';
            splitterResizer.style.background = isDark ? '#1e293b' : '#e2e8f0';
            splitterResizer.style.borderLeft = isDark ? '1px solid #334155' : '1px solid #cbd5e1';
            splitterResizer.style.borderRight = isDark ? '1px solid #334155' : '1px solid #cbd5e1';
            splitterResizer.style.display = 'flex';
            splitterResizer.style.alignItems = 'center';
            splitterResizer.style.justifyContent = 'center';
            splitterResizer.style.userSelect = 'none';
            splitterResizer.style.flexShrink = '0';
            splitterResizer.style.transition = 'background 0.15s ease';
            splitterResizer.title = 'Drag to resize Code Editor / Live Preview';
            splitterResizer.innerHTML = '<span style="color:#94a3b8;font-size:12px;pointer-events:none;">⋮</span>';

            splitterResizer.onmouseenter = function() { splitterResizer.style.background = '#3b82f6'; };
            splitterResizer.onmouseleave = function() { splitterResizer.style.background = isDark ? '#1e293b' : '#e2e8f0'; };

            // Drag handling for Splitter
            var isDraggingSplitter = false;
            splitterResizer.addEventListener('mousedown', function(e) {
                if (e.button === 0) {
                    isDraggingSplitter = true;
                    document.body.style.cursor = 'col-resize';
                    document.body.style.userSelect = 'none';
                    e.preventDefault();
                }
            });

            window.addEventListener('mousemove', function(e) {
                if (!isDraggingSplitter || !studioBoxEl) return;
                var boxRect = studioBoxEl.getBoundingClientRect();
                var newW = e.clientX - boxRect.left;
                var minW = 180;
                var maxW = boxRect.width * 0.75;
                if (newW >= minW && newW <= maxW) {
                    studioLeftPane.style.width = newW + 'px';
                    lastResizedEditorWidth = newW;
                }
            });

            window.addEventListener('mouseup', function() {
                if (isDraggingSplitter) {
                    isDraggingSplitter = false;
                    document.body.style.cursor = '';
                    document.body.style.userSelect = '';
                }
            });

            splitPane.appendChild(splitterResizer);

            // Right Pane (Live Render Preview)
            var rightPane = document.createElement('div');
            rightPane.id = 'studio-preview-pane';
            rightPane.style.flex = '1';
            rightPane.style.display = 'flex';
            rightPane.style.flexDirection = 'column';
            rightPane.style.overflow = 'hidden';
            rightPane.style.position = 'relative';

            // Requirement 5: Expand Code Editor Tab (Appears when editor is collapsed)
            var expandEditorTab = document.createElement('button');
            expandEditorTab.id = 'studio-expand-editor-tab';
            expandEditorTab.innerHTML = '» Code Editor';
            expandEditorTab.title = 'Restore Code Editor Pane';
            expandEditorTab.style.display = 'none';
            expandEditorTab.style.position = 'absolute';
            expandEditorTab.style.top = '12px';
            expandEditorTab.style.left = '12px';
            expandEditorTab.style.zIndex = '20';
            expandEditorTab.style.background = isDark ? '#1e293b' : '#ffffff';
            expandEditorTab.style.color = isDark ? '#60a5fa' : '#1d4ed8';
            expandEditorTab.style.border = isDark ? '1px solid #3b82f6' : '1px solid #93c5fd';
            expandEditorTab.style.borderRadius = '6px';
            expandEditorTab.style.padding = '4px 10px';
            expandEditorTab.style.fontSize = '11px';
            expandEditorTab.style.fontWeight = '700';
            expandEditorTab.style.cursor = 'pointer';
            expandEditorTab.style.boxShadow = '0 2px 8px rgba(0,0,0,0.15)';
            expandEditorTab.onclick = function() {
                toggleStudioCodeEditor(false);
            };
            rightPane.appendChild(expandEditorTab);

            // Preview Container (Requirement 5 default: crisp light canvas)
            previewContainer = document.createElement('div');
            previewContainer.id = 'universal-preview-container';
            previewContainer.style.flex = '1';
            previewContainer.style.width = '100%';
            previewContainer.style.height = '100%';
            previewContainer.style.background = '#ffffff';
            previewContainer.style.backgroundImage = 'radial-gradient(circle, #cbd5e1 1.2px, transparent 1.2px)';
            previewContainer.style.backgroundSize = '20px 20px';
            previewContainer.style.overflow = 'hidden';
            previewContainer.style.position = 'relative';
            previewContainer.style.cursor = 'grab';
            previewContainer.style.display = 'flex';
            previewContainer.style.alignItems = 'center';
            previewContainer.style.justifyContent = 'center';

            previewInner = document.createElement('div');
            previewInner.id = 'universal-preview-inner';
            previewInner.style.transformOrigin = 'center center';
            previewInner.style.transition = 'transform 0.05s ease-out';
            previewInner.style.display = 'inline-flex';
            previewInner.style.alignItems = 'center';
            previewInner.style.justifyContent = 'center';
            previewContainer.appendChild(previewInner);

            // Pan and Zoom Listeners
            var isPanning = false, panStartX = 0, panStartY = 0;
            previewContainer.addEventListener('mousedown', function(e) {
                if (e.button === 0) {
                    isPanning = true;
                    previewContainer.style.cursor = 'grabbing';
                    panStartX = e.clientX - panOffsetX;
                    panStartY = e.clientY - panOffsetY;
                    e.preventDefault();
                }
            });
            window.addEventListener('mousemove', function(e) {
                if (!isPanning) return;
                panOffsetX = e.clientX - panStartX;
                panOffsetY = e.clientY - panStartY;
                updateTransform();
            });
            window.addEventListener('mouseup', function() {
                if (isPanning) {
                    isPanning = false;
                    previewContainer.style.cursor = 'grab';
                }
            });
            previewContainer.addEventListener('wheel', function(e) {
                e.preventDefault();
                var delta = e.deltaY < 0 ? 1.15 : 0.85;
                zoomLevel = Math.min(5.0, Math.max(0.2, zoomLevel * delta));
                updateTransform();
            }, { passive: false });

            rightPane.appendChild(previewContainer);
            splitPane.appendChild(rightPane);
            studioBoxEl.appendChild(splitPane);

            // Helper to toggle editor collapse/expand
            function toggleStudioCodeEditor(forceCollapse) {
                if (forceCollapse != null) {
                    isLeftPaneCollapsed = forceCollapse;
                } else {
                    isLeftPaneCollapsed = !isLeftPaneCollapsed;
                }

                if (isLeftPaneCollapsed) {
                    studioLeftPane.style.display = 'none';
                    splitterResizer.style.display = 'none';
                    expandEditorTab.style.display = 'inline-flex';
                    splitToggleBtn.textContent = '⇤ Show Code Editor';
                } else {
                    studioLeftPane.style.display = 'flex';
                    studioLeftPane.style.width = lastResizedEditorWidth + 'px';
                    splitterResizer.style.display = 'flex';
                    expandEditorTab.style.display = 'none';
                    splitToggleBtn.textContent = '⛶ Fullscreen Preview';
                }
            }

            // E. Bottom Footer Bar (Insert & Export Actions)
            var footer = document.createElement('div');
            footer.style.height = '54px';
            footer.style.background = isDark ? '#0b1120' : '#f8fafc';
            footer.style.borderTop = isDark ? '1px solid #1e293b' : '1px solid #e2e8f0';
            footer.style.display = 'flex';
            footer.style.alignItems = 'center';
            footer.style.justifyContent = 'space-between';
            footer.style.padding = '0 16px';
            footer.style.flexShrink = '0';

            var footerLeft = document.createElement('div');
            footerLeft.style.display = 'flex';
            footerLeft.style.alignItems = 'center';
            footerLeft.style.gap = '10px';

            // Primary: Insert as Editable Draw.io Shapes
            var btnInsertEditable = document.createElement('button');
            btnInsertEditable.innerHTML = '⚡ Insert as Editable Shapes';
            btnInsertEditable.style.background = 'linear-gradient(135deg, #2563eb, #1d4ed8)';
            btnInsertEditable.style.color = '#ffffff';
            btnInsertEditable.style.border = 'none';
            btnInsertEditable.style.borderRadius = '8px';
            btnInsertEditable.style.padding = '8px 16px';
            btnInsertEditable.style.fontSize = '12px';
            btnInsertEditable.style.fontWeight = '700';
            btnInsertEditable.style.cursor = 'pointer';
            btnInsertEditable.style.boxShadow = '0 2px 8px rgba(37, 99, 235, 0.4)';
            btnInsertEditable.onclick = function() {
                var code = codeEditor ? codeEditor.value.trim() : '';
                if (!code) return;

                // PlantUML
                if (currentDetectedType.id === 'plantuml' && currentRenderedXml) {
                    graph.getModel().beginUpdate();
                    try {
                        var pt = graph.getFreeInsertPoint();
                        var cells = ui.importXml(currentRenderedXml, Math.max(20, pt.x), Math.max(20, pt.y), true);
                        graph.setSelectionCells(cells);
                    } finally {
                        graph.getModel().endUpdate();
                    }
                    if (ui.showStatus) ui.showStatus('✓ Inserted editable PlantUML diagram', 2500);
                    studioModal.style.display = 'none';
                    return;
                }

                // Mermaid
                if (currentRenderedXml) {
                    graph.getModel().beginUpdate();
                    try {
                        var insertXml = (typeof mxMermaidToDrawio !== 'undefined' && mxMermaidToDrawio.wrapGroup) ?
                            mxMermaidToDrawio.wrapGroup(currentRenderedXml, code, EditorUi.getInsertMermaidConfig()) : currentRenderedXml;
                        var ptM = graph.getFreeInsertPoint();
                        var cellsM = ui.importXml(insertXml, Math.max(20, ptM.x), Math.max(20, ptM.y), true);
                        graph.setSelectionCells(cellsM);
                    } finally {
                        graph.getModel().endUpdate();
                    }
                    if (ui.showStatus) ui.showStatus('✓ Inserted editable Mermaid diagram', 2500);
                    studioModal.style.display = 'none';
                    return;
                }

                // If Radar or Infographic SVG is active, insert crisp vector
                if (currentRenderedSvg) {
                    insertSvgAsImageCell(currentRenderedSvg);
                    studioModal.style.display = 'none';
                }
            };
            footerLeft.appendChild(btnInsertEditable);

            // Secondary: Insert as Crisp Vector SVG
            var btnInsertVector = document.createElement('button');
            btnInsertVector.innerHTML = '🖼️ Insert Vector SVG';
            btnInsertVector.style.background = isDark ? '#1e293b' : '#ffffff';
            btnInsertVector.style.color = isDark ? '#f8fafc' : '#1e293b';
            btnInsertVector.style.border = isDark ? '1px solid #334155' : '1px solid #cbd5e1';
            btnInsertVector.style.borderRadius = '8px';
            btnInsertVector.style.padding = '8px 14px';
            btnInsertVector.style.fontSize = '12px';
            btnInsertVector.style.fontWeight = '600';
            btnInsertVector.style.cursor = 'pointer';
            btnInsertVector.title = 'Embeds scalable SVG for radar, mindmaps & infographics';
            btnInsertVector.onclick = function() {
                if (currentRenderedSvg) {
                    insertSvgAsImageCell(currentRenderedSvg);
                    studioModal.style.display = 'none';
                } else {
                    ui.showError(mxResources.get('error'), 'No SVG preview is currently generated to insert.', mxResources.get('ok'));
                }
            };
            footerLeft.appendChild(btnInsertVector);

            // Requirement 5: Save to Diagrams Folder Button
            var btnSaveHub = document.createElement('button');
            btnSaveHub.innerHTML = '💾 Save to Diagrams Folder';
            btnSaveHub.style.background = isDark ? '#1e293b' : '#eff6ff';
            btnSaveHub.style.color = isDark ? '#60a5fa' : '#1d4ed8';
            btnSaveHub.style.border = isDark ? '1px solid #3b82f6' : '1px solid #93c5fd';
            btnSaveHub.style.borderRadius = '8px';
            btnSaveHub.style.padding = '8px 14px';
            btnSaveHub.style.fontSize = '12px';
            btnSaveHub.style.fontWeight = '600';
            btnSaveHub.style.cursor = 'pointer';
            btnSaveHub.title = 'Save this diagram card directly into the Diagrams & Folders Workspace';
            btnSaveHub.onclick = function() {
                appPrompt('Save to diagrams folder', currentDetectedType.label || 'My Diagram',
                    'Saved into your default folder. Change it under ⚙ Workspace Settings.').then(function(title) {
                    if (!title) return;

                    var data = getWorkspaceData();
                    var targetFolder = getDefaultFolderId(data);
                    var newDiag = {
                        id: 'diag_' + Date.now(),
                        title: title,
                        folderId: targetFolder,
                        code: codeEditor ? codeEditor.value : '',
                        xml: currentRenderedXml,
                        typeLabel: currentDetectedType.label || 'Diagram',
                        svgPreview: currentRenderedSvg || STARTER_SVGS.flowchart,
                        updatedAt: Date.now(),
                        starred: false
                    };
                    data.diagrams.unshift(newDiag);
                    saveWorkspaceData(data);
                    var folderName = (data.folders.filter(function(f) { return f.id === targetFolder; })[0] || {}).name || 'Personal';
                    setStatus(true, 'Saved to Diagrams Folder ("' + folderName + '")');
                    if (ui.showStatus) ui.showStatus('✓ Saved to Diagrams Workspace', 2500);
                });
            };
            footerLeft.appendChild(btnSaveHub);

            // Open in 2-Way Drag & Drop Visual Editor
            var btnOpen2Way = document.createElement('button');
            btnOpen2Way.innerHTML = '🔄 2-Way Visual Editor';
            btnOpen2Way.style.background = isDark ? '#1e293b' : '#ffffff';
            btnOpen2Way.style.color = isDark ? '#818cf8' : '#4f46e5';
            btnOpen2Way.style.border = isDark ? '1px solid #4338ca' : '1px solid #c7d2fe';
            btnOpen2Way.style.borderRadius = '8px';
            btnOpen2Way.style.padding = '8px 14px';
            btnOpen2Way.style.fontSize = '12px';
            btnOpen2Way.style.fontWeight = '600';
            btnOpen2Way.style.cursor = 'pointer';
            btnOpen2Way.onclick = function() {
                var code = codeEditor ? codeEditor.value : '';
                studioModal.style.display = 'none';
                openVisualMermaidEditor(code);
            };
            footerLeft.appendChild(btnOpen2Way);

            footer.appendChild(footerLeft);

            var footerRight = document.createElement('div');
            footerRight.style.display = 'flex';
            footerRight.style.alignItems = 'center';
            footerRight.style.gap = '8px';

            // Export SVG
            var btnExportSvg = document.createElement('button');
            btnExportSvg.innerHTML = 'Export SVG';
            btnExportSvg.style.background = isDark ? '#1e293b' : '#ffffff';
            btnExportSvg.style.color = isDark ? '#cbd5e1' : '#334155';
            btnExportSvg.style.border = isDark ? '1px solid #334155' : '1px solid #cbd5e1';
            btnExportSvg.style.borderRadius = '6px';
            btnExportSvg.style.padding = '6px 12px';
            btnExportSvg.style.fontSize = '11px';
            btnExportSvg.style.cursor = 'pointer';
            btnExportSvg.onclick = function() {
                if (!currentRenderedSvg) return;
                var blob = new Blob([currentRenderedSvg], { type: 'image/svg+xml;charset=utf-8' });
                var url = URL.createObjectURL(blob);
                var a = document.createElement('a');
                a.href = url;
                a.download = 'diagram.svg';
                a.click();
                URL.revokeObjectURL(url);
            };
            footerRight.appendChild(btnExportSvg);

            // Export PNG
            var btnExportPng = document.createElement('button');
            btnExportPng.innerHTML = 'Export PNG';
            btnExportPng.style.background = isDark ? '#1e293b' : '#ffffff';
            btnExportPng.style.color = isDark ? '#cbd5e1' : '#334155';
            btnExportPng.style.border = isDark ? '1px solid #334155' : '1px solid #cbd5e1';
            btnExportPng.style.borderRadius = '6px';
            btnExportPng.style.padding = '6px 12px';
            btnExportPng.style.fontSize = '11px';
            btnExportPng.style.cursor = 'pointer';
            btnExportPng.onclick = function() {
                if (!currentRenderedSvg) return;
                var img = new Image();
                var svgBlob = new Blob([currentRenderedSvg], { type: 'image/svg+xml;charset=utf-8' });
                var url = URL.createObjectURL(svgBlob);
                img.onload = function() {
                    var canvas = document.createElement('canvas');
                    canvas.width = (img.width || 800) * 2;
                    canvas.height = (img.height || 600) * 2;
                    var ctx = canvas.getContext('2d');
                    ctx.scale(2, 2);
                    ctx.drawImage(img, 0, 0);
                    URL.revokeObjectURL(url);
                    canvas.toBlob(function(pngBlob) {
                        var pUrl = URL.createObjectURL(pngBlob);
                        var a = document.createElement('a');
                        a.href = pUrl;
                        a.download = 'diagram.png';
                        a.click();
                        URL.revokeObjectURL(pUrl);
                    });
                };
                img.src = url;
            };
            footerRight.appendChild(btnExportPng);

            footer.appendChild(footerRight);
            studioBoxEl.appendChild(footer);

            document.body.appendChild(studioModal);

            // Initialize with initial code or flowchart template
            codeEditor.value = initialCode || TEMPLATES.flowchart;
            renderCurrentCode();
        }

        // ==========================================
        // 13. DEDICATED NATIVE TOOLBAR BUTTONS
        // ==========================================
        function injectNativeToolbarButtons(ui) {
            // Remove legacy floating bar if present
            var oldBar = document.getElementById('mermaid-studio-floating-bar');
            if (oldBar && oldBar.parentNode) oldBar.parentNode.removeChild(oldBar);

            if (document.getElementById('mermaid-native-toolbar-group')) return;

            var targetToolbar = (ui.toolbar && ui.toolbar.container) ||
                (ui.toolbarContainer && ui.toolbarContainer.querySelector('.geToolbar')) ||
                document.querySelector('.geToolbar');

            if (!targetToolbar) {
                setTimeout(function() { injectNativeToolbarButtons(ui); }, 250);
                return;
            }

            if (document.getElementById('mermaid-native-toolbar-group')) return;

            // Add Draw.io vertical separator
            var sep = document.createElement('div');
            sep.className = 'geSeparator';
            sep.style.cssText = 'height:20px;margin:0 6px;display:inline-block;vertical-align:middle;';
            targetToolbar.appendChild(sep);

            // Add Flex Container for Native Buttons
            var group = document.createElement('div');
            group.id = 'mermaid-native-toolbar-group';
            group.style.cssText = 'display:inline-flex;align-items:center;gap:6px;vertical-align:top;margin-left:4px;height:30px;';

            // Button 1: 📁 Diagrams Hub
            var btnHub = document.createElement('button');
            btnHub.className = 'mermaid-tb-btn';
            btnHub.innerHTML = '📁 Diagrams';
            btnHub.title = 'Open Visual Diagrams & Folders Hub (Ctrl+Shift+D)';
            btnHub.onclick = function() {
                openDiagramsHub();
            };
            group.appendChild(btnHub);

            // Button 2: ✨ Paste Code ➔ Auto-Render (Primary Button)
            var btnAuto = document.createElement('button');
            btnAuto.className = 'mermaid-tb-btn primary';
            btnAuto.innerHTML = '✨ Paste Code ➔ Auto-Render';
            btnAuto.title = 'Paste any diagram code to auto-detect & render (Ctrl+Shift+M)';
            btnAuto.onclick = function() {
                openUniversalStudio(getSelectedMermaidText());
            };
            group.appendChild(btnAuto);

            // Button 3: ⚡ 2-Way Visual Editor
            var btnVisual = document.createElement('button');
            btnVisual.className = 'mermaid-tb-btn';
            btnVisual.innerHTML = '⚡ 2-Way Visual Editor';
            btnVisual.title = 'Open Interactive 2-Way Visual Flowchart Editor';
            btnVisual.onclick = function() {
                openVisualMermaidEditor(getSelectedMermaidText());
            };
            group.appendChild(btnVisual);

            // Button 4: 🕸️ Quick Templates
            var btnTemplates = document.createElement('button');
            btnTemplates.className = 'mermaid-tb-btn';
            btnTemplates.innerHTML = '🕸️ Quick Templates';
            btnTemplates.title = 'Browse & Insert Diagram Templates';
            btnTemplates.onclick = function() {
                openUniversalStudio(TEMPLATES.radar);
            };
            group.appendChild(btnTemplates);

            targetToolbar.appendChild(group);
        }

        // ==========================================
        // 14. SIDE PANEL « / » COLLAPSE BUTTONS
        // ==========================================
        function setupSidePanelCollapsers(ui) {
            if (document.getElementById('left-panel-collapse-btn')) return;

            var lastSidebarWidth = 212;

            function isLeftPanelCollapsed() {
                if (ui.sidebarContainer && ui.sidebarContainer.style.display === 'none') {
                    return true;
                }
                if (typeof ui.isShapesPanelVisible === 'function') {
                    return !ui.isShapesPanelVisible();
                }
                return (ui.hsplitPosition == null || ui.hsplitPosition === 0);
            }

            function getLeftPanelWidth() {
                if (ui.sidebarContainer && ui.sidebarContainer.offsetWidth > 0) {
                    return ui.sidebarContainer.offsetWidth;
                }
                return (ui.hsplitPosition && ui.hsplitPosition > 0) ? ui.hsplitPosition : 212;
            }

            function isRightPanelCollapsed() {
                if (typeof ui.isFormatPanelVisible === 'function') {
                    return !ui.isFormatPanelVisible();
                }
                if (ui.formatContainer && ui.formatContainer.style.display === 'none') {
                    return true;
                }
                return (ui.formatWidth == null || ui.formatWidth === 0);
            }

            function getRightPanelWidth() {
                if (ui.formatContainer && ui.formatContainer.offsetWidth > 0) {
                    return ui.formatContainer.offsetWidth;
                }
                return (ui.formatWidth && ui.formatWidth > 0) ? ui.formatWidth : 240;
            }

            // A. Left Panel Collapser Button
            var leftBtn = document.createElement('button');
            leftBtn.id = 'left-panel-collapse-btn';
            document.body.appendChild(leftBtn);

            function updateLeftBtnPos() {
                var collapsed = isLeftPanelCollapsed();
                var w = getLeftPanelWidth();
                leftBtn.style.left = (collapsed ? 0 : w) + 'px';
                leftBtn.textContent = collapsed ? '»' : '«';
                leftBtn.title = collapsed ? 'Expand Shapes Sidebar' : 'Collapse Shapes Sidebar';
            }

            leftBtn.onclick = function() {
                if (ui.hsplitPosition > 0) {
                    lastSidebarWidth = ui.hsplitPosition;
                }
                var currentlyOpen = (ui.hsplitPosition > 0 && ui.sidebarContainer && ui.sidebarContainer.style.display !== 'none');

                if (currentlyOpen) {
                    ui.hsplitPosition = 0;
                    ui.refresh();
                    if (ui.sidebarContainer) ui.sidebarContainer.style.display = 'none';
                    if (ui.hsplit) ui.hsplit.style.display = 'none';
                    if (ui.diagramContainer) ui.diagramContainer.style.left = '0px';
                    if (ui.editor && ui.editor.graph) ui.editor.graph.sizeDidChange();
                } else {
                    if (ui.sidebarContainer) ui.sidebarContainer.style.display = '';
                    if (ui.hsplit) ui.hsplit.style.display = '';
                    ui.hsplitPosition = lastSidebarWidth || 212;
                    ui.refresh();
                }
                updateLeftBtnPos();
                setTimeout(updateLeftBtnPos, 200);
            };

            // B. Right Panel Collapser Button
            var rightBtn = document.createElement('button');
            rightBtn.id = 'right-panel-collapse-btn';
            document.body.appendChild(rightBtn);

            function updateRightBtnPos() {
                var collapsed = isRightPanelCollapsed();
                var rw = getRightPanelWidth();
                rightBtn.style.right = (collapsed ? 0 : rw) + 'px';
                rightBtn.textContent = collapsed ? '«' : '»';
                rightBtn.title = collapsed ? 'Expand Format Panel' : 'Collapse Format Panel';
            }

            rightBtn.onclick = function() {
                if (typeof ui.toggleFormatPanel === 'function') {
                    ui.toggleFormatPanel();
                } else {
                    var vis = (ui.formatWidth > 0 && ui.formatContainer && ui.formatContainer.style.display !== 'none');
                    ui.formatWidth = vis ? 0 : 240;
                    if (ui.formatContainer) ui.formatContainer.style.display = vis ? 'none' : '';
                    ui.refresh();
                }
                updateRightBtnPos();
                setTimeout(updateRightBtnPos, 150);
                setTimeout(updateRightBtnPos, 300);
            };

            // Window resize & layout change listeners
            window.addEventListener('resize', function() {
                updateLeftBtnPos();
                updateRightBtnPos();
            });

            // Initial alignment
            updateLeftBtnPos();
            updateRightBtnPos();
            setTimeout(function() {
                updateLeftBtnPos();
                updateRightBtnPos();
            }, 300);
        }

        // ==========================================
        // 15. ACTIONS, SHORTCUTS & MENU REGISTRATION
        // ==========================================
        ui.actions.addAction('diagramsHub', function() {
            openDiagramsHub();
        });

        ui.actions.addAction('universalStudio', function() {
            openUniversalStudio(getSelectedMermaidText());
        });

        ui.actions.addAction('visualMermaid', function() {
            openVisualMermaidEditor(getSelectedMermaidText());
        });

        // Global Keyboard Shortcuts
        window.addEventListener('keydown', function(e) {
            // Ctrl+Shift+D / Cmd+Shift+D: Diagrams Hub
            if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'D' || e.key === 'd')) {
                e.preventDefault();
                openDiagramsHub();
            }
            // Ctrl+Shift+M / Cmd+Shift+M: Universal Studio
            else if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'M' || e.key === 'm')) {
                e.preventDefault();
                openUniversalStudio(getSelectedMermaidText());
            }
            // Escape: Close modals
            else if (e.key === 'Escape') {
                if (studioModal && studioModal.style.display !== 'none') {
                    studioModal.style.display = 'none';
                }
                if (hubModal && hubModal.style.display !== 'none') {
                    hubModal.style.display = 'none';
                }
            }
        });

        // Add to Menus (Insert > Advanced)
        var origInsertAdvanced = ui.menus.get('insertAdvanced');
        if (origInsertAdvanced) {
            var oldFunct = origInsertAdvanced.funct;
            origInsertAdvanced.funct = function(menu, parent) {
                oldFunct.apply(this, arguments);
                menu.addSeparator(parent);
                ui.menus.addMenuItem(menu, 'diagramsHub', parent);
                ui.menus.addMenuItem(menu, 'universalStudio', parent);
                ui.menus.addMenuItem(menu, 'visualMermaid', parent);
            };
        }

        // Add to Cell Context Menu
        var uiCreatePopupMenu = ui.menus.createPopupMenu;
        ui.menus.createPopupMenu = function(menu, cell, evt) {
            uiCreatePopupMenu.apply(this, arguments);
            var mText = getSelectedMermaidText();
            if (mText) {
                menu.addSeparator();
                menu.addItem('✨ Edit in Universal Auto-Detect Studio', null, function() {
                    openUniversalStudio(mText);
                });
                menu.addItem('⚡ Edit in 2-Way Drag & Drop Editor', null, function() {
                    openVisualMermaidEditor(mText);
                });
                menu.addItem('📁 Save to Diagrams Workspace Hub', null, function() {
                    appPrompt('Save diagram', 'Imported Diagram', 'Saved into your default folder.').then(function(title) {
                        if (!title) return;
                        var data = getWorkspaceData();
                        data.diagrams.unshift({
                            id: 'diag_' + Date.now(),
                            title: title,
                            folderId: getDefaultFolderId(data),
                            code: mText,
                            typeLabel: detectDiagramType(mText).label,
                            svgPreview: STARTER_SVGS.flowchart,
                            updatedAt: Date.now(),
                            starred: false
                        });
                        saveWorkspaceData(data);
                        if (ui.showStatus) ui.showStatus('✓ Saved diagram to workspace', 2500);
                    });
                });
            }
        };

        // ==========================================
        // 16. EXTENDED PALETTES IN SIDEBAR (GUARDED)
        // ==========================================
        try {
            if (ui.sidebar && ui.sidebar.addPaletteFunctions && !ui.sidebar._customMermaidPalettesAdded) {
                ui.sidebar._customMermaidPalettesAdded = true;
                var sb = ui.sidebar;

                // Radar & Spider
                sb.addPaletteFunctions('radarSpider', 'Radar & Spider Diagrams', true, [
                    sb.createVertexTemplateEntry(
                        'shape=mxgraph.basic.polygon;polyCoords=[[0.5,0],[1,0.38],[0.81,1],[0.19,1],[0,0.38]];fillColor=none;strokeColor=#4F46E5;strokeWidth=2;',
                        160, 160, '', '5-Axis Radar Grid', true, null, 'radar spider 5 axis'
                    ),
                    sb.createVertexTemplateEntry(
                        'shape=mxgraph.basic.polygon;polyCoords=[[0.5,0.15],[0.85,0.4],[0.7,0.85],[0.3,0.8],[0.15,0.45]];fillColor=#818CF8;fillOpacity=40;strokeColor=#4338CA;strokeWidth=2;',
                        160, 160, '', '5-Axis Data Area', true, null, 'radar spider data polygon'
                    ),
                    sb.createVertexTemplateEntry(
                        'shape=hexagon;perimeter=hexagonPerimeter2;fixedSize=1;size=20;fillColor=none;strokeColor=#059669;strokeWidth=2;',
                        160, 140, 'Performance\n\n\n\nReliability', '6-Axis Hexagon Spider Grid', true, null, 'spider hexagon 6 axis'
                    ),
                    sb.createVertexTemplateEntry(
                        'shape=mxgraph.basic.polygon;polyCoords=[[0.5,0.1],[0.88,0.3],[0.75,0.8],[0.5,0.9],[0.2,0.7],[0.15,0.3]];fillColor=#34D399;fillOpacity=45;strokeColor=#059669;strokeWidth=2;',
                        160, 140, '', '6-Axis Spider Data Polygon', true, null, 'spider data series'
                    )
                ]);

                // Mind Maps
                sb.addPaletteFunctions('mindmapsCustom', 'Mind Maps & Brainstorming', true, [
                    sb.createVertexTemplateEntry(
                        'ellipse;whiteSpace=wrap;html=1;fillColor=#DBEAFE;strokeColor=#2563EB;strokeWidth=3;fontStyle=1;fontSize=14;fontColor=#1E3A8A;',
                        140, 70, 'Central Concept', 'Central Topic', true, null, 'mindmap root concept central'
                    ),
                    sb.createVertexTemplateEntry(
                        'rounded=1;whiteSpace=wrap;html=1;arcSize=40;fillColor=#FEF3C7;strokeColor=#D97706;strokeWidth=2;fontStyle=1;fontSize=12;fontColor=#92400E;',
                        120, 50, 'Branch Topic', 'Branch Node', true, null, 'mindmap branch topic'
                    ),
                    sb.createVertexTemplateEntry(
                        'rounded=1;whiteSpace=wrap;html=1;arcSize=50;fillColor=#F3F4F6;strokeColor=#6B7280;strokeWidth=1;fontSize=11;fontColor=#374151;',
                        100, 36, 'Sub-topic', 'Sub-Topic Node', true, null, 'mindmap subtopic child leaf'
                    )
                ]);

                // Infographics & Flow
                sb.addPaletteFunctions('infographicsSuite', 'Infographics & Flow Visualization', true, [
                    sb.createVertexTemplateEntry(
                        'swimlane;fontStyle=1;align=center;verticalAlign=middle;childLayout=stackLayout;horizontal=1;startSize=30;horizontalStack=0;resizeParent=1;resizeParentMax=0;resizeLast=0;collapsible=0;marginBottom=0;html=1;fillColor=#1E293B;strokeColor=#334155;fontColor=#F8FAFC;rounded=1;arcSize=10;',
                        180, 110, 'System Health\n<h1 style="margin:4px 0;font-size:26px;color:#38BDF8;">99.9%</h1><span style="font-size:11px;color:#94A3B8;">▲ SLA Target Met</span>',
                        'KPI Metric Card', true, null, 'infographic kpi metric stat card'
                    ),
                    sb.createVertexTemplateEntry(
                        'shape=step;perimeter=stepPerimeter;whiteSpace=wrap;html=1;fixedSize=1;size=20;fillColor=#3B82F6;strokeColor=none;fontColor=#ffffff;fontStyle=1;fontSize=12;',
                        140, 50, 'Step 1: Intake', 'Process Chevron Step', true, null, 'infographic chevron process funnel flow'
                    )
                ]);
            }
        } catch (e) {
            console.warn('Could not register custom palettes:', e);
        }

        // Mount Native Toolbar Buttons and Side Panel Collapsers
        injectNativeToolbarButtons(ui);
        setupSidePanelCollapsers(ui);

        console.log('✓ Universal Mermaid Studio, Diagrams Hub & Two-Way Visual Editor Plugin Loaded Successfully');
    }

    // ==========================================
    // 17. IDEMPOTENT REGISTRATION LIFECYCLE
    // ==========================================
    if (typeof window.Draw !== 'undefined' && typeof window.Draw.loadPlugin === 'function') {
        Draw.loadPlugin(initMermaidStudioPlugin);
    }

    if (typeof window.EditorUi !== 'undefined' && EditorUi.prototype && !EditorUi.prototype._mermaidStudioHooked) {
        EditorUi.prototype._mermaidStudioHooked = true;
        var origEditorUiInit = EditorUi.prototype.init;
        EditorUi.prototype.init = function() {
            var res = origEditorUiInit.apply(this, arguments);
            window.__activeDrawioUi = this;
            try { initMermaidStudioPlugin(this); } catch (e) { console.error(e); }
            return res;
        };
    }

    // Fallback polling timer (runs if Draw.loadPlugin was missed or script injected dynamically)
    var pollCount = 0;
    var initInterval = setInterval(function() {
        if (window.__mermaidStudioPluginInitialized) {
            clearInterval(initInterval);
            return;
        }
        pollCount++;

        var activeUi = window.__activeDrawioUi ||
            (window.App && window.App.instances && window.App.instances[0]) ||
            window.editorUi || window.ui;

        if (activeUi && activeUi.editor && activeUi.editor.graph) {
            clearInterval(initInterval);
            initMermaidStudioPlugin(activeUi);
            return;
        }

        if (typeof window.EditorUi !== 'undefined' && EditorUi.prototype && !EditorUi.prototype._mermaidStudioHooked) {
            EditorUi.prototype._mermaidStudioHooked = true;
            var origInit = EditorUi.prototype.init;
            EditorUi.prototype.init = function() {
                var res = origInit.apply(this, arguments);
                window.__activeDrawioUi = this;
                try { initMermaidStudioPlugin(this); } catch (e) { console.error(e); }
                return res;
            };
        }

        if (typeof window.Draw !== 'undefined' && typeof window.Draw.loadPlugin === 'function') {
            Draw.loadPlugin(initMermaidStudioPlugin);
        }

        if (pollCount > 120) {
            clearInterval(initInterval);
        }
    }, 300);

})();
