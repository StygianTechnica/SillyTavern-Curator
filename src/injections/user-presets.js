// The user's own injection presets - reusable texts saved from an
// injection block ("Save as my preset") and offered again under "My
// presets" in the Prompt Analyzer's "Add..." menu. Stored in Curator's
// extension settings, like the blocks themselves.
//
// Preset shape: { id, name, text, role, color, savedAt }

import { getSettings, saveSettings } from '../settings.js';

function list() {
    const settings = getSettings();
    if (!Array.isArray(settings.userPresets)) settings.userPresets = [];
    return settings.userPresets;
}

export function getUserPresets() {
    return list();
}

// Saves a block's text as a preset. A preset with the same name is
// replaced (so re-saving after an edit updates it). Returns
// { preset, replaced }.
export function saveUserPreset({ name, text, role, color }) {
    const presets = list();
    const cleanName = String(name || 'My preset').trim();
    const existing = presets.find(p => p.name.toLowerCase() === cleanName.toLowerCase());
    if (existing) {
        Object.assign(existing, { text, role, color, savedAt: Date.now() });
        saveSettings();
        return { preset: existing, replaced: true };
    }
    const preset = { id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, name: cleanName, text, role, color, savedAt: Date.now() };
    presets.push(preset);
    saveSettings();
    return { preset, replaced: false };
}

export function deleteUserPreset(id) {
    const presets = list();
    const index = presets.findIndex(p => p.id === id);
    if (index < 0) return false;
    presets.splice(index, 1);
    saveSettings();
    return true;
}
