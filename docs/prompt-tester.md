# Prompt Tester

Runs the prompt, as Curator compiles it, against a model of your choice and shows what comes back. It's a **sandbox call**:

- it never sends a chat message or writes to chat history
- it fires none of SillyTavern's generation events, so no other extension (State Engine, Memory Manager, Scenario Builder...) sees or reacts to it
- it changes no presets, variables, persona, world info, characters, connection profiles or settings, apart from Curator's own choice of profile when you edit it

It works the same with or without State Engine installed.

## Running a test

Press **Test Prompt**:

- in the **Prompt Analyzer** toolbar, to test the prompt exactly as arranged there, including unsaved changes
- in Curator's **drawer**, to test the current chat's prompt as Curator would send it (saved arrangement, injection blocks, State Engine variables)

The tester opens with the compiled prompt and your connection. Nothing is sent until you press **Run**. The compiled prompt is sent as **one user message**.

Each run becomes a result card showing:
- the model's response, plus its reasoning when the model returns one
- token usage (prompt + response = total), when the server reports it
- the model name the server reports, and the connection: profile, source, preset, temperature, max tokens
- how long the call took

**Comparing models:** pick another connection profile (or change the overrides) at the top of the tester and press **Run again**. Earlier cards stay, so results line up side by side. Remove a card with ×, or **Clear** them all. **Copy Prompt** and **Copy Response** (latest successful run, or the copy icon on any card) put the text on the clipboard.

If a call fails, its card shows the error, the request that was sent and the connection settings, with API keys and passwords hidden. Nothing else is affected.

## Connection

The Prompt Tester connects the same way State Engine does, through SillyTavern's **Connection Profiles** (set them up in SillyTavern's Connection Manager). Curator stores only which profile to use, never a server, model or API key. Keys stay in SillyTavern's secrets on the server.

Set it in the drawer or at the top of the tester. Both are the same setting, saved at once.

| Setting | |
|---|---|
| **Connection profile** | **Use currently active connection** (SillyTavern's active Chat Completion connection, with its model and sampling), or any profile: Chat Completion or Text Completion, with its own API, model, preset and key. |
| **Temperature** | Optional override. Leave blank to use the profile's own. |
| **Max tokens** | Optional override. Leave blank to use the profile's own. |

To compare models, make a profile for each and switch between them in the tester.

## Limits

- **The active connection must be Chat Completion.** If SillyTavern is on a Text Completion API, pick a connection profile instead. Text Completion profiles work, and receive the compiled prompt as plain text.
- Responses arrive in one piece, not streamed. **Cancel** stops a run in progress.
- The prompt is flattened into a single user message with `[role]` markers, so a model may treat it slightly differently from the same sections sent as separate messages in a real chat.
