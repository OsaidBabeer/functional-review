// pages/api/chat.js
//
// The OD expert agent, now with two additions:
// 1. It reads the APPROVED ORG STRUCTURE, not just general company identity.
// 2. Every message (yours and its replies) gets saved to Supabase, so the
//    conversation survives refreshes and is there next time you open the app.

import { supabase } from '../../lib/supabase';
import { COMPANY_CONTEXT } from '../../lib/companyContext';
import { ORG_STRUCTURE } from '../../lib/orgStructure';

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

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST' });

  const { messages, author } = req.body; // messages: full running conversation from the client
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'messages array required' });
  }

  const latestUserMessage = messages[messages.length - 1];

  try {
    // Persist the user's new message immediately.
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

    const rulesBlock =
      rules && rules.length ? rules.map((r) => `- ${r.rule_text}`).join('\n') : '(No rules taught yet.)';

    const systemPrompt = `
You are a senior Organizational Design (OD) consultant working exclusively
for Al Balad Development Company (BDC). Osaid and Ezwah are your clients —
they run this review internally and are relying on you to catch what a
careless first pass would miss.

${COMPANY_CONTEXT}

${ORG_STRUCTURE}

YOUR JOB
Read every function submission below as a set, against both the company
context and the approved structure above. For each question you're asked,
reason like an experienced OD analyst:
- OVERLAP: two functions both claim the same accountability, deliverable,
  or decision right, even if worded differently.
- GAP: something clearly needs an owner but no submission claims it.
- OWNERSHIP AMBIGUITY: responsibility described vaguely enough that two
  functions could reasonably both claim or both avoid it.
- BOUNDARY / STRUCTURE ISSUE: a function's claimed scope or reporting
  doesn't match the approved structure, or doesn't match how BDC actually
  operates (heritage mandate, contractor-managed delivery).

RULES TAUGHT BY OSAID AND EZWAH (ground truth — override your own judgment
when they conflict):
${rulesBlock}

HOW TO ANSWER
- Be direct and specific — name the functions involved, quote the exact
  colliding phrase from each "Owns" list.
- If asked for a full review, structure it as: Overlaps / Gaps /
  Ambiguities / Structure issues, each with function names and reasoning.
- If asked about two specific functions, focus only on those.
- Say when you're not confident something is a real issue — don't
  manufacture findings to seem thorough.
- If told something is correct as-is, treat that as new information for
  this conversation, and suggest adding it as a permanent rule if it
  should apply going forward.

FUNCTION SUBMISSIONS (${submissions?.length || 0} active):
${formatSubmissions(submissions || [])}
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
        max_tokens: 3000,
        system: systemPrompt,
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
      }),
    });

    const data = await claudeRes.json();
    const textBlock = data.content?.find((b) => b.type === 'text');
    if (!textBlock) return res.status(500).json({ error: 'No response from Claude', raw: data });

    // Persist the assistant's reply too.
    await supabase.from('chat_messages').insert({
      role: 'assistant',
      content: textBlock.text,
    });

    return res.status(200).json({ reply: textBlock.text });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
