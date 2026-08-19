// pages/api/generate-slides-content.js
//
// Rebalanced: SUMMARY TABLES covering every finding (not one slide per
// item), a real chart for the executive summary, and only a handful of
// deep-dive slides for the most critical 2-3 items overall — matching how
// a real consultant deck is actually built, and keeping total slide count
// sane (aiming for ~15-20 slides, not 60+).

export const config = {
  maxDuration: 280,
};

import { getReviewContext } from '../../lib/reviewContext';

const NO_PART_LEAK_RULE = `
IMPORTANT: this deck is generated in pieces behind the scenes, but the
reader sees one seamless deck. NEVER write "Part 1", "Part 2", "continued",
or reference this being generated in pieces, anywhere in any output.
`.trim();

const SLIDE_TYPE_RULES = `
SLIDE TYPES — use the right one:
- "chart": for the executive summary counts ONLY. Fields: heading,
  chartType ("bar" or "pie"), seriesName, labels (array of category names),
  values (array of numbers, same length as labels).
- "table": for ANY list of multiple findings (all overlaps, all gaps, all
  ambiguities, all structure issues, all division recommendations). Fields:
  heading, columns (array of column header strings), rows (array of arrays
  of cell text, one inner array per row). Put severity words like "High",
  "Critical", "Medium", "Low", "Resolved" as their own cell so they get
  color-coded automatically. Keep cell text SHORT — a phrase, not a
  paragraph.
- "bullets": ONLY for the small number of deep-dive slides on the single
  most critical items. Fields: heading, bullets (array of short strings).

CRITICAL RULE: do NOT create one "bullets" slide per individual finding.
Every overlap, gap, ambiguity, and structure issue goes into ONE table
slide per category (all rows in one table). Only the 2-3 most severe items
ACROSS THE WHOLE REVIEW get their own individual "bullets" deep-dive slide.
`.trim();

const SCOPES = {
  1: `
Produce exactly these slides:
1. type "chart" — "Executive Summary at a Glance": bar chart with labels
   ["Overlaps","Gaps","Ambiguities","Structure Issues"] and values = the
   count found in each category.
2. type "bullets" — "How to Read This Deck": brief methodology and
   severity scale (concise, 5-6 bullets max).
3. type "table" — "Approved Structure — As Reviewed": columns
   ["Division","Reporting Line / Key Departments"], one row per division.
Also set deck_title and subtitle for the WHOLE deck — clean and
professional, e.g. "BDC Organizational Design Review" / "Functional Review
— Findings & Recommendations". No "part" language anywhere.
`.trim(),
  2: `
Produce exactly these slides:
1. type "table" — "Overlaps — All Findings": columns ["#","Overlap",
   "Functions in Conflict","Severity"], one row per overlap found (ALL of
   them, in one table).
2. type "table" — "Gaps — All Findings": columns ["#","Gap","Severity",
   "Closest Current Owner"], one row per gap found (ALL of them, one table).
3-4. type "bullets" — deep-dive slides for ONLY the 2 single most critical
   items across overlaps AND gaps combined (pick the most severe/impactful
   ones). Each: what it is, why it matters, recommended resolution.
`.trim(),
  3: `
Produce exactly these slides:
1. type "table" — "Ownership Ambiguities — All Findings": columns
   ["#","Ambiguity","Functions Affected","Severity"], one row per
   ambiguity (ALL of them, one table).
2. type "table" — "Structure Issues — All Findings": columns
   ["#","Issue","Function/Unit","Severity"], one row per issue (ALL of
   them, one table).
3. type "bullets" — ONE deep-dive slide for the single most critical
   ambiguity or structure issue.
`.trim(),
  4: `
Produce exactly these slides:
1. type "table" — "Division Mandate Recommendations": columns
   ["Division","Current Weakness","Recommended Mandate Direction"], one row
   per division that has at least one loaded submission (ALL divisions in
   ONE table — keep each cell to a short phrase, not a paragraph).
2. type "bullets" — "Next Steps & Priorities": 5-8 concise, sequenced
   recommended actions to close this review out.
`.trim(),
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST' });
  const { part } = req.body;
  if (![1, 2, 3, 4].includes(part)) return res.status(400).json({ error: 'part must be 1-4' });

  try {
    const { companyContext, structureText, rulesBlock, submissionsText, submissionCount } = await getReviewContext();

    const prompt = `
You are a senior Organizational Design consultant preparing a CONCISE
executive presentation for BDC's CEO and Executive Leadership — this needs
to be presentable in one meeting, not an exhaustive document. Aim for
clarity and brevity over exhaustive coverage.

${companyContext}

APPROVED STRUCTURE:
${structureText}

RULES TAUGHT BY OSAID AND EZWAH (ground truth):
${rulesBlock}

FUNCTION SUBMISSIONS (${submissionCount} active):
${submissionsText}

${NO_PART_LEAK_RULE}

${SLIDE_TYPE_RULES}

${SCOPES[part]}

Return ONLY valid JSON, no preamble, no markdown fences, in this exact shape:
${part === 1 ? '{ "deck_title": string, "subtitle": string, "slides": [ ...slide objects as described above... ] }' : '{ "slides": [ ...slide objects as described above... ] }'}
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
        max_tokens: 6000,
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
      return res.status(500).json({ error: `Part ${part}'s response was cut off before finishing. Try again.` });
    }

    return res.status(200).json(parsed);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
