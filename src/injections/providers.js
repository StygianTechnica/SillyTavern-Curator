// Injection block PROVIDERS - other extensions (Scenario Builder, a memory
// extension...) offering injection blocks that the user can import into
// Curator's library from the Prompt Analyzer.
//
// Public API, on window.Curator (see src/extension.js):
//
//   window.Curator.registerInjectionProvider({
//       id: 'scenario-builder',              // unique, stable
//       name: 'Scenario Builder',            // shown in the menu
//       getBlocks: async () => [             // called when the menu opens
//           { id: 'pacing', name: 'Pacing rules', text: '...', role: 'system', color: '#4a90d9' },
//       ],
//   });
//   window.Curator.unregisterInjectionProvider('scenario-builder');
//
// Curator may load after the integration: wait for the 'curator:ready'
// event on document if window.Curator is not there yet.
//
// Imported blocks are COPIES (source: { provider, id }); editing one in
// Curator never changes the provider's own data.

const providers = new Map();

export function registerInjectionProvider(provider) {
    if (!provider || typeof provider.id !== 'string' || !provider.id.trim()) throw new Error('Injection provider needs an id');
    if (typeof provider.getBlocks !== 'function') throw new Error('Injection provider needs a getBlocks() function');
    providers.set(provider.id, { id: provider.id, name: String(provider.name || provider.id), getBlocks: provider.getBlocks });
}

export function unregisterInjectionProvider(id) {
    return providers.delete(id);
}

export function getInjectionProviders() {
    return [...providers.values()];
}

// Blocks a provider currently offers, validated. Never throws.
export async function getProviderBlocks(providerId) {
    const provider = providers.get(providerId);
    if (!provider) return [];
    try {
        const blocks = await provider.getBlocks();
        return (Array.isArray(blocks) ? blocks : [])
            .filter(b => b && typeof b.text === 'string')
            .map((b, i) => ({
                id: String(b.id ?? i),
                name: String(b.name || `${provider.name} block ${i + 1}`),
                text: b.text,
                role: b.role,
                color: b.color,
            }));
    } catch (err) {
        console.warn(`[Curator] injection provider "${providerId}" failed`, err);
        return [];
    }
}
