// src/ui/state.js

/**
 * Curator UI State
 * ----------------
 * Holds the currently active PromptSnapshot so panel.js and editor.js
 * can share it without circular imports.
 */

export let currentSnapshot = null;

/**
 * Set the active snapshot.
 * @param {PromptSnapshot} snapshot
 */
export function setSnapshot(snapshot) {
    currentSnapshot = snapshot;
}

/**
 * Get the active snapshot.
 * @returns {PromptSnapshot|null}
 */
export function getSnapshot() {
    return currentSnapshot;
}

/**
 * Clear the active snapshot.
 */
export function clearSnapshot() {
    currentSnapshot = null;
}
