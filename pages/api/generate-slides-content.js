// pages/api/generate-slides-content.js
//
// Split into THREE parts now (not two) — the division-by-division mandate
// recommendations section alone (17+ divisions, each needing real analysis)
// was big enough on its own to run past the token limit when bundled with
// ambiguities and structure issues, producing truncated/invalid JSON.
// Splitting it out into its own call gives it room to actually finish.

export const config = {
  maxDuration: 280,
};

import { getReviewContext } from '../../lib/reviewContext';

const SCOPES = {
  1: `
Cover ONLY these sections, in this order:
1. "How to Read This Deck" — methodology and severity scale
2. "Approved Structure — As Reviewed" — the structure snapshot
3. "Executive Summary" — findings at a glance, all categories
4. "Overlaps" — every overlap found, functions involved, severity
5. "Gaps" — every gap found, severity
Do NOT cover ambiguities, structure issues, or division-by-division
recommendations — those come in later parts.
`.trim(),
  2: `
Cover ONLY these sections, in this order:
1. "Ownership Ambiguities" — every one found
2. "Structure Issues" — every one found
Do NOT cover the title, methodology, structure snapshot, executive summary,
overlaps, gaps, or any division-by-division recommendations — those are
covered in other parts.
`.trim(),
  3: `
Cover ONLY this section:
One slide PER DIVISION with a functional statement / mandate recommendation
— current mandate weakness plus a rewritten recommended mandate. Cover every
division that has at least one loaded function submission. Keep each
division's content focused: current weakness (1-2 bullets), recommended
mandate (1-2 bullets) — do not write long paragraphs, use concise bullets so
all divisions fit.
Do NOT cover anything else — no title, summary, overlaps, gaps, ambiguities,
or structure issues, those are covered in other parts.
`.trim(),
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST' });
  const { part } = req.body;
  if (![1, 2, 3].includes(part)) return res.status(400).json({ error: 'part must be 1, 2, or 3' });

  try {
    const { companyContext, structureText, rulesBlock, submissionsText, submissionCount } = await getReviewContext();

    const prompt = `
You are a senior Organizational Design consultant preparing an executive
presentation for BDC's CEO and Executive Leadership. This is PART ${part} of 3
of the same deck.

${companyContext}

APPROVED STRUCTURE:
${structureText}

RULES TAUGHT BY OSAID AND EZWAH (ground truth):
${rulesBlock}

FUNCTION SUBMISSIONS (${submissionCount} active):
${submissionsText}

${SCOPES[part]}

Return ONLY valid JSON, no preamble, no markdown fences, in this exact shape:
${part === 1 ? '{ "deck_title": string, "subtitle": string, "slides": [ { "heading": string, "bullets": string[] } ] }' : '{ "slides": [ { "heading": string, "bullets": string[] } ] }'}

Write real, specific content — this deck will be presented as-is. Keep
bullets concise so the JSON stays well within limits — no long paragraphs.
`.trim();

    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 10000,
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
        error: `Part ${part}'s response was cut off before finishing (still too much content for one call). Try again — if it keeps happening, this part needs splitting further.`,
      });
    }

    return res.status(200).json(parsed);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
