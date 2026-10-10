// Prompt Diagnostics modal - ask a question about the compiled prompt and
// get a structured analysis from a model, through the same connection
// selector and sandboxed call as the Prompt Tester (src/tester/runner.js):
// nothing reaches the chat and no other extension sees the call.
// Reports stay on screen, so several questions (or models) can be compared.

import { getSettings, saveSettings } from '../settings.js';
import { mountConnectionForm, refreshConnectionForms } from './connection-form.js';
import { resolveConnection } from '../tester/connection.js';
import { runPromptTest } from '../tester/runner.js';
import { buildDiagnosticPrompt, parseReport, isEmptySection, REPORT_SECTIONS } from '../diagnostics/meta-prompt.js';

const DEFAULTS = { question: '', maxTokens: 2048 };

let root = null;
let prepared = null;      // { text, tokens, sections, contextSize, targetModel, meta }
let reports = [];
let running = null;

export function getDiagnosticsSettings() {
    const settings = getSettings();
    if (!settings.diagnostics || typeof settings.diagnostics !== 'object') settings.diagnostics = {};
    for (const [key, value] of Object.entries(DEFAULTS)) {
        if (settings.diagnostics[key] === undefined) settings.diagnostics[key] = value;
    }
    return settings.diagnostics;
}

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

