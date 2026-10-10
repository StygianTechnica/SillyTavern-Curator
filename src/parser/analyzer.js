// src/parser/analyzer.js

import { PromptSnapshot, PromptBlock } from '../models/PromptSnapshot.js';

/**
 * Curator Analyzer
 * ----------------
 * Takes raw prompt text and produces a PromptSnapshot.
 * This file intentionally contains *scaffolding only*.
 * Detailed block detection logic is added later.
 */

export class CuratorAnalyzer {

    /**
     * Analyze raw prompt text and produce a PromptSnapshot.
     * @param {string} rawText
     * @returns {PromptSnapshot}
     */
    analyze(rawText) {
        if (typeof rawText !== 'string') {
            console.error('[CuratorAnalyzer] analyze() expected string rawText');
            return new PromptSnapshot();
        }

        const snapshot = new PromptSnapshot();
        snapshot.meta.sourcePromptLength = rawText.length;

        // 1. Split raw text into rough blocks (placeholder)
        const rawBlocks = this.splitIntoBlocks(rawText);

        // 2. Convert raw blocks into PromptBlock objects
        const blocks = rawBlocks.map((b, index) =>
            this.createBlock(b, index)
        );

        // 3. Add blocks to snapshot
        blocks.forEach(block => snapshot.addBlock(block));

        return snapshot;
    }

    /**
     * Split raw text into rough blocks.
     * Placeholder — real logic added later.
     */
    splitIntoBlocks(rawText) {
        // TODO: replace with real block detection logic
        return rawText
            .split(/\n{2,}/g) // split on double newlines
            .map(t => t.trim())
            .filter(t => t.length > 0);
    }

    /**
     * Create a PromptBlock from raw text.
     * Placeholder — real classification logic added later.
     */
    createBlock(text, order) {
        return new PromptBlock({
            id: `block-${order}`,
            type: 'unknown',        // TODO: detect block type
            label: `Block ${order}`,// TODO: generate meaningful labels
            text,
            enabled: true,
            order,
            provenance: null        // TODO: detect provenance
        });
    }
}
