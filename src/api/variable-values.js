// Thin wrappers around State Engine's Variable Value API (cross-namespace
// display reads - see the State Engine API Reference, "Variable Value
// API"). Identity-checked as Curator, so only usable once Curator has
// claimed its namespace (src/extension.js).

// See src/api/namespace.js for why these are dynamic imports.
const API_PATH = '../../../SillyTavern-StateEngine/src/api/index.js';
const IDENTITY_PATH = '../../../SillyTavern-StateEngine/src/api/identity.js';

// Every preset in every namespace with its variables' display definitions.
// Works without a chat.
export async function listAllVariables(extensionId) {
    const { stateEngine } = await import(API_PATH);
    const { ensureInstanceId } = await import(IDENTITY_PATH);
    return stateEngine.listAllVariables(extensionId, ensureInstanceId());
}

// { [qualifiedName]: { value, def } | undefined } for one chat.
export async function getVariableValues(extensionId, chatId, qualifiedNames) {
    const { stateEngine } = await import(API_PATH);
    const { ensureInstanceId } = await import(IDENTITY_PATH);
    return stateEngine.getVariableValues(extensionId, ensureInstanceId(), chatId, qualifiedNames);
}
