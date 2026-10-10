// Prompt Analyzer modal - Curator's main workspace. A large popup showing
// the analysed prompt as colour-coded, token-counted sections that can be
// dragged into a new order, switched off, and (for single sections)
// edited. For a live Chat Completion prompt the arrangement can be saved
// and applied to every generation from then on (src/capture.js applies
// it; src/prompt/sections.js does the rearranging).

import { getSettings, saveSettings } from '../settings.js';
import { getLastPrompt, refreshPrompt } from '../capture.js';
import { arrange } from '../prompt/sections.js';
import { CATEGORIES, normalize } from '../prompt/sources.js';
import { analyzePrompt } from '../parser/parser.js';
import { CuratorCompiler } from '../parser/compiler.js';
import { getSnapshot, setSnapshot } from './state.js';
import { findBlock, onEditBlockText, onToggleBlock, onReorderBlocks, onRecompile } from './editor.js';
import { onSaveSnapshot } from './panel.js';

const compiler = new CuratorCompiler();

let root = null;
let live = false;
const expanded = new Set();

// -----------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------

function escapeHtml(text) {
    return String(text ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

const fmt = n => Number(n || 0).toLocaleString();

function isGroupKey(key) {
    return key === 'chatHistory' || key === 'dialogueExamples';
}

function totalTokens() {
    const snapshot = getSnapshot();
    return snapshot ? compiler.countTokens(snapshot) : 0;
}

function contextSize() {
    return getSnapshot()?.meta.contextSize || 0;
}

function percentOf(tokens) {
    const base = contextSize() || totalTokens() || 1;
    return (tokens / base) * 100;
}

function blockTokens(block) {
    if (!block.children?.length) return block.tokens || 0;
    return block.children.filter(c => c.enabled).reduce((sum, c) => sum + (c.tokens || 0), 0);
}

// -----------------------------------------------------------------
// Layout (saved arrangement)
// -----------------------------------------------------------------

function layoutFromSnapshot() {
    const snapshot = getSnapshot();
    return {
        sections: [...snapshot.blocks].sort((a, b) => a.order - b.order).map(block => {
            const section = { key: block.id, enabled: block.enabled };
            if (block.edited && !isGroupKey(block.id)) section.text = block.text;
            return section;
        }),
    };
}

// Applies the saved arrangement to a freshly analysed live snapshot so the
// modal shows what is actually being sent.
async function applySavedLayout(snapshot) {
    const layout = getSettings().layout;
    if (!layout) return;
    const arranged = arrange(snapshot.blocks.map(block => ({ key: block.id, block })), layout);
    snapshot.blocks = arranged.map(({ item, enabled, text }, order) => {
        item.block.order = order;
        item.block.enabled = enabled;
        if (text !== null && !isGroupKey(item.key)) {
            item.block.text = text;
            item.block.edited = true;
        }
        return item.block;
    });
    for (const block of snapshot.blocks.filter(b => b.edited)) {
        try {
            block.tokens = await SillyTavern.getContext().getTokenCountAsync(block.text);
        } catch {
            block.tokens = Math.ceil(block.text.length / 4);
        }
    }
}

function isDirty() {
    if (!live || getSnapshot()?.meta.kind !== 'cc') return false;
    const saved = getSettings().layout;
    if (!saved) return getSnapshot().blocks.some((b, i) => !b.enabled || b.edited || b.order !== i);
    return JSON.stringify(arrange(getSnapshot().blocks.map(b => ({ key: b.id })), layoutFromSnapshot()).map(x => [x.item.key, x.enabled, x.text]))
        !== JSON.stringify(arrange(getSnapshot().blocks.map(b => ({ key: b.id })), saved).map(x => [x.item.key, x.enabled, x.text]));
}

// -----------------------------------------------------------------
// Rendering
// -----------------------------------------------------------------

function renderRow(block, { child = false } = {}) {
    const tokens = blockTokens(block);
    const pct = percentOf(tokens);
    const isOpen = expanded.has(block.id);
    return `
        <li class="cr-block cr-cat-${escapeHtml(block.category)}${block.enabled ? '' : ' cr-off'}${child ? ' cr-child' : ''}" data-id="${escapeHtml(block.id)}">
            <div class="cr-block-head">
                <span class="cr-drag fa-solid fa-grip-vertical" title="Drag to reorder"></span>
                <input type="checkbox" class="cr-toggle" ${block.enabled ? 'checked' : ''} title="${child ? 'Include this message (preview only - not saved)' : 'Include this section'}" />
                <span class="cr-chip">${escapeHtml(CATEGORIES[block.category] ?? block.category)}</span>
                <span class="cr-label" title="${escapeHtml(block.label)}">${escapeHtml(block.label)}</span>
                ${block.edited ? '<span class="cr-badge" title="Text edited">edited</span>' : ''}
                ${block.role && !child ? `<span class="cr-role">${escapeHtml(block.role)}</span>` : ''}
                <span class="cr-tokens" title="${pct.toFixed(1)}% of context">${fmt(tokens)} tok</span>
                <span class="cr-meter" title="${pct.toFixed(1)}% of context"><span style="width:${Math.min(100, pct * 2).toFixed(1)}%"></span></span>
                <span class="cr-expand fa-solid ${isOpen ? 'fa-chevron-up' : 'fa-chevron-down'}" title="Show contents"></span>
            </div>
            <div class="cr-block-body"${isOpen ? '' : ' hidden'}>${isOpen ? renderBody(block) : ''}</div>
        </li>`;
}

function renderNotes(block) {
    if (!block.notes?.length) return '';
    return `<div class="cr-notes"><small>Contains:</small> ${block.notes.map(n => `
        <span class="cr-note cr-cat-${escapeHtml(n.category)}" title="${escapeHtml(CATEGORIES[n.category] ?? n.category)}">${escapeHtml(n.label)}${n.constant ? ' <b>(constant)</b>' : ''}</span>`).join('')}</div>`;
}

function renderBody(block) {
    if (block.children?.length) {
        return `${renderNotes(block)}<ol class="cr-children" data-group="${escapeHtml(block.id)}">${[...block.children].sort((a, b) => a.order - b.order).map(c => renderRow(c, { child: true })).join('')}</ol>`;
    }
    const editable = !block.id.startsWith('chatHistory-') && !block.id.startsWith('dialogueExamples-');
    return `${renderNotes(block)}
        <textarea class="text_pole cr-text" rows="${Math.min(16, Math.max(3, block.text.split('\n').length + 1))}" ${editable ? '' : 'readonly'}>${escapeHtml(block.text)}</textarea>
        ${block.edited && live ? '<div class="menu_button menu_button_icon cr-revert"><i class="fa-solid fa-rotate-left"></i><span>Revert text</span></div>' : ''}`;
}

function renderSummary() {
    const snapshot = getSnapshot();
    const total = totalTokens();
    const size = contextSize();
    const byCategory = {};
    for (const block of snapshot.blocks.filter(b => b.enabled)) {
        if (block.children?.length) {
            for (const child of block.children.filter(c => c.enabled)) byCategory[child.category] = (byCategory[child.category] || 0) + (child.tokens || 0);
        } else {
            byCategory[block.category] = (byCategory[block.category] || 0) + (block.tokens || 0);
        }
    }
    const base = Math.max(size, total) || 1;
    const cats = Object.keys(CATEGORIES).filter(c => byCategory[c]);
    root.querySelector('.cr-summary').innerHTML = `
        <div class="cr-total"><b>${fmt(total)}</b> tokens${size ? ` of ${fmt(size)} context (${((total / size) * 100).toFixed(1)}%)` : ''}</div>
        <div class="cr-stack">${cats.map(c => `<span class="cr-cat-${c}" style="width:${((byCategory[c] / base) * 100).toFixed(2)}%" title="${escapeHtml(CATEGORIES[c])}: ${fmt(byCategory[c])} tokens"></span>`).join('')}</div>
        <div class="cr-legend">${cats.map(c => `<span class="cr-legend-item cr-cat-${c}"><i></i>${escapeHtml(CATEGORIES[c])} <b>${fmt(byCategory[c])}</b> <small>(${((byCategory[c] / (total || 1)) * 100).toFixed(0)}%)</small></span>`).join('')}</div>`;
}

function renderHeader() {
    const { meta } = getSnapshot();
    const parts = [
        meta.kind === 'cc' ? 'Chat Completion' : meta.kind === 'tc' ? 'Text Completion' : null,
        meta.api,
        meta.model,
        meta.preset && `Preset: ${meta.preset}`,
        meta.templates,
        meta.capturedAt && `captured ${new Date(meta.capturedAt).toLocaleTimeString()}`,
    ].filter(Boolean);
    root.querySelector('.cr-meta').textContent = (live ? '' : 'Saved snapshot · ') + parts.join(' · ');

    const apply = root.querySelector('.cr-apply');
    const canApply = live && meta.kind === 'cc';
    apply.hidden = !canApply;
    if (canApply) {
        const settings = getSettings();
        apply.querySelector('.cr-apply-toggle').checked = settings.applyLayout;
        apply.querySelector('.cr-apply-state').textContent = isDirty()
            ? 'Unsaved changes - Save Arrangement to use them.'
            : settings.layout ? 'Arrangement saved.' : 'SillyTavern\'s own order.';
    }
    const tcNote = root.querySelector('.cr-tc-note');
    tcNote.hidden = !(live && meta.kind === 'tc');
}

function renderLore() {
    const snapshot = getSnapshot();
    const panel = root.querySelector('.cr-lore');
    const lore = snapshot.lore ?? [];
    if (!lore.length) {
        panel.innerHTML = live
            ? '<small class="cr-hint">No lorebooks connected (or none readable).</small>'
            : '<small class="cr-hint">Lorebooks are not stored with snapshots.</small>';
        return;
    }
    const promptText = normalize(snapshot.blocks.map(b => (b.children?.length ? b.children.map(c => c.text).join(' ') : b.text)).join(' '));
    const books = new Map();
    for (const entry of lore) {
        if (!books.has(entry.world)) books.set(entry.world, []);
        books.get(entry.world).push(entry);
    }
    panel.innerHTML = [...books.entries()].map(([world, entries]) => {
        const active = entries.filter(e => !e.disable);
        const inPrompt = e => {
            const text = normalize(SillyTavern.getContext().substituteParams?.(e.content ?? '') ?? e.content);
            return text.length > 3 && promptText.includes(text);
        };
        const constants = active.filter(e => e.constant);
        const triggered = active.filter(e => !e.constant && inPrompt(e));
        const row = (e, mark) => `<li title="${escapeHtml(e.content ?? '')}">${mark} ${escapeHtml(e.comment || (e.key ?? []).join(', ') || `#${e.uid}`)} <small>~${fmt(Math.ceil((e.content ?? '').length / 4))} tok</small></li>`;
        return `
            <details class="cr-book" open>
                <summary><b>${escapeHtml(world)}</b> <small>${active.length} entries · ${constants.length} constant · ${triggered.length} triggered</small></summary>
                ${constants.length ? `<div class="cr-book-sub">Constant</div><ul>${constants.map(e => row(e, inPrompt(e) ? '<i class="fa-solid fa-check" title="In this prompt"></i>' : '<i class="fa-solid fa-xmark" title="Not found in this prompt (budget, position, or conditions)"></i>')).join('')}</ul>` : ''}
                ${triggered.length ? `<div class="cr-book-sub">Triggered in this prompt</div><ul>${triggered.map(e => row(e, '<i class="fa-solid fa-bolt"></i>')).join('')}</ul>` : ''}
            </details>`;
    }).join('');
}

function makeSortable(list, groupId = null) {
    // jQuery UI sortable ships with SillyTavern (with touch-punch, so
    // dragging works on phones too).
    const jq = globalThis.jQuery;
    if (typeof jq?.fn?.sortable !== 'function') return;
    jq(list).sortable({
        handle: '.cr-drag',
        axis: 'y',
        items: '> li',
        tolerance: 'pointer',
        update: () => {
            const ids = [...list.children].map(li => li.dataset.id);
            onReorderBlocks(ids, groupId);
            refreshMeters();
        },
    });
}

function renderList() {
    const list = root.querySelector('.cr-list');
    list.innerHTML = [...getSnapshot().blocks].sort((a, b) => a.order - b.order).map(b => renderRow(b)).join('');
    makeSortable(list);
    list.querySelectorAll('.cr-children').forEach(ol => makeSortable(ol, ol.dataset.group));
    applySearch();
}

// Token counts / percentages / summary after a change, without rebuilding
// the list (keeps scroll position and open textareas).
function refreshMeters() {
    for (const li of root.querySelectorAll('.cr-block')) {
        const block = findBlock(li.dataset.id);
        if (!block) continue;
        const tokens = blockTokens(block);
        const pct = percentOf(tokens);
        const head = li.querySelector(':scope > .cr-block-head');
        head.querySelector('.cr-tokens').textContent = `${fmt(tokens)} tok`;
        head.querySelector('.cr-meter > span').style.width = `${Math.min(100, pct * 2).toFixed(1)}%`;
        head.querySelectorAll('.cr-tokens, .cr-meter').forEach(el => (el.title = `${pct.toFixed(1)}% of context`));
        li.classList.toggle('cr-off', !block.enabled);
    }
    renderSummary();
    renderHeader();
}

function renderAll() {
    renderHeader();
    renderSummary();
    renderList();
    renderLore();
    root.querySelector('.cr-compiled').hidden = true;
}

function applySearch() {
    const query = root.querySelector('.cr-search').value.trim().toLowerCase();
    for (const li of root.querySelectorAll('.cr-block')) {
        if (!query) {
            li.classList.remove('cr-hit', 'cr-miss');
            continue;
        }
        const block = findBlock(li.dataset.id);
        const hay = [block?.label, block?.text, ...(block?.children ?? []).map(c => `${c.label} ${c.text}`)].join(' ').toLowerCase();
        const hit = hay.includes(query);
        li.classList.toggle('cr-hit', hit);
        li.classList.toggle('cr-miss', !hit);
    }
}

// -----------------------------------------------------------------
// Events
// -----------------------------------------------------------------

function toggleExpand(li) {
    const id = li.dataset.id;
    const body = li.querySelector(':scope > .cr-block-body');
    const icon = li.querySelector(':scope > .cr-block-head .cr-expand');
    const open = body.hidden;
    body.hidden = !open;
    icon.classList.toggle('fa-chevron-down', !open);
    icon.classList.toggle('fa-chevron-up', open);
    if (open) {
        expanded.add(id);
        const block = findBlock(id);
        body.innerHTML = renderBody(block);
        const children = body.querySelector('.cr-children');
        if (children) makeSortable(children, id);
        applySearch();
    } else {
        expanded.delete(id);
    }
}

function wireEvents() {
    root.addEventListener('click', async (e) => {
        const li = e.target.closest('.cr-block');
        if (li && (e.target.closest('.cr-expand') || (e.target.closest('.cr-label')))) {
            toggleExpand(li);
            return;
        }
        if (li && e.target.closest('.cr-revert')) {
            const block = findBlock(li.dataset.id);
            await rebuildFromCapture(block.id);
            return;
        }
        const action = e.target.closest('[data-action]')?.dataset.action;
        if (action) await runAction(action);
    });

    root.addEventListener('change', async (e) => {
        const li = e.target.closest('.cr-block');
        if (li && e.target.classList.contains('cr-toggle')) {
            onToggleBlock(li.dataset.id, e.target.checked);
            refreshMeters();
        } else if (li && e.target.classList.contains('cr-text')) {
            await onEditBlockText(li.dataset.id, e.target.value);
            const head = li.querySelector(':scope > .cr-block-head');
            if (!head.querySelector('.cr-badge')) head.querySelector('.cr-label').insertAdjacentHTML('afterend', '<span class="cr-badge" title="Text edited">edited</span>');
            refreshMeters();
        } else if (e.target.classList.contains('cr-apply-toggle')) {
            const settings = getSettings();
            settings.applyLayout = e.target.checked;
            if (settings.applyLayout && !settings.layout) settings.layout = layoutFromSnapshot();
            saveSettings();
            const drawerBox = document.getElementById('cr_apply_layout');
            if (drawerBox) drawerBox.checked = settings.applyLayout;
            toastr.info(settings.applyLayout ? 'Curator now controls the prompt order.' : 'SillyTavern\'s own prompt order restored.', 'Curator');
            renderHeader();
        }
    });

    root.querySelector('.cr-search').addEventListener('input', applySearch);
}

// Re-analyses the current capture. With `onlyBlockId`, restores just that
// block's original text (Revert); otherwise rebuilds everything.
async function rebuildFromCapture(onlyBlockId = null) {
    const capture = getLastPrompt();
    if (!capture) return;
    const fresh = await analyzePrompt(capture);
    if (onlyBlockId) {
        const original = fresh.blocks.find(b => b.id === onlyBlockId);
        const block = findBlock(onlyBlockId);
        if (original && block) {
            block.text = original.text;
            block.tokens = original.tokens;
            block.edited = false;
        }
        renderList();
        refreshMeters();
        return;
    }
    setSnapshot(fresh);
    await applySavedLayout(fresh);
    renderAll();
}

async function runAction(action) {
    const settings = getSettings();
    switch (action) {
        case 'refresh': {
            root.classList.add('cr-busy');
            const capture = await refreshPrompt();
            root.classList.remove('cr-busy');
            if (!capture) {
                toastr.warning('SillyTavern did not build a prompt - is a chat open?', 'Curator');
                return;
            }
            live = true;
            await rebuildFromCapture();
            break;
        }
        case 'compile': {
            const text = await onRecompile();
            const panel = root.querySelector('.cr-compiled');
            panel.hidden = false;
            panel.querySelector('textarea').value = text;
            panel.querySelector('.cr-compiled-info').textContent = `${fmt(totalTokens())} tokens · ${fmt(text.length)} characters`;
            panel.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' });
            break;
        }
        case 'copy': {
            const text = root.querySelector('.cr-compiled textarea').value;
            await navigator.clipboard?.writeText(text).then(() => toastr.success('Copied.', 'Curator'), () => toastr.error('Copy failed.', 'Curator'));
            break;
        }
        case 'save-snapshot':
            await onSaveSnapshot();
            break;
        case 'expand-all':
        case 'collapse-all':
            for (const li of root.querySelectorAll('.cr-list > .cr-block')) {
                const open = !li.querySelector(':scope > .cr-block-body').hidden;
                if ((action === 'expand-all') !== open) toggleExpand(li);
            }
            break;
        case 'save-layout':
            settings.layout = layoutFromSnapshot();
            saveSettings();
            toastr.success(settings.applyLayout ? 'Arrangement saved - used from the next generation.' : 'Arrangement saved. Turn on "Curator controls prompt order" to use it.', 'Curator');
            renderHeader();
            break;
        case 'reset-layout':
            settings.layout = null;
            saveSettings();
            await rebuildFromCapture();
            toastr.info('Arrangement cleared - back to SillyTavern\'s own order.', 'Curator');
            break;
    }
}

// -----------------------------------------------------------------
// Open
// -----------------------------------------------------------------

function buildRoot() {
    const el = document.createElement('div');
    el.className = 'cr-modal';
    el.innerHTML = `
        <div class="cr-top">
            <div class="cr-title"><i class="fa-solid fa-magnifying-glass-chart"></i> <b>Prompt Analyzer</b> <small class="cr-meta"></small></div>
            <div class="cr-toolbar">
                <div class="menu_button menu_button_icon" data-action="refresh" title="Rebuild the prompt for the current chat now (dry run - nothing is sent)"><i class="fa-solid fa-rotate"></i><span>Refresh</span></div>
                <div class="menu_button menu_button_icon" data-action="compile" title="Show the prompt as arranged here"><i class="fa-solid fa-gears"></i><span>Compile</span></div>
                <div class="menu_button menu_button_icon" data-action="save-snapshot" title="Save this analysis"><i class="fa-solid fa-camera"></i><span>Snapshot</span></div>
                <div class="menu_button fa-solid fa-angles-down" data-action="expand-all" title="Expand all"></div>
                <div class="menu_button fa-solid fa-angles-up" data-action="collapse-all" title="Collapse all"></div>
                <input type="search" class="text_pole cr-search" placeholder="Find..." />
            </div>
            <div class="cr-apply" hidden>
                <label class="checkbox_label" title="Rearrange every Chat Completion prompt by the saved arrangement before it is sent. Overrides the prompt manager's order.">
                    <input type="checkbox" class="cr-apply-toggle" /><span>Curator controls prompt order</span>
                </label>
                <div class="menu_button menu_button_icon" data-action="save-layout"><i class="fa-solid fa-floppy-disk"></i><span>Save Arrangement</span></div>
                <div class="menu_button menu_button_icon" data-action="reset-layout" title="Forget the saved arrangement"><i class="fa-solid fa-arrow-rotate-left"></i><span>Reset</span></div>
                <small class="cr-apply-state"></small>
            </div>
            <small class="cr-tc-note cr-hint" hidden>Text Completion prompt: sections are located by matching known text (character card, persona, lorebook entries, chat messages), so boundaries are approximate. Rearranging here is a preview only.</small>
            <div class="cr-summary"></div>
        </div>
        <div class="cr-main">
            <ol class="cr-list"></ol>
            <aside class="cr-side">
                <div class="cr-compiled" hidden>
                    <div class="cr-side-head"><b>Compiled prompt</b> <small class="cr-compiled-info"></small>
                        <div class="menu_button fa-solid fa-copy" data-action="copy" title="Copy"></div></div>
                    <textarea class="text_pole" rows="14" readonly></textarea>
                </div>
                <div class="cr-side-head"><b><i class="fa-solid fa-book-atlas"></i> Connected Lorebooks</b></div>
                <div class="cr-lore"></div>
            </aside>
        </div>`;
    return el;
}

/**
 * Open the modal on the active snapshot.
 * @param {{ live?: boolean }} options - live: the snapshot is the current
 *   capture (arrangement controls shown, saved arrangement applied).
 */
export async function openAnalyzerModal({ live: isLive = true } = {}) {
    const snapshot = getSnapshot();
    if (!snapshot) return;
    live = isLive;
    expanded.clear();
    if (live && snapshot.meta.kind === 'cc') await applySavedLayout(snapshot);

    root = buildRoot();
    wireEvents();
    renderAll();

    const { Popup, POPUP_TYPE } = SillyTavern.getContext();
    const popup = new Popup(root, POPUP_TYPE.TEXT, '', {
        wide: true,
        large: true,
        okButton: 'Close',
        cancelButton: false,
        allowVerticalScrolling: true,
        leftAlign: true,
    });
    await popup.show();
    root = null;
}
