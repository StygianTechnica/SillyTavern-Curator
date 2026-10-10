// Curator's persisted settings, kept in SillyTavern's own
// extension_settings under the "curator" key so they are saved with the
// rest of the user's settings (no server plugin or file API needed).

const SETTINGS_KEY = 'curator';

const DEFAULTS = {
    enabled: true,
    // When true, every Chat Completion prompt is rearranged by `layout`
    // before it is sent (src/capture.js, src/prompt/sections.js).
    applyLayout: false,
    // { sections: [{ key, enabled, text? }] } - saved from the analyzer modal.
    layout: null,
    // Global injection blocks (src/injections/store.js), shared by all chats.
    injections: [],
    // The user's own reusable injection texts (src/injections/user-presets.js).
    userPresets: [],
    // Virtual file store used by src/storage/storage.js: path -> JSON value.
    files: {},
};

// Returns the live settings object, creating it (and filling in any
// missing defaults) on first use.
export function getSettings() {
    const { extensionSettings } = SillyTavern.getContext();
    if (!extensionSettings[SETTINGS_KEY] || typeof extensionSettings[SETTINGS_KEY] !== 'object') {
        extensionSettings[SETTINGS_KEY] = {};
    }
    const settings = extensionSettings[SETTINGS_KEY];
    for (const [key, value] of Object.entries(DEFAULTS)) {
        if (settings[key] === undefined) settings[key] = structuredClone(value);
    }
    return settings;
}

export function saveSettings() {
    SillyTavern.getContext().saveSettingsDebounced();
}
