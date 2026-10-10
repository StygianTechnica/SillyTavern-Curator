// Curator Prompt Library
// Manages collections of Prompt objects and provides CRUD operations.

import { Prompt } from './prompt.js';

export class PromptLibrary {
    constructor({ prompts = [] } = {}) {
        // Store prompts in a Map for fast lookup by ID
        this.prompts = new Map();

        // Initialize with any provided prompts
        for (const p of prompts) {
            this.addPrompt(p);
        }
    }

    // -------------------------------------------------------------
    // CRUD OPERATIONS
    // -------------------------------------------------------------

    /**
     * Add a new prompt to the library.
     * Accepts either a Prompt instance or a plain object.
     */
    addPrompt(promptData) {
        const prompt = promptData instanceof Prompt
            ? promptData
            : new Prompt(promptData);

        if (!prompt.id) {
            throw new Error('Prompt must have an id');
        }

        this.prompts.set(prompt.id, prompt);
        return prompt;
    }

    /**
     * Remove a prompt by ID.
     */
    removePrompt(id) {
        return this.prompts.delete(id);
    }

    /**
     * Update an existing prompt.
     * Accepts partial updates.
     */
    updatePrompt(id, updates) {
        const existing = this.prompts.get(id);
        if (!existing) return null;

        const updated = new Prompt({
            ...existing,
            ...updates,
            updatedAt: Date.now(),
        });

        this.prompts.set(id, updated);
        return updated;
    }

    /**
     * Retrieve a prompt by ID.
     */
    getPromptById(id) {
        return this.prompts.get(id) || null;
    }

    // -------------------------------------------------------------
    // LISTING & FILTERING
    // -------------------------------------------------------------

    /**
     * Return all prompts as an array.
     */
    listPrompts() {
        return Array.from(this.prompts.values());
    }

    /**
     * Find prompts by category.
     */
    findByCategory(category) {
        return this.listPrompts().filter(p => p.category === category);
    }

    /**
     * Find prompts by tag.
     */
    findByTag(tag) {
        return this.listPrompts().filter(p => p.tags.includes(tag));
    }

    /**
     * Search prompts by name or text.
     */
    search(query) {
        const q = query.toLowerCase();
        return this.listPrompts().filter(p =>
            p.name.toLowerCase().includes(q) ||
            p.text.toLowerCase().includes(q)
        );
    }

    // -------------------------------------------------------------
    // SERIALIZATION
    // -------------------------------------------------------------

    /**
     * Convert the library to a plain JSON-friendly object.
     */
    toJSON() {
        return {
            prompts: this.listPrompts().map(p => ({ ...p })),
        };
    }

    /**
     * Create a PromptLibrary from a plain object.
     */
    static fromJSON(data) {
        return new PromptLibrary({
            prompts: data.prompts || [],
        });
    }
}
