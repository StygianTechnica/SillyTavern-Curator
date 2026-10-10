// src/ui/editor.js

import { compileSnapshot } from '../parser/parser.js';
import { getSnapshot } from './state.js';

/**
 * EDITOR OPERATIONS
 * -----------------
 * Edits to the active snapshot. These only change the model; the analyzer
 * modal (src/ui/analyzer-modal.js) re-renders after calling them.
 */

/**
 * Find a block by id, top level or inside a group.
 * @param {string} blockId
 */
export function findBlock(blockId) {
    const snapshot = getSnapshot();
    if (!snapshot) return null;
    for (const block of snapshot.blocks) {
        if (block.id === blockId) return block;
        const child = block.children?.find(c => c.id === blockId);
        if (child) return child;
    }
    return null;
}

/**
 * Update the text of a block and recount its tokens.
 * @param {string} blockId
 * @param {string} newText
 */
export async function onEditBlockText(blockId, newText) {
    const block = findBlock(blockId);
    if (!block || block.text === newText) return;
    block.text = newText;
    block.edited = true;
    try {
        block.tokens = await SillyTavern.getContext().getTokenCountAsync(newText);
    } catch {
        block.tokens = Math.ceil(newText.length / 4);
    }
}

/**
 * Toggle a block on/off.
 * @param {string} blockId
 * @param {boolean} enabled
 */
export function onToggleBlock(blockId, enabled) {
    const block = findBlock(blockId);
    if (block) block.enabled = enabled;
}

/**
 * Apply a new order (drag & drop) to the top-level blocks, or to one
 * group's children.
 * @param {string[]} orderedIds
 * @param {string|null} groupId
 */
export function onReorderBlocks(orderedIds, groupId = null) {
    const snapshot = getSnapshot();
    if (!snapshot) return;
    const list = groupId ? findBlock(groupId)?.children : snapshot.blocks;
    if (!list) return;
    orderedIds.forEach((id, order) => {
        const block = list.find(b => b.id === id);
        if (block) block.order = order;
    });
    list.sort((a, b) => a.order - b.order);
}

/**
 * Recompile after edits.
 */
export async function onRecompile() {
    const snapshot = getSnapshot();
    if (!snapshot) return '';
    return compileSnapshot(snapshot);
}
