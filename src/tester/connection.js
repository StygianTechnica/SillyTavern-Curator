// Prompt Tester connection - which model the Prompt Tester calls. Works
// like State Engine's background-call connection: a SillyTavern
// Connection Profile (or the active connection), with optional
// temperature / max-token overrides. Curator stores no server, model or
// key of its own - profiles keep those in SillyTavern, and keys stay in
// SillyTavern's secrets on the server.
//
// Settings (extension_settings.curator.llmConnection):
//   { profileId, temperature, max_tokens }
//   - profileId: '' = SillyTavern's currently active connection
//   - temperature / max_tokens: null = the profile's (or connection's) own
//
// Requests never go through SillyTavern's generation pipeline: profiles use
// ConnectionManagerRequestService.sendRequest, the active connection
// ChatCompletionService.sendRequest - plain backend calls that fire no
// events, so no other extension sees them and the chat is never touched.

import { getSettings, saveSettings } from '../settings.js';

export const CONNECTION_DEFAULTS = {
    profileId: '',
    temperature: null,
    max_tokens: null,
};

// Fields from the first Prompt Tester version, which had its own server /
// key / model. Removed on load so no API key is left in Curator's settings.
const RETIRED_FIELDS = ['useSTConnection', 'apiServer', 'apiKey', 'model', 'top_p'];

// Endpoint fields some Chat Completion sources need, copied from
// SillyTavern's settings when using the active connection.
const ST_ENDPOINT_FIELDS = ['custom_url', 'reverse_proxy', 'proxy_password', 'custom_include_headers', 'custom_include_body', 'custom_exclude_body',
    'vertexai_region', 'zai_endpoint', 'siliconflow_endpoint', 'minimax_endpoint', 'pollinations_endpoint'];

export function getConnection() {
    const settings = getSettings();
    if (!settings.llmConnection || typeof settings.llmConnection !== 'object') settings.llmConnection = {};
    const conn = settings.llmConnection;
    let retired = false;
    for (const field of RETIRED_FIELDS) {
        if (field in conn) {
            delete conn[field];
            retired = true;
        }
    }
    if (retired) {
        // The old temperature / max tokens belonged to that removed
        // connection - start from the profile's own settings instead.
        conn.temperature = null;
        conn.max_tokens = null;
    }
    for (const [key, value] of Object.entries(CONNECTION_DEFAULTS)) {
        if (conn[key] === undefined) conn[key] = value;
    }
    if (retired) saveSettings();
    return conn;
}

export function updateConnection(changes) {
    const conn = getConnection();
    Object.assign(conn, changes);
    saveSettings();
    return conn;
}

// Every SillyTavern connection profile as [{ id, name, ... }], or [] when
// Connection Manager isn't available - the same lookup State Engine uses.
export function listConnectionProfiles() {
    try {
        const context = SillyTavern.getContext();
        const svc = context.ConnectionManagerRequestService;
        if (svc && typeof svc.getSupportedProfiles === 'function') return svc.getSupportedProfiles() || [];
        if (context.extensionSettings?.connectionManager?.profiles) return context.extensionSettings.connectionManager.profiles;
    } catch (err) {
        console.warn('[Curator] could not read connection profiles', err);
    }
    return [];
}

function numberOrNull(value) {
    if (value === null || value === undefined || value === '') return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
}

// The connection a test will use, flattened for display.
//   { mode: 'profile' | 'active', name, api, source, model, server, temperature, max_tokens, error? }
// temperature / max_tokens: the override, or null (= the profile's own).
export function resolveConnection(conn = getConnection()) {
    const temperature = numberOrNull(conn.temperature);
    const maxTokens = numberOrNull(conn.max_tokens);
    const max_tokens = maxTokens === null ? null : Math.max(1, Math.round(maxTokens));
    const context = SillyTavern.getContext();

    if (conn.profileId) {
        const profile = listConnectionProfiles().find(p => p?.id === conn.profileId);
        if (!profile) {
            return { mode: 'profile', name: conn.profileId, temperature, max_tokens, error: `Connection profile "${conn.profileId}" was not found - pick another one.` };
        }
        return {
            mode: 'profile',
            profileId: profile.id,
            name: profile.name || profile.id,
            api: profile.mode === 'tc' ? 'textgenerationwebui' : 'openai',
            source: profile.api ?? null,
            model: profile.model ?? '',
            server: profile['api-url'] || null,
            preset: profile.preset ?? null,
            temperature,
            max_tokens,
        };
    }

    if (context.mainApi !== 'openai') {
        return { mode: 'active', name: 'Active connection', temperature, max_tokens, error: 'SillyTavern\'s active connection is a Text Completion API. Pick a connection profile for the Prompt Tester instead (Text Completion profiles work).' };
    }
    const oai = context.chatCompletionSettings ?? {};
    let model = '';
    try {
        model = context.getChatCompletionModel?.() ?? '';
    } catch { /* unavailable */ }
    return {
        mode: 'active',
        name: 'Active connection',
        api: 'openai',
        source: oai.chat_completion_source,
        model,
        server: oai.chat_completion_source === 'custom' ? oai.custom_url : (oai.reverse_proxy || null),
        temperature,
        max_tokens,
    };
}

// The request body used for the ACTIVE connection (profiles build their
// own inside ConnectionManagerRequestService).
export function buildActiveRequest(messages, resolved) {
    const oai = SillyTavern.getContext().chatCompletionSettings ?? {};
    const request = {
        stream: false,
        messages,
        model: resolved.model,
        chat_completion_source: resolved.source,
        temperature: resolved.temperature ?? Number(oai.temp_openai ?? 1),
        top_p: Number(oai.top_p_openai ?? 1),
        max_tokens: resolved.max_tokens ?? Number(oai.openai_max_tokens ?? 1024),
    };
    for (const field of ST_ENDPOINT_FIELDS) {
        if (oai[field] !== undefined && oai[field] !== '') request[field] = oai[field];
    }
    return request;
}

// A copy safe to show on screen: passwords masked, long messages shortened.
export function redact(object) {
    const copy = structuredClone(object ?? {});
    if (copy.proxy_password) copy.proxy_password = '…(hidden)';
    if (typeof copy.custom_include_headers === 'string') copy.custom_include_headers = copy.custom_include_headers.replace(/Bearer [^"\n]+/g, 'Bearer …(hidden)');
    const shorten = text => (typeof text === 'string' && text.length > 300 ? `${text.slice(0, 300)}… (${text.length} characters)` : text);
    if (Array.isArray(copy.messages)) copy.messages = copy.messages.map(m => ({ ...m, content: shorten(m.content) }));
    if (typeof copy.prompt === 'string') copy.prompt = shorten(copy.prompt);
    return copy;
}
