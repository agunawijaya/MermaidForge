// Tauri 2.x global API surface — tauri.conf.json has withGlobalTauri=true.
import { TEMPLATES, CATEGORIES } from './templates.js';

const Tauri = () => window.__TAURI__;
const invoke = (...a) => Tauri()?.core?.invoke(...a);

// ============================================================
//  Lucide MIT-licensed icon paths for the app toolbar (T4.6.2.3).
//  Each entry contains the inner SVG markup; injectIcons() wraps it
//  in a <svg> with currentColor stroke.
// ============================================================
const ICONS = {
  'file-plus':   '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="11" x2="12" y2="17"/><line x1="9" y1="14" x2="15" y2="14"/>',
  'folder-open': '<path d="M6 14l1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.55 6a2 2 0 0 1-1.94 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.93a2 2 0 0 1 1.66.9l.82 1.2a2 2 0 0 0 1.66.9H18a2 2 0 0 1 2 2v2"/>',
  'save':        '<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/>',
  'save-as':     '<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h9"/><polyline points="13 3 13 8 19 8"/><circle cx="17" cy="17" r="4"/><line x1="17" y1="15" x2="17" y2="19"/><line x1="15" y1="17" x2="19" y2="17"/>',
  'undo':        '<path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6.4 2.6L3 13"/>',
  'redo':        '<path d="M21 7v6h-6"/><path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6.4 2.6L21 13"/>',
  'export':      '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>',
  'copy':        '<rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
};

function injectIcons() {
  document.querySelectorAll('[data-icon]').forEach(btn => {
    const icon = btn.dataset.icon;
    if (!ICONS[icon]) return;
    const svg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">${ICONS[icon]}</svg>`;
    const caret = btn.classList.contains('atb-with-caret')
      ? '<span class="atb-caret">&#9662;</span>'
      : '';
    btn.innerHTML = svg + caret;
  });
}

// ============================================================
//  Module-level state
// ============================================================
let editor, preview, statusMessageEl;
let renderTimer = null;
let renderSeq = 0;
let currentTemplateId = null;
let currentFilePath = null;     // null = template or unsaved buffer; non-null = file on disk
let lastLoadedSource = null;    // dirty-state comparison anchor
let statusResetTimer = null;

// ============================================================
//  Status message helper (wired in T4.6.2; reused by export, etc.)
// ============================================================
// T7: showStatus accepts an optional type for visual differentiation
// (info / success / warning / error). Backward-compatible with existing
// two-arg call sites.
const STATUS_ICONS = { info: '', success: '✓', warning: '⚠', error: '✕' };

function showStatus(message, autoResetMs, type = 'info') {
  if (!statusMessageEl) return;
  if (statusResetTimer) { clearTimeout(statusResetTimer); statusResetTimer = null; }
  const icon = STATUS_ICONS[type] || '';
  statusMessageEl.textContent = icon ? `${icon}  ${message}` : message;
  statusMessageEl.dataset.type = type;
  if (autoResetMs && autoResetMs > 0) {
    statusResetTimer = setTimeout(() => {
      statusMessageEl.textContent = 'Ready';
      statusMessageEl.dataset.type = 'info';
      statusResetTimer = null;
    }, autoResetMs);
  }
}

function resetStatus() {
  if (!statusMessageEl) return;
  if (statusResetTimer) { clearTimeout(statusResetTimer); statusResetTimer = null; }
  statusMessageEl.textContent = 'Ready';
  statusMessageEl.dataset.type = 'info';
}

// ============================================================
//  Rendering
// ============================================================
async function renderNow() {
  if (!window.__mermaid) return;
  const src = editor.value;
  const seq = ++renderSeq;
  const id = 'preview-svg-' + seq;
  try {
    const { svg } = await window.__mermaid.render(id, src);
    if (seq !== renderSeq) return;
    preview.innerHTML = svg;
    // Re-apply diagram zoom against the freshly-mounted SVG.
    applyZoom('diagram');
  } catch (e) {
    if (seq !== renderSeq) return;
    preview.innerHTML = '';
    const err = document.createElement('pre');
    err.className = 'err';
    err.textContent = String(e?.message || e);
    preview.appendChild(err);
  }
}

function scheduleRender() {
  if (renderTimer) clearTimeout(renderTimer);
  renderTimer = setTimeout(renderNow, 50);
}

function onSourceChanged() {
  scheduleRender();
  updateTitle();
  syncFlowchartButtons();
  syncDirectionDropdown();
}

// ============================================================
//  Dirty-state + doc name
// ============================================================
function isDirty() {
  if (lastLoadedSource === null) return false;
  return editor.value !== lastLoadedSource;
}
function currentTemplateName() {
  const t = TEMPLATES.find(x => x.id === currentTemplateId);
  return t ? t.name : null;
}
function currentFileBasename() {
  if (!currentFilePath) return null;
  return currentFilePath.split(/[\\/]/).pop();
}
function currentDocName() {
  return currentFileBasename() || currentTemplateName() || 'Untitled';
}

// ============================================================
//  Native dialog helpers
// ============================================================
async function confirmDiscardIfDirty(actionDescription) {
  if (!isDirty()) return true;
  const ask = Tauri()?.dialog?.ask;
  if (!ask) {
    console.warn('Tauri dialog API unavailable; assuming proceed.');
    return true;
  }
  return await ask(
    `You have unsaved changes.\n\n${actionDescription} will discard them.\n\nContinue?`,
    {
      title: 'Unsaved changes',
      kind: 'warning',
      okLabel: 'Discard changes',
      cancelLabel: 'Keep editing',
    }
  );
}

async function showError(message) {
  const msg = Tauri()?.dialog?.message;
  if (msg) {
    await msg(message, { title: 'Mermaid Forge', kind: 'error', okLabel: 'OK' });
  } else {
    console.error(message);
  }
}

// ============================================================
//  Window title
// ============================================================
async function updateTitle() {
  const dirtyMark = isDirty() ? '• ' : '';
  const title = `${dirtyMark}${currentDocName()} — Mermaid Forge`;
  document.title = title;
  try {
    const win = Tauri()?.window?.getCurrentWindow?.() ?? Tauri()?.window?.getCurrent?.();
    if (win?.setTitle) await win.setTitle(title);
  } catch (e) {
    console.warn('setTitle failed:', e);
  }
  // Tell Rust so the Window submenu in OTHER windows can refresh
  // their entry for this window. Best-effort — never fails the title set.
  try {
    if (invoke) await invoke('notify_title_changed', { title });
  } catch (e) {
    console.warn('notify_title_changed failed:', e);
  }
}

// ============================================================
//  Multi-window plumbing (Task 8)
// ============================================================
async function openNewWindow(initialPath = null) {
  if (!invoke) {
    await showError('Tauri invoke API unavailable; cannot open new window.');
    return null;
  }
  try {
    return await invoke('open_new_window', { initialPath });
  } catch (err) {
    console.error('[openNewWindow]', err);
    showStatus(`Failed to open new window: ${err}`, 5000, 'error');
    return null;
  }
}

function getInitialFilePath() {
  try {
    const params = new URLSearchParams(window.location.search);
    const file = params.get('file');
    return file ? decodeURIComponent(file) : null;
  } catch {
    return null;
  }
}

// Initial state entry: replaces the unconditional first-template load.
// If the URL has ?file=<path>, load that file in this window; else
// load the default first template.
async function loadInitialState() {
  const path = getInitialFilePath();
  if (!path) {
    if (TEMPLATES.length > 0) loadTemplate(TEMPLATES[0]);
    return;
  }
  const readTextFile = Tauri()?.fs?.readTextFile;
  if (!readTextFile) {
    showStatus('Tauri fs API unavailable; cannot load initial file.', 5000, 'error');
    if (TEMPLATES.length > 0) loadTemplate(TEMPLATES[0]);
    return;
  }
  try {
    const contents = await readTextFile(path);
    editor.value = contents;
    lastLoadedSource = contents;
    currentFilePath = path;
    currentTemplateId = null;
    updateSelectedSidebar();
    updateTitle();
    resetUndoStack();
    syncFlowchartButtons();
    syncDirectionDropdown();
    renderNow();
    showStatus(`Opened ${path.split(/[\\/]/).pop()}`, 2000, 'success');
  } catch (err) {
    console.error('Failed to load initial file:', err);
    showStatus(`Failed to load ${path}: ${err.message || err}`, 5000, 'error');
    if (TEMPLATES.length > 0) loadTemplate(TEMPLATES[0]);
  }
}

