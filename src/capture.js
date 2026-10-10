// Captures the most recent prompt SillyTavern assembled, and - when the
// user has turned on "Curator controls prompt order" - rewrites it before
// it is sent.
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
import { flattenMessages, applyLayoutToChat, contentText } from './prompt/sections.js';

let lastPrompt = null;
let openaiModule = null;
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
    };

    if (settings.applyLayout && settings.layout) {
        lastPrompt.applied = applyLayoutToChat(data.chat, leaves, settings.layout);
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
