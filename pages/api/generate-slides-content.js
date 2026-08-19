// pages/api/generate-slides-content.js
//
// Now 5 parts, each disciplined to produce ONE SLIDE PER TOPIC (one overlap
// = one slide, one gap = one slide, etc.) instead of cramming everything
// into a single crowded slide. Smaller, focused parts also means each call
// finishes faster and more reliably.

export const config = {
  maxDuration: 280,
};

import { getReviewContext } from '../../lib/reviewContext';

const NO_PART_LEAK_RULE = `
IMPORTANT: this deck is being generated in several separate pieces behind
the scenes, but the person reading the final deck will NEVER know that —
they see one single, seamless presentation. NEVER write "Part 1", "Part 2",
"continued", "as covered earlier", or any reference to this being generated
in pieces, anywhere in deck_title, subtitle, headings, or bullets.
`.trim();

const SCOPES = {
  1: `
Produce exactly 3 slides, in this order:
1. "How to Read This Deck" — methodology and severity scale
2. "Approved Structure — As Reviewed" — the structure snapshot
3. "Executive Summary" — findings at a glance, all categories, as counts
Also set deck_title and subtitle for the WHOLE deck (this is the only part
that sets these) — a clean, professional title and subtitle with no
reference to "findings," "part," or anything implying this is one section
of several. Just the deck's real title, e.g. "BDC Organizational Design
Review" and a subtitle like "Functional Review — Gaps, Overlaps &
Recommendations".
`.trim(),
  2: `
Produce ONE SLIDE PER OVERLAP found — do not bundle multiple overlaps onto
one slide. Each slide heading should name the overlap (e.g. "Overlap:
Corporate Brand & Narrative Ownership"), and bullets should cover: which
functions are in conflict, what each claims, the risk, and the recommended
resolution — kept concise (aim for 4-6 bullets per slide, not long
paragraphs). If there are 9 overlaps, produce 9 separate slides.
`.trim(),
  3: `
Produce ONE SLIDE PER GAP found — do not bundle multiple gaps onto one
slide. Each slide heading should name the gap, and bullets should cover:
what's missing, why it matters for BDC specifically, and the action
required — kept concise (4-6 bullets per slide). If there are 6 gaps,
produce 6 separate slides.
`.trim(),
  4: `
Produce ONE SLIDE PER OWNERSHIP AMBIGUITY, then ONE SLIDE PER STRUCTURE
ISSUE found — do not bundle multiple items onto one slide. Concise bullets
(4-6 per slide), not long paragraphs.
`.trim(),
  5: `
Produce ONE SLIDE PER DIVISION that has at least one loaded function
submission — a functional statement / mandate recommendation for each.
Each slide: current mandate weakness (1-2 bullets), recommended rewritten
mandate (1-2 bullets). Keep every division's slide concise so it stays
readable — do not write long paragraphs.
`.trim(),
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST' });
  const { part } = req.body;
  if (![1, 2, 3, 4, 5].includes(part)) return res.status(400).json({ error: 'part must be 1-5' });

  try {
    const { companyContext, structureText, rulesBlock, submissionsText, submissionCount } = await getReviewContext();

    const prompt = `
You are a senior Organizational Design consultant preparing an executive
presentation for BDC's CEO and Executive Leadership.

${companyContext}

APPROVED STRUCTURE:
${structureText}

RULES TAUGHT BY OSAID AND EZWAH (ground truth):
${rulesBlock}

FUNCTION SUBMISSIONS (${submissionCount} active):
${submissionsText}

${NO_PART_LEAK_RULE}

${SCOPES[part]}

Return ONLY valid JSON, no preamble, no markdown fences, in this exact shape:
${part === 1 ? '{ "deck_title": string, "subtitle": string, "slides": [ { "heading": string, "bullets": string[] } ] }' : '{ "slides": [ { "heading": string, "bullets": string[] } ] }'}

Write real, specific content — this deck will be presented as-is. Keep
bullets concise so each slide is actually readable when projected.
`.trim();

    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 8000,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    const data = await claudeRes.json();
    const textBlock = data.content?.find((b) => b.type === 'text');
    if (!textBlock) return res.status(500).json({ error: 'No response from Claude' });

    const cleaned = textBlock.text.replace(/```json|```/g, '').trim();

    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch (parseErr) {
      return res.status(500).json({
        error: `Part ${part}'s response was cut off before finishing. Try again.`,
      });
    }

    return res.status(200).json(parsed);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
