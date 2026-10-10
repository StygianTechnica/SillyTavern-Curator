# Injection Blocks

Injection blocks are Curator's own prompt blocks: pieces of text you write once and Curator sends with **every Chat Completion prompt**, in every chat, wherever you placed them. They are stored in Curator's extension settings and are not tied to any chat, character, persona, preset or connection.

Manage them in **Extensions → Curator → Open Prompt Analyzer → Injection Blocks** (right-hand panel).

## Keep them setting-agnostic

Because one injection block applies to *every* chat, write it so it makes sense in all of them. Good injection blocks say **how** to write:

- "Never write actions or dialogue for {{user}}."
- "Keep responses to 2-4 paragraphs."
- "Don't reuse phrases from your recent responses."

Setting-specific content (who people are, what the world is like, what's happening now) does **not** belong here. Put it where SillyTavern already scopes it:

| Content | Where it belongs |
|---|---|
| A character's looks, personality, history | Character card (description / personality) |
| Who *you* are | Persona |
| The situation the story starts in | Scenario |
| Places, factions, lore, rules of the world | World Info / lorebooks |

A block like "The city of Brass is ruled by guilds" would leak into every other chat you run. Macros such as `{{char}}` and `{{user}}` are resolved each time the block is sent, so they're a good way to stay generic.

## What you can do

| | How |
|---|---|
| Create | **+** in the panel. New blocks start switched off so you can write them first. |
| Edit / rename / change role | Pencil (or click the name). Text can also be edited straight in the prompt list. |
| Colour | The colour swatch. The block is drawn in this colour in the prompt list. |
| Enable / disable | The tick box, in the panel or on the block in the prompt list. |
| Clone | Copy icon. The copy appears directly below the original. |
| Delete | Bin icon (asks first). Removed from every chat. |
| Reorder the library | Drag by the grip in the panel. |
| Place in the prompt | Drag the block in the prompt list, like any other section. Its place is saved immediately. |
| Add a ready-made block | **Add from...**: Curator presets, plus blocks offered by other extensions. |
| Clone a prompt section | Open any section (or a single chat message) and press **Clone to injection block**. The copy lands right below the original, so you can switch the original off and experiment with the copy. |

### Where a block goes

Each block remembers the section directly above it. If that section isn't in a particular prompt (an empty Author's Note, say), the block falls back to just before Chat History. Blocks you've never dragged sit just before Chat History too.

Injection blocks are always sent while enabled. They don't need **Curator controls prompt order**; that switch only rearranges SillyTavern's *own* sections.

### Limits

- **Chat Completion only.** Text Completion prompts are not modified.
- Each block is sent as one message, in the role you choose (system by default).
- Blocks imported from presets or other extensions are **copies**. Editing them never changes the original source.

## For extension developers

Other extensions (Scenario Builder, a memory extension...) can offer blocks that users import from **Add from...**:

```js
function register() {
    window.Curator.registerInjectionProvider({
        id: 'scenario-builder',            // unique and stable
        name: 'Scenario Builder',          // menu group label
        getBlocks: async () => [           // called each time the analyzer opens
            { id: 'pacing', name: 'Pacing rules', text: 'Advance the plot every few turns.', role: 'system', color: '#4a90d9' },
        ],
    });
}
if (window.Curator) register();
else document.addEventListener('curator:ready', register, { once: true });
```

`window.Curator.unregisterInjectionProvider(id)` removes it. `window.Curator.getInjectionBlocks()` returns a read-only copy of the user's blocks. When State Engine is installed, Curator also declares the capability `prompt.injectionBlocks`.
