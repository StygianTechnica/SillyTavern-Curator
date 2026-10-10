// Thin wrappers around State Engine's open discovery reads - no caller
// identity needed (see the State Engine API Reference, "Extension
// Capability Graph" and "Extension Registration API"). Only called once
// src/api/connection.js reports State Engine connected.

// See src/api/namespace.js for why these are dynamic imports.
const API_PATH = '../../../SillyTavern-StateEngine/src/api/index.js';

// { [extensionId]: { capabilities, dependsOn } } for every extension that
// has claimed a State Engine namespace.
export async function getCapabilityGraph() {
    const { stateEngine } = await import(API_PATH);
    return stateEngine.getCapabilityGraph();
}

// { [extensionId]: { namespace, variables, capabilities, dependsOn, description } }
export async function getRegisteredExtensions() {
    const { stateEngine } = await import(API_PATH);
    return stateEngine.getRegisteredExtensions();
}
