// Known prompt SOURCES - the pieces of text SillyTavern pulls into a
// prompt (character card fields, persona, chat messages, lorebook
// entries, Author's Note, extension injections) - and matching them
// against prompt text, so a section or segment can be attributed to
// where it came from.

// Section categories, in legend order. Colours live in style.css
// (.cr-cat-<id>).
export const CATEGORIES = {
    chat: 'Chat History',
    character: 'Character',
    persona: 'Persona',
    worldInfo: 'World Info',
    preset: 'Preset Prompts',
    authorsNote: "Author's Note",
    extension: 'Extensions',
    injection: 'In-chat Injection',
    curator: 'Curator Blocks',
    stateEngine: 'State Engine Variables',
    other: 'Other',
};

let worldInfoModule = null;

// Every entry of every lorebook connected right now (global, character,
// chat, persona), via SillyTavern's own getSortedEntries(). Each entry
// carries .world (the book name). Empty if world-info.js can't be reached.
export async function getConnectedLoreEntries() {
    try {
        worldInfoModule ??= await import('../../../../../world-info.js');
        const entries = await worldInfoModule.getSortedEntries();
        return Array.isArray(entries) ? entries : [];
    } catch (err) {
        console.warn('[Curator] could not read connected lorebooks', err);
        return [];
    }
}

export function normalize(text) {
    return String(text ?? '').replace(/\s+/g, ' ').trim();
}

function substitute(context, text) {
    try {
        return context.substituteParams(String(text ?? ''));
    } catch {
        return String(text ?? '');
    }
}

function characterSources(context, character, sources) {
    if (!character) return;
    const name = character.name || 'Character';
    const fields = [
        ['description', 'Description'],
        ['personality', 'Personality'],
        ['scenario', 'Scenario'],
        ['mes_example', 'Example Dialogue'],
    ];
    for (const [field, label] of fields) {
        sources.push({ category: 'character', label: `${name} - ${label}`, text: character[field] ?? character.data?.[field] });
    }
    sources.push({ category: 'character', label: `${name} - Main Prompt Override`, text: character.data?.system_prompt });
    sources.push({ category: 'character', label: `${name} - Post-History Override`, text: character.data?.post_history_instructions });
    sources.push({ category: 'character', label: `${name} - Character's Note`, text: character.data?.extensions?.depth_prompt?.prompt });
}

// Builds the list of known sources for the CURRENT chat. Lorebook
// entries are passed in (they are loaded asynchronously).
export function buildSources(context, loreEntries = []) {
    const sources = [];

    const characters = [];
    if (context.groupId) {
        const group = context.groups?.find(g => g.id == context.groupId);
        for (const avatar of group?.members ?? []) {
            const character = context.characters?.find(c => c.avatar === avatar);
            if (character) characters.push(character);
        }
    } else if (context.characterId !== undefined && context.characterId !== null) {
        characters.push(context.characters?.[context.characterId]);
    }
    for (const character of characters) characterSources(context, character, sources);

    sources.push({ category: 'persona', label: `Persona - ${context.name1 ?? 'User'}`, text: context.powerUserSettings?.persona_description });

    for (const [key, prompt] of Object.entries(context.extensionPrompts ?? {})) {
        if (!prompt?.value) continue;
        if (key === '2_floating_prompt') sources.push({ category: 'authorsNote', label: "Author's Note", text: prompt.value });
        else if (key === 'DEPTH_PROMPT') sources.push({ category: 'character', label: "Character's Note", text: prompt.value });
        else if (key === '1_memory') sources.push({ category: 'extension', label: 'Summary', text: prompt.value });
        else sources.push({ category: 'extension', label: `Extension - ${key}`, text: prompt.value });
    }

    for (const entry of loreEntries) {
        if (entry.disable) continue;
        sources.push({
            category: 'worldInfo',
            label: `${entry.world} - ${entry.comment || (entry.key ?? []).join(', ') || `#${entry.uid}`}`,
            text: entry.content,
            entry,
        });
    }

    (context.chat ?? []).forEach((message, index) => {
        if (message?.is_system && !message.mes) return;
        sources.push({ category: 'chat', label: `#${index} ${message?.name ?? ''}`.trim(), text: message?.mes, chatIndex: index });
    });

    // Resolve macros once and drop empty sources.
    return sources
        .map(source => {
            const text = substitute(context, source.text).trim();
            return { ...source, text, norm: normalize(text) };
        })
        .filter(source => source.norm.length >= 4);
}

// Sources whose text appears inside `text` (whitespace-insensitive).
export function sourcesWithin(text, sources) {
    const norm = normalize(text);
    if (!norm) return [];
    return sources.filter(source => norm.includes(source.norm));
}

// Best single attribution for a piece of text: the source covering most of
// it, or null.
export function attribute(text, sources) {
    const norm = normalize(text);
    let best = null;
    for (const source of sourcesWithin(text, sources)) {
        if (!best || source.norm.length > best.norm.length) best = source;
    }
    return best && best.norm.length >= norm.length * 0.3 ? best : null;
}
