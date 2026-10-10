// Chat Completion prompt sections.
//
// When SillyTavern builds a Chat Completion prompt it keeps a tree of
// MessageCollections / Messages, each tagged with an identifier ('main',
// 'charDescription', 'personaDescription', 'worldInfoBefore',
// 'chatHistory-12', a custom prompt's uuid, an extension prompt key...),
// on promptManager.messages. The flat array actually sent is that tree's
// getChat(). This file flattens the tree the same way getChat() does, so
// leaf i describes sent message i, then groups the leaves into stable
// SECTIONS (keyed so the same section has the same key on every
// generation) - the unit Curator shows, reorders and toggles.

import { historyKeepMask } from './history-limit.js';

// Section key for one leaf: every chat history message shares the
// 'chatHistory' section, every example dialogue message 'dialogueExamples';
// everything else is its own identifier.
export function sectionKey(leaf) {
    const id = String(leaf.identifier ?? '');
    if (id.startsWith('chatHistory') || leaf.collection === 'chatHistory') return 'chatHistory';
    if (id.startsWith('dialogueExamples') || leaf.collection === 'dialogueExamples') return 'dialogueExamples';
    return id || leaf.collection || 'unknown';
}

export function contentText(content) {
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) return content.map(part => (typeof part?.text === 'string' ? part.text : '')).join('');
    return '';
}

// Flattens promptManager.messages exactly the way ChatCompletion.getChat()
// does (a message is sent only if it has content or tool calls).
export function flattenMessages(root) {
    const leaves = [];
    const walk = (node, collection) => {
        if (!node) return;
        if (Array.isArray(node.collection)) {
            for (const child of node.collection) walk(child, node.identifier ?? collection);
            return;
        }
        if (!node.content && !node.tool_calls) return;
        leaves.push({
            identifier: node.identifier ?? null,
            collection: collection ?? null,
            role: node.role,
            name: node.name ?? null,
            content: contentText(node.content),
            tokens: Number(node.tokens) || 0,
            toolCall: Boolean(node.tool_calls),
        });
    };
    walk(root, null);
    return leaves;
}

// Groups consecutive leaves with the same section key. Returns
// [{ key, start, leaves }] in prompt order (start = index of the first
// leaf in the flat array).
export function groupSections(leaves) {
    const sections = [];
    leaves.forEach((leaf, index) => {
        const key = sectionKey(leaf);
        const last = sections[sections.length - 1];
        if (last && last.key === key) last.leaves.push(leaf);
        else sections.push({ key, start: index, leaves: [leaf] });
    });
    return sections;
}

// Orders `items` (each with a .key) by a saved layout: keys in the layout
// take the layout's order; a key the layout has never seen (a new custom
// prompt, an extension that just started injecting) stays right after
// whatever preceded it in SillyTavern's own order. Returns
// [{ item, enabled, text }] - text is the saved replacement, or null.
export function arrange(items, layout) {
    const entries = Array.isArray(layout?.sections) ? layout.sections : [];
    const rankOf = new Map(entries.map((s, i) => [s.key, i]));
    let lastRank = -1;
    const ranked = items.map((item, index) => {
        const known = rankOf.get(item.key);
        const rank = known !== undefined ? known : lastRank + 0.5;
        if (known !== undefined) lastRank = known;
        else lastRank = rank;
        return { item, index, rank };
    });
    ranked.sort((a, b) => a.rank - b.rank || a.index - b.index);
    return ranked.map(({ item }) => {
        const saved = entries[rankOf.get(item.key)];
        return {
            item,
            enabled: saved ? saved.enabled !== false : true,
            text: saved && typeof saved.text === 'string' ? saved.text : null,
        };
    });
}

// Inserts injection blocks into an ordered list. Each injection goes
// directly after its anchor (the key of the block that was above it when
// the user placed it; '^' = top). An injection anchored to another
// injection is placed once that one is. Anything without a usable anchor
// (never placed, or its anchor isn't in this prompt) goes just before Chat
// History, or at the end. `keyOf(entry)` reads an entry's key; injections
// carry `.anchor`. Returns a new list.
export function placeInjections(list, injections, keyOf) {
    const result = [...list];
    let pending = [...injections];
    let topCount = 0;
    let progress = true;
    while (pending.length && progress) {
        progress = false;
        for (const injection of [...pending]) {
            const anchor = injection.anchor;
            let index = -1;
            if (anchor === '^') index = topCount++;
            else if (anchor) {
                const at = result.findIndex(entry => keyOf(entry) === anchor);
                if (at >= 0) index = at + 1;
            }
            if (index < 0) continue;
            result.splice(index, 0, injection);
            pending = pending.filter(p => p !== injection);
            progress = true;
        }
    }
    for (const injection of pending) {
        const chatIndex = result.findIndex(entry => keyOf(entry) === 'chatHistory');
        if (chatIndex >= 0) result.splice(chatIndex, 0, injection);
        else result.push(injection);
    }
    return result;
}

// Rewrites the outgoing chat array IN PLACE: SillyTavern's own sections
// rearranged by `layout` (only when `reorder` is on), then Curator's
// enabled injection blocks inserted at their places. `chat` is the array
// SillyTavern is about to send; `leaves` its flattened description (same
// length, same order). Returns false (and leaves chat untouched) if they
// don't line up.
//   injections: [{ key, anchor, role, content }]
//   historyLimit: keep only the last N chat messages of Chat History
//     (null = all); chatFlags[i] says whether leaf i is a chat message
//     (src/prompt/history-limit.js), so injections inside it are kept.
export function buildOutgoing(chat, leaves, { layout = null, reorder = false, injections = [], historyLimit = null, chatFlags = null } = {}) {
    if (!Array.isArray(chat) || chat.length !== leaves.length) return false;
    const sections = groupSections(leaves).map(section => {
        let messages = chat.slice(section.start, section.start + section.leaves.length);
        if (section.key === 'chatHistory' && historyLimit !== null && chatFlags) {
            const keep = historyKeepMask(chatFlags.slice(section.start, section.start + messages.length), historyLimit);
            messages = messages.filter((_, i) => keep[i]);
        }
        return { key: section.key, messages };
    });
    const arranged = reorder && layout
        ? arrange(sections, layout)
        : sections.map(item => ({ item, enabled: true, text: null }));
    const injected = injections.map(inj => ({
        item: { key: inj.key, messages: [{ role: inj.role, content: inj.content }] },
        enabled: true,
        text: null,
        anchor: inj.anchor,
    }));
    const placed = placeInjections(arranged, injected, entry => entry.item.key);

    const result = [];
    for (const { item, enabled, text } of placed) {
        if (!enabled) continue;
        if (text !== null && item.key !== 'chatHistory' && item.key !== 'dialogueExamples') {
            // A replaced section is sent as one message, in its first message's role.
            result.push({ ...item.messages[0], content: text });
        } else {
            result.push(...item.messages);
        }
    }
    chat.splice(0, chat.length, ...result);
    return true;
}
