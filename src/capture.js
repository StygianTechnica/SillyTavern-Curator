// Captures the most recent prompt SillyTavern assembled, so the analyzer
// has real text to work on. Chat Completion APIs fire
// CHAT_COMPLETION_PROMPT_READY with the message array; Text Completion
// APIs fire GENERATE_AFTER_COMBINE_PROMPTS with the combined string.
// Dry runs (token counting on chat load) are captured too, so a prompt
// is usually available without sending anything.

import { getSettings } from './settings.js';

let lastPrompt = null;
const listeners = new Set();

function formatChat(chat) {
    return chat
        .map(m => {
            const content = typeof m.content === 'string'
                ? m.content
                : Array.isArray(m.content)
                    ? m.content.map(part => part?.text ?? '').join('')
                    : '';
            return `[${m.role}${m.name ? `: ${m.name}` : ''}]\n${content}`;
        })
        .join('\n\n');
}

function record(text, source) {
    if (!getSettings().enabled || typeof text !== 'string') return;
    lastPrompt = { text, source, capturedAt: Date.now() };
    for (const fn of listeners) fn(lastPrompt);
}

export function initPromptCapture() {
    const { eventSource, eventTypes } = SillyTavern.getContext();
    if (eventTypes.CHAT_COMPLETION_PROMPT_READY) {
        eventSource.on(eventTypes.CHAT_COMPLETION_PROMPT_READY, (data) => {
            if (Array.isArray(data?.chat)) record(formatChat(data.chat), 'chat completion');
        });
    }
    if (eventTypes.GENERATE_AFTER_COMBINE_PROMPTS) {
        eventSource.on(eventTypes.GENERATE_AFTER_COMBINE_PROMPTS, (data) => {
            record(data?.prompt, 'text completion');
        });
    }
}

export function getLastPrompt() {
    return lastPrompt;
}

export function onPromptCaptured(fn) {
    listeners.add(fn);
}