// ============================================================
//  Custom undo stack (T4.6.1)
// ============================================================
const UNDO_LIMIT = 50;
const UNDO_DEBOUNCE_MS = 300;
const undoStack = [];
let undoIndex = -1;
let undoTimer = null;

function snapshotEditor() {
  return {
    value: editor.value,
    selectionStart: editor.selectionStart,
    selectionEnd: editor.selectionEnd,
  };
}
function statesEqual(a, b) {
  return a && b && a.value === b.value;
}
function pushUndoState() {
  const snap = snapshotEditor();
  if (undoIndex < undoStack.length - 1) {
    undoStack.splice(undoIndex + 1);
  }
  if (statesEqual(undoStack[undoIndex], snap)) return;
  undoStack.push(snap);
  if (undoStack.length > UNDO_LIMIT) {
    undoStack.shift();
  }
  undoIndex = undoStack.length - 1;
  updateUndoButtons();
}

function updateUndoButtons() {
  const undoBtn = document.querySelector('#tb-edit-undo');
  const redoBtn = document.querySelector('#tb-edit-redo');
  if (undoBtn) undoBtn.disabled = undoIndex <= 0;
  if (redoBtn) redoBtn.disabled = undoIndex >= undoStack.length - 1;
}
function pushUndoStateDebounced() {
  if (undoTimer) clearTimeout(undoTimer);
  undoTimer = setTimeout(() => {
    undoTimer = null;
    pushUndoState();
  }, UNDO_DEBOUNCE_MS);
}
function flushPendingUndo() {
  if (!undoTimer) return;
  clearTimeout(undoTimer);
  undoTimer = null;
  pushUndoState();
}
function restoreUndoState(state) {
  editor.value = state.value;
  editor.selectionStart = state.selectionStart;
  editor.selectionEnd = state.selectionEnd;
  // After restore, re-derive everything that depends on source.
  scheduleRender();
  updateTitle();
  syncFlowchartButtons();
  syncDirectionDropdown();
}
function customUndo() {
  flushPendingUndo();
  if (undoIndex <= 0) return;
  undoIndex--;
  restoreUndoState(undoStack[undoIndex]);
  updateUndoButtons();
}
function customRedo() {
  if (undoIndex >= undoStack.length - 1) return;
  undoIndex++;
  restoreUndoState(undoStack[undoIndex]);
  updateUndoButtons();
}
function resetUndoStack() {
  undoStack.length = 0;
  undoIndex = -1;
  if (undoTimer) { clearTimeout(undoTimer); undoTimer = null; }
  pushUndoState();
}
// Mutator wrapper for toolbar-driven code mutations.
function mutateEditor(newValueAndSelection) {
  flushPendingUndo();
  editor.value = newValueAndSelection.value;
  editor.selectionStart = newValueAndSelection.selectionStart ?? 0;
  editor.selectionEnd   = newValueAndSelection.selectionEnd   ?? 0;
  pushUndoState();
  onSourceChanged();
}

// ============================================================
//  Layout prefs (T4.6.3 + T4.6.4) — sidebar + code collapse
// ============================================================
const LAYOUT_PREFS_KEY = 'mermaidforge.layoutPrefs';
function getLayoutPrefs() {
  try { return JSON.parse(localStorage.getItem(LAYOUT_PREFS_KEY)) || {}; }
  catch { return {}; }
}
function setLayoutPref(key, value) {
  const prefs = getLayoutPrefs();
  prefs[key] = value;
  localStorage.setItem(LAYOUT_PREFS_KEY, JSON.stringify(prefs));
}
function setSidebarCollapsed(collapsed) {
  document.querySelector('#sidebar').classList.toggle('collapsed', collapsed);
  document.querySelector('#sidebar-restore').hidden = !collapsed;
  document.querySelector('.status-bar')?.classList.toggle('sidebar-collapsed', collapsed);
  setLayoutPref('sidebarCollapsed', collapsed);
}
function setCodeCollapsed(collapsed) {
  document.querySelector('#code-pane').classList.toggle('collapsed', collapsed);
  document.querySelector('#code-restore').hidden = !collapsed;
  document.querySelector('.status-bar')?.classList.toggle('code-collapsed', collapsed);
  setLayoutPref('codeCollapsed', collapsed);
}

// ============================================================
//  Theme (T4.6.8 dropdown)
// ============================================================
const THEME_KEY = 'mermaidforge.theme';
function getThemePref() {
  return localStorage.getItem(THEME_KEY) || 'default';
}
function setThemePref(theme) {
  localStorage.setItem(THEME_KEY, theme);
}
function applyMermaidTheme(theme) {
  if (window.__mermaid) {
    window.__mermaid.initialize({ startOnLoad: false, theme });
  }
}

// ============================================================
//  Zoom (T4.6.5 / T4.6.6 / T4.6.7)
// ============================================================
const ZOOM_PREFS_KEY = 'mermaidforge.zoomPrefs';
const ZOOM_MIN = 0.25;
const ZOOM_MAX = 4.0;
const ZOOM_STEP = 0.25;
const ZOOM_DEFAULT = 1.0;
const CODE_BASE_FONT_PX = 13;

const zoomState = { code: ZOOM_DEFAULT, diagram: ZOOM_DEFAULT };

// Task 8: zoom is per-window, in-memory only. Persisting via
// localStorage would re-introduce cross-window shared state, violating
// the state-isolation principle. Each new window starts at default
// zoom; the value lives only in the `zoomState` module-level object.
function getZoomPrefs() { return {}; }
function setZoomPref(_target, _value) { /* intentional no-op (T8 S6) */ }
function clampZoom(v) {
  return Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, v));
}
function setZoom(target, value) {
  const v = clampZoom(value);
  zoomState[target] = v;
  applyZoom(target);
  setZoomPref(target, v);
  updateZoomReadout(target);
}
function applyZoom(target) {
  const z = zoomState[target];
  if (target === 'code') {
    if (editor) {
      // setProperty with 'important' so this beats #editor's stylesheet rule
      // even if some future CSS specificity quirk would otherwise out-rank
      // the inline style attribute.
      editor.style.setProperty('font-size', `${CODE_BASE_FONT_PX * z}px`, 'important');
    }
    return;
  }
  if (target === 'diagram') {
    if (!preview) return;
    const svg = preview.querySelector('svg');
    if (!svg) return;
    let natW = parseFloat(svg.getAttribute('width'));
    let natH = parseFloat(svg.getAttribute('height'));
    if ((!natW || !natH) && svg.viewBox && svg.viewBox.baseVal) {
      natW = svg.viewBox.baseVal.width;
      natH = svg.viewBox.baseVal.height;
    }
    if (!natW || !natH) {
      const bbox = svg.getBoundingClientRect();
      natW = bbox.width || 600;
      natH = bbox.height || 400;
    }
    svg.style.transformOrigin = '0 0';
    svg.style.transform = `scale(${z})`;
    svg.style.maxWidth = 'none';
    svg.style.width  = `${natW}px`;
    svg.style.height = `${natH}px`;
    // Wrap SVG so #preview gets scrollbars sized to the scaled content.
    let wrap = preview.querySelector('.svg-wrap');
    if (!wrap) {
      wrap = document.createElement('div');
      wrap.className = 'svg-wrap';
      svg.parentNode.insertBefore(wrap, svg);
      wrap.appendChild(svg);
    }
    wrap.style.width  = `${natW * z}px`;
    wrap.style.height = `${natH * z}px`;
    wrap.style.position = 'relative';
  }
}
function updateZoomReadout(target) {
  const el = document.querySelector(`.zoom-readout[data-target="${target}"]`);
  if (el) el.textContent = `${Math.round(zoomState[target] * 100)}%`;
}
function initZoom() {
  const prefs = getZoomPrefs();
  zoomState.code    = clampZoom(prefs.code    ?? ZOOM_DEFAULT);
  zoomState.diagram = clampZoom(prefs.diagram ?? ZOOM_DEFAULT);
  applyZoom('code');
  applyZoom('diagram');
  updateZoomReadout('code');
  updateZoomReadout('diagram');
}

