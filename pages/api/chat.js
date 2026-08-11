// pages/api/chat.js
//
// This is the agent you actually talk to. Every message, it re-reads:
//   1. Company context (static — who BDC is)
//   2. Every active function submission (the real data)
//   3. Every accumulated review rule (things you/Ezwah have taught it)
// ...and answers as a senior OD expert. It doesn't "remember" across
// sessions on its own — the memory is Supabase feeding back in, every time.

import { supabase } from '../../lib/supabase';
import { COMPANY_CONTEXT } from '../../lib/companyContext';

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

  const { messages } = req.body; // [{role: 'user'|'assistant', content: '...'}]
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'messages array required' });
  }

  try {
    const { data: submissions } = await supabase
      .from('function_submissions')
      .select('*')
      .eq('status', 'active')
      .order('division');

    const { data: rules } = await supabase
      .from('review_rules')
      .select('rule_text')
      .eq('active', true);

    const rulesBlock = rules && rules.length
      ? rules.map((r) => `- ${r.rule_text}`).join('\n')
      : '(No rules taught yet.)';

    const systemPrompt = `
You are a senior Organizational Design (OD) consultant working exclusively
for Al Balad Development Company (BDC). You have reviewed hundreds of
functional org designs before this one. Osaid and Ezwah are your clients —
they run this review internally and are relying on you to catch what a
careless first pass would miss.

${COMPANY_CONTEXT}

YOUR JOB
Read every function submission below as a set. For each question you're
asked, reason like an experienced OD analyst, not a text-matching tool:
- OVERLAP: two functions both claim the same accountability, deliverable,
  or decision right (their "Owns" lists collide, even if worded differently).
- GAP: something clearly needs an owner (implied by one function's "Does not
  own," or by BDC's operating model) but no submission claims it.
- OWNERSHIP AMBIGUITY: responsibility is described vaguely enough that two
  functions could reasonably both claim or both avoid it.
- BOUNDARY ISSUE: a function's scope doesn't match how BDC actually
  operates (see company context above — e.g. claiming direct execution
  when BDC works through contractors).

RULES TAUGHT BY OSAID AND EZWAH (treat these as ground truth, they override
your own judgment when they conflict):
${rulesBlock}

HOW TO ANSWER
- Be direct and specific — name the functions involved, quote the exact
  colliding phrase from each "Owns" list, don't just say "there might be
  overlap."
- If asked for a full review, structure it as: Overlaps / Gaps / Ambiguities
  / Boundary issues, each with function names and reasoning.
- If asked about two specific functions, focus only on those.
- If you're not confident something is a real issue, say so — don't
  manufacture findings to seem thorough.
- If the user tells you something is correct as-is (not actually an issue),
  treat that as new information for this conversation, and suggest they add
  it as a permanent rule if it should apply going forward.

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
        messages: messages,
      }),
    });

    const data = await claudeRes.json();
    const textBlock = data.content?.find((b) => b.type === 'text');
    if (!textBlock) return res.status(500).json({ error: 'No response from Claude', raw: data });

    return res.status(200).json({ reply: textBlock.text });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
