// Prompt Tester - one sandboxed LLM call.
//
// Sends the compiled prompt (as a single user message for Chat Completion,
// as the prompt text for a Text Completion profile) through a SillyTavern
// Connection Profile (ConnectionManagerRequestService.sendRequest) or the
// active Chat Completion connection (ChatCompletionService.sendRequest).
// Both are plain calls to SillyTavern's backend - no generation pipeline,
// no events, no chat writes - so no extension (State Engine, Memory
// Manager...) sees it and nothing in the chat, presets, variables, persona
// or world info changes. Never throws: every failure comes back as
// { ok: false, error, request, connection }.

import { getConnection, resolveConnection, buildActiveRequest, redact } from './connection.js';

function normalizeUsage(json) {
    const usage = json?.usage ?? json?.usageMetadata ?? null;
    if (!usage) return null;
    const prompt = usage.prompt_tokens ?? usage.input_tokens ?? usage.promptTokenCount ?? null;
    const completion = usage.completion_tokens ?? usage.output_tokens ?? usage.candidatesTokenCount ?? null;
    const total = usage.total_tokens ?? usage.totalTokenCount ?? (prompt !== null && completion !== null ? prompt + completion : null);
    return { prompt, completion, total };
}

function extractText(json, api) {
    if (typeof json === 'string') return json;
    try {
        const text = SillyTavern.getContext().extractMessageFromData?.(json, api);
        if (typeof text === 'string' && text) return text;
    } catch { /* fall through */ }
    return json?.choices?.[0]?.message?.content ?? json?.choices?.[0]?.text ?? json?.content ?? '';
}

function extractReasoning(json) {
    const message = json?.choices?.[0]?.message;
    return message?.reasoning_content ?? message?.reasoning ?? '';
}

// ConnectionManagerRequestService wraps failures as "API request failed"
// with the real error as `cause`.
function errorMessage(error) {
    const parts = [];
    for (let e = error; e && parts.length < 3; e = e.cause) {
        const message = String(e?.message ?? e);
        if (message && !parts.includes(message)) parts.push(message);
    }
    return parts.join(': ') || 'Unknown error';
}

/**
 * @param {string} prompt - the compiled prompt
 * @param {{ signal?: AbortSignal }} options
 */
export async function runPromptTest(prompt, { signal = null } = {}) {
    const startedAt = Date.now();
    const conn = getConnection();
    let request = null;
    let resolved = null;
    const fail = (error) => ({
        ok: false,
        error: typeof error === 'string' ? error : errorMessage(error),
        aborted: error?.name === 'AbortError' || error?.cause?.name === 'AbortError',
        request: request ? redact(request) : null,
        connection: { settings: { ...conn }, resolved },
        resolved,
        startedAt,
        durationMs: Date.now() - startedAt,
    });

    try {
        resolved = resolveConnection(conn);
        if (resolved.error) return fail(resolved.error);
        const context = SillyTavern.getContext();
        let json;

        if (resolved.mode === 'profile') {
            const svc = context.ConnectionManagerRequestService;
            if (typeof svc?.sendRequest !== 'function') return fail('Connection Manager is not available - enable SillyTavern\'s Connection Manager extension, or use the active connection.');
            const overridePayload = {};
            if (resolved.temperature !== null) overridePayload.temperature = resolved.temperature;
            request = {
                profile: resolved.name,
                ...(resolved.api === 'openai' ? { messages: [{ role: 'user', content: prompt }] } : { prompt }),
                max_tokens: resolved.max_tokens ?? '(profile default)',
                ...overridePayload,
            };
            json = await svc.sendRequest(resolved.profileId, resolved.api === 'openai' ? [{ role: 'user', content: prompt }] : prompt,
                resolved.max_tokens ?? undefined, { stream: false, extractData: false, signal }, overridePayload);
        } else {
            const svc = context.ChatCompletionService;
            if (typeof svc?.sendRequest !== 'function') return fail('This SillyTavern version has no ChatCompletionService - the Prompt Tester needs a newer SillyTavern.');
            request = buildActiveRequest([{ role: 'user', content: prompt }], resolved);
            const payload = typeof svc.createRequestData === 'function' ? { ...svc.createRequestData(request), top_p: request.top_p } : request;
            json = await svc.sendRequest(payload, false, signal);
        }

        return {
            ok: true,
            content: extractText(json, resolved.api),
            reasoning: extractReasoning(json),
            usage: normalizeUsage(json),
            model: json?.model ?? resolved.model,
            resolved,
            request: redact(request),
            startedAt,
            durationMs: Date.now() - startedAt,
        };
    } catch (err) {
        console.warn('[Curator] Prompt Tester request failed', err);
        return fail(err);
    }
}