// ============================================================
//  Flowchart detection + Direction/Layout sync (T4.6.9 / T4.6.10 / T4.6.11)
// ============================================================
function stripFrontmatter(code) {
  return code.replace(/^---\s*\n[\s\S]*?\n---\s*\n/, '');
}
function isFlowchart(code) {
  const noFm = stripFrontmatter(code);
  const firstLine = noFm.split('\n').find(l => l.trim() !== '');
  return firstLine ? /^\s*(?:flowchart|graph)\b/i.test(firstLine) : false;
}
function currentDirection(code) {
  const m = code.match(/^(?:flowchart|graph)\s+(TB|TD|BT|LR|RL)\b/im);
  return m ? m[1] : '';
}
function syncFlowchartButtons() {
  const code = editor ? editor.value : '';
  const enable = isFlowchart(code);
  const dir = document.querySelector('#tb-direction');
  const lay = document.querySelector('#tb-layout');
  if (dir) {
    dir.disabled = !enable;
    dir.title = enable
      ? 'Flowchart direction'
      : 'Direction applies to flowcharts only';
  }
  if (lay) {
    lay.disabled = !enable;
    lay.title = enable
      ? 'Layout engine'
      : 'Layout applies to flowcharts only';
  }
  syncExportAvailability(enable);
}

// Per-format export availability. PPTX and VSDX engines only support
// flowcharts; PNG/SVG can render anything Mermaid renders.
function syncExportAvailability(isFlow) {
  const availability = {
    pptx: isFlow,
    vsdx: isFlow,
    png:  true,
    svg:  true,
  };
  document.querySelectorAll('#tb-export-menu .atb-menu-item').forEach((item) => {
    const fmt = item.dataset.format;
    const ok = availability[fmt] ?? true;
    item.disabled = !ok;
    item.title = ok
      ? ''
      : `${fmt.toUpperCase()} export is only available for flowcharts`;
  });
}
function syncDirectionDropdown() {
  const dir = document.querySelector('#tb-direction');
  if (!dir) return;
  const cur = currentDirection(editor ? editor.value : '');
  dir.dataset.current = cur;
  // Show placeholder text reflecting current direction when set.
  const placeholderOpt = dir.querySelector('option[value=""]');
  if (placeholderOpt) {
    placeholderOpt.textContent = cur ? `Direction: ${cur}` : 'Direction…';
  }
}

function changeDirection(newDir) {
  const oldValue = editor.value;
  const re = /^(\s*(?:flowchart|graph)\s+)(TB|TD|BT|LR|RL)\b/im;
  const match = oldValue.match(re);
  if (!match) {
    showStatus('Direction applies to flowcharts only', 2000, 'warning');
    return;
  }
  if (match[2] === newDir) return;
  const newValue = oldValue.replace(re, `$1${newDir}`);
  const cursorPos = editor.selectionStart;
  mutateEditor({
    value: newValue,
    selectionStart: cursorPos,
    selectionEnd: cursorPos,
  });
}

function ensureElkInFrontmatter(code) {
  const fmRe = /^---\s*\n([\s\S]*?)\n---\s*\n/;
  const match = code.match(fmRe);
  if (!match) {
    return `---\nconfig:\n  layout: elk\n---\n` + code;
  }
  let fm = match[1];
  const cfgRe = /^(\s*)config:\s*\n((?:[ \t]+\S.*\n?)*)/m;
  const cfgMatch = fm.match(cfgRe);
  if (cfgMatch) {
    if (/^[ \t]+layout:\s*/m.test(cfgMatch[2])) {
      fm = fm.replace(/^([ \t]+)layout:[ \t]*.+$/m, '$1layout: elk');
    } else {
      fm = fm.replace(cfgRe, (_m, indent, body) => {
        const trailing = body.endsWith('\n') ? '' : '\n';
        return `${indent}config:\n${body}${trailing}${indent}  layout: elk\n`;
      });
    }
  } else {
    fm = (fm.trimEnd() + '\nconfig:\n  layout: elk');
  }
  return `---\n${fm}\n---\n` + code.slice(match[0].length);
}
function removeElkFromFrontmatter(code) {
  const fmRe = /^---\s*\n([\s\S]*?)\n---\s*\n/;
  const match = code.match(fmRe);
  if (!match) return code;
  let fm = match[1];
  fm = fm.replace(/^[ \t]+layout:[ \t]*elk[ \t]*\r?\n?/m, '');
  // If config block is now empty (no further indented body), remove it.
  fm = fm.replace(/^config:[ \t]*\n(?![ \t]+\S)/m, '');
  // Collapse blank lines and trim.
  fm = fm.split('\n').map(l => l.replace(/\s+$/, '')).join('\n');
  fm = fm.replace(/\n{2,}/g, '\n').replace(/^\n+|\n+$/g, '');
  if (fm === '') {
    return code.slice(match[0].length);
  }
  return `---\n${fm}\n---\n` + code.slice(match[0].length);
}
function setLayout(layout) {
  const oldValue = editor.value;
  let newValue;
  try {
    newValue = layout === 'elk'
      ? ensureElkInFrontmatter(oldValue)
      : removeElkFromFrontmatter(oldValue);
  } catch (e) {
    console.warn('Layout mutation failed; no-op:', e);
    return;
  }
  if (newValue === oldValue) return;
  const cursorPos = editor.selectionStart;
  const delta = newValue.length - oldValue.length;
  const newCursor = Math.max(0, cursorPos + delta);
  mutateEditor({
    value: newValue,
    selectionStart: newCursor,
    selectionEnd: newCursor,
  });
}

// ============================================================
//  Template loading
// ============================================================
function loadTemplate(template) {
  editor.value = template.source;
  lastLoadedSource = template.source;
  currentTemplateId = template.id;
  currentFilePath = null;
  updateSelectedSidebar();
  updateTitle();
  resetUndoStack();
  syncFlowchartButtons();
  syncDirectionDropdown();
  renderNow();
}
async function handleTemplateClick(template) {
  if (template.id === currentTemplateId && !currentFilePath && !isDirty()) {
    return;
  }
  const proceed = await confirmDiscardIfDirty(`Loading "${template.name}"`);
  if (!proceed) return;
  loadTemplate(template);
}

// ============================================================
//  File operations
// ============================================================
function loadBlankEditor() {
  editor.value = '';
  lastLoadedSource = '';
  currentFilePath = null;
  currentTemplateId = null;
  updateSelectedSidebar();
  updateTitle();
  resetUndoStack();
  syncFlowchartButtons();
  syncDirectionDropdown();
  renderNow();
}

// Task 8 Q4 rewire: File → New always opens a fresh window. The
// current window is untouched — no dirty prompt needed.
async function handleFileNew() {
  await openNewWindow(null);
}

// Task 8 Q5 rewire: File → Open shows the dialog in the CURRENT window,
// then spawns a NEW window with the selected file. The current window's
// content is untouched — no dirty prompt needed.
async function handleFileOpen() {
  const open = Tauri()?.dialog?.open;
  if (!open) { await showError('Tauri dialog API unavailable.'); return; }

  let selected;
  try {
    selected = await open({
      multiple: false,
      filters: [{ name: 'Mermaid diagram', extensions: ['mmd', 'mermaid'] }],
      title: 'Open Mermaid file',
    });
  } catch (e) {
    await showError(`Open dialog failed:\n\n${e}`);
    return;
  }
  if (!selected) {
    showStatus('Open cancelled', 1500, 'warning');
    return;
  }
  const path = Array.isArray(selected) ? selected[0] : selected;
  await openNewWindow(path);
}

