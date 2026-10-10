// storage.js
//
// Curator's data lives in a small virtual file store inside its
// extension settings (see src/settings.js), addressed by path like
// "snapshots/<id>.json". The helpers below are the only place that
// knows this; everything else just reads and writes "files".

import { getSettings as getCuratorSettings, saveSettings as persistCuratorSettings } from '../settings.js';

async function readJSON(path) {
    const value = getCuratorSettings().files[path];
    return value === undefined ? null : structuredClone(value);
}

async function writeJSON(path, data) {
    getCuratorSettings().files[path] = structuredClone(data);
    persistCuratorSettings();
}

async function listFiles(dir) {
    const prefix = `${dir}/`;
    return Object.keys(getCuratorSettings().files)
        .filter(path => path.startsWith(prefix))
        .map(path => path.slice(prefix.length));
}

async function deleteFile(path) {
    delete getCuratorSettings().files[path];
    persistCuratorSettings();
}

// -----------------------------
// PROMPTS
// -----------------------------

export async function loadPrompts() {
    try {
        const data = await readJSON('prompts.json');
        return data || [];
    } catch (err) {
        console.error('[Curator] Failed to load prompts:', err);
        return [];
    }
}

export async function savePrompts(prompts) {
    try {
        await writeJSON('prompts.json', prompts);
        return true;
    } catch (err) {
        console.error('[Curator] Failed to save prompts:', err);
        return false;
    }
}

// -----------------------------
// SNIPPETS
// -----------------------------

export async function loadSnippets() {
    try {
        const data = await readJSON('snippets.json');
        return data || [];
    } catch (err) {
        console.error('[Curator] Failed to load snippets:', err);
        return [];
    }
}

export async function saveSnippets(snippets) {
    try {
        await writeJSON('snippets.json', snippets);
        return true;
    } catch (err) {
        console.error('[Curator] Failed to save snippets:', err);
        return false;
    }
}

// -----------------------------
// SETTINGS
// -----------------------------

export async function loadSettings() {
    try {
        const data = await readJSON('settings.json');
        return data || {};
    } catch (err) {
        console.error('[Curator] Failed to load settings:', err);
        return {};
    }
}

export async function saveSettings(settings) {
    try {
        await writeJSON('settings.json', settings);
        return true;
    } catch (err) {
        console.error('[Curator] Failed to save settings:', err);
        return false;
    }
}

// storage.js (continuing in order)

// -----------------------------
// SNAPSHOTS
// -----------------------------

// Snapshots are stored as individual JSON files in /snapshots/
// Example: snapshots/snapshot-1696880000000.json

export async function listSnapshots() {
    try {
        const files = await listFiles('snapshots');
        return files
            .filter(f => f.endsWith('.json'))
            .map(f => ({
                id: f.replace('.json', ''),
                file: f
            }));
    } catch (err) {
        console.error('[Curator] Failed to list snapshots:', err);
        return [];
    }
}

export async function loadSnapshot(id) {
    try {
        const data = await readJSON(`snapshots/${id}.json`);
        return data || null;
    } catch (err) {
        console.error(`[Curator] Failed to load snapshot ${id}:`, err);
        return null;
    }
}

export async function saveSnapshot(id, snapshot) {
    try {
        await writeJSON(`snapshots/${id}.json`, snapshot);
        return true;
    } catch (err) {
        console.error(`[Curator] Failed to save snapshot ${id}:`, err);
        return false;
    }
}

export async function deleteSnapshot(id) {
    try {
        await deleteFile(`snapshots/${id}.json`);
        return true;
    } catch (err) {
        console.error(`[Curator] Failed to delete snapshot ${id}:`, err);
        return false;
    }
}
