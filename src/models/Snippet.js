// models/Snippet.js

export class Snippet {
    constructor({
        id = null,
        name = "",
        category = "",
        text = "",
        tags = [],
        enabled = true,
        provenance = null
    } = {}) {
        this.id = id;               // unique snippet ID
        this.name = name;           // human-readable name
        this.category = category;   // optional category (lore, rules, flavor, etc.)
        this.text = text;           // raw snippet text
        this.tags = tags;           // optional tags for searching/filtering
        this.enabled = enabled;     // user toggle
        this.provenance = provenance; // where this snippet came from (user, extension, WI, etc.)
    }

    toJSON() {
        return {
            id: this.id,
            name: this.name,
            category: this.category,
            text: this.text,
            tags: this.tags,
            enabled: this.enabled,
            provenance: this.provenance
        };
    }

    static fromJSON(json) {
        return new Snippet({
            id: json.id,
            name: json.name,
            category: json.category,
            text: json.text,
            tags: json.tags || [],
            enabled: json.enabled,
            provenance: json.provenance
        });
    }
}