async function handleFileSave() {
  if (!currentFilePath) return handleFileSaveAs();
  const writeTextFile = Tauri()?.fs?.writeTextFile;
  if (!writeTextFile) { await showError('Tauri fs API unavailable.'); return; }
  const editorContent = editor.value;
  try {
    await writeTextFile(currentFilePath, editorContent);
    lastLoadedSource = editorContent;
    updateTitle();
  } catch (e) {
    await showError(`Could not save file:\n\n${e}`);
  }
}

async function handleFileSaveAs() {
  const save = Tauri()?.dialog?.save;
  const writeTextFile = Tauri()?.fs?.writeTextFile;
  if (!save || !writeTextFile) { await showError('Tauri dialog/fs API unavailable.'); return; }

  const suggestedName = currentFileBasename()
    || ((currentTemplateName() || 'diagram') + '.mmd');

  let selected;
  try {
    selected = await save({
      filters: [{ name: 'Mermaid diagram', extensions: ['mmd'] }],
      defaultPath: suggestedName,
      title: 'Save Mermaid file',
    });
  } catch (e) {
    await showError(`Save dialog failed:\n\n${e}`);
    return;
  }
  if (!selected) return;

  const editorContent = editor.value;
  try {
    await writeTextFile(selected, editorContent);
    currentFilePath = selected;
    currentTemplateId = null;
    lastLoadedSource = editorContent;
    updateSelectedSidebar();
    updateTitle();
  } catch (e) {
    await showError(`Could not save file:\n\n${e}`);
  }
}

// ============================================================
//  Sidebar rendering
// ============================================================
function renderSidebar() {
  const nav = document.querySelector('.template-list');
  nav.innerHTML = '';
  for (const cat of CATEGORIES) {
    const heading = document.createElement('div');
    heading.className = 'category-heading';
    heading.textContent = cat;
    nav.appendChild(heading);

    for (const t of TEMPLATES.filter(x => x.category === cat)) {
      const item = document.createElement('button');
      item.className = 'template-item';
      item.dataset.templateId = t.id;
      item.textContent = t.name;
      item.addEventListener('click', () => handleTemplateClick(t));
      nav.appendChild(item);
    }
  }
}
function updateSelectedSidebar() {
  document.querySelectorAll('.template-item').forEach(el => {
    el.classList.toggle('selected', !currentFilePath && el.dataset.templateId === currentTemplateId);
  });
}

// ============================================================
//  Editor input handler
// ============================================================
function onEditorInput() {
  pushUndoStateDebounced();
  onSourceChanged();
}

// ============================================================
//  Menu events
// ============================================================
async function bindMenuEvents() {
  const listen = Tauri()?.event?.listen;
  if (!listen) {
    console.warn('Tauri event.listen unavailable; menu events will not fire.');
    return;
  }
  await listen('menu-event', (event) => {
    const id = event.payload;
    switch (id) {
      case 'file_new':     handleFileNew();     break;
      case 'file_open':    handleFileOpen();    break;
      case 'file_save':    handleFileSave();    break;
      case 'file_save_as': handleFileSaveAs();  break;
      case 'file_exit':    requestExit();       break;
      case 'help_about':   showAboutDialog();   break;
    }
  });
}
async function requestExit() {
  try {
    const win = Tauri()?.window?.getCurrentWindow?.() ?? Tauri()?.window?.getCurrent?.();
    if (win?.close) await win.close();
  } catch (e) {
    console.warn('requestExit failed:', e);
  }
}
async function showAboutDialog() {
  const msg = Tauri()?.dialog?.message;
  if (!msg) return;
  await msg(
    'Mermaid Forge\n\n' +
    'Version: 0.1.0\n' +
    'Built with Tauri 2.x and Mermaid v11.15.0\n\n' +
    'Convert Mermaid diagrams to editable PowerPoint files.\n' +
    'Developed by Ardhivipala.\n' +
    '© 2026',
    { title: 'About Mermaid Forge', kind: 'info', okLabel: 'OK' }
  );
}

// ============================================================
//  Close-window prompt
// ============================================================
async function wireCloseHandler() {
  try {
    const win = Tauri()?.window?.getCurrentWindow?.() ?? Tauri()?.window?.getCurrent?.();
    if (!win?.onCloseRequested) return;
    await win.onCloseRequested(async (event) => {
      if (!isDirty()) return;
      event.preventDefault();
      const proceed = await confirmDiscardIfDirty('Closing the app');
      if (proceed) {
        await win.destroy();
      }
    });
  } catch (e) {
    console.warn('Close handler wiring failed:', e);
  }
}

// ============================================================
//  Diagram toolbar wiring (T4.6.8)
// ============================================================
let panActive = false;
let panState = null;

function setPanMode(on) {
  panActive = on;
  preview.classList.toggle('panning', on);
  document.querySelector('#tb-pan').classList.toggle('active', on);
}

function onPanMouseDown(e) {
  if (!panActive || e.button !== 0) return;
  e.preventDefault();
  panState = {
    x: e.clientX,
    y: e.clientY,
    sl: preview.scrollLeft,
    st: preview.scrollTop,
  };
}
function onPanMouseMove(e) {
  if (!panState) return;
  preview.scrollLeft = panState.sl - (e.clientX - panState.x);
  preview.scrollTop  = panState.st - (e.clientY - panState.y);
}
function onPanMouseUp() { panState = null; }

function fitDiagram() {
  const svg = preview.querySelector('svg');
  if (!svg) return;
  let natW = parseFloat(svg.getAttribute('width'));
  let natH = parseFloat(svg.getAttribute('height'));
  if ((!natW || !natH) && svg.viewBox && svg.viewBox.baseVal) {
    natW = svg.viewBox.baseVal.width;
    natH = svg.viewBox.baseVal.height;
  }
  if (!natW || !natH) return;
  const padW = 32, padH = 32;
  const cw = Math.max(50, preview.clientWidth  - padW);
  const ch = Math.max(50, preview.clientHeight - padH);
  const fit = Math.min(cw / natW, ch / natH);
  setZoom('diagram', fit);
}

function wireDiagramToolbar() {
  document.querySelector('#tb-pan').addEventListener('click', () => {
    setPanMode(!panActive);
  });
  preview.addEventListener('mousedown', onPanMouseDown);
  window.addEventListener('mousemove', onPanMouseMove);
  window.addEventListener('mouseup', onPanMouseUp);

  document.querySelector('#tb-zoom-in').addEventListener('click', () => {
    setZoom('diagram', zoomState.diagram + ZOOM_STEP);
  });
  document.querySelector('#tb-zoom-out').addEventListener('click', () => {
    setZoom('diagram', zoomState.diagram - ZOOM_STEP);
  });
  document.querySelector('#tb-zoom-fit').addEventListener('click', fitDiagram);
  document.querySelector('#tb-zoom-reset').addEventListener('click', () => {
    setZoom('diagram', ZOOM_DEFAULT);
  });

  const themeEl = document.querySelector('#tb-theme');
  themeEl.value = getThemePref();
  themeEl.addEventListener('change', (e) => {
    const theme = e.target.value;
    setThemePref(theme);
    applyMermaidTheme(theme);
    renderNow();
  });

  document.querySelector('#tb-direction').addEventListener('change', (e) => {
    const newDir = e.target.value;
    e.target.value = '';
    if (!newDir) return;
    changeDirection(newDir);
  });

  document.querySelector('#tb-layout').addEventListener('change', (e) => {
    const value = e.target.value;
    e.target.value = '';
    if (!value) return;
    setLayout(value);
  });
}

// ============================================================
//  Status bar zoom controls + popover (T4.6.7)
// ============================================================
let openPopover = null;

