// Prompt Analyzer modal - Curator's main workspace. A large popup showing
// the analysed prompt as colour-coded, token-counted sections that can be
// dragged into a new order, switched off, and (for single sections)
// edited. For a live Chat Completion prompt:
//   - SillyTavern's own sections: the arrangement can be saved and applied
//     to every generation ("Curator controls prompt order").
//   - Curator's global injection blocks appear as ordinary sections and are
//     managed from the Injection Blocks panel; dragging one saves its place
//     at once.
// src/capture.js applies both to the outgoing prompt; src/prompt/sections.js
// does the arranging, so what is shown here is what is sent.

import { getSettings, saveSettings } from '../settings.js';
import { getLastPrompt, refreshPrompt } from '../capture.js';
import { arrange, placeInjections } from '../prompt/sections.js';
import { CATEGORIES, normalize } from '../prompt/sources.js';
import { analyzePrompt } from '../parser/parser.js';
import { CuratorCompiler } from '../parser/compiler.js';
import { PromptBlock } from '../models/PromptSnapshot.js';
import { getSnapshot, setSnapshot } from './state.js';
import { findBlock, onEditBlockText, onToggleBlock, onReorderBlocks, onRecompile } from './editor.js';
import { onSaveSnapshot } from './panel.js';
import {
    DEFAULT_COLOR, ROLES, getInjections, getInjection, createInjection, updateInjection, deleteInjection,
    cloneInjection, reorderInjections, setAnchors, injectionKey, isInjectionKey, isCuratorKey, idFromKey, resolvedText,
} from '../injections/store.js';
import {
    discoverInjectables, readValues, getVariableSetting, updateVariableSetting, setVariableAnchors,
    variableKey, isVariableKey, nameFromKey,
} from '../injections/variables.js';
import { isStateEngineConnected } from '../api/connection.js';
import { PromptSnapshot } from '../models/PromptSnapshot.js';
import { openTesterModal } from './tester-modal.js';
import { INJECTION_PRESETS } from '../injections/presets.js';
import { getInjectionProviders, getProviderBlocks } from '../injections/providers.js';
import { getUserPresets, saveUserPreset, deleteUserPreset } from '../injections/user-presets.js';

const compiler = new CuratorCompiler();

let root = null;
let live = false;
const expanded = new Set();
let editingInjection = null;
let providerOffers = [];          // [{ provider, blocks }]
let analysedOrder = [];           // SillyTavern's own section keys, in its order
let injectables = [];             // State Engine variables offered for injection
let variableValues = {};          // { [name]: { text, hasValue } } for this chat
const find = { query: '', matches: [], index: -1 };

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

