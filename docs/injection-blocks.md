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
| Create your own | **+ Blank** in the panel (or **Blank block** in the Add menu). It starts enabled with its editor open, and is only sent once it has text. |
| Save as my preset | Bookmark icon. The text becomes reusable from **My presets** in the Add menu. Saving again under the same name updates it. Manage them under **My presets** in the panel. |
| Edit / rename / change role | Pencil (or click the name). Text can also be edited straight in the prompt list. |
| Colour | The colour swatch. The block is drawn in this colour in the prompt list. |
| Enable / disable | The tick box, in the panel or on the block in the prompt list. |
| Clone | Copy icon. The copy appears directly below the original. |
| Delete | Bin icon (asks first). Removed from every chat. |
| Reorder the library | Drag by the grip in the panel. |
| Place in the prompt | Drag the block in the prompt list, like any other section. Its place is saved immediately. |
| Add a ready-made block | **Add a block...**: your presets, Curator presets, plus blocks offered by other extensions. |
| Clone a prompt section | Open any section (or a single chat message) and press **Clone to injection block**. The copy lands right below the original, so you can switch the original off and experiment with the copy. |

### The GM Card preset

**GM Card (multi-character narrator)** is a complete Game Master instruction set: you narrate the world and play every NPC, never act for {{user}}, use flowing third-person prose without "Name: dialogue" script format, establish each new scene, keep NPCs consistent and limited to what they know, follow the lorebooks, and end each turn on a pause for the player. It is added at the top of the prompt.

With it in place, the character card no longer needs GM instructions. Use the card for a short **setting blurb** instead, such as era and technology level, place, premise, tone and major themes. If your Main Prompt (or the card's Main Prompt override) still holds older GM rules, switch it off in the analyzer and save the arrangement so the two don't contradict each other.

### The Scene details preset

**Scene details (time, place, weather)** asks the model to state the scene's facts plainly whenever they're established or change: time of day and time passed, the date or day, the specific location, weather and conditions, and who is present. It also tells the model not to repeat unchanged details.

It's meant for State Engine's **prompted** scene variables. Those are filled by reading the latest response, so they can only capture what the narration actually says. It pairs well with the GM Card, whose scene rule covers *when* to set a scene; this one makes the facts explicit enough to capture.

### Where a block goes

Each block remembers the section directly above it. If that section isn't in a particular prompt (an empty Author's Note, say), the block falls back to just before Chat History. Blocks you've never dragged sit just before Chat History too.

Enabled injection blocks are sent only while **Curator controls the prompt** is on (Curator's drawer) - with it off, Curator changes no prompt at all - and, with **Only change chat replies** on, only in the prompts for the chat's own replies, never in other extensions' background prompts.

### Limits

- **Chat Completion only.** Text Completion prompts are not modified.
- Each block is sent as one message, in the role you choose (system by default).
- Blocks imported from presets or other extensions are **copies**. Editing them never changes the original source.

## State Engine variables (second bank)

When [State Engine](https://github.com/StygianTechnica/SillyTavern-StateEngine) is installed, the analyzer shows a second bank, **State Engine Variables**. It lists variables that other State Engine extensions (Memory Manager, Scenario Builder...) offer for injection, grouped by the extension that offers them. Without State Engine this bank doesn't exist.

- **Content is the variable's value in the current chat.** It's dynamic and chat-specific, so it can't be edited in Curator. Open its section to read the current value.
- **Tick one to add it to the prompt.** Its section appears in the prompt list; drag it where it belongs. It's sent as one message there, in the role you pick, while Curator controls the prompt. The choice applies to every chat.
- **Remove it with the bin** on its section in the prompt list (or untick it in the bank). It leaves the prompt list and stays offered in the bank - unticked variables never crowd the prompt list.
- **Nothing is sent where there's no value.** That happens when the variable's preset isn't active in that chat. The section then shows **no value**.
- **The list doesn't need a chat.** Offered variables are known as soon as their extension has declared them. Values appear once a chat is open.
- Variables are **not in the prompt** until you tick them.
- The bank and the prompt list name the offering extension briefly ("Archivist", "State Engine"); hover for its full id. Offered text should not name its source - the model doesn't need it.

To get any other State Engine variable into the prompt, put its `{{macro}}` in a constant World Info entry.

## For extension developers

### Offering State Engine variables (requires State Engine)

Declare one State Engine **capability** per injectable variable: `curator.inject:<fully-qualified variable name>`. The variable must be in your own namespace.

```js
stateEngine.registerExtension(EXTENSION_ID, instanceId, {
    namespace: 'mm',
    variables: ['mm__summary', 'mm__recent_events'],
    capabilities: ['curator.inject:mm__summary', 'curator.inject:mm__recent_events'],
    description: 'Memory Manager',
});
```

Curator reads State Engine's capability graph, so this works whatever order extensions load in and with no chat open. Labels and descriptions come from the variable definitions, and values come from the Variable Value API for the open chat. The value is sent exactly as State Engine's own `{{macro}}` renders it, so write prompt-ready text into the variable - without naming your extension in it (Curator shows the source; the model doesn't need it). Nothing else is needed: no Curator API call, and Curator need not be installed.

To suggest the message role, also declare `curator.inject.role:<role>:<variable>` (`system`, `user` or `assistant`), e.g. `curator.inject.role:user:mm__summary`. It is the variable's role until the user picks one in the analyzer; without it, `system`. State Engine and Archivist suggest `user` for theirs, and start each block with the line `REFERENCE ONLY — DO NOT CONTINUE` so the model treats it as reference rather than text to continue.

### Offering static injection blocks (no State Engine needed)

Other extensions can also offer ready-made, editable blocks that users import from **Add a block...**:

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
