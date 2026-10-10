// src/parser/parser.js

import { CuratorRouter } from './router.js';

const router = new CuratorRouter();

/**
 * High-level Curator parser API.
 * Other modules should import from here instead of directly
 * touching analyzer/compiler/router.
 */

export async function analyzePrompt(rawText) {
    return router.analyzePrompt(rawText);
}

export async function compileSnapshot(snapshot) {
    return router.compileSnapshot(snapshot);
}

export async function saveSnapshot(snapshot) {
    return router.saveSnapshot(snapshot);
}

export async function loadSnapshot(id) {
    return router.loadSnapshot(id);
}

export async function listSnapshots() {
    return router.listSnapshots();
}

export async function deleteSnapshot(id) {
    return router.deleteSnapshot(id);
}

export async function analyzeCompileSave(rawText) {
    return router.analyzeCompileSave(rawText);
}
