// models/PromptSnapshot.js

export class PromptSnapshot {
    constructor() {
        this.id = null;                     // snapshot ID (timestamp or UUID)
        this.createdAt = Date.now();        // creation timestamp

        this.blocks = [];                   // array of PromptBlock objects
        this.finalText = "";                // compiled prompt text (after user edits)

        this.meta = {                       // optional metadata
            sourcePromptLength: 0,
            compiledLength: 0,
            templateUsed: null,
            characterId: null,
            personaId: null,
            kind: null,                     // 'cc' (chat completion) | 'tc' (text completion)
            contextSize: 0,                 // max context of the connection, in tokens
            api: null,
            model: null,
            preset: null,
            capturedAt: null
        };
    }

    // Add a block to the snapshot
    addBlock(block) {
        this.blocks.push(block);
    }

    // Get blocks by type
    getBlocksByType(type) {
        return this.blocks.filter(b => b.type === type);
    }

    // Serialize snapshot to JSON
    toJSON() {
        return {
            id: this.id,
            createdAt: this.createdAt,
            blocks: this.blocks.map(b => b.toJSON()),
            finalText: this.finalText,
            meta: this.meta
        };
    }

    // Load snapshot from JSON
    static fromJSON(json) {
        const snap = new PromptSnapshot();
        snap.id = json.id || null;
        snap.createdAt = json.createdAt || Date.now();
        snap.finalText = json.finalText || "";
        snap.meta = { ...new PromptSnapshot().meta, ...(json.meta || {}) };

        snap.blocks = (json.blocks || []).map(b => PromptBlock.fromJSON(b));

        return snap;
    }
}

// -------------------------------------------
// PromptBlock — represents a single prompt section
// -------------------------------------------

export class PromptBlock {
    constructor({
        id = null,
        type = "unknown",
        label = "",
        text = "",
        enabled = true,
        order = 0,
        provenance = null,
        category = 'other',
        tokens = 0,
        role = null,
        children = [],
        notes = [],
        edited = false,
        color = null
    } = {}) {
        this.id = id;               // unique block ID
        this.type = type;           // block type (persona, chat, WI, etc.)
        this.label = label;         // human-readable label
        this.text = text;           // raw text of the block
        this.enabled = enabled;     // user toggle
        this.order = order;         // ordering index
        this.provenance = provenance; // where this block came from (persona, WI entry, extension, etc.)
        this.category = category;   // colour group, see CATEGORIES in src/prompt/sources.js
        this.tokens = tokens;       // token count of text (or of children, for a group)
        this.role = role;           // chat completion role, if any
        this.children = children;   // PromptBlocks of a group (chat history, example dialogue)
        this.notes = notes;         // [{ label, category, constant }] sources found inside the text
        this.edited = edited;       // text changed by the user
        this.color = color;         // custom colour (Curator injection blocks)
    }

    get isGroup() {
        return this.children.length > 0;
    }

    toJSON() {
        return {
            id: this.id,
            type: this.type,
            label: this.label,
            text: this.text,
            enabled: this.enabled,
            order: this.order,
            provenance: this.provenance,
            category: this.category,
            tokens: this.tokens,
            role: this.role,
            children: this.children.map(c => c.toJSON()),
            notes: this.notes,
            edited: this.edited,
            color: this.color
        };
    }

    static fromJSON(json) {
        return new PromptBlock({
            ...json,
            children: (json.children || []).map(c => PromptBlock.fromJSON(c)),
            notes: json.notes || []
        });
    }
}
