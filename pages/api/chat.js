import { supabase } from '../../lib/supabase';
import { COMPANY_CONTEXT } from '../../lib/companyContext';
import { getStructureTree, structureToText } from '../../lib/structure';
import { executeStructureTool, STRUCTURE_TOOL_DEFINITION } from '../../lib/structureTools';

function list(v) {
  return Array.isArray(v) && v.length ? v.join('; ') : '—';
}

function formatSubmissions(subs) {
  if (!subs.length) return '(No active submissions saved yet.)';
  return subs.map((s) => `
### ${s.department_function} (${s.division})
Status: ${s.status || 'active'}
User comments: ${s.user_comments || '—'}
Mandate: ${s.functional_statement || '—'}
Core responsibilities: ${list(s.core_responsibilities)}
Owns: ${list(s.owns)}
Does not own: ${list(s.does_not_own)}
Outputs: ${list(s.key_outputs)}
Interfaces: ${list(s.interfaces)}
KPIs: ${list(s.kpis)}
Decision authorities: ${list(s.decision_authorities)}
Extracted statements: ${Array.isArray(s.extracted_items) ? s.extracted_items.map((x) => `[${x.type || 'item'}] ${x.text}`).join('; ') : '—'}
Source: ${s.source_filename || 'manual entry'}
`.trim()).join('\n\n');
}

function formatReferences(refs) {
  if (!refs?.length) return '(No company reference documents saved yet.)';
  return refs.map((r) => `
### ${r.title}
Type: ${r.reference_type}
Notes: ${r.notes || '—'}
Content:
${String(r.content || '').slice(0, 12000)}
`.trim()).join('\n\n');
}

async function callClaude(systemPrompt, messages) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 1800,
      system: systemPrompt,
      tools: [STRUCTURE_TOOL_DEFINITION],
      messages,
    }),
  });
  return response.json();
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST' });

  const { messages, author, review_context } = req.body;
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

    const [{ data: submissions }, { data: rules }, { data: references }] = await Promise.all([
      supabase.from('function_submissions').select('*').order('division'),
      supabase.from('review_rules').select('rule_text').eq('active', true),
      supabase.from('reference_documents').select('*').eq('active', true).order('created_at', { ascending: false }),
    ]);

    const structureTree = await getStructureTree();
    const structureText = structureToText(structureTree);
    const rulesBlock = rules?.length ? rules.map((r) => `• ${r.rule_text}`).join('\n') : '(No saved review rules.)';

    const target = review_context?.target_department_function
      ? `${review_context.target_department_function}${review_context.target_division ? ` (${review_context.target_division})` : ''}`
      : 'not specified';

    const mode = review_context?.mode || 'chat';
    const extraComment = review_context?.user_comment || '';

    const systemPrompt = `
You are the internal Organizational Development review specialist for Al Balad Development Company.
Your job is to help OD build a complete, practical functional responsibility model before department calibration meetings.

${COMPANY_CONTEXT}

APPROVED ORGANIZATION STRUCTURE
${structureText}

COMPANY REFERENCE KNOWLEDGE
Use these references when relevant to company goals, strategic priorities, business plans, operating model needs, and mandates. Do not invent content that is not in the references.
${formatReferences(references || [])}

SAVED OD RULES
${rulesBlock}

FUNCTION SUBMISSION HISTORY
Current active submissions are the source of truth. Superseded records are historical context only and must not be treated as current ownership claims.
${formatSubmissions(submissions || [])}

CURRENT REVIEW REQUEST
Mode: ${mode}
Selected function: ${target}
User context/comment: ${extraComment || '—'}

OD REVIEW LOGIC
Consider the approved structure, the purpose of each department, ownership logic, separation of responsibilities, duplication, missing ownership, missing responsibilities, company strategy, nature of BDC's business, interfaces, outputs, and decision rights.
Reason by meaning, not matching words.

EVIDENCE STANDARD
1. A confirmed overlap requires meaningful evidence that two functions explicitly claim materially the same accountability. A department name, job title, or what a function would normally own is not enough.
2. If only one side is explicit, label it as a boundary clarification only when important. Do not call it a confirmed overlap.
3. A confirmed gap requires a responsibility that is demonstrably needed for BDC and no reasonable owner across the available submissions and references. Do not invent a responsibility from generic best practice and call it a gap.
4. Respect explicit Does Not Own boundaries and user comments.
5. Do not create weak, theoretical, or cosmetic findings.
6. If evidence is insufficient, say so briefly instead of guessing.
7. Separate functional architecture problems from optional process improvement suggestions.

RESPONSE STYLE
Keep reviews concise. Prioritize only meaningful findings. Usually 3 to 6 findings maximum.
For each finding use exactly these four short fields
Submitted
Issue
Involved
Change

Use one short heading for each finding. Add a severity word only when useful, such as High, Medium, or Low.
Do not write long background paragraphs.
Do not repeat the same issue in several categories.
If there are no material findings, say "No material issues found" and mention at most two points worth validating.

For a Full Review, compare the selected function against EVERYTHING available in the system, including prior active department submissions, saved responsibilities, approved structure, company references, saved OD rules, and relevant prior conversation context. If no selected function is provided, review all active submissions together.

STRUCTURE CHANGES
If the user states a real confirmed change to the approved reporting structure, use update_org_structure. Do not use that tool for functional responsibility changes, review recommendations, or hypothetical questions.
`.trim();

    let conversation = messages.map((m) => ({ role: m.role, content: m.content }));
    let data = await callClaude(systemPrompt, conversation);

    let guard = 0;
    while (data.stop_reason === 'tool_use' && guard < 3) {
      guard += 1;
      const toolUseBlock = data.content?.find((b) => b.type === 'tool_use');
      if (!toolUseBlock) break;
      const result = await executeStructureTool(toolUseBlock.input);
      conversation = [
        ...conversation,
        { role: 'assistant', content: data.content },
        {
          role: 'user',
          content: [{ type: 'tool_result', tool_use_id: toolUseBlock.id, content: JSON.stringify(result) }],
        },
      ];
      data = await callClaude(systemPrompt, conversation);
    }

    const textBlock = data.content?.find((b) => b.type === 'text');
    const replyText = textBlock?.text || data.error?.message || '(No reply returned.)';

    await supabase.from('chat_messages').insert({ role: 'assistant', content: replyText });
    return res.status(200).json({ reply: replyText });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
