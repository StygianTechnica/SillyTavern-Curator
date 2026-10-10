// Prompt Tester modal - runs the compiled prompt against a model and shows
// what came back, without touching the chat (see src/tester/runner.js).
// Results stay on screen as cards, so the same prompt can be run against
// several models / servers / sampling settings and compared side by side:
// change the connection at the top, press Run again.

import { mountConnectionForm, refreshConnectionForms } from './connection-form.js';
import { resolveConnection } from '../tester/connection.js';
import { runPromptTest } from '../tester/runner.js';

let root = null;
let prompt = '';
let results = [];
let running = null;   // AbortController of the request in flight

function escapeHtml(text) {
    return String(text ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

const fmt = n => (n === null || n === undefined ? '?' : Number(n).toLocaleString());

async function copy(text, what) {
    try {
        await navigator.clipboard.writeText(text);
        toastr.success(`${what} copied.`, 'Curator');
    } catch {
        toastr.error('Copy failed - select the text and copy it by hand.', 'Curator');
    }
}

function connectionLine(result) {
    const r = result.resolved ?? {};
    return [
        r.mode === 'profile' ? `Profile: ${r.name}` : 'Active connection',
        r.source,
        r.server,
        r.preset && `preset ${r.preset}`,
        `temp ${r.temperature ?? 'from profile'}`,
        `max ${r.max_tokens ?? 'from profile'}`,
    ].filter(Boolean).join(' · ');
}

function renderResult(result, index) {
    const title = result.ok ? (result.model || result.resolved?.model || 'model') : (result.resolved?.model || 'Request failed');
    const time = `${new Date(result.startedAt).toLocaleTimeString()} · ${(result.durationMs / 1000).toFixed(1)}s`;
    if (!result.ok) {
        return `
            <div class="cr-result cr-result-error" data-index="${index}">
                <div class="cr-result-head"><b>${escapeHtml(title)}</b> <small>${escapeHtml(time)}</small>
                    <span class="menu_button fa-solid fa-xmark cr-result-remove" title="Remove"></span></div>
                <div class="cr-result-error-msg"><i class="fa-solid fa-triangle-exclamation"></i> ${escapeHtml(result.aborted ? 'Cancelled.' : result.error)}</div>
                <details><summary>Request</summary><pre>${escapeHtml(JSON.stringify(result.request, null, 2) ?? '(not built)')}</pre></details>
                <details><summary>Connection settings</summary><pre>${escapeHtml(JSON.stringify(result.connection, null, 2))}</pre></details>
            </div>`;
    }
    const usage = result.usage
        ? `${fmt(result.usage.prompt)} prompt + ${fmt(result.usage.completion)} response = ${fmt(result.usage.total)} tokens`
        : 'Token usage not reported by this server';
    return `
        <div class="cr-result" data-index="${index}">
            <div class="cr-result-head"><b>${escapeHtml(title)}</b> <small>${escapeHtml(time)}</small>
                <span class="menu_button fa-solid fa-copy cr-result-copy" title="Copy response"></span>
                <span class="menu_button fa-solid fa-xmark cr-result-remove" title="Remove"></span></div>
            <small class="cr-hint">${escapeHtml(connectionLine(result))}</small>
            <small class="cr-result-usage">${escapeHtml(usage)}</small>
            ${result.reasoning ? `<details><summary>Reasoning</summary><div class="cr-result-text">${escapeHtml(result.reasoning)}</div></details>` : ''}
            <div class="cr-result-text">${escapeHtml(result.content || '(empty response)')}</div>
        </div>`;
}

function renderResults() {
    const list = root.querySelector('.cr-results');
    list.innerHTML = results.length
        ? results.map((r, i) => renderResult(r, i)).reverse().join('')
        : '<small class="cr-hint">No runs yet. Press Run. Pick another connection profile above and run again to compare models.</small>';
    root.querySelector('[data-action="copy-response"]').classList.toggle('disabled', !results.some(r => r.ok));
}

function renderRunState() {
    const run = root.querySelector('[data-action="run"]');
    const cancel = root.querySelector('[data-action="cancel"]');
    run.classList.toggle('disabled', Boolean(running));
    run.querySelector('span').textContent = running ? 'Running...' : results.length ? 'Run again' : 'Run';
    cancel.hidden = !running;
    const resolved = resolveConnection();
    root.querySelector('.cr-run-target').textContent = resolved.error ? '' : `→ ${resolved.mode === 'profile' ? resolved.name : (resolved.model || 'active connection')}`;
}

async function run() {
    if (running) return;
    running = new AbortController();
    renderRunState();
    const result = await runPromptTest(prompt, { signal: running.signal });
    running = null;
    if (!root) return;
    results.push(result);
    renderResults();
    renderRunState();
    if (!result.ok && !result.aborted) toastr.error(result.error, 'Prompt Tester');
}

function buildRoot(meta) {
    const el = document.createElement('div');
    el.className = 'cr-tester';
    el.innerHTML = `
        <div class="cr-title"><i class="fa-solid fa-flask"></i> <b>Prompt Tester</b>
            <small class="cr-hint">A sandbox call - nothing is added to the chat and no other extension sees it.</small></div>
        <div class="cr-tester-grid">
            <section class="cr-tester-left">
                <div class="cr-side-head"><b>Connection</b></div>
                <div class="cr-tester-conn"></div>
                <div class="cr-tester-actions">
                    <div class="menu_button menu_button_icon cr-primary" data-action="run" title="Send the compiled prompt to the selected connection"><i class="fa-solid fa-play"></i><span>Run</span></div>
                    <small class="cr-run-target cr-hint"></small>
                    <div class="menu_button menu_button_icon" data-action="cancel" hidden><i class="fa-solid fa-stop"></i><span>Cancel</span></div>
                </div>
                <div class="cr-side-head"><b>Compiled prompt</b> <small class="cr-hint">${escapeHtml(meta)}</small>
                    <div class="menu_button fa-solid fa-copy" data-action="copy-prompt" title="Copy prompt"></div></div>
                <textarea class="text_pole cr-tester-prompt" readonly></textarea>
                <small class="cr-hint">Sent as one user message (as the prompt text for a Text Completion profile).</small>
            </section>
            <section class="cr-tester-right">
                <div class="cr-side-head"><b>Responses</b>
                    <div class="menu_button menu_button_icon" data-action="copy-response" title="Copy the latest response"><i class="fa-solid fa-copy"></i><span>Copy Response</span></div>
                    <div class="menu_button menu_button_icon" data-action="clear-results" title="Clear all results"><i class="fa-solid fa-eraser"></i><span>Clear</span></div></div>
                <div class="cr-results"></div>
            </section>
        </div>`;
    return el;
}

function wire() {
    root.addEventListener('click', async (e) => {
        const card = e.target.closest('.cr-result');
        if (card && e.target.closest('.cr-result-remove')) {
            results.splice(Number(card.dataset.index), 1);
            renderResults();
            renderRunState();
            return;
        }
        if (card && e.target.closest('.cr-result-copy')) {
            await copy(results[Number(card.dataset.index)]?.content ?? '', 'Response');
            return;
        }
        switch (e.target.closest('[data-action]')?.dataset.action) {
            case 'run': await run(); break;
            case 'cancel': running?.abort(); break;
            case 'copy-prompt': await copy(prompt, 'Prompt'); break;
            case 'copy-response': {
                const latest = [...results].reverse().find(r => r.ok);
                if (latest) await copy(latest.content, 'Response');
                break;
            }
            case 'clear-results': results = []; renderResults(); renderRunState(); break;
        }
    });
}

/**
 * Opens the Prompt Tester on `compiledPrompt`. Nothing is sent until the
 * user presses Run.
 * @param {string} compiledPrompt
 * @param {{ meta?: string }} options
 */
export async function openTesterModal(compiledPrompt, { meta = '' } = {}) {
    prompt = String(compiledPrompt ?? '');
    refreshConnectionForms();
    results = [];
    running = null;
    root = buildRoot(meta);
    root.querySelector('.cr-tester-prompt').value = prompt;
    mountConnectionForm(root.querySelector('.cr-tester-conn'), { onChange: () => renderRunState() });
    wire();
    renderResults();
    renderRunState();

    const { Popup, POPUP_TYPE } = SillyTavern.getContext();
    const popup = new Popup(root, POPUP_TYPE.TEXT, '', {
        wide: true,
        large: true,
        okButton: 'Close',
        cancelButton: false,
        allowVerticalScrolling: true,
        leftAlign: true,
        onClose: () => running?.abort(),
    });
    await popup.show();
    root = null;
}
