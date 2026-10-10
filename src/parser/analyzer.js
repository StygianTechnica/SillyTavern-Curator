// src/parser/analyzer.js

import { PromptSnapshot, PromptBlock } from '../models/PromptSnapshot.js';
import { groupSections } from '../prompt/sections.js';
import { CATEGORIES, attribute, buildSources, getConnectedLoreEntries, sourcesWithin } from '../prompt/sources.js';
import { getPromptManagerSync } from '../capture.js';

/**
 * Curator Analyzer
 * ----------------
 * Turns a captured prompt (src/capture.js) into a PromptSnapshot of
 * labelled, colour-categorised, token-counted blocks.
 *
 * - Chat Completion: one block per prompt-manager section (see
 *   src/prompt/sections.js), chat history and example dialogue as groups
 *   whose children are attributed message by message.
 * - Text Completion: the prompt is one string, so known sources (character
 *   card, persona, lorebook entries, chat messages...) are located inside
 *   it and the gaps become "Template / other" blocks.
 * - A plain string is treated as a Text Completion prompt.
 */

// Labels and categories for the identifiers SillyTavern itself uses.
const KNOWN_SECTIONS = {
    main: ['Main Prompt', 'preset'],
    nsfw: ['Auxiliary Prompt', 'preset'],
    jailbreak: ['Post-History Instructions', 'preset'],
    enhanceDefinitions: ['Enhance Definitions', 'preset'],
    newMainChat: ['New Chat marker', 'preset'],
    newChat: ['New Chat marker', 'preset'],
    newExampleChat: ['New Example Chat marker', 'preset'],
    bias: ['Bias', 'preset'],
    worldInfoBefore: ['World Info (before)', 'worldInfo'],
    worldInfoAfter: ['World Info (after)', 'worldInfo'],
    charDescription: ['Character Description', 'character'],
    charPersonality: ['Character Personality', 'character'],
    scenario: ['Scenario', 'character'],
    dialogueExamples: ['Example Dialogue', 'character'],
    personaDescription: ['Persona Description', 'persona'],
    chatHistory: ['Chat History', 'chat'],
    authorsNote: ["Author's Note", 'authorsNote'],
    summary: ['Summary', 'extension'],
    vectorsMemory: ['Vector Memory', 'extension'],
    vectorsDataBank: ['Data Bank', 'extension'],
    smartContext: ['Smart Context', 'extension'],
    impersonate: ['Impersonation Prompt', 'other'],
    quietPrompt: ['Quiet Prompt', 'other'],
    groupNudge: ['Group Nudge', 'other'],
    continueNudge: ['Continue Nudge', 'other'],
    emptyUserMessageReplacement: ['Empty Message Replacement', 'other'],
};

function describeSection(key) {
    if (KNOWN_SECTIONS[key]) return { label: KNOWN_SECTIONS[key][0], category: KNOWN_SECTIONS[key][1] };
    const prompt = getPromptManagerSync()?.getPromptById?.(key);
    if (prompt) return { label: prompt.name || key, category: 'preset' };
    return { label: key, category: 'extension' };
}

function notesFor(text, sources, ownCategory) {
    return sourcesWithin(text, sources)
        .filter(s => s.category === 'worldInfo' || s.category !== ownCategory)
        .filter(s => s.category !== 'chat')
        .map(s => ({ label: s.label, category: s.category, constant: Boolean(s.entry?.constant) }));
}

async function countTokens(text) {
    try {
        return await SillyTavern.getContext().getTokenCountAsync(text);
    } catch {
        return Math.ceil(text.length / 4);
    }
}

function connectionMeta(kind) {
    const context = SillyTavern.getContext();
    const meta = { kind, api: context.mainApi ?? null, model: null, preset: null, contextSize: 0 };
    try {
        meta.preset = context.getPresetManager?.()?.getSelectedPresetName?.() ?? null;
    } catch { /* not available */ }
    if (kind === 'cc') {
        meta.contextSize = Number(context.chatCompletionSettings?.openai_max_context) || 0;
        try {
            meta.model = context.getChatCompletionModel?.() ?? null;
        } catch { /* not available */ }
        meta.api = context.chatCompletionSettings?.chat_completion_source ?? meta.api;
    } else {
        meta.contextSize = Number(context.maxContext) || 0;
        meta.model = context.textCompletionSettings?.type ?? null;
        const instruct = context.powerUserSettings?.instruct;
        const ctxTemplate = context.powerUserSettings?.context;
        meta.templates = [ctxTemplate?.preset && `Context: ${ctxTemplate.preset}`, instruct?.enabled && instruct?.preset && `Instruct: ${instruct.preset}`].filter(Boolean).join(' · ');
    }
    return meta;
}

export class CuratorAnalyzer {

    /**
     * @param {object|string} capture - a capture from src/capture.js, or raw prompt text
     * @returns {Promise<PromptSnapshot>}
     */
    async analyze(capture) {
        if (typeof capture === 'string') capture = { kind: 'tc', text: capture };
        const snapshot = new PromptSnapshot();
        if (!capture) return snapshot;

        const context = SillyTavern.getContext();
        const lore = await getConnectedLoreEntries();
        const sources = buildSources(context, lore);

        Object.assign(snapshot.meta, connectionMeta(capture.kind), { capturedAt: capture.capturedAt ?? Date.now() });
        snapshot.lore = lore;

        const blocks = capture.kind === 'cc'
            ? this.analyzeChatCompletion(capture.leaves, sources)
            : await this.analyzeTextCompletion(capture.text ?? '', sources);

        blocks.forEach((block, order) => {
            block.order = order;
            snapshot.addBlock(block);
        });
        snapshot.meta.sourcePromptLength = blocks.reduce((sum, b) => sum + b.text.length, 0);
        return snapshot;
    }

