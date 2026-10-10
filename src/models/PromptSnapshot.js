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
            personaId: null
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
        snap.meta = json.meta || {};

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
        provenance = null
    } = {}) {
        this.id = id;               // unique block ID
        this.type = type;           // block type (persona, chat, WI, etc.)
        this.label = label;         // human-readable label
        this.text = text;           // raw text of the block
        this.enabled = enabled;     // user toggle
        this.order = order;         // ordering index
        this.provenance = provenance; // where this block came from (persona, WI entry, extension, etc.)
    }

    toJSON() {
        return {
            id: this.id,
            type: this.type,
            label: this.label,
            text: this.text,
            enabled: this.enabled,
            order: this.order,
            provenance: this.provenance
        };
    }

    static fromJSON(json) {
        return new PromptBlock({
            id: json.id,
            type: json.type,
            label: json.label,
            text: json.text,
            enabled: json.enabled,
            order: json.order,
            provenance: json.provenance
        });
    }
}
