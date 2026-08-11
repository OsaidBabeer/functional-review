// lib/extractFunction.js
//
// Reads an ENTIRE uploaded document (all slides concatenated, in order),
// not slide-by-slide. Two reasons:
// 1. A real submission can be spread across several slides (Function Info
//    on one, Owns/Outputs on the next, etc.) — splitting by slide loses
//    the connection between them.
// 2. A file can mix instructional/example content with the real filled-in
//    answer — the agent needs the whole picture to tell them apart.
// Returns an ARRAY, because one file might contain one submission (this
// Admin file) or many (a deck with one sector per slide).

export async function extractFunctionsFromDocument(fullText) {
  const prompt = `
You are reading an ENTIRE uploaded document — a "BDC Functional Review
Template" file. It contains a mix of: instructional slides (how to fill the
template, quality checklists), example/reference slides (a worked example
used for guidance, NOT a real submission), blank prompt slides, and the
REAL filled-in submission(s) from an actual department head.

Your job: find only the REAL filled-in submission(s) and ignore everything
else — instructions, the reference example, blank unfilled prompts.

IMPORTANT: a single real submission is often spread across MULTIPLE
consecutive slides (e.g. one slide has Division/Department/Mandate, the
next has Owns/Does Not Own, the next has Outputs/Interfaces, etc.) — treat
all of that as ONE submission and merge it into one record, no matter how
many slides it spans. Only split into separate submissions if the document
clearly contains more than one distinct department's real answers
(different Division/Department names).

For each real submission found, extract this exact JSON shape:
{
  "division": string,
  "department_function": string,
  "prepared_by": string or null,
  "submission_date": string or null,
  "functional_statement": string,
  "core_responsibilities": string[],
  "owns": string[],
  "does_not_own": string[],
  "key_outputs": string[],
  "interfaces": string[],
  "kpis": string[]
}

Return ONLY a JSON array of these objects, no preamble, no markdown fences.
If you find zero real submissions (e.g. the file is entirely instructions
with nothing filled in), return an empty array: []

Rules:
- Keep the person's own wording; don't paraphrase or improve it.
- Split combined sentences into separate array items where it's a clear list.
- If a section is genuinely missing from what was filled in, return an
  empty array (or null) for it — don't invent content.
- Do NOT extract the "Completed Example" / reference slide as a submission.

DOCUMENT TEXT:
"""
${fullText}
"""
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
  if (!textBlock) throw new Error('No text response from Claude');

  const cleaned = textBlock.text.replace(/```json|```/g, '').trim();
  return JSON.parse(cleaned);
}