// Minimal, safe markdown: escaped text, bullet lists, **bold**, `code`.
function renderMarkdown(text) {
    const inline = s => escapeHtml(s)
        .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
        .replace(/`([^`]+)`/g, '<code>$1</code>');
    const html = [];
    let list = null;
    for (const line of String(text ?? '').split('\n')) {
        const bullet = line.match(/^\s*(?:[-*•]|\d+[.)])\s+(.*)$/);
        if (bullet) {
            if (!list) {
                list = [];
                html.push(list);
            }
            list.push(`<li>${inline(bullet[1])}</li>`);
        } else {
            list = null;
            if (line.trim()) html.push(`<p>${inline(line)}</p>`);
        }
    }
    return html.map(part => (Array.isArray(part) ? `<ul>${part.join('')}</ul>` : part)).join('');
}

function connectionLine(result) {
    const r = result.resolved ?? {};
    return [
        r.mode === 'profile' ? `Profile: ${r.name}` : 'Active connection',
        r.source,
        result.model || r.model,
        `max ${r.max_tokens ?? 'from profile'}`,
    ].filter(Boolean).join(' · ');
}

function renderReport(report, index) {
    const { question, result } = report;
    const time = `${new Date(result.startedAt).toLocaleTimeString()} · ${(result.durationMs / 1000).toFixed(1)}s`;
    const head = `
        <div class="cr-result-head"><b title="${escapeHtml(question)}">${escapeHtml(question)}</b> <small>${escapeHtml(time)}</small>
            <span class="menu_button fa-solid fa-circle-question cr-report-copy-q" title="Copy question"></span>
            ${result.ok ? '<span class="menu_button fa-solid fa-copy cr-report-copy" title="Copy report"></span>' : ''}
            <span class="menu_button fa-solid fa-xmark cr-result-remove" title="Remove"></span></div>`;
    if (!result.ok) {
        return `
            <div class="cr-result cr-result-error cr-report" data-index="${index}">${head}
                <div class="cr-result-error-msg"><i class="fa-solid fa-triangle-exclamation"></i> ${escapeHtml(result.aborted ? 'Cancelled.' : result.error)}</div>
                <details><summary>Request</summary><pre>${escapeHtml(JSON.stringify(result.request, null, 2) ?? '(not built)')}</pre></details>
                <details><summary>Connection settings</summary><pre>${escapeHtml(JSON.stringify(result.connection, null, 2))}</pre></details>
            </div>`;
    }
    const { sections, structured } = parseReport(result.content);
    const usage = result.usage
        ? `${fmt(result.usage.prompt)} prompt + ${fmt(result.usage.completion)} report = ${fmt(result.usage.total)} tokens`
        : 'Token usage not reported by this server';
    const blocks = Object.entries(REPORT_SECTIONS).map(([key, [heading]]) => {
        const text = sections[key];
        if (text === undefined) return '';
        const empty = isEmptySection(text);
        return `
            <section class="cr-report-section cr-report-${key}${empty ? ' cr-report-empty' : ''}">
                <div class="cr-report-heading">${escapeHtml(heading)}</div>
                ${empty ? '<small class="cr-hint">None found.</small>' : renderMarkdown(text)}
            </section>`;
    }).join('');
    return `
        <div class="cr-result cr-report" data-index="${index}">${head}
            <small class="cr-hint">${escapeHtml(connectionLine(result))}</small>
            <small class="cr-result-usage">${escapeHtml(usage)}</small>
            ${structured ? '' : '<small class="cr-hint">The model did not use the requested headings - its whole answer is shown as the diagnosis.</small>'}
            ${result.reasoning ? `<details><summary>Reasoning</summary><div class="cr-result-text">${escapeHtml(result.reasoning)}</div></details>` : ''}
            <div class="cr-report-sections">${blocks || '<small class="cr-hint">(empty report)</small>'}</div>
            <details><summary>Full report text</summary><div class="cr-result-text">${escapeHtml(result.content)}</div></details>
        </div>`;
}

function renderReports() {
    const list = root.querySelector('.cr-results');
    list.innerHTML = reports.length
        ? reports.map((r, i) => renderReport(r, i)).reverse().join('')
        : '<small class="cr-hint">Ask a question about the prompt - for example "Why does the model keep speaking for my character?" - and press Diagnose.</small>';
}

function renderRunState() {
    const run = root.querySelector('[data-action="diagnose"]');
    run.classList.toggle('disabled', Boolean(running));
    run.querySelector('span').textContent = running ? 'Diagnosing...' : 'Diagnose';
    root.querySelector('[data-action="cancel"]').hidden = !running;
    const resolved = resolveConnection();
    root.querySelector('.cr-run-target').textContent = resolved.error ? '' : `→ ${resolved.mode === 'profile' ? resolved.name : (resolved.model || 'active connection')}`;
}

async function diagnose() {
    if (running) return;
    const question = root.querySelector('.cr-diag-question').value.trim();
    if (!question) {
        toastr.info('Type a question about the prompt first.', 'Curator');
        root.querySelector('.cr-diag-question').focus();
        return;
    }
    const settings = getDiagnosticsSettings();
    settings.question = question;
    saveSettings();
    const drawerQuestion = document.getElementById('cr_diag_question');
    if (drawerQuestion) drawerQuestion.value = question;

    const metaPrompt = buildDiagnosticPrompt({ question, compiled: prepared.text, sections: prepared.sections, totalTokens: prepared.tokens, contextSize: prepared.contextSize, targetModel: prepared.targetModel });
    running = new AbortController();
    renderRunState();
    const result = await runPromptTest(metaPrompt, { signal: running.signal, maxTokens: Number(settings.maxTokens) || null });
    running = null;
    if (!root) return;
    reports.push({ question, result });
    renderReports();
    renderRunState();
    if (!result.ok && !result.aborted) toastr.error(result.error, 'Prompt Diagnostics');
}

function buildRoot() {
    const settings = getDiagnosticsSettings();
    const el = document.createElement('div');
    el.className = 'cr-tester cr-diagnostics';
    el.innerHTML = `
        <div class="cr-title"><i class="fa-solid fa-stethoscope"></i> <b>Prompt Diagnostics</b>
            <small class="cr-hint">A model reviews the compiled prompt and answers your question - a sandbox call, nothing reaches the chat.</small></div>
        <div class="cr-tester-grid">
            <section class="cr-tester-left">
                <div class="cr-side-head"><b>Question</b></div>
                <textarea class="text_pole cr-diag-question" rows="4" placeholder="e.g. Why does the model keep writing actions for my character? Why are scene details missing?">${escapeHtml(settings.question)}</textarea>
                <div class="cr-tester-actions">
                    <div class="menu_button menu_button_icon cr-primary" data-action="diagnose" title="Send the question and the compiled prompt to the selected connection"><i class="fa-solid fa-stethoscope"></i><span>Diagnose</span></div>
                    <small class="cr-run-target cr-hint"></small>
                    <div class="menu_button menu_button_icon" data-action="cancel" hidden><i class="fa-solid fa-stop"></i><span>Cancel</span></div>
                </div>
                <div class="cr-side-head"><b>Connection</b></div>
                <div class="cr-tester-conn"></div>
                <label class="cr-diag-length">Report length (max tokens, when the connection sets none)
                    <input type="number" class="text_pole cr-diag-max" min="256" step="256" value="${escapeHtml(settings.maxTokens)}" /></label>
                <details class="cr-diag-prompt"><summary>Compiled prompt <small class="cr-hint">${escapeHtml(prepared.meta)}</small></summary>
                    <textarea class="text_pole cr-tester-prompt" readonly></textarea></details>
                <small class="cr-hint">The diagnosing model reads the whole prompt plus the question, so it needs a context at least that large.</small>
            </section>
            <section class="cr-tester-right">
                <div class="cr-side-head"><b>Reports</b>
                    <div class="menu_button menu_button_icon" data-action="clear" title="Clear all reports"><i class="fa-solid fa-eraser"></i><span>Clear</span></div></div>
                <div class="cr-results cr-reports"></div>
            </section>
        </div>`;
    return el;
}

function wire() {
    root.addEventListener('click', async (e) => {
        const card = e.target.closest('.cr-report');
        const report = card ? reports[Number(card.dataset.index)] : null;
        if (report && e.target.closest('.cr-result-remove')) {
            reports.splice(Number(card.dataset.index), 1);
            renderReports();
            return;
        }
        if (report && e.target.closest('.cr-report-copy-q')) return copy(report.question, 'Question');
        if (report && e.target.closest('.cr-report-copy')) return copy(`Question: ${report.question}\n\n${report.result.content}`, 'Report');
        switch (e.target.closest('[data-action]')?.dataset.action) {
            case 'diagnose': await diagnose(); break;
            case 'cancel': running?.abort(); break;
            case 'clear': reports = []; renderReports(); break;
        }
    });
    root.addEventListener('change', (e) => {
        if (e.target.classList.contains('cr-diag-max')) {
            getDiagnosticsSettings().maxTokens = Math.max(256, Math.round(Number(e.target.value) || DEFAULTS.maxTokens));
            saveSettings();
        } else if (e.target.classList.contains('cr-diag-question')) {
            getDiagnosticsSettings().question = e.target.value;
            saveSettings();
        }
    });
    root.querySelector('.cr-diag-question').addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            void diagnose();
        }
    });
}

/**
 * Opens Prompt Diagnostics on a compiled prompt.
 * @param {{ text: string, tokens: number, sections: object[], contextSize: number, targetModel: string|null, meta: string }} compiled
 * @param {{ question?: string, run?: boolean }} options - question: prefill
 *   (and save) a question; run: diagnose straight away (used when the user
 *   already pressed Diagnose Prompt with a question in the drawer)
 */
export async function openDiagnosticsModal(compiled, { question = null, run = false } = {}) {
    prepared = compiled;
    reports = [];
    running = null;
    if (question !== null) {
        getDiagnosticsSettings().question = question;
        saveSettings();
    }
    refreshConnectionForms();
    root = buildRoot();
    root.querySelector('.cr-tester-prompt').value = prepared.text;
    mountConnectionForm(root.querySelector('.cr-tester-conn'), { onChange: () => renderRunState() });
    wire();
    renderReports();
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
    const shown = popup.show();
    if (run) void diagnose();
    await shown;
    root = null;
}
