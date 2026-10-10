# Prompt Diagnostics

Ask a model a question about your prompt, such as "Why does the model keep writing actions for my character?" or "Why are scene details missing?", and get a structured review back. Like the [Prompt Tester](prompt-tester.md), it's a **sandbox call**: nothing is sent to the chat, no SillyTavern events fire, no other extension sees it, and nothing in your chat, presets, variables, persona or world info changes. It works with or without State Engine.

## Running a diagnosis

- **From the drawer:** type a question under **Prompt Diagnostics** and press **Diagnose Prompt**. Curator compiles the current chat's prompt as it would send it, and the diagnosis starts straight away.
- **From the Prompt Analyzer:** press **Diagnose** in the toolbar. It diagnoses the prompt exactly as arranged there, including unsaved changes. Type your question and press **Diagnose** (or Ctrl+Enter).

Your last question is remembered. Ask again with other questions, or pick another connection, and earlier reports stay on screen to compare.

## What the model receives

One message containing:
1. an instruction to act as an expert prompt engineer and look for structural causes, ordering issues, ambiguities, conflicts, missing instructions, token pressure and model-specific weaknesses
2. your question
3. facts Curator already knows: the target model (your chat connection's), the prompt's size against your context size, and the list of sections in order with their roles and token counts
4. the compiled prompt
5. the required report headings

The diagnosing model must read the whole prompt, so it needs a context window at least that large. The size is shown above the compiled prompt in the Diagnostics window.

## The report

Each report shows your question and these sections, each in its own colour:

| Section | |
|---|---|
| **Diagnosis** | The answer to your question |
| **Suggested fixes** | Concrete rewrites or moves |
| **Conflicts** | Instructions that contradict each other |
| **Ambiguities** | Instructions open to more than one reading |
| **Missing instructions** | What the prompt never says |
| **Token pressure** | Where the context is spent |
| **Ordering issues** | Sections in a position that weakens them |

Sections with nothing to report are dimmed. If the model ignores the requested headings, its whole answer is shown as the diagnosis. The full text is always under **Full report text**.

Each report also shows the connection used and token usage, when the server reports it. Buttons copy the question or the whole report. A failed call shows the error, the request and the connection settings, and changes nothing.

## Connection

Diagnostics uses the **Prompt Tester's connection**: a SillyTavern connection profile or the active connection, with the same optional temperature and max-token overrides. A report needs room, so when the connection sets no max tokens, **Report length** (default 2048) is used. A stronger model than the one you chat with often gives a better diagnosis, so it's worth keeping a profile for it.
