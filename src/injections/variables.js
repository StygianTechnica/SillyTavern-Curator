// State Engine variable injections - the second bank of injectables.
//
// Other State Engine extensions (Memory Manager, Scenario Builder...) mark
// variables as injectable by declaring a State Engine CAPABILITY per
// variable:
//
//     stateEngine.declareCapabilities(id, instance, [
//         'curator.inject:mm__summary',
//         'curator.inject:mm__recent_events',
//     ]);
//
// (or in registerExtension's metadata.capabilities). The variable must be
// in the declaring extension's own namespace. Curator discovers them
// through State Engine's open capability graph - persisted, so it works
// with no chat open and whatever order extensions load in - and reads
// labels from the variable definitions and values for the current chat
// through the Variable Value API. Without State Engine none of this exists
// and the bank is hidden.
//
// The content is the variable's value in the current chat: dynamic,
// chat-specific, never edited in Curator. What the user controls here is
// whether each one is sent, where (anchor, as for injection blocks) and in
// which role - stored in Curator's settings as
//   variableInjections: { [qualifiedName]: { enabled, anchor, role } }

import { getSettings, saveSettings } from '../settings.js';
import { EXTENSION_ID, isStateEngineConnected } from '../api/connection.js';
import { getCapabilityGraph, getRegisteredExtensions } from '../api/discovery.js';
import { listAllVariables, getVariableValues } from '../api/variable-values.js';
import { ROLES } from './store.js';

export const INJECT_CAPABILITY_PREFIX = 'curator.inject:';
export const VARIABLE_PREFIX = 'var:';

export function variableKey(name) {
    return `${VARIABLE_PREFIX}${name}`;
}

export function isVariableKey(key) {
    return typeof key === 'string' && key.startsWith(VARIABLE_PREFIX);
}

export function nameFromKey(key) {
    return isVariableKey(key) ? key.slice(VARIABLE_PREFIX.length) : null;
}

function store() {
    const settings = getSettings();
    if (!settings.variableInjections || typeof settings.variableInjections !== 'object') settings.variableInjections = {};
    return settings.variableInjections;
}

// The user's settings for one variable (defaults: off, before Chat History,
// system role).
export function getVariableSetting(name) {
    const saved = store()[name] ?? {};
    return { enabled: saved.enabled === true, anchor: saved.anchor ?? null, role: ROLES.includes(saved.role) ? saved.role : 'system' };
}

export function updateVariableSetting(name, changes) {
    const all = store();
    all[name] = { ...getVariableSetting(name), ...changes };
    saveSettings();
    return all[name];
}

// One save for several anchors: { [qualifiedName]: anchor }.
export function setVariableAnchors(anchors) {
    const all = store();
    let changed = false;
    for (const [name, anchor] of Object.entries(anchors)) {
        const current = getVariableSetting(name);
        if (current.anchor !== anchor) {
            all[name] = { ...current, anchor };
            changed = true;
        }
    }
    if (changed) saveSettings();
}

// Variable value -> prompt text, the way State Engine's own {{macro}}
// renders it (objects as JSON, everything else as a string).
export function formatValue(value) {
    if (value === null || value === undefined) return '';
    if (typeof value === 'object' && !Array.isArray(value)) return JSON.stringify(value);
    return String(value);
}

// Every injectable variable any State Engine extension offers right now:
// [{ name, extensionId, extensionDescription, label, description, type, defined }]
// Empty without State Engine. Never throws.
export async function discoverInjectables() {
    if (!isStateEngineConnected()) return [];
    try {
        const [graph, registrations, presets] = await Promise.all([
            getCapabilityGraph(),
            getRegisteredExtensions(),
            listAllVariables(EXTENSION_ID),
        ]);
        const defs = new Map();
        for (const preset of presets ?? []) {
            for (const def of preset.variables ?? []) defs.set(def.name, def);
        }
        const found = [];
        for (const [extensionId, entry] of Object.entries(graph ?? {})) {
            const namespace = registrations?.[extensionId]?.namespace;
            for (const capability of entry?.capabilities ?? []) {
                if (typeof capability !== 'string' || !capability.startsWith(INJECT_CAPABILITY_PREFIX)) continue;
                const name = capability.slice(INJECT_CAPABILITY_PREFIX.length).trim();
                if (!name) continue;
                // Only an extension's own variables (when its namespace is known).
                if (namespace && !name.startsWith(`${namespace}__`)) continue;
                const def = defs.get(name);
                found.push({
                    name,
                    extensionId,
                    extensionDescription: registrations?.[extensionId]?.description ?? '',
                    label: def?.label || name.split('__').pop(),
                    description: def?.description ?? '',
                    type: def?.type ?? null,
                    defined: Boolean(def),
                });
            }
        }
        return found;
    } catch (err) {
        console.warn('[Curator] could not discover injectable State Engine variables', err);
        return [];
    }
}

// Values for a chat: { [name]: { text, hasValue } }. Never throws.
export async function readValues(chatId, names) {
    const out = {};
    for (const name of names) out[name] = { text: '', hasValue: false };
    if (!isStateEngineConnected() || !chatId || !names.length) return out;
    try {
        const values = await getVariableValues(EXTENSION_ID, chatId, names);
        for (const name of names) {
            const entry = values?.[name];
            if (entry) out[name] = { text: formatValue(entry.value), hasValue: true };
        }
    } catch (err) {
        console.warn('[Curator] could not read State Engine variable values', err);
    }
    return out;
}

// What src/capture.js inserts into an outgoing prompt: every ENABLED
// injectable variable that has a non-empty value in this chat.
//   [{ key, anchor, role, content }]
export async function buildVariableInjections(chatId) {
    if (!isStateEngineConnected()) return [];
    const enabled = (await discoverInjectables()).filter(v => getVariableSetting(v.name).enabled);
    if (!enabled.length) return [];
    const values = await readValues(chatId, enabled.map(v => v.name));
    return enabled
        .filter(v => values[v.name].text.trim())
        .map(v => {
            const setting = getVariableSetting(v.name);
            return { key: variableKey(v.name), anchor: setting.anchor, role: setting.role, content: values[v.name].text };
        });
}
