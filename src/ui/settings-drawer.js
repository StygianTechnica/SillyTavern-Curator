// Curator drawer in SillyTavern's Extensions settings - the home for
// every Curator control. Rendered from settings.html and appended to
// #extensions_settings2, the same way State Engine's and Pretty Panels'
// drawers are. Rendering lives in src/ui/panel.js; this file only wires
// events to the panel.js / editor.js handlers.

import { getSettings, saveSettings } from '../settings.js';
import { getLastPrompt, onPromptCaptured } from '../capture.js';
import { getSnapshot } from './state.js';
import {
    onAnalyzePrompt,
    onCompileSnapshot,
    onSaveSnapshot,
    onLoadSnapshot,
    onDeleteSnapshot,
    onClearSnapshot,
    refreshSnapshotList,
} from './panel.js';
import { onEditBlockText, onToggleBlock, onReorderBlock } from './editor.js';

// SillyTavern resolves extension templates relative to
// public/scripts/extensions/, i.e. "third-party/<folder name>". Derived
// from this file's own URL so a renamed install folder still works.
const EXTENSION_FOLDER = decodeURIComponent(new URL('../../', import.meta.url).pathname.split('/').filter(Boolean).pop());
const TEMPLATE_PATH = `third-party/${EXTENSION_FOLDER}`;

function renderCaptureInfo(prompt) {
    const info = document.getElementById('cr_capture_info');
    if (!info) return;
    if (!getSettings().enabled) {
        info.textContent = 'Curator is disabled - prompts are not being captured.';
    } else if (!prompt) {
        info.textContent = 'No prompt captured yet - send a message (or open a chat) first.';
    } else {
        info.textContent = `Last prompt: ${prompt.text.length} characters (${prompt.source}), captured ${new Date(prompt.capturedAt).toLocaleTimeString()}.`;
    }
}

// Moves a block one step up (-1) or down (+1) by swapping order values
// with its neighbour.
function moveBlock(blockId, direction) {
    const snapshot = getSnapshot();
    if (!snapshot) return;
    const sorted = [...snapshot.blocks].sort((a, b) => a.order - b.order);
    const index = sorted.findIndex(b => b.id === blockId);
    const neighbour = sorted[index + direction];
    if (index < 0 || !neighbour) return;
    const block = sorted[index];
    const target = neighbour.order;
    neighbour.order = block.order;
    onReorderBlock(blockId, target);
}

// Shows the optional State Engine integration's status in the drawer.
// Purely informational - nothing in Curator depends on it.
export function setStateEngineStatus(status) {
    const el = document.getElementById('cr_status');
    if (el) el.textContent = status;
}

export async function addSettingsDrawer(stateEngineStatus) {
    if (document.getElementById('curator_settings')) return;

    let html;
    try {
        html = await SillyTavern.getContext().renderExtensionTemplateAsync(TEMPLATE_PATH, 'settings');
    } catch (err) {
        console.error('[Curator] failed to load settings.html template', err);
        return;
    }

    const container = document.getElementById('extensions_settings2');
    if (!container) return;
    container.insertAdjacentHTML('beforeend', html);

    const enabledBox = document.getElementById('cr_enabled');
    enabledBox.checked = getSettings().enabled;
    enabledBox.addEventListener('change', () => {
        getSettings().enabled = enabledBox.checked;
        saveSettings();
        renderCaptureInfo(getLastPrompt());
    });

    setStateEngineStatus(stateEngineStatus);

    document.getElementById('cr_analyze').addEventListener('click', () => onAnalyzePrompt());
    document.getElementById('cr_compile').addEventListener('click', () => onCompileSnapshot());
    document.getElementById('cr_clear').addEventListener('click', () => onClearSnapshot());
    document.getElementById('cr_save_snapshot').addEventListener('click', () => onSaveSnapshot());

    const blockList = document.getElementById('cr_block_list');
    blockList.addEventListener('change', (e) => {
        const blockId = e.target.closest('.cr-block')?.dataset.blockId;
        if (!blockId) return;
        if (e.target.classList.contains('cr-block-toggle')) onToggleBlock(blockId, e.target.checked);
        else if (e.target.classList.contains('cr-block-text')) onEditBlockText(blockId, e.target.value);
    });
    blockList.addEventListener('click', (e) => {
        const blockId = e.target.closest('.cr-block')?.dataset.blockId;
        if (!blockId) return;
        if (e.target.classList.contains('cr-block-up')) moveBlock(blockId, -1);
        else if (e.target.classList.contains('cr-block-down')) moveBlock(blockId, 1);
    });

    document.getElementById('cr_snapshot_list').addEventListener('click', (e) => {
        const id = e.target.closest('.cr-snapshot')?.dataset.snapshotId;
        if (!id) return;
        if (e.target.classList.contains('cr-snapshot-load')) onLoadSnapshot(id);
        else if (e.target.classList.contains('cr-snapshot-delete')) onDeleteSnapshot(id);
    });

    renderCaptureInfo(getLastPrompt());
    onPromptCaptured(renderCaptureInfo);
    await refreshSnapshotList();
}
