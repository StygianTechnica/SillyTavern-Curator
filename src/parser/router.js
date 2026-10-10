// src/parser/router.js

import { CuratorAnalyzer } from './analyzer.js';
import { CuratorCompiler } from './compiler.js';
import {
    loadSnapshot,
    saveSnapshot,
    listSnapshots,
    deleteSnapshot
} from '../storage/storage.js';
import { PromptSnapshot } from '../models/PromptSnapshot.js';

/**
 * Curator Router
 * --------------
 * Coordinates analyzer, compiler, and storage.
 * This file intentionally contains *scaffolding only*.
 * Logic is added later once full pipeline is ready.
 */

export class CuratorRouter {
    constructor() {
        this.analyzer = new CuratorAnalyzer();
        this.compiler = new CuratorCompiler();
    }

    /**
     * Analyze raw prompt text into a PromptSnapshot.
     * @param {string} rawText
     * @returns {PromptSnapshot}
     */
    analyzePrompt(rawText) {
        return this.analyzer.analyze(rawText);
    }

    /**
     * Compile a PromptSnapshot into final text.
     * @param {PromptSnapshot} snapshot
     * @returns {string}
     */
    compileSnapshot(snapshot) {
        return this.compiler.compile(snapshot);
    }

    /**
     * Save a snapshot to storage.
     * @param {PromptSnapshot} snapshot
     * @returns {Promise<boolean>}
     */
    async saveSnapshot(snapshot) {
        if (!(snapshot instanceof PromptSnapshot)) {
            console.error('[CuratorRouter] saveSnapshot() expected PromptSnapshot');
            return false;
        }

        const id = snapshot.id || `snapshot-${Date.now()}`;
        snapshot.id = id;

        return await saveSnapshot(id, snapshot.toJSON());
    }

    /**
     * Load a snapshot from storage.
     * @param {string} id
     * @returns {Promise<PromptSnapshot|null>}
     */
    async loadSnapshot(id) {
        const json = await loadSnapshot(id);
        if (!json) return null;
        return PromptSnapshot.fromJSON(json);
    }

    /**
     * List all saved snapshots.
     * @returns {Promise<Array>}
     */
    async listSnapshots() {
        return await listSnapshots();
    }

    /**
     * Delete a snapshot.
     * @param {string} id
     * @returns {Promise<boolean>}
     */
    async deleteSnapshot(id) {
        return await deleteSnapshot(id);
    }

    /**
     * Full pipeline:
     * Analyze → Compile → Save
     * @param {string} rawText
     * @returns {Promise<PromptSnapshot>}
     */
    async analyzeCompileSave(rawText) {
        const snapshot = this.analyzePrompt(rawText);
        this.compileSnapshot(snapshot);
        await this.saveSnapshot(snapshot);
        return snapshot;
    }
}
