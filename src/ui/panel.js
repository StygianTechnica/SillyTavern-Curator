// src/ui/panel.js

import {
    analyzePrompt,
    compileSnapshot,
    saveSnapshot,
    loadSnapshot,
    listSnapshots,
    deleteSnapshot,
} from '../parser/parser.js';

import {
    setSnapshot,
    getSnapshot,
    clearSnapshot,
} from './state.js';

import { getLastPrompt } from '../capture.js';

/**
 * PANEL INTEGRATION
 * -----------------
 * These functions wire Curator's parser pipeline into the UI.
 * You can call them from buttons, menus, or event handlers.
 */


/**
 * Analyze the most recently captured SillyTavern prompt.
 */
export async function onAnalyzePrompt() {
    const rawText = getCurrentPromptText();
    if (!rawText) {
        toastr.info('No prompt captured yet - send a message or open a chat first.', 'Curator');
        return;
    }
    const snapshot = await analyzePrompt(rawText);

    setSnapshot(snapshot);
    renderSnapshot(snapshot);
    renderCompiledText(null);
}


/**
 * Compile the active snapshot.
 */
export async function onCompileSnapshot() {
    const snapshot = getSnapshot();
    if (!snapshot) return;

    const finalText = await compileSnapshot(snapshot);
    renderCompiledText(finalText);
}


/**
 * Save the active snapshot.
 */
export async function onSaveSnapshot() {
    const snapshot = getSnapshot();
    if (!snapshot) return;

    if (await saveSnapshot(snapshot)) toastr.success(`Saved ${snapshot.id}.`, 'Curator');
    await refreshSnapshotList();
}


/**
 * Load a snapshot by ID.
 */
export async function onLoadSnapshot(id) {
    const snapshot = await loadSnapshot(id);
    if (!snapshot) return;

    setSnapshot(snapshot);
    renderSnapshot(snapshot);
    renderCompiledText(snapshot.finalText || null);
}


/**
 * Clear the active snapshot.
 */
export function onClearSnapshot() {
    clearSnapshot();
    renderSnapshot(null);
    renderCompiledText(null);
}


/**
 * Delete a snapshot by ID.
 */
export async function onDeleteSnapshot(id) {
    await deleteSnapshot(id);
    await refreshSnapshotList();
}


/**
 * Refresh the snapshot list in the UI.
 */
export async function refreshSnapshotList() {
    const snapshots = await listSnapshots();
    renderSnapshotList(snapshots);
}

// ===============================
// UI RENDERING
// ===============================
// Everything renders into the Curator drawer (settings.html). Event
// wiring lives in src/ui/settings-drawer.js, which delegates to
// src/ui/editor.js, so this file only draws.

function escapeHtml(text) {
    return String(text ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/**
 * Render the snapshot's blocks into the drawer (null clears it).
 */
export function renderSnapshot(snapshot) {
    const list = document.getElementById('cr_block_list');
    const info = document.getElementById('cr_snapshot_info');
    if (!list || !info) return;

    if (!snapshot) {
        list.innerHTML = '';
        info.textContent = '';
        return;
    }

    const enabled = snapshot.blocks.filter(b => b.enabled);
    const chars = enabled.reduce((sum, b) => sum + b.text.length, 0);
    info.textContent = `${snapshot.id ?? 'Unsaved snapshot'} - ${enabled.length}/${snapshot.blocks.length} blocks enabled, ${chars} characters.`;

    list.innerHTML = snapshot.blocks.map(block => `
        <div class="cr-block${block.enabled ? '' : ' cr-disabled'}" data-block-id="${escapeHtml(block.id)}">
            <div class="cr-block-header">
                <input type="checkbox" class="cr-block-toggle" ${block.enabled ? 'checked' : ''} title="Include this block" />
                <span class="cr-block-label">${escapeHtml(block.label)} <small>(${escapeHtml(block.type)})</small></span>
                <span class="cr-block-length">${block.text.length} ch</span>
                <div class="menu_button fa-solid fa-arrow-up cr-block-up" title="Move up"></div>
                <div class="menu_button fa-solid fa-arrow-down cr-block-down" title="Move down"></div>
            </div>
            <textarea class="text_pole textarea_compact cr-block-text" rows="3">${escapeHtml(block.text)}</textarea>
        </div>`).join('');
}

/**
 * Render the compiled text (null hides it).
 */
export function renderCompiledText(text) {
    const wrap = document.getElementById('cr_compiled_wrap');
    const area = document.getElementById('cr_compiled');
    if (!wrap || !area) return;
    wrap.hidden = text === null || text === undefined;
    area.value = text ?? '';
}

/**
 * Render the list of saved snapshots.
 */
export function renderSnapshotList(list) {
    const container = document.getElementById('cr_snapshot_list');
    if (!container) return;
    if (!list.length) {
        container.innerHTML = '<small class="cr-hint">No saved snapshots.</small>';
        return;
    }
    container.innerHTML = list.map(({ id }) => `
        <div class="cr-snapshot" data-snapshot-id="${escapeHtml(id)}">
            <span class="cr-snapshot-name">${escapeHtml(id)}</span>
            <div class="menu_button fa-solid fa-folder-open cr-snapshot-load" title="Load"></div>
            <div class="menu_button fa-solid fa-trash-can cr-snapshot-delete" title="Delete"></div>
        </div>`).join('');
}

/**
 * Get the most recently captured prompt text (see src/capture.js).
 */
export function getCurrentPromptText() {
    return getLastPrompt()?.text ?? '';
}
