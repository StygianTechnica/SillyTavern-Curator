// Chat history limit - keep only the last N chat messages in the prompt.
//
// The limit counts real chat messages only. In-chat injections that sit
// inside the history (Author's Note, lorebook @depth entries, Character's
// Note, extension prompts) are always kept, so a small limit never cuts
// them out. One rule, used by both the analyzer (what you see) and
// src/capture.js (what is sent).
//
// Setting: extension_settings.curator.historyLimit - a whole number, or
// null for no limit (SillyTavern's own context budget still applies).

import { normalize } from './sources.js';

export function normalizeLimit(value) {
    if (value === null || value === undefined || value === '') return null;
    const n = Math.floor(Number(value));
    return Number.isFinite(n) && n >= 0 ? n : null;
}

// For each Chat History entry ({ text, role }), whether it is a chat
// message (counted by the limit) rather than an in-chat injection (always
// kept). User and assistant entries are chat messages. System entries are
// where injections live (Author's Note, lorebook @depth entries, extension
// prompts) - one counts only if its text is clearly one of the chat's own
// messages (e.g. a narrator message). Matching by role first matters:
// SillyTavern often changes message text on its way into the prompt
// (regex scripts, macros, formatting), so text alone can't be relied on.
export function chatMessageFlags(entries, chat) {
    const messages = (chat ?? [])
        .map(m => normalize(m?.mes))
        .filter(m => m.length > 0);
    return entries.map(({ text, role }) => {
        if (role === 'user' || role === 'assistant') return true;
        const norm = normalize(text);
        if (!norm) return false;
        return messages.some(m => m.length >= norm.length * 0.5 && norm.includes(m));
    });
}

// Which entries of a chat history to keep: every non-chat entry, plus the
// last `limit` chat messages. `isChat` is in prompt order (oldest first).
export function historyKeepMask(isChat, limit) {
    const keep = new Array(isChat.length).fill(true);
    if (limit === null) return keep;
    let kept = 0;
    for (let i = isChat.length - 1; i >= 0; i--) {
        if (!isChat[i]) continue;
        if (kept < limit) kept++;
        else keep[i] = false;
    }
    return keep;
}
