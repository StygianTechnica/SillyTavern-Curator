// Detects whether the OPTIONAL State Engine extension is installed,
// enabled, and has actually finished initializing - WITHOUT hardcoding or probing any
// file path. The signal used is `window.StateEngineWI`, a global the
// REAL State Engine extension sets for ITSELF once its own startup
// sequence completes (SillyTavern-StateEngine/src/world-info/wi-api.js,
// `exposeStateEngineWI()`) - which only happens if SillyTavern actually
// loaded and ran it as an enabled extension. If the global is missing
// for ANY reason - not installed, not enabled, or its own
// initialization failed partway through - this treats the dependency as
// unavailable. That covers all three failure modes this check exists
// for with one signal, rather than trying to tell them apart.

function stateEnginePresent() {
    return typeof window !== 'undefined' && typeof window.StateEngineWI === 'object' && window.StateEngineWI !== null;
}

// Waits, AT MOST once, for SillyTavern's own APP_READY event - the same
// "everything has finished loading" signal State Engine's own startup
// code waits for (see runStartupOnce() in its initialization-engine.js)
// - so a load-order race (this extension's script running before State
// Engine's own async startup has finished) doesn't produce a false
// negative. This is a single bounded wait, never a retry loop: if
// APP_READY already fired before this ran, or there is no event bus to
// wait on at all, it resolves immediately instead of hanging.
function waitForAppReady() {
    return new Promise((resolve) => {
        let context;
        try {
            context = SillyTavern.getContext();
        } catch {
            resolve();
            return;
        }
        if (!context?.eventSource || !context?.eventTypes?.APP_READY) {
            resolve();
            return;
        }
        const done = () => resolve();
        if (typeof context.eventSource.once === 'function') {
            context.eventSource.once(context.eventTypes.APP_READY, done);
        } else {
            context.eventSource.on(context.eventTypes.APP_READY, done);
        }
        // Safety net in case APP_READY already fired before this ran, or
        // never fires at all - a hard ceiling, not a poll.
        setTimeout(done, 3000);
    });
}

// Resolves true once State Engine is confirmed present - checking
// immediately, then (only if that first check fails) once more after
// waiting for APP_READY - or false if it is still absent after that
// single wait. Never checks a third time.
export async function ensureStateEngineAvailable() {
    if (stateEnginePresent()) return true;
    await waitForAppReady();
    return stateEnginePresent();
}
