// pages/api/generate-slides-content.js
//
// Returns SLIDE CONTENT ONLY (JSON), not a built pptx file — building the
// file happens in the browser instead (see downloadSlides in index.js).
// Split into two parts so neither single request has to generate the whole
// deck's worth of content in one go, which was taking long enough to blow
// past even a 300-second server limit.

export const config = {
  maxDuration: 280,
};

import { getReviewContext } from '../../lib/reviewContext';

const PART_1_SCOPE = `
Cover ONLY these sections, in this order:
1. A title slide (heading: deck title as a normal slide heading isn't needed —
   just include deck_title/subtitle at the top level, no separate title slide
   entry in the array)
2. "How to Read This Deck" — methodology and severity scale
3. "Approved Structure — As Reviewed" — the structure snapshot
4. "Executive Summary" — findings at a glance, all categories
5. "Overlaps" — every overlap found, functions involved, severity
6. "Gaps" — every gap found, severity
Do NOT cover ambiguities, structure issues, or division-by-division
recommendations — those come in part 2.
`.trim();

const PART_2_SCOPE = `
Cover ONLY these sections, in this order:
1. "Ownership Ambiguities" — every one found
2. "Structure Issues" — every one found
3. One slide per division with a functional statement / mandate recommendation
   — current weakness plus a rewritten recommended mandate
Do NOT repeat the title, methodology, structure snapshot, executive summary,
overlaps, or gaps — those were already covered in part 1.
`.trim();

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST' });
  const { part } = req.body;
  if (part !== 1 && part !== 2) return res.status(400).json({ error: 'part must be 1 or 2' });

  try {
    const { companyContext, structureText, rulesBlock, submissionsText, submissionCount } = await getReviewContext();

    const prompt = `
You are a senior Organizational Design consultant preparing an executive
presentation for BDC's CEO and Executive Leadership. This is PART ${part} of 2
of the same deck.

${companyContext}

APPROVED STRUCTURE:
${structureText}

RULES TAUGHT BY OSAID AND EZWAH (ground truth):
${rulesBlock}

FUNCTION SUBMISSIONS (${submissionCount} active):
${submissionsText}

${part === 1 ? PART_1_SCOPE : PART_2_SCOPE}

Return ONLY valid JSON, no preamble, no markdown fences, in this exact shape:
${part === 1 ? '{ "deck_title": string, "subtitle": string, "slides": [ { "heading": string, "bullets": string[] } ] }' : '{ "slides": [ { "heading": string, "bullets": string[] } ] }'}

Write real, specific, thorough content — this deck will be presented as-is.
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
        max_tokens: 8000,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    const data = await claudeRes.json();
    const textBlock = data.content?.find((b) => b.type === 'text');
    if (!textBlock) return res.status(500).json({ error: 'No response from Claude' });

    const cleaned = textBlock.text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(cleaned);

    return res.status(200).json(parsed);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
