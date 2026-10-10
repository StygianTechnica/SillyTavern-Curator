# SillyTavern-Curator
Inspect, and take control of, the prompt SillyTavern sends to the LLM. Works standalone; integrates with [State Engine](https://github.com/StygianTechnica/SillyTavern-StateEngine) when it is installed.

After installing, open **Extensions → Curator → Open Prompt Analyzer**.

## Prompt Analyzer
A large popup showing the last prompt SillyTavern built (or a fresh dry run - **Refresh**), split into colour-coded sections with token counts and their share of the context:

- **Chat Completion**: sections come straight from SillyTavern's prompt manager (Main Prompt, World Info, Character, Persona, Chat History, custom prompts, extension prompts...). Messages injected into chat history (Author's Note, lorebook @depth entries, Character's Note, extensions) are identified where possible.
- **Text Completion**: sections are found by matching known text (character card, persona, lorebook entries, chat messages) inside the prompt string, so boundaries are approximate.
- **Connected Lorebooks**: every connected book, its constant entries (and whether they made it into the prompt), and the entries triggered in this prompt.

Drag sections (grip handle) to reorder, untick to drop, expand to read or edit. **Compile** shows the resulting prompt.

## Curator controls prompt order (Chat Completion)
**Save Arrangement** stores the order, on/off state and edited text of each section. With **Curator controls prompt order** on, every Chat Completion prompt is rearranged that way just before it is sent - overriding the prompt manager. Sections Curator hasn't seen before keep their place after their neighbour. Raw generations from other extensions (trackers etc.) are never touched. Edited text replaces that section on *every* generation, so prefer editing static sections (Main Prompt, custom prompts).
