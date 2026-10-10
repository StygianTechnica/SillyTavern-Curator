// Global injection blocks - Curator's own prompt blocks, stored in
// Curator's extension settings and shared by every chat, character and
// preset. Each is sent as one Chat Completion message wherever it was
// placed in the Prompt Analyzer (see placeInjections() in
// src/prompt/sections.js).
//
// Block shape:
//   { id, name, text, role, color, enabled, anchor, source, createdAt, updatedAt }
//   - role:   'system' | 'user' | 'assistant'
//   - anchor: key of the block directly above it in the prompt
//             ('^' = top of the prompt, null = just before Chat History)
//   - source: where it came from - null (user), { preset: id },
//             { provider, id } (an integration), or { clonedFrom: key }
//
// The array order is the library order (also the default order of
// injection blocks that share a position).

import { getSettings, saveSettings } from '../settings.js';

export const INJECTION_PREFIX = 'inj:';
export const DEFAULT_COLOR = '#2fa4a9';
export const ROLES = ['system', 'user', 'assistant'];

const listeners = new Set();

function list() {
    const settings = getSettings();
    if (!Array.isArray(settings.injections)) settings.injections = [];
    return settings.injections;
}

function commit() {
    saveSettings();
    for (const fn of listeners) {
        try {
            fn();
        } catch (err) {
            console.error('[Curator] injection listener failed', err);
        }
    }
}

function newId() {
    return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

function normalizeRole(role) {
    return ROLES.includes(role) ? role : 'system';
}

export function injectionKey(id) {
    return `${INJECTION_PREFIX}${id}`;
}

export function isInjectionKey(key) {
    return typeof key === 'string' && key.startsWith(INJECTION_PREFIX);
}

// Keys of sections Curator itself adds to a prompt: injection blocks and
// State Engine variable injections ('var:...', src/injections/variables.js).
export function isCuratorKey(key) {
    return isInjectionKey(key) || (typeof key === 'string' && key.startsWith('var:'));
}

export function idFromKey(key) {
    return isInjectionKey(key) ? key.slice(INJECTION_PREFIX.length) : null;
}

export function onInjectionsChanged(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
}

export function getInjections() {
    return list();
}

export function getInjection(id) {
    return list().find(b => b.id === id) ?? null;
}

export function createInjection({ name, text = '', role = 'system', color = DEFAULT_COLOR, enabled = true, anchor = null, source = null } = {}, { after = null } = {}) {
    const now = Date.now();
    const block = {
        id: newId(),
        name: String(name || 'New injection block').trim(),
        text: String(text ?? ''),
        role: normalizeRole(role),
        color: color || DEFAULT_COLOR,
        enabled: Boolean(enabled),
        anchor,
        source,
        createdAt: now,
        updatedAt: now,
    };
    const blocks = list();
    const index = after ? blocks.findIndex(b => b.id === after) : -1;
    if (index >= 0) blocks.splice(index + 1, 0, block);
    else blocks.push(block);
    commit();
    return block;
}

export function updateInjection(id, changes) {
    const block = getInjection(id);
    if (!block) return null;
    for (const field of ['name', 'text', 'color', 'enabled', 'anchor']) {
        if (changes[field] !== undefined) block[field] = changes[field];
    }
    if (changes.role !== undefined) block.role = normalizeRole(changes.role);
    if (typeof block.name === 'string') block.name = block.name.trim() || 'Untitled';
    block.updatedAt = Date.now();
    commit();
    return block;
}

export function deleteInjection(id) {
    const blocks = list();
    const index = blocks.findIndex(b => b.id === id);
    if (index < 0) return false;
    const [removed] = blocks.splice(index, 1);
    // Anything anchored to it takes over its anchor, so it keeps its place.
    const gone = injectionKey(id);
    for (const block of blocks) {
        if (block.anchor === gone) block.anchor = removed.anchor ?? null;
    }
    commit();
    return true;
}

// Copy of an injection block, placed directly below the original.
export function cloneInjection(id) {
    const original = getInjection(id);
    if (!original) return null;
    return createInjection({
        ...original,
        name: `${original.name} (copy)`,
        anchor: injectionKey(original.id),
        source: original.source,
    }, { after: original.id });
}

// New library order, from a list of ids.
export function reorderInjections(ids) {
    const blocks = list();
    const byId = new Map(blocks.map(b => [b.id, b]));
    const ordered = ids.map(id => byId.get(id)).filter(Boolean);
    const rest = blocks.filter(b => !ids.includes(b.id));
    blocks.splice(0, blocks.length, ...ordered, ...rest);
    commit();
}

// Positions from the Prompt Analyzer: { [id]: anchor } for every block.
// One save for the lot.
export function setAnchors(anchors) {
    let changed = false;
    for (const block of list()) {
        if (Object.hasOwn(anchors, block.id) && block.anchor !== anchors[block.id]) {
            block.anchor = anchors[block.id];
            changed = true;
        }
    }
    if (changed) commit();
}

// The text actually sent: macros ({{char}}, {{user}}...) resolved.
export function resolvedText(block) {
    try {
        return SillyTavern.getContext().substituteParams(block.text ?? '');
    } catch {
        return block.text ?? '';
    }
}