function closeZoomPopover() {
  if (!openPopover) return;
  openPopover.remove();
  openPopover = null;
  document.removeEventListener('mousedown', outsideClickClose, true);
  window.removeEventListener('keydown', popoverEscClose, true);
}
function outsideClickClose(e) {
  if (!openPopover) return;
  if (openPopover.contains(e.target)) return;
  if (e.target.closest('.zoom-readout')) return;
  closeZoomPopover();
}
function popoverEscClose(e) {
  if (e.key === 'Escape') {
    e.preventDefault();
    closeZoomPopover();
  }
}
function openZoomPopover(target, anchorEl) {
  if (openPopover) {
    const sameTarget = openPopover.dataset.target === target;
    closeZoomPopover();
    if (sameTarget) return;
  }
  const pop = document.createElement('div');
  pop.className = 'zoom-popover';
  pop.dataset.target = target;
  pop.innerHTML = `
    <header>${target === 'code' ? 'Code zoom' : 'Diagram zoom'}</header>
    <div class="row">
      <input type="range" min="25" max="400" step="5" />
      <input type="number" min="25" max="400" />
    </div>
    <button class="reset-btn">Reset to 100%</button>
  `;
  document.body.appendChild(pop);
  const cur = Math.round(zoomState[target] * 100);
  const range = pop.querySelector('input[type=range]');
  const num   = pop.querySelector('input[type=number]');
  const reset = pop.querySelector('.reset-btn');
  range.value = cur;
  num.value   = cur;
  range.addEventListener('input', () => {
    num.value = range.value;
    setZoom(target, Number(range.value) / 100);
  });
  num.addEventListener('change', () => {
    let v = Math.max(25, Math.min(400, Number(num.value) || 100));
    num.value   = v;
    range.value = v;
    setZoom(target, v / 100);
  });
  num.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      let v = Math.max(25, Math.min(400, Number(num.value) || 100));
      num.value   = v;
      range.value = v;
      setZoom(target, v / 100);
      closeZoomPopover();
    }
  });
  reset.addEventListener('click', () => {
    range.value = 100;
    num.value   = 100;
    setZoom(target, 1.0);
  });
  // Position above the anchor, right-aligned.
  const rect = anchorEl.getBoundingClientRect();
  const popW = pop.offsetWidth || 240;
  const popH = pop.offsetHeight || 100;
  let left = rect.right - popW;
  if (left < 8) left = 8;
  let top  = rect.top - popH - 8;
  if (top < 8) top = rect.bottom + 8;
  pop.style.left = `${left}px`;
  pop.style.top  = `${top}px`;
  openPopover = pop;
  setTimeout(() => {
    document.addEventListener('mousedown', outsideClickClose, true);
    window.addEventListener('keydown', popoverEscClose, true);
  }, 0);
}

function wireStatusBarZoom() {
  document.querySelectorAll('.zoom-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.target;
      const action = btn.dataset.action;
      const delta = action === 'in' ? ZOOM_STEP : -ZOOM_STEP;
      setZoom(target, zoomState[target] + delta);
    });
  });
  document.querySelectorAll('.zoom-readout').forEach(el => {
    el.addEventListener('click', () => openZoomPopover(el.dataset.target, el));
  });
}

// ============================================================
//  Keyboard (T4.6.0.1, T4.6.1, T4.6.6)
// ============================================================
function currentZoomTarget() {
  if (document.activeElement === editor) return 'code';
  return 'diagram';
}

function wireKeyboard() {
  // File-op accelerators (hot-patch — Tauri 2.x menu accelerators not dispatching).
  // T4.6.0.1: restore the keydown listener for Ctrl+N / Ctrl+O / Ctrl+S / Ctrl+Shift+S.
  window.addEventListener('keydown', (e) => {
    if (!e.ctrlKey) return;
    const k = e.key.toLowerCase();
    if (k === 'n') {
      e.preventDefault();
      handleFileNew();
    } else if (k === 'o') {
      e.preventDefault();
      handleFileOpen();
    } else if (k === 's') {
      e.preventDefault();
      if (e.shiftKey) handleFileSaveAs();
      else handleFileSave();
    }
  });

  // Undo / redo
  window.addEventListener('keydown', (e) => {
    if (!e.ctrlKey) return;
    const k = e.key.toLowerCase();
    if (k === 'z' && !e.shiftKey) {
      e.preventDefault();
      customUndo();
    } else if (k === 'y' || (k === 'z' && e.shiftKey)) {
      e.preventDefault();
      customRedo();
    }
  });

  // Ctrl+= / Ctrl+- / Ctrl+0 zoom
  window.addEventListener('keydown', (e) => {
    if (!e.ctrlKey) return;
    if (e.key === '=' || e.key === '+') {
      e.preventDefault();
      const t = currentZoomTarget();
      setZoom(t, zoomState[t] + ZOOM_STEP);
    } else if (e.key === '-') {
      e.preventDefault();
      const t = currentZoomTarget();
      setZoom(t, zoomState[t] - ZOOM_STEP);
    } else if (e.key === '0') {
      e.preventDefault();
      const t = currentZoomTarget();
      setZoom(t, ZOOM_DEFAULT);
    }
  });

  // Ctrl+wheel zoom per pane
  editor.addEventListener('wheel', (e) => {
    if (!e.ctrlKey) return;
    e.preventDefault();
    setZoom('code', zoomState.code + (e.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP));
  }, { passive: false });
  preview.addEventListener('wheel', (e) => {
    if (!e.ctrlKey) return;
    e.preventDefault();
    setZoom('diagram', zoomState.diagram + (e.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP));
  }, { passive: false });
}

// ============================================================
//  Collapse buttons wiring (T4.6.3 + T4.6.4)
// ============================================================
function wireCollapseButtons() {
  document.querySelector('#sidebar-collapse').addEventListener('click', () => setSidebarCollapsed(true));
  document.querySelector('#sidebar-restore').addEventListener('click', () => setSidebarCollapsed(false));
  document.querySelector('#code-collapse').addEventListener('click', () => setCodeCollapsed(true));
  document.querySelector('#code-restore').addEventListener('click', () => setCodeCollapsed(false));

  const prefs = getLayoutPrefs();
  if (prefs.sidebarCollapsed) setSidebarCollapsed(true);
  if (prefs.codeCollapsed)    setCodeCollapsed(true);
}

// ============================================================
//  Export PPTX (existing) + SVG (new in T4.6.2.6)
// ============================================================
async function handleExportPptx() {
  if (!invoke) {
    await showError('Tauri API not available — are you in a browser?');
    return;
  }
  const code = editor ? editor.value : '';

  // Pre-check: PPTX engine supports flowcharts only.
  if (!isFlowchart(code)) {
    showStatus('PPTX export is only available for flowcharts', 3000, 'error');
    return;
  }

  const save = Tauri()?.dialog?.save;
  if (!save) {
    await showError('Tauri dialog API unavailable.');
    return;
  }

  const baseName = currentFilePath
    ? currentFilePath.replace(/\.mmd$/i, '').split(/[\\/]/).pop()
    : (currentTemplateName() || 'diagram');

  let outPath;
  try {
    outPath = await save({
      defaultPath: `${baseName}.pptx`,
      filters: [{ name: 'PowerPoint Presentation', extensions: ['pptx'] }],
      title: 'Export PPTX',
    });
  } catch (e) {
    await showError(`Save dialog failed:\n\n${e}`);
    return;
  }
  if (!outPath) {
    showStatus('Export cancelled', 1500);
    return;
  }

  showStatus('Generating PPTX…');
  try {
    const t0 = performance.now();
    await invoke('export_pptx', { mermaidSource: code, outputPath: outPath });
    const dt = (performance.now() - t0).toFixed(0);
    showStatus(`PPTX exported in ${dt} ms`, 3000, 'success');
    try { await Tauri()?.opener?.openPath(outPath); }
    catch (e) { console.warn('opener failed:', e); }
  } catch (err) {
    console.error('[handleExportPptx]', err);
    const raw = err?.message || String(err);
    let userMsg = `PPTX export failed: ${raw}`;
    if (/cycle/i.test(raw)) {
      userMsg = 'PPTX export failed: diagram contains cycles';
    } else if (/flowchart/i.test(raw)) {
      userMsg = 'PPTX export is only available for flowcharts';
    }
    showStatus(userMsg, 0, 'error');
  }
}

