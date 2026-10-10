// Extension bootstrap: starts prompt capture and adds the Curator drawer
// to the Extensions settings, then - only if State Engine is present -
// claims a namespace, registers this extension for discovery, and
// declares its capabilities. Curator works without State Engine (see
// manifest.json); State Engine just adds integration on top. See
// docs/how-to-extend.md for where everything else goes.

import { ensureStateEngineAvailable } from './api/dependency-check.js';
import { claimNamespace } from './api/namespace.js';
import { registerWithStateEngine } from './api/registration.js';
import { declareCapabilities } from './api/capabilities.js';
import { getSettings } from './settings.js';
import { initPromptCapture } from './capture.js';
import { addSettingsDrawer, setStateEngineStatus } from './ui/settings-drawer.js';
import { registerInjectionProvider, unregisterInjectionProvider } from './injections/providers.js';
import { getInjections } from './injections/store.js';
import { EXTENSION_ID, setStateEngineConnected } from './api/connection.js';

// ---------------------------------------------------------------------
// EXTENSION IDENTITY - rename these before building on this template.
// See docs/README.md, "Renaming the namespace".
// ---------------------------------------------------------------------

// EXTENSION_ID (src/api/connection.js) must be unique across every
// extension that talks to the State Engine API on this SillyTavern
// install - it is how the State Engine tells Curator's calls apart.

// Prefixes every variable and preset your extension creates through the
// State Engine (e.g. a variable named "mood" is stored as
// "myExtension__mood"). Letters and digits only, starting with a
// letter - see the State Engine API Reference, "Namespace Model".
const NAMESPACE = 'cr';

// Plain strings describing what this extension provides to other State
// Engine extensions: global injection blocks (see window.Curator below).
const CAPABILITIES = ['prompt.injectionBlocks'];

// Curator's public API for other extensions (see src/injections/providers.js).
// Exposed whether or not State Engine is installed; an integration that
// loads before Curator waits for the 'curator:ready' event on document.
function exposePublicApi() {
    window.Curator = Object.freeze({
        version: 1,
        registerInjectionProvider,
        unregisterInjectionProvider,
        // Read-only copies of the user's global injection blocks.
        getInjectionBlocks: () => structuredClone(getInjections()),
    });
    try {
        document.dispatchEvent(new CustomEvent('curator:ready', { detail: window.Curator }));
    } catch (err) {
        console.warn('[Curator] could not announce curator:ready', err);
    }
}

// Called once, on load (see src/index.js). Safe to call again on a
// later page load - claimNamespace() is idempotent for the same
// EXTENSION_ID/NAMESPACE pair, and registerWithStateEngine()/
// declareCapabilities() simply replace the previous declaration with
// the same one.
//
// The drawer and prompt capture come up FIRST and never depend on State
// Engine. The State Engine check then gates only the integration calls:
// if it is missing, Curator logs it, notes it in the drawer, and keeps
// working on its own.
export async function initExtension() {
    getSettings();
    initPromptCapture();
    exposePublicApi();
    await addSettingsDrawer('Checking for State Engine...');

    const available = await ensureStateEngineAvailable();
    let status;
    if (!available) {
        status = 'State Engine not detected - running standalone.';
        console.info(`[${EXTENSION_ID}] State Engine was not found - running without State Engine integration.`);
    } else {
        try {
            await claimNamespace(EXTENSION_ID, NAMESPACE);

            await registerWithStateEngine(EXTENSION_ID, {
                namespace: NAMESPACE,
                capabilities: CAPABILITIES,
                description: 'Analyzes and curates the prompt context sent to the LLM.',
            });

            await declareCapabilities(EXTENSION_ID, CAPABILITIES);

            setStateEngineConnected(true);
            status = 'Connected to State Engine.';
            console.log(`[${EXTENSION_ID}] initialized - namespace "${NAMESPACE}" claimed.`);
        } catch (err) {
            // State Engine looked present but an actual call failed (e.g. a
            // differently named install folder breaking the import paths in
            // src/api/*.js). Never fatal - Curator still runs standalone.
            status = 'State Engine found, but its API could not be reached - running standalone.';
            console.warn(`[${EXTENSION_ID}] State Engine calls failed - running without State Engine integration.`, err);
        }
    }

    setStateEngineStatus(status);
}
