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

/**
 * PANEL INTEGRATION
 * -----------------
 * These functions wire Curator's parser pipeline into the UI.
 * You can call them from buttons, menus, or event handlers.
 */


/**
 * Analyze the current SillyTavern prompt.
 * Replace `getCurrentPromptText()` with your actual ST integration.
 */
export async function onAnalyzePrompt() {
    const rawText = getCurrentPromptText();   // TODO: your ST API call
    const snapshot = await analyzePrompt(rawText);

    setSnapshot(snapshot);
    renderSnapshot(snapshot);                 // TODO: your UI renderer
}


/**
 * Compile the active snapshot.
 */
export async function onCompileSnapshot() {
    const snapshot = getSnapshot();
    if (!snapshot) return;

    const finalText = await compileSnapshot(snapshot);
    renderCompiledText(finalText);            // TODO: your UI renderer
}


/**
 * Save the active snapshot.
 */
export async function onSaveSnapshot() {
    const snapshot = getSnapshot();
    if (!snapshot) return;

    await saveSnapshot(snapshot);
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
    renderSnapshotList(snapshots);            // TODO: your UI renderer
}

// ===============================
// UI RENDERING SCAFFOLDING
// ===============================

/**
 * Render the snapshot into the UI.
 * Replace this with your actual DOM/UI code.
 */
export function renderSnapshot(snapshot) {
    console.log('[Curator UI] Rendering snapshot:', snapshot);
    // TODO: Replace with actual UI rendering logic
}

/**
 * Render the compiled text into the UI.
 */
export function renderCompiledText(text) {
    console.log('[Curator UI] Compiled text:', text);
    // TODO: Replace with actual UI rendering logic
}

/**
 * Render the list of saved snapshots.
 */
export function renderSnapshotList(list) {
    console.log('[Curator UI] Snapshot list:', list);
    // TODO: Replace with actual UI rendering logic
}

/**
 * Get the current prompt text from SillyTavern.
 * Replace this with your ST integration.
 */
export function getCurrentPromptText() {
    console.log('[Curator UI] getCurrentPromptText() placeholder');
    return ''; // TODO: Replace with actual ST API call
}