// ============================================================
//  Cycle detection (T6 B.3) — DFS over flowchart edges.
//  VSDX engine produces visually broken output for cycles, so block
//  export with a clear message before invoking the sidecar.
// ============================================================
function detectCycles(mermaidSource) {
  const code = mermaidSource.replace(/^---\s*\n[\s\S]*?\n---\s*\n/, '');
  // Strip node shape declarations so they don't get matched as edge targets.
  const stripped = code.replace(/\[[^\]]+\]|\([^)]+\)|\{[^}]+\}/g, '');
  const edges = [];
  const edgeRe = /([A-Za-z_][A-Za-z0-9_]*)\s*-->\s*(?:\|[^|]*\|\s*)?([A-Za-z_][A-Za-z0-9_]*)/g;
  let m;
  while ((m = edgeRe.exec(stripped)) !== null) {
    edges.push([m[1], m[2]]);
  }
  const graph = new Map();
  edges.forEach(([s, d]) => {
    if (!graph.has(s)) graph.set(s, []);
    graph.get(s).push(d);
  });
  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = new Map();
  edges.forEach(([s, d]) => {
    if (!color.has(s)) color.set(s, WHITE);
    if (!color.has(d)) color.set(d, WHITE);
  });
  const cycleNodes = new Set();
  function dfs(node) {
    color.set(node, GRAY);
    for (const next of (graph.get(node) || [])) {
      if (color.get(next) === GRAY) {
        cycleNodes.add(node);
        cycleNodes.add(next);
        return true;
      }
      if (color.get(next) === WHITE && dfs(next)) {
        cycleNodes.add(node);
        return true;
      }
    }
    color.set(node, BLACK);
    return false;
  }
  for (const node of color.keys()) {
    if (color.get(node) === WHITE && dfs(node)) {
      return { hasCycle: true, cycleNodes: [...cycleNodes] };
    }
  }
  return { hasCycle: false, cycleNodes: [] };
}

// ============================================================
//  Export VSDX (T6 B.4) — flowchart + cycle pre-checks, sidecar invoke
// ============================================================
async function handleExportVsdx() {
  const code = editor ? editor.value : '';

  if (!isFlowchart(code)) {
    showStatus('VSDX export is only available for flowcharts', 3000, 'error');
    return;
  }
  const cycleCheck = detectCycles(code);
  if (cycleCheck.hasCycle) {
    const cycleSummary = cycleCheck.cycleNodes.slice(0, 3).join(', ');
    showStatus(
      `VSDX export does not support cyclic flowcharts. Cycle involves: ${cycleSummary}`,
      6000,
      'error'
    );
    return;
  }

  const save = Tauri()?.dialog?.save;
  if (!save || !invoke) {
    await showError('Tauri dialog/invoke API unavailable.');
    return;
  }

  const baseName = currentFilePath
    ? currentFilePath.replace(/\.mmd$/i, '').split(/[\\/]/).pop()
    : (currentTemplateName() || 'diagram');

  let outPath;
  try {
    outPath = await save({
      defaultPath: `${baseName}.vsdx`,
      filters: [{ name: 'Visio Drawing', extensions: ['vsdx'] }],
      title: 'Export VSDX',
    });
  } catch (e) {
    await showError(`Save dialog failed:\n\n${e}`);
    return;
  }
  if (!outPath) {
    showStatus('Export cancelled', 1500);
    return;
  }

  showStatus('Generating VSDX…');
  try {
    const result = await invoke('export_vsdx', {
      mermaidSource: code,
      outputPath: outPath,
    });
    // Sidecar stdout is something like "OK <path> nodes=N edges=M size=B".
    const m = String(result || '').match(/nodes=(\d+)\s+edges=(\d+)/);
    if (m) {
      showStatus(`VSDX exported: ${m[1]} nodes, ${m[2]} edges`, 3000, 'success');
    } else {
      showStatus('VSDX exported', 3000, 'success');
    }
    try { await Tauri()?.opener?.openPath(outPath); }
    catch (e) { console.warn('opener failed:', e); }
  } catch (err) {
    console.error('[handleExportVsdx]', err);
    showStatus(`VSDX export failed: ${err.message || err}`, 0, 'error');
  }
}

async function handleExportSvg() {
  const svgEl = preview ? preview.querySelector('svg') : null;
  if (!svgEl) {
    showStatus('No diagram to export', 2000, 'error');
    return;
  }
  // Clone so we don't mutate the live preview; strip zoom transform so the
  // saved file is the unscaled diagram.
  const clone = svgEl.cloneNode(true);
  clone.style.transform = '';
  clone.style.width  = '';
  clone.style.height = '';
  clone.style.maxWidth = '';
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  if (!clone.getAttribute('xmlns:xlink')) {
    clone.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
  }
  const serializer = new XMLSerializer();
  const svgText =
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    serializer.serializeToString(clone);

  const save = Tauri()?.dialog?.save;
  const writeTextFile = Tauri()?.fs?.writeTextFile;
  if (!save || !writeTextFile) {
    await showError('Tauri dialog/fs API unavailable.');
    return;
  }

  const baseName = currentFilePath
    ? currentFilePath.replace(/\.mmd$/i, '').split(/[\\/]/).pop()
    : (currentTemplateName() || 'diagram');

  let path;
  try {
    path = await save({
      defaultPath: `${baseName}.svg`,
      filters: [{ name: 'SVG Vector Graphics', extensions: ['svg'] }],
      title: 'Export SVG',
    });
  } catch (e) {
    await showError(`Save dialog failed:\n\n${e}`);
    return;
  }
  if (!path) return;

  try {
    showStatus('Exporting SVG…');
    await writeTextFile(path, svgText);
    showStatus('SVG exported', 3000, 'success');
    try { await Tauri()?.opener?.openPath(path); }
    catch (e) { console.warn('opener failed:', e); }
  } catch (e) {
    showStatus('SVG export failed', 3000, 'error');
    await showError(`Could not write SVG:\n\n${e}`);
  }
}

// ============================================================
//  SVG → PNG rasterization (T4.7.2) — shared by Copy PNG + Export PNG
// ============================================================
const PNG_RENDER_SCALE = 2;       // baseline DPR multiplier
const PNG_MAX_SIDE     = 4000;    // px cap on either axis

async function rasterizeDiagramToPng() {
  const liveSvg = preview ? preview.querySelector('svg') : null;
  if (!liveSvg) {
    throw new Error('No diagram to rasterize');
  }

  // 1. Clone + clean inline overrides applied by the zoom system.
  const svg = liveSvg.cloneNode(true);
  svg.style.transform = '';
  svg.style.width     = '';
  svg.style.height    = '';
  svg.style.maxWidth  = '';
  if (!svg.getAttribute('xmlns')) {
    svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  }
  if (!svg.getAttribute('xmlns:xlink')) {
    svg.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
  }

  // 2. Natural dimensions: prefer viewBox; fall back to the live SVG's
  //    bounding rect divided by the current diagram zoom factor.
  let naturalW = 0;
  let naturalH = 0;
  const vb = svg.getAttribute('viewBox');
  if (vb) {
    const parts = vb.split(/\s+/).map(Number);
    if (parts.length === 4 && parts[2] > 0 && parts[3] > 0) {
      naturalW = parts[2];
      naturalH = parts[3];
    }
  }
  if (!naturalW || !naturalH) {
    const liveRect = liveSvg.getBoundingClientRect();
    const liveZoom = zoomState.diagram || 1;
    naturalW = liveRect.width  / liveZoom;
    naturalH = liveRect.height / liveZoom;
  }
  if (!naturalW || !naturalH) {
    throw new Error('Diagram has zero size — nothing to rasterize');
  }

  // 3. Render scale: 2x for crispness, then cap at PNG_MAX_SIDE per axis.
  let scale = PNG_RENDER_SCALE;
  let outW  = naturalW * scale;
  let outH  = naturalH * scale;
  if (outW > PNG_MAX_SIDE || outH > PNG_MAX_SIDE) {
    const k = Math.min(PNG_MAX_SIDE / outW, PNG_MAX_SIDE / outH);
    scale *= k;
    outW = naturalW * scale;
    outH = naturalH * scale;
  }

  // 4. Theme-aware background: prefer #preview's computed bg, fall back
  //    to body bg, finally white. (Mermaid embeds the theme palette in
  //    its own <style>, but the SVG itself is transparent.)
  const transparent = (c) =>
    !c || c === 'transparent' || c === 'rgba(0, 0, 0, 0)';
  const previewBg = window.getComputedStyle(preview).backgroundColor;
  const bodyBg    = window.getComputedStyle(document.body).backgroundColor;
  const bg = !transparent(previewBg)
    ? previewBg
    : (!transparent(bodyBg) ? bodyBg : '#ffffff');

  // 5. Force explicit width/height attributes on the cloned SVG so the
  //    img loader has unambiguous intrinsic dimensions (some Mermaid
  //    outputs only set viewBox, which can rasterize as 0x0 when loaded
  //    via Image in WebView2).
  svg.setAttribute('width',  String(naturalW));
  svg.setAttribute('height', String(naturalH));

  // 6. Strip @import rules from inline <style> blocks — external font
  //    @imports would taint the canvas in WebView2, blocking toBlob.
  svg.querySelectorAll('style').forEach((styleEl) => {
    styleEl.textContent = styleEl.textContent.replace(/@import[^;]+;/g, '');
  });

  // 7. Serialize SVG and use an INLINE data: URL.
  //    blob: URLs sometimes taint the canvas in WebView2 even though
  //    they're same-origin (the SVG's <foreignObject> content trips the
  //    conservative taint check). An inline data:image/svg+xml URL
  //    bypasses that path. encodeURIComponent + UTF-8 is more robust
  //    than base64 for large diagrams with non-ASCII content.
  const serializer = new XMLSerializer();
  const svgText = serializer.serializeToString(svg);
  const svgUrl =
    'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgText);

  // 8. Load into Image, then draw to canvas with bg fill.
  const img = new Image();
  await new Promise((resolve, reject) => {
    img.onload  = resolve;
    img.onerror = (e) => reject(
      new Error('Image load failed (SVG → img)'
        + (e && e.message ? ': ' + e.message : ''))
    );
    img.src = svgUrl;
  });

  const canvas = document.createElement('canvas');
  canvas.width  = Math.max(1, Math.round(outW));
  canvas.height = Math.max(1, Math.round(outH));
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  // 9. Canvas → PNG Blob. Will throw SecurityError if the canvas was
  //    tainted; the data:-URL path above is meant to avoid that.
  const blob = await new Promise((resolve, reject) => {
    try {
      canvas.toBlob((b) => {
        if (b) resolve(b);
        else reject(new Error('canvas.toBlob returned null'));
      }, 'image/png');
    } catch (e) {
      reject(e);
    }
  });

  return blob;
}

