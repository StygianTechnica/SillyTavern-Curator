// Prompt Tester connection selector - the same form in Curator's drawer and
// at the top of the Prompt Tester, so models can be switched between runs.
// Works like State Engine's: a SillyTavern Connection Profile dropdown
// ("Use currently active connection" or any profile) plus optional
// temperature / max-token overrides. Every change is saved at once
// (src/tester/connection.js).

import { getConnection, updateConnection, listConnectionProfiles, resolveConnection } from '../tester/connection.js';

const forms = new Set();

function escapeHtml(text) {
    return String(text ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function summary() {
    const r = resolveConnection();
    if (r.error) return `<small class="cr-conn-error">${escapeHtml(r.error)}</small>`;
    const parts = [
        r.api === 'textgenerationwebui' ? 'Text Completion' : 'Chat Completion',
        r.source,
        r.model ? `<b>${escapeHtml(r.model)}</b>` : null,
        r.preset && `preset ${escapeHtml(r.preset)}`,
    ].filter(Boolean);
    return `<small class="cr-hint">${parts.map(p => (p.startsWith('<b>') ? p : escapeHtml(p))).join(' · ')}</small>`;
}

function render(container) {
    const conn = getConnection();
    const profiles = listConnectionProfiles().filter(p => p?.id);
    const options = profiles.map(p => `<option value="${escapeHtml(p.id)}"${p.id === conn.profileId ? ' selected' : ''}>${escapeHtml(p.name || p.id)}</option>`);
    if (conn.profileId && !profiles.some(p => p.id === conn.profileId)) {
        options.push(`<option value="${escapeHtml(conn.profileId)}" selected>(not found) ${escapeHtml(conn.profileId)}</option>`);
    }
    container.innerHTML = `
        <label>Connection profile
            <select class="text_pole cr-conn-profile" title="SillyTavern Connection Profile to test with (set them up in SillyTavern's Connection Manager)">
                <option value=""${conn.profileId ? '' : ' selected'}>Use currently active connection</option>
                ${options.join('')}
            </select></label>
        <div class="cr-conn-summary">${summary()}</div>
        <div class="cr-conn-sampling">
            <label>Temperature <input type="number" class="text_pole cr-conn-temp" min="0" max="2" step="0.05" value="${conn.temperature ?? ''}" placeholder="profile's" /></label>
            <label>Max tokens <input type="number" class="text_pole cr-conn-max" min="1" step="1" value="${conn.max_tokens ?? ''}" placeholder="profile's" /></label>
        </div>
        ${profiles.length ? '' : '<small class="cr-hint">No connection profiles yet - create them in SillyTavern\'s Connection Manager to compare models.</small>'}`;
}

function rerenderAll(except = null) {
    for (const form of forms) {
        if (form === except) continue;
        if (!form.isConnected) {
            forms.delete(form);
            continue;
        }
        render(form);
    }
}

const optionalNumber = value => (value === '' ? null : Number(value));

/**
 * Renders the connection form into `container` and keeps it saved and in
 * sync with any other open copy.
 * @param {HTMLElement} container
 * @param {{ onChange?: () => void }} options
 */
export function mountConnectionForm(container, { onChange = null } = {}) {
    container.classList.add('cr-conn');
    forms.add(container);
    watchSillyTavern();
    render(container);

    container.addEventListener('change', (e) => {
        const t = e.target;
        if (t.classList.contains('cr-conn-profile')) updateConnection({ profileId: t.value });
        else if (t.classList.contains('cr-conn-temp')) updateConnection({ temperature: optionalNumber(t.value) });
        else if (t.classList.contains('cr-conn-max')) {
            const n = optionalNumber(t.value);
            updateConnection({ max_tokens: n === null ? null : Math.max(1, Math.round(n)) });
        } else return;
        render(container);
        rerenderAll(container);
        onChange?.();
    });
}

// Profiles (and the active connection) can change in SillyTavern at any
// time - keep every open form current. Registered once.
let watching = false;
function watchSillyTavern() {
    if (watching) return;
    watching = true;
    try {
        const { eventSource, eventTypes } = SillyTavern.getContext();
        for (const type of ['CONNECTION_PROFILE_LOADED', 'CONNECTION_PROFILE_CREATED', 'CONNECTION_PROFILE_DELETED', 'CONNECTION_PROFILE_UPDATED',
            'MAIN_API_CHANGED', 'CHATCOMPLETION_SOURCE_CHANGED', 'CHATCOMPLETION_MODEL_CHANGED']) {
            if (eventTypes?.[type]) eventSource.on(eventTypes[type], () => rerenderAll());
        }
    } catch (err) {
        console.warn('[Curator] could not watch connection changes', err);
    }
}

// Re-reads profiles and the connection summary in every open form.
export function refreshConnectionForms() {
    rerenderAll();
}
