// pages/api/chat.js
//
// Two tools now: update_org_structure (from before) and manage_review_rule
// (new — this is what makes "remember this rule" actually persist). Both
// go through the same generic tool-use loop: Claude calls a tool by name,
// we route to the matching executor, feed the result back, repeat until
// Claude stops calling tools and gives a normal text reply.

import { supabase } from '../../lib/supabase';
import { COMPANY_CONTEXT } from '../../lib/companyContext';
import { getStructureTree, structureToText } from '../../lib/structure';
import { executeStructureTool, STRUCTURE_TOOL_DEFINITION } from '../../lib/structureTools';
import { executeRuleTool, RULE_TOOL_DEFINITION } from '../../lib/ruleTools';

function formatSubmissions(subs) {
  if (!subs.length) return '(No function submissions uploaded yet.)';
  return subs
    .map(
      (s) => `
### ${s.department_function} (${s.division})
Mandate: ${s.functional_statement || '—'}
Core responsibilities: ${(s.core_responsibilities || []).join('; ') || '—'}
Owns: ${(s.owns || []).join('; ') || '—'}
Does not own: ${(s.does_not_own || []).join('; ') || '—'}
Key outputs: ${(s.key_outputs || []).join('; ') || '—'}
Interfaces: ${(s.interfaces || []).join('; ') || '—'}
KPIs: ${(s.kpis || []).join('; ') || '—'}
`.trim()
    )
    .join('\n\n');
}

async function callClaude(systemPrompt, messages) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 3000,
      system: systemPrompt,
      tools: [STRUCTURE_TOOL_DEFINITION, RULE_TOOL_DEFINITION],
      messages,
    }),
  });
  return res.json();
}

async function routeToolCall(toolUseBlock) {
  if (toolUseBlock.name === 'update_org_structure') {
    return executeStructureTool(toolUseBlock.input);
  }
  if (toolUseBlock.name === 'manage_review_rule') {
    return executeRuleTool(toolUseBlock.input);
  }
  return { ok: false, message: `Unknown tool "${toolUseBlock.name}".` };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST' });

  const { messages, author } = req.body;
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'messages array required' });
  }

  const latestUserMessage = messages[messages.length - 1];

  try {
    await supabase.from('chat_messages').insert({
      role: 'user',
      content: latestUserMessage.content,
      author: author || null,
    });

    const { data: submissions } = await supabase
      .from('function_submissions')
      .select('*')
      .eq('status', 'active')
      .order('division');

    const { data: rules } = await supabase
      .from('review_rules')
      .select('rule_text')
      .eq('active', true);

    const structureTree = await getStructureTree();
    const structureText = structureToText(structureTree);

    const rulesBlock =
      rules && rules.length ? rules.map((r) => `- ${r.rule_text}`).join('\n') : '(No rules taught yet.)';

    const systemPrompt = `
You are a senior Organizational Design (OD) consultant working exclusively
for Al Balad Development Company (BDC). Osaid and Ezwah are your clients.

${COMPANY_CONTEXT}

CURRENT APPROVED STRUCTURE (reflects any changes already made — treat as up to date):
${structureText}

YOUR JOB
Read every function submission below against the company context and the
structure above. Identify:
- OVERLAP: two functions claiming the same accountability, even if worded differently.
- GAP: something that clearly needs an owner but nothing claims it.
- OWNERSHIP AMBIGUITY: vague enough that two functions could both claim or both avoid it.
- STRUCTURE ISSUE: a function's claimed scope or reporting doesn't match the approved structure above.

TOOLS
- If Osaid or Ezwah state a REAL, CONFIRMED change to the approved structure,
  call update_org_structure — actually call it, don't just say you will.
- If they explicitly ask you to remember/save a rule for future reviews, or
  to stop applying one, call manage_review_rule — actually call it.
- Do not call either tool for hypothetical questions or general discussion.

RULES TAUGHT BY OSAID AND EZWAH (ground truth):
${rulesBlock}

HOW TO ANSWER
- Be direct and specific — name functions, quote the exact colliding phrase.
- Full review = structure as Overlaps / Gaps / Ambiguities / Structure issues.
- Say when you're not confident — don't manufacture findings.

FUNCTION SUBMISSIONS (${submissions?.length || 0} active):
${formatSubmissions(submissions || [])}
`.trim();

    let conversation = messages.map((m) => ({ role: m.role, content: m.content }));
    let data = await callClaude(systemPrompt, conversation);

    let guard = 0;
    while (data.stop_reason === 'tool_use' && guard < 3) {
      guard++;
      const toolUseBlock = data.content.find((b) => b.type === 'tool_use');
      const result = await routeToolCall(toolUseBlock);

      conversation = [
        ...conversation,
        { role: 'assistant', content: data.content },
        {
          role: 'user',
          content: [
            { type: 'tool_result', tool_use_id: toolUseBlock.id, content: JSON.stringify(result) },
          ],
        },
      ];

      data = await callClaude(systemPrompt, conversation);
    }

    const textBlock = data.content?.find((b) => b.type === 'text');
    const replyText = textBlock ? textBlock.text : '(No text reply — check logs.)';

    await supabase.from('chat_messages').insert({ role: 'assistant', content: replyText });

    return res.status(200).json({ reply: replyText });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
