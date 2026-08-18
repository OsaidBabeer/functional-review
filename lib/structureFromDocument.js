// lib/structureFromDocument.js
//
// Takes a base64-encoded PDF of a full org chart and asks Claude to:
// 1. Read the actual diagram (boxes, connector lines, hierarchy) — not
//    just scrape text, since position and connections ARE the information.
// 2. Compare it against the structure we currently have stored.
// 3. Return a clean tree we can use to rebuild org_units, plus a plain
//    English summary of what changed, for the audit log and for you to see.

export async function extractStructureFromPdf(base64Pdf, currentStructureText) {
  const prompt = `
You are reading an organizational chart PDF — boxes, connector lines,
hierarchy. Extract the COMPLETE structure exactly as shown in the diagram.

For context, here is the structure we currently have on record (may be
outdated — the PDF is the new source of truth):
${currentStructureText}

Return ONLY valid JSON, no preamble, no markdown fences, in this shape:

{
  "tree": [
    {
      "name": "Division Name",
      "type": "division",
      "children": [
        { "name": "Department Name", "type": "department" }
      ]
    }
  ],
  "change_summary": "One short paragraph in plain English describing what
    is different between the current structure and this new PDF — new
    divisions/departments, removed ones, renamed ones, moved ones. If
    nothing changed, say so explicitly."
}

Rules:
- Read the diagram itself — box positions and connecting lines define the
  hierarchy, not just the text.
- Include every division and department visible in the chart, even if
  identical to what's on record.
- Use the exact names as they appear in the diagram.
- Only two levels deep: divisions (report to CEO) and departments/functions
  (sit under a division). If the diagram shows more levels (e.g. individual
  people), only extract at the division/department level.
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
      max_tokens: 4000,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'document',
              source: { type: 'base64', media_type: 'application/pdf', data: base64Pdf },
            },
            { type: 'text', text: prompt },
          ],
        },
      ],
    }),
  });

  const data = await claudeRes.json();
  const textBlock = data.content?.find((b) => b.type === 'text');
  if (!textBlock) throw new Error('No text response from Claude');

  const cleaned = textBlock.text.replace(/```json|```/g, '').trim();
  return JSON.parse(cleaned);
}
