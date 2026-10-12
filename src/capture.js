// Captures the most recent prompt SillyTavern assembled, and - only when the
// user has turned on "Curator controls the prompt" - rewrites it before it
// is sent: SillyTavern's own sections rearranged (with a saved
// arrangement), Curator's injection blocks and the State Engine variables
// the user ticked inserted, the chat history limit applied. With that
// switch off Curator changes nothing; disabled, it does nothing at all.
//
// Only chat replies (settings.onlyChatReplies, on by default): other
// extensions can build prompts through the same prompt manager - a summary,
// a background "quiet" generation - and those must not get the user's
// story injections or arrangement. SillyTavern tells each generation's type
// (GENERATION_STARTED); a 'quiet' one is captured but left as it is.
//
// Chat Completion: CHAT_COMPLETION_PROMPT_READY hands over the exact
// message array about to be sent ({ chat, dryRun }); SillyTavern sends
// that same array afterwards, so editing it in place changes the request.
// promptManager.messages (openai.js) still holds the identifier-tagged tree
// it was built from, which is what lets each message be attributed to a
// section (see src/prompt/sections.js).
//
// Text Completion: GENERATE_AFTER_COMBINE_PROMPTS hands over the combined
// prompt string; captured for analysis only.
//
// Dry runs (SillyTavern builds the prompt to count tokens on chat load and
// on prompt manager edits) are captured too, so a prompt is usually
// available without sending anything.

import { getSettings } from './settings.js';
import { flattenMessages, buildOutgoing, contentText } from './prompt/sections.js';
import { getInjections, injectionKey, resolvedText } from './injections/store.js';
import { buildVariableInjections } from './injections/variables.js';
import { normalizeLimit, chatMessageFlags } from './prompt/history-limit.js';
import { sectionKey } from './prompt/sections.js';

let lastPrompt = null;
let openaiModule = null;
// The type of the generation in progress ('normal', 'swipe', 'quiet'...),
// from GENERATION_STARTED; null before the first.
let generationType = null;

// Generation types that are the chat itself; anything else ('quiet') is
// another extension's background prompt.
export const CHAT_GENERATION_TYPES = Object.freeze(['normal', 'swipe', 'regenerate', 'continue', 'impersonate']);

// Whether Curator may change a prompt of generation `type` (null: unknown -
// treated as the chat, as a dry run of the analyzer is).
export function mayChangePrompt(settings, type) {
    if (!settings.enabled || !settings.applyLayout) return false;
    if (settings.onlyChatReplies === false || type === null || type === undefined) return true;
    return CHAT_GENERATION_TYPES.includes(type);
}
const listeners = new Set();

async function getPromptManager() {
    try {
        openaiModule ??= await import('../../../../openai.js');
        return openaiModule.promptManager ?? null;
    } catch (err) {
        console.warn('[Curator] could not reach SillyTavern\'s prompt manager', err);
        return null;
    }
}

function emit() {
    for (const fn of listeners) {
        try {
            fn(lastPrompt);
        } catch (err) {
            console.error('[Curator] prompt listener failed', err);
        }
    }
}

async function onChatCompletionPrompt(data) {
    const settings = getSettings();
    if (!settings.enabled || !Array.isArray(data?.chat)) return;

    // Only prompts built by the prompt manager are Curator's business: a
    // generateRaw() call (extensions such as trackers use it) fires the same
    // event with its own unrelated messages. The tree must describe the
    // outgoing array message for message, or this prompt is left alone.
    const promptManager = await getPromptManager();
    const leaves = promptManager?.messages ? flattenMessages(promptManager.messages) : null;
    const matches = leaves
        && leaves.length === data.chat.length
        && leaves.every((leaf, i) => leaf.content === contentText(data.chat[i]?.content));
    if (!matches) {
        console.debug('[Curator] prompt is not a prompt-manager build (raw generation or modified) - not captured.');
        return;
    }

    lastPrompt = {
        kind: 'cc',
        leaves,
        dryRun: Boolean(data.dryRun),
        chatId: SillyTavern.getContext().chatId,
        capturedAt: Date.now(),
        generationType,
    };

    // Nothing is changed unless Curator controls the prompt - and, by
    // default, only for the chat's own replies.
    if (!mayChangePrompt(settings, generationType)) {
        lastPrompt.untouched = settings.applyLayout ? 'background' : 'off';
        emit();
        return;
    }
    const injections = getInjections()
        .filter(b => b.enabled && b.text.trim())
        .map(b => ({ key: injectionKey(b.id), anchor: b.anchor, role: b.role, content: resolvedText(b) }));
    // State Engine variables other extensions offer (only with State Engine).
    injections.push(...await buildVariableInjections(lastPrompt.chatId));
    const reorder = Boolean(settings.applyLayout && settings.layout);
    const historyLimit = normalizeLimit(settings.historyLimit);
    if (reorder || injections.length || historyLimit !== null) {
        const flags = historyLimit === null ? null : (() => {
            const inHistory = leaves.map(l => sectionKey(l) === 'chatHistory');
            const isChat = chatMessageFlags(leaves.map((l, i) => (inHistory[i] ? { text: l.content, role: l.role } : { text: '', role: null })), SillyTavern.getContext().chat);
            return isChat.map((flag, i) => inHistory[i] && flag);
        })();
        buildOutgoing(data.chat, leaves, { layout: settings.layout, reorder, injections, historyLimit, chatFlags: flags });
        lastPrompt.applied = reorder;
        lastPrompt.injected = injections.length;
        lastPrompt.historyLimit = historyLimit;
    }
    emit();
}

function onTextCompletionPrompt(data) {
    if (!getSettings().enabled || typeof data?.prompt !== 'string') return;
    lastPrompt = {
        kind: 'tc',
        text: data.prompt,
        dryRun: Boolean(data.dryRun),
        chatId: SillyTavern.getContext().chatId,
        capturedAt: Date.now(),
    };
    emit();
}

export function initPromptCapture() {
    const { eventSource, eventTypes } = SillyTavern.getContext();
    void getPromptManager();
    if (eventTypes.GENERATION_STARTED) {
        eventSource.on(eventTypes.GENERATION_STARTED, (type) => {
            generationType = typeof type === 'string' ? type : null;
        });
    }
    if (eventTypes.CHAT_COMPLETION_PROMPT_READY) eventSource.on(eventTypes.CHAT_COMPLETION_PROMPT_READY, onChatCompletionPrompt);
    if (eventTypes.GENERATE_AFTER_COMBINE_PROMPTS) eventSource.on(eventTypes.GENERATE_AFTER_COMBINE_PROMPTS, onTextCompletionPrompt);
}

// Asks SillyTavern to build the prompt for the current chat without
// sending it (a dry run), which fires the events above. Resolves with the
// fresh capture, or the previous one if nothing was captured.
export async function refreshPrompt() {
    const before = lastPrompt;
    try {
        await SillyTavern.getContext().generate('normal', {}, true);
    } catch (err) {
        console.warn('[Curator] dry run failed', err);
    }
    return lastPrompt ?? before;
}

export function getLastPrompt() {
    return lastPrompt;
}

export function getPromptManagerSync() {
    return openaiModule?.promptManager ?? null;
}

export function onPromptCaptured(fn) {
    listeners.add(fn);
}
