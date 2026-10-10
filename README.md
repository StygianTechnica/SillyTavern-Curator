# SillyTavern-Curator
Inspect, and take control of, the prompt SillyTavern sends to the LLM. Works standalone; integrates with [State Engine](https://github.com/StygianTechnica/SillyTavern-StateEngine) when it is installed.

After installing, open **Extensions → Curator → Open Prompt Analyzer**.

## Prompt Analyzer
A large popup showing the last prompt SillyTavern built (or a fresh dry run - **Refresh**), split into colour-coded sections with token counts and their share of the context:

- **Chat Completion**: sections come straight from SillyTavern's prompt manager (Main Prompt, World Info, Character, Persona, Chat History, custom prompts, extension prompts...). Messages injected into chat history (Author's Note, lorebook @depth entries, Character's Note, extensions) are identified where possible.
- **Text Completion**: sections are found by matching known text (character card, persona, lorebook entries, chat messages) inside the prompt string, so boundaries are approximate.
- **Connected Lorebooks**: every connected book, its constant entries (and whether they made it into the prompt), and the entries triggered in this prompt.

Drag sections (grip handle) to reorder, untick to drop, expand to read or edit. **Compile** shows the resulting prompt. **Chat history limit**: type a number in the Chat History row ("last N msgs") to send only the most recent N chat messages in every prompt. In-chat injections inside the history (Author's Note, lorebook @depth entries...) are always kept. Leave it blank to send everything SillyTavern includes. **Find** searches the prompt text: Enter / Shift+Enter (or the arrows) step through each match, opening its section and highlighting it.

## Injection Blocks
Global blocks of your own text, sent with every Chat Completion prompt in every chat, wherever you drag them. Create, edit, colour, enable, clone, reorder and delete them in the analyzer's Injection Blocks panel; add ready-made ones from presets or other extensions; or clone any prompt section into one to experiment. **Keep them setting-agnostic** - setting-specific content belongs in the character, persona, scenario or lorebooks. See [docs/injection-blocks.md](docs/injection-blocks.md).

## Curator controls prompt order (Chat Completion)
**Save Arrangement** stores the order, on/off state and edited text of each section. With **Curator controls prompt order** on, every Chat Completion prompt is rearranged that way just before it is sent - overriding the prompt manager. Sections Curator hasn't seen before keep their place after their neighbour. Raw generations from other extensions (trackers etc.) are never touched. Edited text replaces that section on *every* generation, so prefer editing static sections (Main Prompt, custom prompts).

## Prompt Tester
**Test Prompt** (analyzer toolbar or drawer) runs the compiled prompt against SillyTavern's active connection or any of its Connection Profiles (like State Engine), in a sandbox: nothing reaches the chat and no other extension sees the call. Switch profiles and run again to compare responses side by side. Nothing is sent until you press **Run**. See [docs/prompt-tester.md](docs/prompt-tester.md).

## Prompt Diagnostics
Ask a model a question about the prompt (**Diagnose Prompt** in the drawer, or **Diagnose** in the analyzer) and get a structured report: diagnosis, suggested fixes, conflicts, ambiguities, missing instructions, token pressure and ordering issues. Uses the Prompt Tester's connection, in the same sandbox. See [docs/prompt-diagnostics.md](docs/prompt-diagnostics.md).