// ============================================================
//  Copy diagram as PNG (T4.7.3) — clipboard image write
// ============================================================
// Tauri fallback: writeImage's exact shape varies across plugin
// versions, so try several patterns in order, logging each failure.
async function copyPngViaTauri(blob) {
  const cm = Tauri()?.clipboardManager;
  if (!cm) throw new Error('Tauri clipboardManager namespace unavailable');
  if (!cm.writeImage) throw new Error('Tauri clipboardManager.writeImage unavailable');

  const bytes = new Uint8Array(await blob.arrayBuffer());
  const attempts = [
    // 1. Raw Uint8Array of PNG-encoded bytes (Tauri 2.x recent builds).
    ['bytes', () => cm.writeImage(bytes)],
    // 2. Object with `bytes` field (some plugin versions).
    ['object', () => cm.writeImage({ bytes: Array.from(bytes) })],
    // 3. Image class wrapper.
    ['Image.fromBytes', async () => {
      const TauriImage = Tauri()?.image?.Image;
      if (!TauriImage?.fromBytes) throw new Error('Tauri Image class unavailable');
      const img = await TauriImage.fromBytes(bytes);
      return cm.writeImage(img);
    }],
  ];

  let lastErr;
  for (const [label, fn] of attempts) {
    try {
      await fn();
      console.info('[copyPngViaTauri] succeeded with shape:', label);
      return;
    } catch (e) {
      console.warn(`[copyPngViaTauri attempt ${label}]`, e);
      lastErr = e;
    }
  }
  throw lastErr || new Error('All Tauri writeImage shapes failed');
}

async function handleCopyPng() {
  showStatus('Generating PNG…');
  let blob;
  try {
    blob = await rasterizeDiagramToPng();
  } catch (err) {
    console.error('[handleCopyPng rasterize]', err);
    showStatus(`Rasterize failed: ${err.message || err}`, 0, 'error');
    return;
  }

  // Re-focus the window so navigator.clipboard.write can see a focused
  // document (Chromium rejects clipboard writes when the document loses
  // focus, e.g. after a dropdown click handler returned). Best-effort.
  try { window.focus(); } catch {}

  let browserErr = null;
  if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
    try {
      await navigator.clipboard.write([
        new ClipboardItem({ 'image/png': blob }),
      ]);
      showStatus('Diagram copied to clipboard as PNG', 2000, 'success');
      return;
    } catch (err) {
      browserErr = err;
      console.warn('[handleCopyPng browser path]', err);
    }
  }

  // Fallback to Tauri's native clipboard plugin (no browser focus or
  // user-activation requirement).
  try {
    await copyPngViaTauri(blob);
    showStatus('Diagram copied to clipboard as PNG', 2000);
  } catch (err) {
    console.error('[handleCopyPng tauri path]', err);
    const browserMsg = browserErr ? browserErr.message || String(browserErr) : 'browser API unavailable';
    const tauriMsg   = err.message || String(err);
    showStatus(`Copy PNG failed — browser: ${browserMsg}; Tauri: ${tauriMsg}`, 0, 'error');
  }
}

// ============================================================
//  Export PNG (T4.7.4) — save dialog + Tauri fs.writeFile (binary)
// ============================================================
async function handleExportPng() {
  const save = Tauri()?.dialog?.save;
  // Tauri 2.x plugin-fs JS exposes both writeFile (binary) and
  // writeBinaryFile (legacy alias on some builds). Prefer writeFile.
  const fs = Tauri()?.fs;
  const writeBinary =
    fs?.writeFile ??
    fs?.writeBinaryFile ??
    null;
  if (!save || !writeBinary) {
    await showError(
      `Tauri dialog/fs binary-write API unavailable.\n` +
      `dialog.save: ${!!save}, fs.writeFile: ${!!fs?.writeFile}, ` +
      `fs.writeBinaryFile: ${!!fs?.writeBinaryFile}`
    );
    return;
  }
  try {
    showStatus('Generating PNG…');
    const blob = await rasterizeDiagramToPng();
    const bytes = new Uint8Array(await blob.arrayBuffer());

    const baseName = currentFilePath
      ? currentFilePath.replace(/\.mmd$/i, '').split(/[\\/]/).pop()
      : (currentTemplateName() || 'diagram');

    const path = await save({
      defaultPath: `${baseName}.png`,
      filters: [{ name: 'PNG Image', extensions: ['png'] }],
      title: 'Export PNG',
    });
    if (!path) {
      showStatus('Export cancelled', 1500, 'warning');
      return;
    }

    await writeBinary(path, bytes);
    showStatus('PNG exported', 3000, 'success');
    try { await Tauri()?.opener?.openPath(path); }
    catch (e) { console.warn('opener failed:', e); }
  } catch (err) {
    console.error('[handleExportPng]', err);
    // No auto-reset — keep the error visible.
    showStatus(`Export PNG failed: ${err.message || err}`, 0, 'error');
  }
}

// ============================================================
//  Copy code as text (T4.6.2.7) — Tauri clipboard plugin with browser fallback
// ============================================================
async function handleCopyCode() {
  const code = editor ? editor.value : '';
  const writeText = Tauri()?.clipboardManager?.writeText;
  try {
    if (typeof writeText === 'function') {
      await writeText(code);
    } else {
      await navigator.clipboard.writeText(code);
    }
    showStatus('Code copied to clipboard', 2000, 'success');
  } catch (err) {
    try {
      await navigator.clipboard.writeText(code);
      showStatus('Code copied to clipboard', 2000, 'success');
    } catch {
      showStatus('Copy failed', 2500, 'error');
      console.error('Clipboard write failed:', err);
    }
  }
}

