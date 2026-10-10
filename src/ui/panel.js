// src/ui/panel.js

import {
    analyzePrompt,
    saveSnapshot,
    loadSnapshot,
    listSnapshots,
    deleteSnapshot,
} from '../parser/parser.js';

import { setSnapshot, getSnapshot } from './state.js';
import { getLastPrompt, refreshPrompt } from '../capture.js';
import { openAnalyzerModal } from './analyzer-modal.js';

/**
 * PANEL INTEGRATION
 * -----------------
 * Handlers behind the Curator drawer (settings.html): opening the Prompt
 * Analyzer and managing saved snapshots. The analyzer itself lives in
 * src/ui/analyzer-modal.js.
 */


/**
 * Analyze the most recently captured prompt - building one with a dry run
 * first if nothing has been captured yet - and open the Prompt Analyzer.
 */
export async function onAnalyzePrompt() {
    const capture = getLastPrompt() ?? await refreshPrompt();
    if (!capture) {
        toastr.info('No prompt available yet - open a chat first.', 'Curator');
        return;
    }
    const snapshot = await analyzePrompt(capture);
    setSnapshot(snapshot);
    await openAnalyzerModal({ live: true });
}


/**
 * Save the active snapshot.
 */
export async function onSaveSnapshot() {
    const snapshot = getSnapshot();
    if (!snapshot) return;

    if (await saveSnapshot(snapshot)) toastr.success('Snapshot saved - the last 5 are kept.', 'Curator');
    await refreshSnapshotList();
}


/**
 * Open a saved snapshot in the Prompt Analyzer.
 */
export async function onLoadSnapshot(id) {
    const snapshot = await loadSnapshot(id);
    if (!snapshot) return;

    setSnapshot(snapshot);
    await openAnalyzerModal({ live: false });
}


/**
 * Delete a snapshot by ID.
 */
export async function onDeleteSnapshot(id) {
    await deleteSnapshot(id);
    await refreshSnapshotList();
}


/**
 * Refresh the snapshot list in the drawer.
 */
export async function refreshSnapshotList() {
    const snapshots = await listSnapshots();
    renderSnapshotList(snapshots);
}

function escapeHtml(text) {
    return String(text ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/**
 * Render the list of saved snapshots into the drawer.
 */
export function renderSnapshotList(list) {
    const container = document.getElementById('cr_snapshot_list');
    if (!container) return;
    if (!list.length) {
        container.innerHTML = '<small class="cr-hint">No saved snapshots.</small>';
        return;
    }
    container.innerHTML = list.map(({ id, savedAt }) => `
        <div class="cr-snapshot" data-snapshot-id="${escapeHtml(id)}">
            <span class="cr-snapshot-name" title="${escapeHtml(id)}">${escapeHtml(savedAt ? new Date(savedAt).toLocaleString() : id)}</span>
            <div class="menu_button fa-solid fa-folder-open cr-snapshot-load" title="Open in the Prompt Analyzer"></div>
            <div class="menu_button fa-solid fa-trash-can cr-snapshot-delete" title="Delete"></div>
        </div>`).join('');
}
