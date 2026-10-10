// src/parser/compiler.js

import { PromptSnapshot } from '../models/PromptSnapshot.js';
import { PromptBlock } from '../models/PromptSnapshot.js';

/**
 * Curator Compiler
 * ----------------
 * Takes a PromptSnapshot and produces final compiled text.
 * This file intentionally contains *scaffolding only*.
 * Logic is added later once Scenario Builder + SE integration are ready.
 */

export class CuratorCompiler {

    /**
     * Compile a PromptSnapshot into final prompt text.
     * @param {PromptSnapshot} snapshot
     * @returns {string} final compiled text
     */
    compile(snapshot) {
        if (!(snapshot instanceof PromptSnapshot)) {
            console.error('[CuratorCompiler] Invalid snapshot passed to compile()');
            return '';
        }

        // 1. Filter disabled blocks
        const enabledBlocks = this.filterEnabled(snapshot.blocks);

        // 2. Sort blocks by order
        const orderedBlocks = this.sortBlocks(enabledBlocks);

        // 3. Apply template rules (placeholder for future logic)
        const templatedBlocks = this.applyTemplateRules(orderedBlocks, snapshot.meta.templateUsed);

        // 4. Insert snippets (placeholder)
        const withSnippets = this.insertSnippets(templatedBlocks);

        // 5. Insert reusable prompts (placeholder)
        const withPrompts = this.insertPrompts(withSnippets);

        // 6. Merge blocks into final text
        const finalText = this.mergeBlocks(withPrompts);

        // 7. Store final text in snapshot
        snapshot.finalText = finalText;
        snapshot.meta.compiledLength = finalText.length;

        return finalText;
    }

    /**
     * Filter out disabled blocks.
     */
    filterEnabled(blocks) {
        return blocks.filter(b => b.enabled);
    }

    /**
     * Sort blocks by their order field.
     */
    sortBlocks(blocks) {
        return [...blocks].sort((a, b) => a.order - b.order);
    }

    /**
     * Apply template rules.
     * Placeholder — logic added later.
     */
    applyTemplateRules(blocks, template) {
        // TODO: integrate template structure
        return blocks;
    }

    /**
     * Insert snippets into the prompt.
     * Placeholder — logic added later.
     */
    insertSnippets(blocks) {
        // TODO: integrate snippet insertion
        return blocks;
    }

    /**
     * Insert reusable prompts.
     * Placeholder — logic added later.
     */
    insertPrompts(blocks) {
        // TODO: integrate prompt insertion
        return blocks;
    }

    /**
     * Merge blocks into final text.
     */
    mergeBlocks(blocks) {
        return blocks
            .map(b => b.text.trim())
            .filter(t => t.length > 0)
            .join('\n\n');
    }
}
