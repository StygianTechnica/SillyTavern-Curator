// Prompt Diagnostics - the meta prompt sent to the diagnosing model, and
// the parser for its report.
//
// The report is requested under fixed markdown headings rather than as
// JSON: small local models break JSON far more often than they break
// headings, and a report that ignores the format still shows (as the
// diagnosis) instead of failing.

// Report sections, in display order: key -> [heading, matcher].
export const REPORT_SECTIONS = {
    explanation: ['Diagnosis', /diagnos|explanation|answer|summary/i],
    fixes: ['Suggested fixes', /fix|suggest|recommend/i],
    conflicts: ['Conflicts', /conflict|contradict/i],
    ambiguities: ['Ambiguities', /ambigu|unclear|vague/i],
    missing: ['Missing instructions', /missing/i],
    tokenPressure: ['Token pressure', /token|length|budget|pressure/i],
    ordering: ['Ordering issues', /order|position|placement|sequence/i],
};

const fmt = n => Number(n || 0).toLocaleString();

/**
 * @param {object} input
 * @param {string} input.question - the user's question
 * @param {string} input.compiled - the compiled prompt
 * @param {{ label: string, category: string, role: string|null, tokens: number }[]} input.sections - enabled sections, in order
 * @param {number} input.totalTokens
 * @param {number} input.contextSize - the chat connection's context size (0 = unknown)
 * @param {string|null} input.targetModel - the model the prompt is written for
 */
export function buildDiagnosticPrompt({ question, compiled, sections = [], totalTokens = 0, contextSize = 0, targetModel = null }) {
    const sectionLines = sections.map((s, i) => `${i + 1}. ${s.label} [${s.category}${s.role ? `, ${s.role}` : ''}] - ${fmt(s.tokens)} tokens`).join('\n');
    const share = contextSize ? totalTokens / contextSize : 0;
    const pressure = share >= 0.85 ? 'close to the limit' : share >= 0.6 ? 'getting full' : 'well within the limit';
    const budget = contextSize
        ? `${fmt(totalTokens)} of ${fmt(contextSize)} context tokens (${(share * 100).toFixed(0)}% - ${pressure})`
        : `${fmt(totalTokens)} tokens`;
    const headings = Object.values(REPORT_SECTIONS).map(([heading]) => `## ${heading}`).join('\n');

    return `You are an expert in prompt engineering for roleplay and interactive-fiction LLM prompts. Analyze the prompt below and answer the user's question. Identify structural causes, ordering issues, ambiguities, conflicting instructions, missing instructions, token pressure points, and weaknesses specific to the target model.

User question:
${question}

About the prompt:
- Target model: ${targetModel || 'unknown'}
- Size: ${budget}
- It is a chat prompt: sections are sent in this order, each as its own message. In the section list, the first bracketed word is Curator's label for where the text came from (character card, lorebook, preset...) - the model never sees it; the second is the message role (system, user, assistant).
- Lines starting with "[role]" in the compiled prompt only separate messages.
${sectionLines ? `Sections:\n${sectionLines}` : ''}

Compiled prompt (between the markers; "[role]" lines separate messages):
<<<PROMPT
${compiled}
PROMPT>>>

Answer the user question: ${question}

Write your report under exactly these headings, in this order:
${headings}
Under each heading use short bullet points. Quote the exact prompt text involved and name the section it is in. Under "Suggested fixes", give concrete rewrites or moves. Write "None found." under a heading that has nothing.`;
}

// Splits the model's report into REPORT_SECTIONS by its headings
// ("## Conflicts", or a line that is only "**Conflicts**"). A heading that
// isn't one of ours stays as text in the current section. Returns
// { sections: { key: text }, structured } - structured is false when no
// known heading was found (the whole text is then the diagnosis).
export function parseReport(text) {
    const raw = String(text ?? '');
    const buffers = { _preamble: [] };
    let current = '_preamble';
    let structured = false;
    for (const line of raw.split('\n')) {
        const heading = line.match(/^\s{0,3}#{1,4}\s*(.+?)\s*:?\s*#*\s*$/) ?? line.match(/^\s{0,3}\*\*([^*]+?)\*\*\s*:?\s*$/);
        const key = heading ? Object.entries(REPORT_SECTIONS).find(([, [, matcher]]) => matcher.test(heading[1]))?.[0] : null;
        if (key) {
            current = key;
            structured = true;
            buffers[key] ??= [];
            continue;
        }
        buffers[current].push(line);
    }
    if (!structured) return { sections: { explanation: raw.trim() }, structured: false };
    const sections = {};
    for (const [key, lines] of Object.entries(buffers)) {
        if (key !== '_preamble') sections[key] = lines.join('\n').trim();
    }
    const preamble = buffers._preamble.join('\n').trim();
    if (preamble) sections.explanation = sections.explanation ? `${preamble}\n\n${sections.explanation}` : preamble;
    return { sections, structured };
}

// True when a section says there is nothing to report.
export function isEmptySection(text) {
    const t = String(text ?? '').replace(/[-*•\s]/g, '').toLowerCase();
    return !t || /^(nonefound|none|n\/a|nothing|noissues?(found)?)\.?$/.test(t);
}
