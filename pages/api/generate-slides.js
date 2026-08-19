// pages/api/generate-slides.js
//
// This does NOT go through the chat agent — no conversation, no tool-use
// loop, no reply shown anywhere. It asks Claude for slide content directly
// as JSON, builds the pptx immediately, and hands the file straight back.
// Click button → download. Nothing else happens.

export const config = {
  maxDuration: 300,
};

import { getReviewContext } from '../../lib/reviewContext';
import { buildPptx } from '../../lib/slideTools';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST' });

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

Prepare a complete, thorough executive slide deck covering:
1. A title slide
2. How to read the deck / methodology
3. The approved structure as reviewed
4. Executive summary of findings at a glance
5. Overlaps — every one found, with functions involved and severity
6. Gaps — every one found, with severity
7. Ownership ambiguities — every one found
8. Structure issues — every one found
9. One slide per division with a functional statement / mandate recommendation,
   noting current weaknesses and a rewritten recommended mandate

Return ONLY valid JSON, no preamble, no markdown fences, in this exact shape:
{
  "deck_title": string,
  "subtitle": string,
  "slides": [
    { "heading": string, "bullets": string[] }
  ]
}

Write real, specific, thorough content based on everything above — this deck
will be presented as-is. Use as many slides as needed to cover everything
properly; do not compress or skip content to save space.
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
        max_tokens: 16000,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    const data = await claudeRes.json();
    const textBlock = data.content?.find((b) => b.type === 'text');
    if (!textBlock) return res.status(500).json({ error: 'No response from Claude' });

    const cleaned = textBlock.text.replace(/```json|```/g, '').trim();
    const slideContent = JSON.parse(cleaned);

    const { base64, filename, mimeType } = await buildPptx(slideContent);

    return res.status(200).json({ base64, filename, mimeType });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