// ============================================================
//  App toolbar wiring (T4.6.2.4 / .5 / .6 / .7)
// ============================================================
function setupAtbDropdown(btnId, menuId) {
  const btn = document.querySelector('#' + btnId);
  const menu = document.querySelector('#' + menuId);
  if (!btn || !menu) return;
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    document.querySelectorAll('.atb-dropdown-menu').forEach(m => {
      if (m !== menu) m.hidden = true;
    });
    menu.hidden = !menu.hidden;
  });
}
function closeAtbDropdowns() {
  document.querySelectorAll('.atb-dropdown-menu').forEach(m => m.hidden = true);
}

function wireAppToolbar() {
  document.querySelector('#tb-file-new'   ).addEventListener('click', handleFileNew);
  document.querySelector('#tb-file-open'  ).addEventListener('click', handleFileOpen);
  document.querySelector('#tb-file-save'  ).addEventListener('click', handleFileSave);
  document.querySelector('#tb-file-saveas').addEventListener('click', handleFileSaveAs);

  document.querySelector('#tb-edit-undo').addEventListener('click', customUndo);
  document.querySelector('#tb-edit-redo').addEventListener('click', customRedo);

  setupAtbDropdown('tb-export-btn', 'tb-export-menu');
  setupAtbDropdown('tb-copy-btn',   'tb-copy-menu');

  document.querySelectorAll('#tb-export-menu .atb-menu-item').forEach(item => {
    item.addEventListener('click', () => {
      const fmt = item.dataset.format;
      closeAtbDropdowns();
      if (fmt === 'pptx') handleExportPptx();
      else if (fmt === 'vsdx') handleExportVsdx();
      else if (fmt === 'png') handleExportPng();
      else if (fmt === 'svg') handleExportSvg();
    });
  });
  document.querySelectorAll('#tb-copy-menu .atb-menu-item').forEach(item => {
    item.addEventListener('click', () => {
      const target = item.dataset.copy;
      closeAtbDropdowns();
      if (target === 'png') handleCopyPng();
      else if (target === 'code') handleCopyCode();
    });
  });

  // Close dropdowns on outside click + Escape.
  document.addEventListener('click', (e) => {
    if (e.target.closest('.atb-dropdown')) return;
    closeAtbDropdowns();
  });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeAtbDropdowns();
  });

  updateUndoButtons();
}

// ============================================================
//  Alt-key mnemonic overlays (T4.6.2.0 workaround for WebView2
//  swallowing Alt keys before the native menu accelerator system
//  can see them).
// ============================================================
let openAltMenu = null;

function altMenuItems(name) {
  return Array.from(
    document.querySelectorAll(`#alt-menu-${name} .alt-menu-item`)
  ).filter(b => !b.disabled);
}
function showAltMenu(name) {
  closeAltMenu();
  const el = document.getElementById(`alt-menu-${name}`);
  if (!el) return;
  el.hidden = false;
  openAltMenu = { name, el };
  const items = altMenuItems(name);
  if (items.length) items[0].focus();
}
function closeAltMenu() {
  if (!openAltMenu) return;
  openAltMenu.el.hidden = true;
  openAltMenu = null;
}
function altMenuActivate(action) {
  closeAltMenu();
  switch (action) {
    case 'new':     handleFileNew();     break;
    case 'open':    handleFileOpen();    break;
    case 'save':    handleFileSave();    break;
    case 'save_as': handleFileSaveAs();  break;
    case 'exit':    requestExit();       break;
    case 'about':   showAboutDialog();   break;
  }
}
function altMenuKeyHandler(e) {
  if (!openAltMenu) return;
  const items = altMenuItems(openAltMenu.name);
  const focused = document.activeElement;
  const idx = items.indexOf(focused);
  if (e.key === 'Escape') {
    e.preventDefault();
    closeAltMenu();
  } else if (e.key === 'ArrowDown') {
    e.preventDefault();
    items[(idx + 1) % items.length]?.focus();
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    items[(idx - 1 + items.length) % items.length]?.focus();
  } else if (e.key === 'Enter') {
    e.preventDefault();
    if (focused?.classList.contains('alt-menu-item')) {
      altMenuActivate(focused.dataset.action);
    }
  } else if (/^[a-z]$/i.test(e.key) && !e.ctrlKey && !e.altKey && !e.metaKey) {
    // Mnemonic letter: match item with data-mnem.
    const k = e.key.toLowerCase();
    const target = items.find(b => b.dataset.mnem === k);
    if (target) {
      e.preventDefault();
      altMenuActivate(target.dataset.action);
    }
  }
}

function wireAltMenu() {
  // Alt + letter triggers (workaround — see file header).
  window.addEventListener('keydown', (e) => {
    if (!e.altKey || e.ctrlKey || e.shiftKey || e.metaKey) return;
    const k = e.key.toLowerCase();
    if (k === 'f') { e.preventDefault(); showAltMenu('file'); }
    else if (k === 'h') { e.preventDefault(); showAltMenu('help'); }
  });
  // Per-item click handlers.
  document.querySelectorAll('.alt-menu-item').forEach(item => {
    item.addEventListener('click', () => altMenuActivate(item.dataset.action));
  });
  // Outside click closes the overlay.
  document.addEventListener('mousedown', (e) => {
    if (!openAltMenu) return;
    if (openAltMenu.el.contains(e.target)) return;
    closeAltMenu();
  });
  // Keyboard navigation while overlay is open.
  window.addEventListener('keydown', altMenuKeyHandler);
}

// ============================================================
//  Pane splitter — Code↔Diagram drag-to-resize (T4.8 A.3)
//  No persistence; resets to default flex-basis every launch.
// ============================================================
function initPaneSplitter() {
  const splitter = document.querySelector('#code-diagram-splitter');
  const codePane = document.querySelector('#code-pane');
  const panes    = document.querySelector('.panes');
  if (!splitter || !codePane || !panes) return;

  let isDragging = false;
  let startX     = 0;
  let startWidth = 0;

  splitter.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    isDragging = true;
    startX = e.clientX;
    startWidth = codePane.getBoundingClientRect().width;
    splitter.classList.add('dragging');
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    e.preventDefault();
  });

  document.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    const delta = e.clientX - startX;
    const containerWidth = panes.getBoundingClientRect().width;
    const clamped = Math.max(
      200,
      Math.min(containerWidth - 200, startWidth + delta)
    );
    codePane.style.flexBasis = `${clamped}px`;
  });

  document.addEventListener('mouseup', () => {
    if (!isDragging) return;
    isDragging = false;
    splitter.classList.remove('dragging');
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  });
}

// ============================================================
//  Wiring
// ============================================================
function safeWire(label, fn) {
  try { fn(); }
  catch (e) { console.error(`[bindUI] ${label} failed:`, e); }
}

function bindUI() {
  editor = document.getElementById('editor');
  preview = document.getElementById('preview');
  statusMessageEl = document.getElementById('status-message');

  // Click anywhere on the status bar message to dismiss it (T7 D.3).
  if (statusMessageEl) {
    statusMessageEl.addEventListener('click', resetStatus);
  }

  injectIcons();
  renderSidebar();

  // Wire independent subsystems defensively so a single failure cannot
  // cascade (e.g., a stale HTML asset would otherwise leave later wirings
  // unbound — that's the T4.6.1 regression we are patching).
  safeWire('keyboard',        wireKeyboard);
  safeWire('collapseButtons', wireCollapseButtons);
  safeWire('statusBarZoom',   wireStatusBarZoom);
  safeWire('diagramToolbar',  wireDiagramToolbar);

  // Apply saved theme before first render.
  applyMermaidTheme(getThemePref());

  // Apply saved zoom (won't affect SVG until first render mounts one).
  initZoom();

  editor.addEventListener('input', onEditorInput);
  bindMenuEvents();
  wireCloseHandler();

  safeWire('appToolbar',   wireAppToolbar);
  safeWire('altMenu',      wireAltMenu);
  safeWire('paneSplitter', initPaneSplitter);

  // Task 8: this entry point handles both fresh-launch (no file in URL,
  // load default template) and "spawned with a file" (URL ?file=path)
  // — replaces the unconditional template load.
  loadInitialState();
}

if (window.__mermaid) {
  bindUI();
} else {
  window.addEventListener('mermaid-ready', bindUI, { once: true });
}
