// lib/extractFunction.js
//
// Pulled out of the API route so both the text-paste path and the pptx
// upload path call the exact same extraction logic. One place to fix
// bugs or improve the prompt, instead of two.

export async function extractOneFunction(raw_text) {
  const prompt = `
You are extracting structured data from ONE filled-in "BDC Functional Review
Template" slide. The template has these sections: Function Information
(Division, Department, Prepared by, Date), Functional Statement / Mandate,
Core Responsibilities, Owns / Does Not Own, Key Outputs, Key Interfaces,
KPIs. People fill these inconsistently — some skip sections, some merge
them, some use different labels. Do your best to map their content to the
correct field below even if their formatting is messy.

If this text clearly is NOT a functional review submission (e.g. it's a
cover/instructions slide with no actual department content), return exactly:
{"skip": true}

Otherwise return ONLY valid JSON, no preamble, no markdown fences, matching
exactly this shape:

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

Rules:
- Split combined sentences into separate array items where it's a clear list.
- If a section is genuinely missing, return an empty array (or null) — don't invent content.
- Keep the person's own wording; don't paraphrase or improve it.

SOURCE TEXT:
"""
${raw_text}
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
      max_tokens: 2000,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  const data = await claudeRes.json();
  const textBlock = data.content?.find((b) => b.type === 'text');
  if (!textBlock) throw new Error('No text response from Claude');

  const cleaned = textBlock.text.replace(/```json|```/g, '').trim();
  return JSON.parse(cleaned);
}
