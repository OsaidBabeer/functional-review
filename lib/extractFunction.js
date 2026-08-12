export async function extractFunctionsFromDocument(fullText, userComment = '') {
  const prompt = `
You are an Organizational Development document extraction specialist for BDC.
Your ONLY job is to faithfully extract the real department submission from the uploaded functional review document.

The document may contain instructions, worked examples, blank templates, and the real filled submission. Ignore instructions, examples, and blank prompts.
A real submission can span several slides. Merge those slides into one submission unless the document clearly contains different departments.

USER COMMENT OR INSTRUCTION
${userComment?.trim() || '(none)'}
Use the comment only as context. Do not turn the comment into a responsibility unless the user explicitly states that it should be added to the submission.

For each real submission return this JSON shape exactly
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
  "kpis": string[],
  "decision_authorities": string[],
  "success_factors_challenges": string[],
  "extracted_items": [
    { "type": "responsibility|activity|task|function|mandate|accountability|ownership|boundary|output|interface|kpi|decision_authority|other", "text": string }
  ]
}

EXTRACTION RULES
1. Preserve the submitter's wording. Do not improve, paraphrase, merge away, or silently drop statements.
2. extracted_items is the audit list. It must contain every meaningful submitted statement that could affect functional ownership or the OD review.
3. Include every responsibility, activity, task, function, mandate, accountability, Owns statement, Does Not Own boundary, output, interface, KPI, and decision authority that appears in the real submission.
4. If one bullet contains several distinct accountabilities, split it into separate extracted_items only when the split is obvious from the source.
5. Do not invent missing content.
6. Return [] if the document contains no real filled submission.
7. Return ONLY a JSON array. No markdown and no explanation.

DOCUMENT TEXT
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
      max_tokens: 10000,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  const data = await claudeRes.json();
  const textBlock = data.content?.find((b) => b.type === 'text');
  if (!textBlock) throw new Error(data.error?.message || 'No text response from Claude');

  const cleaned = textBlock.text.replace(/```json|```/g, '').trim();
  return JSON.parse(cleaned);
}
