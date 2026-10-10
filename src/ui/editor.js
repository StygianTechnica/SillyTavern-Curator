// src/ui/editor.js

import {
    compileSnapshot,
} from '../parser/parser.js';

import {
    getSnapshot,
    setSnapshot,
} from './state.js';

import {
    renderSnapshot,
    renderCompiledText
} from './panel.js';
/**
 * EDITOR INTEGRATION
 * ------------------
 * These functions wire Curator's snapshot editing into the UI.
 * You can call them from textareas, toggles, drag handles, etc.
 */


/**
 * Update the text of a block.
 * @param {string} blockId
 * @param {string} newText
 */
export function onEditBlockText(blockId, newText) {
    const snapshot = getSnapshot();
    if (!snapshot) return;

    const block = snapshot.blocks.find(b => b.id === blockId);
    if (!block) return;

    block.text = newText;

    // Re-render the editor UI
    renderSnapshot(snapshot);
}


/**
 * Toggle a block on/off.
 * @param {string} blockId
 * @param {boolean} enabled
 */
export function onToggleBlock(blockId, enabled) {
    const snapshot = getSnapshot();
    if (!snapshot) return;

    const block = snapshot.blocks.find(b => b.id === blockId);
    if (!block) return;

    block.enabled = enabled;

    renderSnapshot(snapshot);
}


/**
 * Reorder blocks (drag & drop).
 * @param {string} blockId
 * @param {number} newOrder
 */
export function onReorderBlock(blockId, newOrder) {
    const snapshot = getSnapshot();
    if (!snapshot) return;

    const block = snapshot.blocks.find(b => b.id === blockId);
    if (!block) return;

    block.order = newOrder;

    // Re-sort blocks in the snapshot
    snapshot.blocks.sort((a, b) => a.order - b.order);

    renderSnapshot(snapshot);
}


/**
 * Recompile after edits.
 */
export async function onRecompile() {
    const snapshot = getSnapshot();
    if (!snapshot) return;

    const finalText = await compileSnapshot(snapshot);

    renderCompiledText(finalText);
}


/**
 * Replace the entire snapshot (e.g., after loading).
 * @param {PromptSnapshot} snapshot
 */
export function loadSnapshotIntoEditor(snapshot) {
    setSnapshot(snapshot);
    renderSnapshot(snapshot); 
}
