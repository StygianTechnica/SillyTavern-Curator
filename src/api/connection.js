// Whether Curator is connected to State Engine (set by src/extension.js
// once the namespace claim and registration succeed). Everything that
// reads State Engine data checks this first - Curator never requires
// State Engine.

export const EXTENSION_ID = 'Curator';

let connected = false;

export function setStateEngineConnected(value) {
    connected = Boolean(value);
}

export function isStateEngineConnected() {
    return connected;
}
