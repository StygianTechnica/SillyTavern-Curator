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

// Rewrites the outgoing chat array IN PLACE according to the layout.
// `chat` is the array SillyTavern is about to send; `leaves` its flattened
// description (same length, same order). Returns false (and leaves chat
// untouched) if they don't line up.
export function applyLayoutToChat(chat, leaves, layout) {
    if (!Array.isArray(chat) || chat.length !== leaves.length) return false;
    const sections = groupSections(leaves).map(section => ({
        key: section.key,
        messages: chat.slice(section.start, section.start + section.leaves.length),
    }));
    const result = [];
    for (const { item, enabled, text } of arrange(sections, layout)) {
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