    analyzeChatCompletion(leaves, sources) {
        return groupSections(leaves).map(section => {
            const { label, category } = describeSection(section.key);
            if (section.key === 'chatHistory' || section.key === 'dialogueExamples') {
                const children = section.leaves.map((leaf, i) => this.chatChild(leaf, i, section.key, sources));
                return new PromptBlock({
                    id: section.key,
                    type: section.key,
                    label: `${label} (${children.length} messages)`,
                    category,
                    tokens: children.reduce((sum, c) => sum + c.tokens, 0),
                    children,
                    text: '',
                });
            }
            const text = section.leaves.map(l => l.content).join('\n\n');
            return new PromptBlock({
                id: section.key,
                type: section.key,
                label: section.leaves.length > 1 ? `${label} (${section.leaves.length} messages)` : label,
                category,
                role: section.leaves[0].role,
                tokens: section.leaves.reduce((sum, l) => sum + l.tokens, 0),
                text,
                notes: notesFor(text, sources, category),
            });
        });
    }

    // One message inside chat history / example dialogue. A chat history
    // message that isn't any chat message is an in-chat injection (Author's
    // Note, lorebook @depth, Character's Note, extension, prompt manager
    // in-chat prompt) - attributed when its source can be recognised.
    chatChild(leaf, index, groupKey, sources) {
        let category = groupKey === 'chatHistory' ? 'chat' : 'character';
        let label = `${leaf.role}${leaf.name ? ` · ${leaf.name}` : ''}`;
        const source = attribute(leaf.content, sources);
        if (groupKey === 'chatHistory') {
            if (source?.category === 'chat') {
                label = `${source.label} (${leaf.role})`;
            } else if (source) {
                category = source.category;
                label = `Injected: ${source.label}`;
            } else {
                const prompt = getPromptManagerSync()?.getPromptById?.(leaf.identifier);
                category = 'injection';
                label = prompt?.name ? `Injected: ${prompt.name}` : `In-chat injection (${leaf.role})`;
            }
        }
        return new PromptBlock({
            id: `${groupKey}-${index}`,
            type: groupKey,
            label,
            category,
            role: leaf.role,
            tokens: leaf.tokens,
            text: leaf.content,
            order: index,
            notes: notesFor(leaf.content, sources, category),
        });
    }

    async analyzeTextCompletion(text, sources) {
        // Locate each source verbatim; longest first so a lorebook entry
        // inside the description doesn't split it.
        const found = [];
        const taken = [];
        const overlaps = (s, e) => taken.some(([a, b]) => s < b && e > a);
        for (const source of [...sources].sort((a, b) => b.text.length - a.text.length)) {
            let from = 0;
            while (from < text.length) {
                const start = text.indexOf(source.text, from);
                if (start < 0) break;
                const end = start + source.text.length;
                from = end;
                if (overlaps(start, end)) continue;
                taken.push([start, end]);
                found.push({ start, end, source });
                if (source.category !== 'chat') break;
            }
        }
        found.sort((a, b) => a.start - b.start);

        // Segments with the gaps between them. A short gap (a "Name: "
        // prefix, separators) is folded into the following segment.
        const segments = [];
        let cursor = 0;
        for (const hit of found) {
            let start = hit.start;
            if (start > cursor) {
                const gap = text.slice(cursor, start);
                if (gap.trim().length > 64 || !segments.length && gap.trim().length > 0 && hit.source.category !== 'chat') {
                    segments.push({ text: gap, category: 'other', label: 'Template / other' });
                } else {
                    start = cursor;
                }
            }
            segments.push({ text: text.slice(start, hit.end), category: hit.source.category, label: hit.source.label, source: hit.source });
            cursor = hit.end;
        }
        if (cursor < text.length) segments.push({ text: text.slice(cursor), category: 'other', label: 'Template / other' });

        // Consecutive chat messages become one Chat History group.
        const blocks = [];
        let group = null;
        let index = 0;
        for (const seg of segments) {
            const tokens = await countTokens(seg.text);
            const block = new PromptBlock({
                id: `tc-${index++}`,
                type: seg.category,
                label: seg.label,
                category: seg.category,
                tokens,
                text: seg.text,
                notes: seg.category === 'worldInfo' ? [] : notesFor(seg.text, sources, seg.category),
            });
            if (seg.category === 'chat') {
                if (!group) {
                    group = new PromptBlock({ id: `chatHistory-${index}`, type: 'chatHistory', label: CATEGORIES.chat, category: 'chat', children: [] });
                    blocks.push(group);
                }
                block.order = group.children.length;
                group.children.push(block);
                group.tokens += tokens;
            } else {
                group = null;
                blocks.push(block);
            }
        }
        for (const block of blocks) {
            if (block.isGroup) block.label = `${CATEGORIES.chat} (${block.children.length} messages)`;
        }
        return blocks;
    }
}
