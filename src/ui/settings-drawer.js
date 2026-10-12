// Curator drawer in SillyTavern's Extensions settings - global switches,
// the entry point to the Prompt Analyzer modal, and saved snapshots.
// Rendered from settings.html and appended to #extensions_settings2, the
// same way State Engine's and Pretty Panels' drawers are. This file only
// wires events to the panel.js handlers.

import { getSettings, saveSettings } from '../settings.js';
import { getLastPrompt, onPromptCaptured } from '../capture.js';
import {
    onAnalyzePrompt,
    onLoadSnapshot,
    onDeleteSnapshot,
    refreshSnapshotList,
} from './panel.js';
import { testCurrentPrompt, diagnoseCurrentPrompt } from './analyzer-modal.js';
import { getDiagnosticsSettings } from './diagnostics-modal.js';
import { mountConnectionForm } from './connection-form.js';

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
        info.textContent = 'No prompt captured yet - opening the analyzer will build one for the current chat.';
    } else {
        const kind = prompt.kind === 'cc' ? `Chat Completion, ${prompt.leaves.length} messages` : `Text Completion, ${prompt.text.length} characters`;
        const applied = prompt.untouched === 'off' ? ' - not changed (Curator does not control the prompt)'
            : prompt.untouched === 'background' ? ' - another extension\'s prompt, left alone'
                : prompt.applied ? ' - rearranged by Curator' : '';
        info.textContent = `Last prompt: ${kind}${applied}, captured ${new Date(prompt.capturedAt).toLocaleTimeString()}.`;
    }
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
        document.getElementById('cr_apply_layout')?.dispatchEvent(new Event('cr:sync'));
    });

    setStateEngineStatus(stateEngineStatus);

    // "Curator controls the prompt": every change Curator makes to a prompt
    // (order, injections, variables, history limit) - see src/capture.js.
    const applyBox = document.getElementById('cr_apply_layout');
    const onlyChat = document.getElementById('cr_only_chat');
    const warning = document.getElementById('cr_control_warning');
    const syncControl = () => {
        const settings = getSettings();
        applyBox.checked = settings.applyLayout;
        applyBox.disabled = !settings.enabled;
        onlyChat.checked = settings.onlyChatReplies !== false;
        onlyChat.disabled = !settings.enabled || !settings.applyLayout;
        warning.hidden = !(settings.enabled && settings.applyLayout);
    };
    applyBox.addEventListener('change', () => {
        const settings = getSettings();
        settings.applyLayout = applyBox.checked;
        saveSettings();
        if (applyBox.checked && !settings.layout) {
            toastr.info('Curator now adds your injection blocks and variables. To rearrange SillyTavern\'s own sections too, save an arrangement in the Prompt Analyzer.', 'Curator');
        }
        syncControl();
    });
    onlyChat.addEventListener('change', () => {
        getSettings().onlyChatReplies = onlyChat.checked;
        saveSettings();
    });
    syncControl();

    document.getElementById('cr_analyze').addEventListener('click', () => onAnalyzePrompt());
    document.getElementById('cr_test_prompt').addEventListener('click', () => testCurrentPrompt());
    mountConnectionForm(document.getElementById('cr_tester_conn'));

    const question = document.getElementById('cr_diag_question');
    question.value = getDiagnosticsSettings().question;
    question.addEventListener('change', () => {
        getDiagnosticsSettings().question = question.value;
        saveSettings();
    });
    document.getElementById('cr_diagnose_prompt').addEventListener('click', async () => {
        await diagnoseCurrentPrompt(question.value);
        question.value = getDiagnosticsSettings().question;
    });

    document.getElementById('cr_snapshot_list').addEventListener('click', (e) => {
        const id = e.target.closest('.cr-snapshot')?.dataset.snapshotId;
        if (!id) return;
        if (e.target.classList.contains('cr-snapshot-load')) onLoadSnapshot(id);
        else if (e.target.classList.contains('cr-snapshot-delete')) onDeleteSnapshot(id);
    });

    renderCaptureInfo(getLastPrompt());
    applyBox.addEventListener('cr:sync', syncControl);
    onPromptCaptured((prompt) => {
        renderCaptureInfo(prompt);
        syncControl();
    });
    await refreshSnapshotList();
}