function sortedBlocks() {
    return [...getSnapshot().blocks].sort((a, b) => a.order - b.order);
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

async function countTokens(text) {
    try {
        return await SillyTavern.getContext().getTokenCountAsync(text);
    } catch {
        return Math.ceil(String(text).length / 4);
    }
}

function injectionsSupported() {
    return live && getSnapshot()?.meta.kind === 'cc';
}

// -----------------------------------------------------------------
// Layout (saved arrangement of SillyTavern's own sections)
// -----------------------------------------------------------------

function layoutFromSnapshot() {
    return {
        sections: sortedBlocks().filter(b => !isCuratorKey(b.id)).map(block => {
            const section = { key: block.id, enabled: block.enabled };
            if (block.edited && !isGroupKey(block.id)) section.text = block.text;
            return section;
        }),
    };
}

// Arranges a freshly analysed live snapshot by the saved arrangement and
// inserts the injection blocks, so the modal shows what is actually sent.
async function arrangeSnapshot(snapshot) {
    analysedOrder = snapshot.blocks.filter(b => !isCuratorKey(b.id)).map(b => b.id);
    const layout = getSettings().layout;
    if (layout) {
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
        for (const block of snapshot.blocks.filter(b => b.edited)) block.tokens = await countTokens(block.text);
    }
    await syncInjectionBlocks(snapshot);
}

async function injectionBlock(injection) {
    return new PromptBlock({
        id: injectionKey(injection.id),
        type: 'injection',
        label: injection.name,
        category: 'curator',
        role: injection.role,
        text: injection.text,
        enabled: injection.enabled,
        color: injection.color,
        tokens: await countTokens(resolvedText(injection)),
    });
}

// A State Engine variable offered for injection, as a read-only section
// holding its value in this chat.
async function variableBlock(variable) {
    const setting = getVariableSetting(variable.name);
    const value = variableValues[variable.name] ?? { text: '', hasValue: false };
    return new PromptBlock({
        id: variableKey(variable.name),
        type: 'variable',
        label: variable.label,
        category: 'stateEngine',
        role: setting.role,
        text: value.text,
        enabled: setting.enabled,
        tokens: value.text ? await countTokens(value.text) : 0,
        provenance: { extensionId: variable.extensionId, variable: variable.name, hasValue: value.hasValue },
    });
}

// Discovers the injectable State Engine variables and reads their values
// for the current chat. Nothing without State Engine.
async function loadVariableBank() {
    injectables = await discoverInjectables();
    const chatId = SillyTavern.getContext().chatId;
    variableValues = await readValues(chatId, injectables.map(v => v.name));
}

// Rebuilds the snapshot's injection blocks from the library and places
// them by their anchors (same rule as the outgoing prompt).
async function syncInjectionBlocks(snapshot = getSnapshot()) {
    if (!live || snapshot.meta.kind !== 'cc') return;
    const own = [...snapshot.blocks].filter(b => !isCuratorKey(b.id)).sort((a, b) => a.order - b.order);
    const injected = [];
    for (const injection of getInjections()) {
        const block = await injectionBlock(injection);
        block.anchor = injection.anchor;
        injected.push(block);
    }
    for (const variable of injectables) {
        const block = await variableBlock(variable);
        block.anchor = getVariableSetting(variable.name).anchor;
        injected.push(block);
    }
    snapshot.blocks = placeInjections(own, injected, b => b.id);
    snapshot.blocks.forEach((block, order) => {
        block.order = order;
        delete block.anchor;
    });
}

// Saves every injection block's place: the key of the block above it.
function persistInjectionAnchors() {
    const anchors = {};
    const variableAnchors = {};
    const blocks = sortedBlocks();
    blocks.forEach((block, index) => {
        const anchor = index === 0 ? '^' : blocks[index - 1].id;
        if (isInjectionKey(block.id)) anchors[idFromKey(block.id)] = anchor;
        else if (isVariableKey(block.id)) variableAnchors[nameFromKey(block.id)] = anchor;
    });
    setAnchors(anchors);
    setVariableAnchors(variableAnchors);
}

function isDirty() {
    if (!injectionsSupported()) return false;
    const own = sortedBlocks().filter(b => !isCuratorKey(b.id));
    const saved = getSettings().layout;
    if (!saved) return own.some(b => !b.enabled || b.edited) || own.map(b => b.id).join('|') !== analysedOrder.join('|');
    const items = own.map(b => ({ key: b.id }));
    const view = layout => JSON.stringify(arrange(items, layout).map(x => [x.item.key, x.enabled, x.text]));
    return view(layoutFromSnapshot()) !== view(saved);
}

// -----------------------------------------------------------------
// Rendering - section list
// -----------------------------------------------------------------

function colorStyle(block) {
    return block.color ? ` style="--cr-cat:${escapeHtml(block.color)}"` : '';
}

function renderRow(block, { child = false } = {}) {
    const tokens = blockTokens(block);
    const pct = percentOf(tokens);
    const isOpen = expanded.has(block.id);
    const injection = isInjectionKey(block.id);
    const variable = isVariableKey(block.id);
    const toggleTitle = child ? 'Include this message (preview only - not saved)'
        : injection ? 'Enable this injection block (saved - applies to every chat)'
            : variable ? 'Inject this State Engine variable (saved - applies to every chat where it has a value)' : 'Include this section';
    return `
        <li class="cr-block cr-cat-${escapeHtml(block.category)}${block.enabled ? '' : ' cr-off'}${child ? ' cr-child' : ''}${injection || variable ? ' cr-injection' : ''}" data-id="${escapeHtml(block.id)}"${colorStyle(block)}>
            <div class="cr-block-head">
                <span class="cr-drag fa-solid fa-grip-vertical" title="Drag to reorder"></span>
                <input type="checkbox" class="cr-toggle" ${block.enabled ? 'checked' : ''} title="${toggleTitle}" />
                <span class="cr-chip">${escapeHtml(CATEGORIES[block.category] ?? block.category)}</span>
                <span class="cr-label" title="${escapeHtml(block.label)}">${escapeHtml(block.label)}</span>
                ${block.edited ? '<span class="cr-badge" title="Text edited">edited</span>' : ''}
                ${variable ? `<span class="cr-badge cr-source" title="Offered by this State Engine extension">${escapeHtml(block.provenance?.extensionId ?? '')}</span>` : ''}
                ${variable && !block.provenance?.hasValue ? '<span class="cr-badge" title="This chat holds no value for it, so nothing is sent">no value</span>' : ''}
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
    const injection = isInjectionKey(block.id);
    const variable = isVariableKey(block.id);
    const editable = !variable && !block.id.startsWith('chatHistory-') && !block.id.startsWith('dialogueExamples-');
    const actions = [
        block.edited && live ? '<div class="menu_button menu_button_icon cr-revert"><i class="fa-solid fa-rotate-left"></i><span>Revert text</span></div>' : '',
        injectionsSupported() && !injection ? '<div class="menu_button menu_button_icon cr-clone" title="Copy this text into a new global injection block placed right below - for testing changes without touching the original"><i class="fa-solid fa-clone"></i><span>Clone to injection block</span></div>' : '',
        injection ? '<small class="cr-hint">Global injection block - edits are saved for every chat. Rename, recolour or delete it in the Injection Blocks panel.</small>' : '',
        variable ? `<small class="cr-hint">State Engine variable <code>${escapeHtml(nameFromKey(block.id))}</code> from <b>${escapeHtml(block.provenance?.extensionId ?? '')}</b>. ${block.provenance?.hasValue ? 'Its value in this chat - read-only here; it changes as the story goes.' : 'No value in this chat (its preset may not be active here), so nothing is sent.'}</small>` : '',
    ].join('');
    return `${renderNotes(block)}
        <textarea class="text_pole cr-text" rows="${Math.min(16, Math.max(3, block.text.split('\n').length + 1))}" ${editable ? '' : 'readonly'}>${escapeHtml(block.text)}</textarea>
        ${actions ? `<div class="cr-body-actions">${actions}</div>` : ''}`;
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
    const canApply = injectionsSupported();
    apply.hidden = !canApply;
    if (canApply) {
        const settings = getSettings();
        apply.querySelector('.cr-apply-toggle').checked = settings.applyLayout;
        apply.querySelector('.cr-apply-state').textContent = isDirty()
            ? 'Unsaved changes - Save Arrangement to use them.'
            : settings.layout ? 'Arrangement saved.' : 'SillyTavern\'s own order.';
    }
    root.querySelector('.cr-tc-note').hidden = !(live && meta.kind === 'tc');
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

function makeSortable(list, onUpdate) {
    // jQuery UI sortable ships with SillyTavern (with touch-punch, so
    // dragging works on phones too).
    const jq = globalThis.jQuery;
    if (typeof jq?.fn?.sortable !== 'function') return;
    jq(list).sortable({
        handle: '.cr-drag',
        axis: 'y',
        items: '> li',
        tolerance: 'pointer',
        update: () => onUpdate([...list.children].map(li => li.dataset.id)),
    });
}

function sortSections(ids, groupId = null) {
    onReorderBlocks(ids, groupId);
    if (!groupId) persistInjectionAnchors();
    refreshMeters();
    refreshFind();
}

function renderList() {
    const list = root.querySelector('.cr-list');
    list.innerHTML = sortedBlocks().map(b => renderRow(b)).join('');
    makeSortable(list, ids => sortSections(ids));
    list.querySelectorAll('.cr-children').forEach(ol => makeSortable(ol, ids => sortSections(ids, ol.dataset.group)));
    refreshFind();
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
    renderLibrary();
    renderVariableBank();
    renderLore();
    root.querySelector('.cr-compiled').hidden = true;
}

// -----------------------------------------------------------------
// Rendering - Injection Blocks library
// -----------------------------------------------------------------

function renderAddMenu() {
    const select = root.querySelector('.cr-lib-add');
    const presets = INJECTION_PRESETS.map(p => `<option value="preset:${escapeHtml(p.id)}">${escapeHtml(p.name)}</option>`).join('');
    const mine = getUserPresets();
    const minePresets = mine.length
        ? mine.map(p => `<option value="user:${escapeHtml(p.id)}">${escapeHtml(p.name)}</option>`).join('')
        : '<option disabled>(none yet - use the bookmark on a block)</option>';
    const offered = providerOffers.map(({ provider, blocks }) => `
        <optgroup label="${escapeHtml(provider.name)}">${blocks.length
        ? blocks.map(b => `<option value="provider:${escapeHtml(provider.id)}:${escapeHtml(b.id)}">${escapeHtml(b.name)}</option>`).join('')
        : '<option disabled>(nothing offered right now)</option>'}</optgroup>`).join('');
    select.innerHTML = `<option value="">Add a block...</option><option value="blank">Blank block (write your own)</option><optgroup label="My presets">${minePresets}</optgroup><optgroup label="Curator presets">${presets}</optgroup>${offered}`;

    const manager = root.querySelector('.cr-mypresets');
    manager.hidden = !mine.length;
    manager.querySelector('summary').textContent = `My presets (${mine.length})`;
    manager.querySelector('ul').innerHTML = mine.map(p => `
        <li data-preset-id="${escapeHtml(p.id)}" title="${escapeHtml(p.text)}">
            <i class="fa-solid fa-square" style="color:${escapeHtml(p.color || DEFAULT_COLOR)}"></i>
            <span>${escapeHtml(p.name)}</span>
            <div class="menu_button fa-solid fa-trash-can cr-mypreset-delete" title="Delete this preset (blocks made from it are kept)"></div>
        </li>`).join('');
}

function renderLibrary() {
    const list = root.querySelector('.cr-lib-list');
    const blocks = getInjections();
    root.querySelector('.cr-lib-note').hidden = injectionsSupported();
    if (!blocks.length) {
        list.innerHTML = '<li class="cr-hint cr-lib-empty">No injection blocks yet. Create one, add a preset, or clone a prompt section.</li>';
        return;
    }
    list.innerHTML = blocks.map(b => {
        const editing = editingInjection === b.id;
        return `
            <li class="cr-lib-item${b.enabled ? '' : ' cr-off'}" data-id="${escapeHtml(b.id)}" style="--cr-cat:${escapeHtml(b.color || DEFAULT_COLOR)}">
                <div class="cr-lib-head">
                    <span class="cr-drag fa-solid fa-grip-vertical" title="Drag to reorder the library"></span>
                    <input type="color" class="cr-lib-color" value="${escapeHtml(b.color || DEFAULT_COLOR)}" title="Colour" />
                    <input type="checkbox" class="cr-lib-enabled" ${b.enabled ? 'checked' : ''} title="Enabled - sent with every Chat Completion prompt" />
                    <span class="cr-lib-name" title="${escapeHtml(b.name)}">${escapeHtml(b.name)}</span>
                    <div class="menu_button fa-solid fa-pen cr-lib-edit" title="Edit"></div>
                    <div class="menu_button fa-solid fa-bookmark cr-lib-save-preset" title="Save as my preset - reusable from the Add menu"></div>
                    <div class="menu_button fa-solid fa-clone cr-lib-clone" title="Clone"></div>
                    <div class="menu_button fa-solid fa-trash-can cr-lib-delete" title="Delete"></div>
                </div>
                ${editing ? `
                <div class="cr-lib-editor">
                    <input type="text" class="text_pole cr-lib-name-input" value="${escapeHtml(b.name)}" placeholder="Name" />
                    <select class="text_pole cr-lib-role" title="Message role">${ROLES.map(r => `<option value="${r}"${b.role === r ? ' selected' : ''}>${r}</option>`).join('')}</select>
                    <textarea class="text_pole cr-lib-text" rows="6" placeholder="Text - macros such as {{char}} and {{user}} work">${escapeHtml(b.text)}</textarea>
                    <div class="menu_button menu_button_icon cr-lib-done"><i class="fa-solid fa-check"></i><span>Done</span></div>
                </div>` : ''}
            </li>`;
    }).join('');
    makeSortable(list, async ids => {
        reorderInjections(ids);
        await afterLibraryChange({ keepLibrary: true });
    });
}

// The State Engine variable bank: every variable other State Engine
// extensions offer for injection, grouped by extension. Hidden entirely
// without State Engine.
function renderVariableBank() {
    const bank = root.querySelector('.cr-vars');
    bank.hidden = !isStateEngineConnected();
    if (bank.hidden) return;
    const list = bank.querySelector('.cr-var-list');
    if (!injectables.length) {
        list.innerHTML = '<small class="cr-hint">No State Engine extension offers injectable variables yet.</small>';
        return;
    }
    const byExtension = new Map();
    for (const variable of injectables) {
        if (!byExtension.has(variable.extensionId)) byExtension.set(variable.extensionId, []);
        byExtension.get(variable.extensionId).push(variable);
    }
    const hasChat = Boolean(SillyTavern.getContext().chatId);
    list.innerHTML = [...byExtension.entries()].map(([extensionId, variables]) => `
        <div class="cr-var-group">
            <div class="cr-var-ext" title="${escapeHtml(variables[0].extensionDescription || extensionId)}"><i class="fa-solid fa-puzzle-piece"></i> ${escapeHtml(extensionId)}</div>
            <ul>${variables.map(v => {
        const setting = getVariableSetting(v.name);
        const value = variableValues[v.name] ?? { text: '', hasValue: false };
        const preview = !hasChat ? 'open a chat to see its value'
            : !value.hasValue ? 'no value in this chat'
                : value.text.trim() ? value.text.replace(/\s+/g, ' ').slice(0, 90) + (value.text.length > 90 ? '...' : '') : '(empty)';
        return `
                <li class="cr-var-item${setting.enabled ? '' : ' cr-off'}" data-name="${escapeHtml(v.name)}" title="${escapeHtml(v.description || v.name)}">
                    <div class="cr-var-head">
                        <input type="checkbox" class="cr-var-enabled" ${setting.enabled ? 'checked' : ''} title="Inject into every Chat Completion prompt where it has a value" />
                        <span class="cr-var-name">${escapeHtml(v.label)}${v.defined ? '' : ' <small>(not defined yet)</small>'}</span>
                        <select class="text_pole cr-var-role" title="Message role">${ROLES.map(r => `<option value="${r}"${setting.role === r ? ' selected' : ''}>${r}</option>`).join('')}</select>
                    </div>
                    <small class="cr-var-preview${value.hasValue && value.text.trim() ? '' : ' cr-hint'}">${escapeHtml(preview)}</small>
                </li>`;
    }).join('')}</ul>
        </div>`).join('');
}

// After any change to the library: rebuild the injection sections and
// redraw what depends on them.
async function afterLibraryChange({ keepLibrary = false } = {}) {
    if (injectionsSupported()) {
        await syncInjectionBlocks();
        renderList();
        refreshMeters();
    }
    if (!keepLibrary) renderLibrary();
}

async function loadProviderOffers() {
    providerOffers = [];
    for (const provider of getInjectionProviders()) {
        providerOffers.push({ provider, blocks: await getProviderBlocks(provider.id) });
    }
    if (root) renderAddMenu();
}

// A new empty block, enabled, with its editor open. It is only sent once
// it has text.
async function addBlankBlock() {
    const block = createInjection({ name: 'New injection block', enabled: true });
    editingInjection = block.id;
    await afterLibraryChange();
    toastr.info('Blank block added before Chat History - write its text in the Injection Blocks panel, then drag it where you want it.', 'Curator');
}

async function addFromMenu(value) {
    if (value === 'blank') return addBlankBlock();
    let block = null;
    if (value.startsWith('user:')) {
        const preset = getUserPresets().find(p => `user:${p.id}` === value);
        if (preset) block = createInjection({ name: preset.name, text: preset.text, role: preset.role, color: preset.color, source: { userPreset: preset.id } });
    } else if (value.startsWith('preset:')) {
        const preset = INJECTION_PRESETS.find(p => `preset:${p.id}` === value);
        if (preset) block = createInjection({ ...preset, source: { preset: preset.id } });
    } else if (value.startsWith('provider:')) {
        const [, providerId, ...rest] = value.split(':');
        const blockId = rest.join(':');
        const offer = providerOffers.find(o => o.provider.id === providerId)?.blocks.find(b => b.id === blockId);
        if (offer) block = createInjection({ ...offer, source: { provider: providerId, id: offer.id } });
    }
    if (block) {
        const where = block.anchor === '^' ? 'at the top of the prompt' : 'before Chat History';
        toastr.success(`Added "${block.name}" ${where}. Drag it where you want it.`, 'Curator');
        await afterLibraryChange();
    }
}

async function confirmDelete(name) {
    const context = SillyTavern.getContext();
    try {
        if (context.callGenericPopup && context.POPUP_TYPE) {
            return Boolean(await context.callGenericPopup(`Delete the injection block "${escapeHtml(name)}"? It is removed from every chat.`, context.POPUP_TYPE.CONFIRM));
        }
    } catch { /* fall through */ }
    return window.confirm(`Delete the injection block "${name}"?`);
}

// -----------------------------------------------------------------
// Find - matches in section text, stepped through with Enter / Shift+Enter
// -----------------------------------------------------------------

// Every occurrence of the query in section / message text, in display
// order: [{ blockId, groupId, start, end }].
function computeMatches(query) {
    const matches = [];
    if (!query) return matches;
    const needle = query.toLowerCase();
    const scan = (block, groupId) => {
        const hay = (block.text ?? '').toLowerCase();
        let at = hay.indexOf(needle);
        while (at >= 0) {
            matches.push({ blockId: block.id, groupId, start: at, end: at + needle.length });
            at = hay.indexOf(needle, at + needle.length);
        }
    };
    for (const block of sortedBlocks()) {
        if (block.children?.length) [...block.children].sort((a, b) => a.order - b.order).forEach(c => scan(c, block.id));
        else scan(block, null);
    }
    return matches;
}

function renderFindCount() {
    const count = root.querySelector('.cr-find-count');
    if (!find.query) count.textContent = '';
    else if (!find.matches.length) count.textContent = 'no matches';
    else count.textContent = find.revealed ? `${find.index + 1} / ${find.matches.length}` : `${find.matches.length} match${find.matches.length === 1 ? '' : 'es'}`;
    count.classList.toggle('cr-find-none', Boolean(find.query) && !find.matches.length);
}

// Section outlines (hit / dimmed) and text highlights for the current
// query. Called after anything that changes text, order or what's open.
function refreshFind() {
    if (!root) return;
    const query = root.querySelector('.cr-search').value;
    const current = find.matches[find.index];
    find.query = query;
    find.matches = computeMatches(query);
    if (!find.matches.length) find.index = -1;
    else {
        const same = current && find.matches.findIndex(m => m.blockId === current.blockId && m.start === current.start);
        find.index = same >= 0 ? same : Math.min(Math.max(find.index, 0), find.matches.length - 1);
    }

    const hitIds = new Set(find.matches.flatMap(m => [m.blockId, m.groupId]).filter(Boolean));
    for (const li of root.querySelectorAll('.cr-block')) {
        li.classList.toggle('cr-hit', Boolean(query) && hitIds.has(li.dataset.id));
        li.classList.toggle('cr-miss', Boolean(query) && !hitIds.has(li.dataset.id));
    }
    for (const ta of root.querySelectorAll('.cr-text')) highlightTextarea(ta);
    renderFindCount();
}

// Draws the matches behind a textarea: a mirror layer with the same box,
// font and wrapping, holding the text with <mark>s, under a transparent
// textarea. (A textarea can't style its own text, and a plain selection
// is invisible while the cursor stays in the Find box.)
function highlightTextarea(ta) {
    const li = ta.closest('.cr-block');
    const ranges = find.matches.filter(m => m.blockId === li?.dataset.id);
    let wrap = ta.parentElement.classList.contains('cr-hl-wrap') ? ta.parentElement : null;
    if (!ranges.length) {
        if (wrap) {
            wrap.replaceWith(ta);
            ta.style.background = '';
        }
        return;
    }
    if (!wrap) {
        wrap = document.createElement('div');
        wrap.className = 'cr-hl-wrap';
        ta.replaceWith(wrap);
        const backdrop = document.createElement('div');
        backdrop.className = 'cr-hl-backdrop';
        wrap.append(backdrop, ta);
        ta.addEventListener('scroll', () => (backdrop.scrollTop = ta.scrollTop));
        if (typeof ResizeObserver === 'function') new ResizeObserver(() => syncBackdropBox(ta, backdrop)).observe(ta);
    }
    const backdrop = wrap.querySelector('.cr-hl-backdrop');
    syncBackdropBox(ta, backdrop);
    const current = find.matches[find.index];
    const text = ta.value;
    let html = '';
    let cursor = 0;
    for (const range of ranges) {
        html += escapeHtml(text.slice(cursor, range.start));
        const isCurrent = current && current.blockId === range.blockId && current.start === range.start;
        html += `<mark class="${isCurrent ? 'cr-current' : ''}">${escapeHtml(text.slice(range.start, range.end))}</mark>`;
        cursor = range.end;
    }
    backdrop.innerHTML = `${html}${escapeHtml(text.slice(cursor))}\n`;
    backdrop.scrollTop = ta.scrollTop;
}

function syncBackdropBox(ta, backdrop) {
    const style = getComputedStyle(ta);
    if (!ta.dataset.crBg) ta.dataset.crBg = style.backgroundColor;
    for (const prop of ['fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
        'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth', 'borderRadius', 'boxSizing', 'textIndent', 'tabSize']) {
        backdrop.style[prop] = style[prop];
    }
    backdrop.style.width = `${ta.offsetWidth}px`;
    backdrop.style.height = `${ta.offsetHeight}px`;
    backdrop.style.backgroundColor = ta.dataset.crBg;
    ta.style.background = 'transparent';
}

// Next (+1) / previous (-1) match. The first step after typing goes to the
// first match (or the last, backwards).
function stepFind(direction) {
    if (!find.matches.length) return;
    const target = find.revealed ? find.index + direction : (direction > 0 ? 0 : find.matches.length - 1);
    find.revealed = true;
    goToMatch(target);
}

function rowFor(id) {
    return [...root.querySelectorAll('.cr-block')].find(li => li.dataset.id === id) ?? null;
}

// Opens the section (and its chat history group) holding match `i`, marks
// it as current and scrolls it into view - inside the textarea too.
function goToMatch(i) {
    if (!find.matches.length) return;
    find.index = (i + find.matches.length) % find.matches.length;
    const match = find.matches[find.index];
    const openRow = id => {
        const li = rowFor(id);
        if (li && li.querySelector(':scope > .cr-block-body').hidden) toggleExpand(li, { skipFind: true });
        return rowFor(id);
    };
    if (match.groupId) openRow(match.groupId);
    const li = openRow(match.blockId);
    refreshFind();
    const ta = li?.querySelector('.cr-text');
    if (!ta) return;
    // Scroll the textarea so the match is mid-view: measure the text up to it.
    const full = ta.value;
    const top = ta.scrollTop;
    ta.value = full.slice(0, match.start);
    const offset = ta.scrollHeight;
    ta.value = full;
    ta.scrollTop = Math.max(0, offset - ta.clientHeight / 2) || top;
    ta.dispatchEvent(new Event('scroll'));
    li.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
    (ta.closest('.cr-hl-wrap') ?? ta).scrollIntoView?.({ block: 'center', behavior: 'smooth' });
}

// -----------------------------------------------------------------
// Events
// -----------------------------------------------------------------

function toggleExpand(li, { skipFind = false } = {}) {
    const id = li.dataset.id;
    const body = li.querySelector(':scope > .cr-block-body');
    const icon = li.querySelector(':scope > .cr-block-head .cr-expand');
    const open = body.hidden;
    body.hidden = !open;
    icon.classList.toggle('fa-chevron-down', !open);
    icon.classList.toggle('fa-chevron-up', open);
    if (open) {
        expanded.add(id);
        body.innerHTML = renderBody(findBlock(id));
        const children = body.querySelector('.cr-children');
        if (children) makeSortable(children, ids => sortSections(ids, id));
    } else {
        expanded.delete(id);
    }
    if (!skipFind) refreshFind();
}

async function cloneToInjection(block) {
    const groupId = block.id.startsWith('chatHistory-') ? 'chatHistory' : block.id.startsWith('dialogueExamples-') ? 'dialogueExamples' : null;
    const created = createInjection({
        name: `${block.label} (copy)`,
        text: block.text,
        role: block.role ?? 'system',
        color: DEFAULT_COLOR,
        anchor: groupId ?? block.id,
        source: { clonedFrom: block.id },
    });
    expanded.add(injectionKey(created.id));
    await afterLibraryChange();
    toastr.success(`Cloned to injection block "${created.name}" - it is sent from now on. Switch the original off to test the copy alone.`, 'Curator');
}

function wireEvents() {
    root.addEventListener('click', async (e) => {
        const li = e.target.closest('.cr-block');
        if (li && (e.target.closest('.cr-expand') || e.target.closest('.cr-label'))) {
            toggleExpand(li);
            return;
        }
        if (li && e.target.closest('.cr-revert')) {
            await rebuildFromCapture(li.dataset.id);
            return;
        }
        if (li && e.target.closest('.cr-clone')) {
            await cloneToInjection(findBlock(li.dataset.id));
            return;
        }

        const item = e.target.closest('.cr-lib-item');
        if (item) {
            const id = item.dataset.id;
            if (e.target.closest('.cr-lib-edit') || e.target.closest('.cr-lib-name')) {
                editingInjection = editingInjection === id ? null : id;
                renderLibrary();
            } else if (e.target.closest('.cr-lib-done')) {
                editingInjection = null;
                renderLibrary();
            } else if (e.target.closest('.cr-lib-save-preset')) {
                const block = getInjection(id);
                if (block && !block.text.trim()) {
                    toastr.warning('Write some text first - an empty block makes an empty preset.', 'Curator');
                } else if (block) {
                    const { replaced } = saveUserPreset(block);
                    toastr.success(`${replaced ? 'Updated' : 'Saved'} "${block.name}" in My presets.`, 'Curator');
                    renderAddMenu();
                }
            } else if (e.target.closest('.cr-lib-clone')) {
                const copy = cloneInjection(id);
                if (copy) toastr.success(`Cloned to "${copy.name}".`, 'Curator');
                await afterLibraryChange();
            } else if (e.target.closest('.cr-lib-delete')) {
                const block = getInjection(id);
                if (block && await confirmDelete(block.name)) {
                    deleteInjection(id);
                    if (editingInjection === id) editingInjection = null;
                    await afterLibraryChange();
                }
            }
            return;
        }

        const variableItem = e.target.closest('.cr-var-item');
        if (variableItem && e.target.closest('.cr-var-name')) {
            const row = rowFor(variableKey(variableItem.dataset.name));
            if (row) {
                if (row.querySelector(':scope > .cr-block-body').hidden) toggleExpand(row);
                row.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
            }
            return;
        }

        const presetRow = e.target.closest('[data-preset-id]');
        if (presetRow && e.target.closest('.cr-mypreset-delete')) {
            deleteUserPreset(presetRow.dataset.presetId);
            renderAddMenu();
            return;
        }

        const action = e.target.closest('[data-action]')?.dataset.action;
        if (action) await runAction(action);
    });

    root.addEventListener('change', async (e) => {
        const target = e.target;
        const li = target.closest('.cr-block');
        if (li && target.classList.contains('cr-toggle')) {
            if (isInjectionKey(li.dataset.id)) {
                updateInjection(idFromKey(li.dataset.id), { enabled: target.checked });
                renderLibrary();
            } else if (isVariableKey(li.dataset.id)) {
                updateVariableSetting(nameFromKey(li.dataset.id), { enabled: target.checked });
                renderVariableBank();
            }
            onToggleBlock(li.dataset.id, target.checked);
            refreshMeters();
            return;
        }
        if (li && target.classList.contains('cr-text')) {
            if (isInjectionKey(li.dataset.id)) {
                const injection = updateInjection(idFromKey(li.dataset.id), { text: target.value });
                const block = findBlock(li.dataset.id);
                block.text = target.value;
                block.tokens = await countTokens(resolvedText(injection));
                renderLibrary();
            } else {
                await onEditBlockText(li.dataset.id, target.value);
                const head = li.querySelector(':scope > .cr-block-head');
                if (!head.querySelector('.cr-badge')) head.querySelector('.cr-label').insertAdjacentHTML('afterend', '<span class="cr-badge" title="Text edited">edited</span>');
            }
            refreshMeters();
            refreshFind();
            return;
        }

        const item = target.closest('.cr-lib-item');
        if (item) {
            const id = item.dataset.id;
            if (target.classList.contains('cr-lib-enabled')) updateInjection(id, { enabled: target.checked });
            else if (target.classList.contains('cr-lib-color')) updateInjection(id, { color: target.value });
            else if (target.classList.contains('cr-lib-name-input')) updateInjection(id, { name: target.value });
            else if (target.classList.contains('cr-lib-role')) updateInjection(id, { role: target.value });
            else if (target.classList.contains('cr-lib-text')) updateInjection(id, { text: target.value });
            await afterLibraryChange();
            return;
        }

        const variableItem = target.closest('.cr-var-item');
        if (variableItem) {
            const name = variableItem.dataset.name;
            if (target.classList.contains('cr-var-enabled')) updateVariableSetting(name, { enabled: target.checked });
            else if (target.classList.contains('cr-var-role')) updateVariableSetting(name, { role: target.value });
            await afterLibraryChange({ keepLibrary: true });
            renderVariableBank();
            return;
        }

        if (target.classList.contains('cr-lib-add') && target.value) {
            const value = target.value;
            target.value = '';
            await addFromMenu(value);
            return;
        }

        if (target.classList.contains('cr-apply-toggle')) {
            const settings = getSettings();
            settings.applyLayout = target.checked;
            if (settings.applyLayout && !settings.layout) settings.layout = layoutFromSnapshot();
            saveSettings();
            const drawerBox = document.getElementById('cr_apply_layout');
            if (drawerBox) drawerBox.checked = settings.applyLayout;
            toastr.info(settings.applyLayout ? 'Curator now controls the prompt order.' : 'SillyTavern\'s own prompt order restored.', 'Curator');
            renderHeader();
        }
    });

    // Keep highlights aligned while a highlighted textarea is edited.
    root.addEventListener('input', (e) => {
        if (e.target.classList.contains('cr-text') && e.target.closest('.cr-hl-wrap')) {
            const li = e.target.closest('.cr-block');
            const block = findBlock(li.dataset.id);
            if (block) {
                const saved = block.text;
                block.text = e.target.value;
                find.matches = computeMatches(find.query);
                block.text = saved;
                highlightTextarea(e.target);
            }
        }
    });

    const search = root.querySelector('.cr-search');
    search.addEventListener('input', () => {
        find.index = 0;
        find.revealed = false;
        refreshFind();
    });
    search.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        e.stopPropagation();
        stepFind(e.shiftKey ? -1 : 1);
    });
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
    await loadVariableBank();
    await arrangeSnapshot(fresh);
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
        case 'test-prompt':
            await testPrompt();
            break;
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
                if ((action === 'expand-all') !== open) toggleExpand(li, { skipFind: true });
            }
            refreshFind();
            break;
        case 'find-next':
        case 'find-prev':
            stepFind(action === 'find-next' ? 1 : -1);
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
        case 'new-injection':
            await addBlankBlock();
            break;
    }
}

// -----------------------------------------------------------------
// Prompt Tester
// -----------------------------------------------------------------

// The prompt as compiled here, with injection blocks' macros resolved the
// way they are when sent. Works on a copy - the snapshot is not changed.
async function compileForTest(snapshot = getSnapshot()) {
    const copy = PromptSnapshot.fromJSON(JSON.parse(JSON.stringify(snapshot.toJSON())));
    for (const block of copy.blocks) {
        if (!isInjectionKey(block.id)) continue;
        const injection = getInjection(idFromKey(block.id));
        if (injection) block.text = resolvedText(injection);
    }
    const text = compiler.compile(copy);
    return { text, tokens: compiler.countTokens(copy) };
}

async function testPrompt(snapshot = getSnapshot()) {
    const { text, tokens } = await compileForTest(snapshot);
    if (!text.trim()) {
        toastr.warning('The compiled prompt is empty - nothing to test.', 'Curator');
        return;
    }
    await openTesterModal(text, { meta: `${fmt(tokens)} tokens · ${fmt(text.length)} characters` });
}

/**
 * Test Prompt from outside the analyzer (Curator's drawer): analyses the
 * last prompt - building one with a dry run if needed - arranges it exactly
 * as the analyzer would (saved arrangement, injection blocks, State Engine
 * variables), compiles it and opens the Prompt Tester.
 */
export async function testCurrentPrompt() {
    const capture = getLastPrompt() ?? await refreshPrompt();
    if (!capture) {
        toastr.info('No prompt available yet - open a chat first.', 'Curator');
        return;
    }
    const snapshot = await analyzePrompt(capture);
    setSnapshot(snapshot);
    live = true;
    await loadVariableBank();
    if (snapshot.meta.kind === 'cc') await arrangeSnapshot(snapshot);
    await testPrompt(snapshot);
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
                <div class="menu_button menu_button_icon" data-action="test-prompt" title="Compile the prompt as arranged here and run it against a model - a sandbox call, nothing reaches the chat"><i class="fa-solid fa-flask"></i><span>Test Prompt</span></div>
                <div class="menu_button menu_button_icon" data-action="save-snapshot" title="Save this analysis"><i class="fa-solid fa-camera"></i><span>Snapshot</span></div>
                <div class="menu_button fa-solid fa-angles-down" data-action="expand-all" title="Expand all"></div>
                <div class="menu_button fa-solid fa-angles-up" data-action="collapse-all" title="Collapse all"></div>
                <div class="cr-find">
                    <input type="search" class="text_pole cr-search" placeholder="Find in prompt..." title="Enter: next match · Shift+Enter: previous" />
                    <span class="cr-find-count"></span>
                    <div class="menu_button fa-solid fa-chevron-up" data-action="find-prev" title="Previous match (Shift+Enter)"></div>
                    <div class="menu_button fa-solid fa-chevron-down" data-action="find-next" title="Next match (Enter)"></div>
                </div>
            </div>
            <div class="cr-apply" hidden>
                <label class="checkbox_label" title="Rearrange SillyTavern's own sections in every Chat Completion prompt by the saved arrangement before it is sent. Overrides the prompt manager's order. (Injection blocks are always placed where you put them.)">
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
                <div class="cr-lib">
                    <div class="cr-side-head"><b><i class="fa-solid fa-syringe"></i> Injection Blocks</b>
                        <div class="menu_button menu_button_icon" data-action="new-injection" title="Add a blank block and write your own text"><i class="fa-solid fa-plus"></i><span>Blank</span></div></div>
                    <small class="cr-hint">Global - shared by every chat. Keep them setting-agnostic: setting details belong in the character, persona, scenario or lorebooks.</small>
                    <small class="cr-hint cr-lib-note" hidden>Injection blocks are sent with Chat Completion prompts only, and are shown in the prompt for live analyses.</small>
                    <select class="text_pole cr-lib-add" title="Add a blank block, one of your presets, or a ready-made one"></select>
                    <details class="cr-mypresets" hidden><summary></summary><ul></ul></details>
                    <ol class="cr-lib-list"></ol>
                </div>
                <div class="cr-vars" hidden>
                    <div class="cr-side-head"><b><i class="fa-solid fa-gears"></i> State Engine Variables</b></div>
                    <small class="cr-hint">Offered by State Engine extensions. Their content is each chat's current value - read-only, it changes as the story goes. Tick one to inject it; drag its section in the prompt to place it.</small>
                    <div class="cr-var-list"></div>
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
 *   capture (arrangement controls shown, saved arrangement and injection
 *   blocks applied).
 */
export async function openAnalyzerModal({ live: isLive = true } = {}) {
    const snapshot = getSnapshot();
    if (!snapshot) return;
    live = isLive;
    expanded.clear();
    editingInjection = null;
    Object.assign(find, { query: '', matches: [], index: -1, revealed: false });
    await loadVariableBank();
    if (injectionsSupported()) await arrangeSnapshot(snapshot);

    root = buildRoot();
    wireEvents();
    renderAddMenu();
    renderAll();
    void loadProviderOffers();

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
