// Ready-made injection blocks offered in the Prompt Analyzer's "Add from
// presets" menu. Kept SETTING-AGNOSTIC on purpose: they say how to write,
// never what the world is - that belongs in the character, persona,
// scenario, world info or lorebooks. Macros ({{char}}, {{user}}) are
// resolved at send time.

export const INJECTION_PRESETS = [
    {
        id: 'no-user-actions',
        name: 'Never act for the user',
        role: 'system',
        color: '#e05555',
        text: 'Never write actions, dialogue, thoughts or decisions for {{user}}. Stop and hand the turn back whenever {{user}} would need to act.',
    },
    {
        id: 'stay-in-character',
        name: 'Stay in character',
        role: 'system',
        color: '#e8973a',
        text: 'Stay in character. Do not break the fourth wall, summarise the story, or address the reader unless {{user}} explicitly asks out of character.',
    },
    {
        id: 'response-length',
        name: 'Response length',
        role: 'system',
        color: '#4a90d9',
        text: 'Keep each response to 2-4 paragraphs. End at a natural point where {{user}} can respond.',
    },
    {
        id: 'show-dont-tell',
        name: "Show, don't tell",
        role: 'system',
        color: '#a070e0',
        text: 'Convey emotion and intent through action, body language, dialogue and sensory detail rather than stating them outright.',
    },
    {
        id: 'avoid-repetition',
        name: 'Avoid repetition',
        role: 'system',
        color: '#d4b03c',
        text: 'Do not reuse phrases, sentence openings or descriptions from your recent responses. Vary sentence structure and vocabulary.',
    },
    {
        id: 'scene-anchoring',
        name: 'Scene anchoring',
        role: 'system',
        color: '#4caf50',
        text: 'Keep track of where the scene takes place, who is present and what time it is. Keep details consistent with what has already been established.',
    },
];
