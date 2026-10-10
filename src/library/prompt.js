// Curator Prompt Model
// Defines the core data structures used by Curator's prompt library.

/**
 * Optional metadata describing a prompt.
 */
export class PromptMetadata {
    constructor({
        author = null,
        source = null,
        usageCount = 0,
        lastUsed = null,
        description = null,
        flags = {},
    }) {
        this.author = author;
        this.source = source;
        this.usageCount = usageCount;
        this.lastUsed = lastUsed;
        this.description = description;
        this.flags = flags;
    }
}

/**
 * A single prompt stored in Curator.
 */
export class Prompt {
    constructor({
        id,
        name,
        text,
        category = null,
        tags = [],
        metadata = {},
        createdAt = Date.now(),
        updatedAt = Date.now(),
    }) {
        this.id = id;           // unique string (uuid or nanoid)
        this.name = name;       // human-readable name
        this.text = text;       // the actual prompt text
        this.category = category;
        this.tags = tags;
        this.metadata = metadata instanceof PromptMetadata
            ? metadata
            : new PromptMetadata(metadata);

        this.createdAt = createdAt;
        this.updatedAt = updatedAt;
    }
}

/**
 * Optional category constants.
 */
export const PromptCategories = {
    GENERAL: 'general',
    CHARACTER: 'character',
    SCENE: 'scene',
    SYSTEM: 'system',
    STYLE: 'style',
    META: 'meta',
};
