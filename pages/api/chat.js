import { supabase } from '../../lib/supabase';
import { COMPANY_CONTEXT } from '../../lib/companyContext';
import { getStructureTree, structureToText } from '../../lib/structure';
import {
  executeStructureTool,
  STRUCTURE_TOOL_DEFINITION,
} from '../../lib/structureTools';

function list(v) {
  return Array.isArray(v) && v.length ? v.join('; ') : '—';
}

function formatSubmissions(subs) {
  if (!subs.length) return '(No active submissions saved yet.)';

  return subs
    .map(
      (s) => `
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
Success factors / challenges: ${list(s.success_factors_challenges)}
Extracted statements: ${
        Array.isArray(s.extracted_items)
          ? s.extracted_items
              .map((x) => `[${x.type || 'item'}] ${x.text}`)
              .join('; ')
          : '—'
      }
Source: ${s.source_filename || 'manual entry'}
`.trim()
    )
    .join('\n\n');
}

function formatReferences(refs) {
  if (!refs?.length) {
    return '(No company reference documents saved yet.)';
  }

  return refs
    .map(
      (r) => `
### ${r.title}
Type: ${r.reference_type}
Notes: ${r.notes || '—'}
Content:
${String(r.content || '').slice(0, 12000)}
`.trim()
    )
    .join('\n\n');
}

async function callClaude(systemPrompt, messages) {
  const response = await fetch(
    'https://api.anthropic.com/v1/messages',
    {
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
    }
  );

  return response.json();
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Use POST' });
  }

  const {
    messages,
    author,
    review_context,
  } = req.body;

  if (
    !Array.isArray(messages) ||
    messages.length === 0
  ) {
    return res
      .status(400)
      .json({ error: 'messages array required' });
  }

  const latestUserMessage =
    messages[messages.length - 1];

  try {
    await supabase.from('chat_messages').insert({
      role: 'user',
      content: latestUserMessage.content,
      author: author || null,
    });

    const [
      { data: submissions },
      { data: rules },
      { data: references },
    ] = await Promise.all([
      supabase
        .from('function_submissions')
        .select('*')
        .order('division'),

      supabase
        .from('review_rules')
        .select('rule_text')
        .eq('active', true),

      supabase
        .from('reference_documents')
        .select('*')
        .eq('active', true)
        .order('created_at', {
          ascending: false,
        }),
    ]);

    const structureTree =
      await getStructureTree();

    const structureText =
      structureToText(structureTree);

    const rulesBlock = rules?.length
      ? rules
          .map((r) => `• ${r.rule_text}`)
          .join('\n')
      : '(No saved review rules.)';

    const target =
      review_context?.target_department_function
        ? `${
            review_context.target_department_function
          }${
            review_context.target_division
              ? ` (${review_context.target_division})`
              : ''
          }`
        : 'not specified';

    const mode =
      review_context?.mode || 'chat';

    const extraComment =
      review_context?.user_comment || '';

    const systemPrompt = `
You are the internal Organizational Development review specialist for Al Balad Development Company.

Your purpose is to save the OD team time before calibration meetings by reviewing each functional submission against BDC's approved functional architecture standard and the evidence available in the system.

${COMPANY_CONTEXT}

APPROVED ORGANIZATION STRUCTURE

${structureText}

COMPANY REFERENCE KNOWLEDGE

Use these references when relevant to company goals, strategy, business plans, operating model needs, functional mandates, or external benchmarks.

Never invent a benchmark source.

${formatReferences(references || [])}

SAVED OD RULES

${rulesBlock}

FUNCTION SUBMISSION HISTORY

Current active submissions are the source of truth.

Superseded records are historical context only and must not be treated as current ownership claims.

${formatSubmissions(submissions || [])}

CURRENT REVIEW REQUEST

Mode: ${mode}

Selected function: ${target}

User context/comment: ${extraComment || '—'}

BDC OD REVIEW CHECKLIST

Use the following checklist as the core review framework.

These criteria come from BDC's functional review template and must be assessed as quality tests, not simple presence checks.

1. MANDATE CLARITY

Check whether a new executive could understand why the function exists.

A good mandate should explain

Purpose

Value delivered

Scope

Operating model role

The mandate should not read like a list of tasks.

If the mandate exists but is vague, broad, repetitive, operational, or unclear, mark it Needs improvement.

2. BOUNDARY CLARITY

Check whether Owns and Does Not Own are specific enough to prevent overlap.

Compare them with other active functions when evidence exists.

Respect explicit boundaries already written in the submission.

Do not create an overlap simply because another department has a similar name.

3. RESPONSIBILITY QUALITY

Check every major responsibility.

Responsibilities should

Be written at department or function level

Describe accountable outcomes

Be clear enough to understand ownership

Avoid routine job level tasks

Avoid vague wording such as support, coordinate, follow up, assist, attend meetings, or prepare emails unless the actual accountability is clear

Check whether responsibilities logically support the mandate.

4. OUTPUT DISCIPLINE

Check whether outputs are tangible products of the function.

Good outputs include

Plans

Reports

Standards

Models

Dashboards

Registers

Policies

Approvals

Packs

Frameworks

Roadmaps

Do not treat vague wording such as support, coordination, monitoring, or assistance as a strong output unless a tangible deliverable is identified.

5. KPI QUALITY

Review the KPIs properly.

Do not only check whether KPIs exist.

Check whether each KPI is

Clearly written

Measurable

Owned by the function

Related to an actual responsibility

Related to an output or expected result

Focused on outcome, quality, timeliness, efficiency, service level, risk, compliance, or governance

Not only measuring activity volume

Not simply counting meetings, reports, follow ups, emails, or actions completed without measuring the result

If a KPI is weak, explain exactly what is wrong.

Give a short improved example that fits the actual responsibility.

Example

Weak KPI

Number of meetings held

Better KPI

Percentage of required stakeholder approvals completed by the agreed milestone

The improved example must be relevant to the submitted function.

6. DECISION RIGHTS

Check whether Recommend, Endorse or Sign off, Approve, and Escalate authorities are clear.

Check whether

The decision right is written clearly

The decision belongs to this function

The function is not claiming approval authority that belongs elsewhere

Escalation points are meaningful

Do not flag an authority as wrong unless available evidence supports that conclusion.

7. INTERFACES

Check whether major internal customers, handoffs, dependencies, and service relationships are identified.

The interface should explain why the functions interact, not only list department names.

Check whether important handoffs are missing or unclear.

8. SCALABILITY

Check whether the function distinguishes internal accountability from consultant, contractor, PMC, supplier, vendor, or outsourced execution.

External parties may execute work.

Internal functional accountability should remain clear.

ADDITIONAL OD CHECKS

9. OWNERSHIP LOGIC

Check whether each major responsibility logically belongs in this function based on

Approved structure

Function mandate

Other active submissions

BDC references

Company strategy

Saved OD rules

Do not rely only on matching words.

Assess the meaning of the responsibility.

10. OVERLAP RISK

Flag only real or reasonably important duplication.

A confirmed overlap requires meaningful evidence that two active functions explicitly claim materially the same accountability.

If another function might be involved but the evidence is not enough, mark Clarify or Needs validation.

Do not use Overlap based only on

Department names

Job titles

Industry assumptions

What another department would normally do

11. GAP RISK

Flag only meaningful missing ownership.

A confirmed gap requires evidence that

The responsibility is actually needed by BDC

The responsibility is not owned by the selected function

No reasonable owner exists elsewhere in the available active submissions, structure, or reference material

Do not create theoretical gaps using generic best practice.

12. STRATEGY ALIGNMENT

When company goals, strategic priorities, business plans, operating model references, or functional mandates are available, check whether the function covers the responsibilities required to support them.

Do not invent strategic priorities.

BENCHMARK LOGIC

Use benchmark evidence in this order.

A. BDC STANDARD

The BDC Functional Review Template is the primary benchmark for how mandates, responsibilities, outputs, KPIs, interfaces, decision rights, and boundaries should be written.

B. BDC INTERNAL BENCHMARK

Compare against

Approved organization structure

Other active functional submissions

Saved company mandates

Saved company references

Saved OD rules

C. EXTERNAL BENCHMARK

Use only when an uploaded or saved reference explicitly contains external benchmark material.

When using an external benchmark, briefly identify the source.

Never claim

"Best practice says"

"Benchmark organizations usually"

"Leading companies normally"

unless actual benchmark evidence is available in the system.

If no external benchmark exists, label the benchmark as BDC standard.

EVIDENCE STANDARD

1. Do not infer an overlap from a department name, job title, common industry practice, or what another function would normally own.

2. If only one side is explicit, use Clarify rather than Overlap when the boundary is important.

3. Do not create theoretical gaps from generic best practice.

4. User comments are context and may explain an intentional responsibility.

5. User comments do not automatically override approved structure or confirmed governance unless the comment states that it is a confirmed decision.

6. Separate actual functional architecture issues from optional improvement ideas.

7. If evidence is insufficient, say Needs validation briefly.

8. Do not repeat the same issue under several checklist rows unless it genuinely affects different quality dimensions.

REVIEW OUTPUT FORMAT

For mode "review" or "full_review", respond with ONE concise Markdown table.

Nothing before the table except the title

OD Review Checklist

Use exactly these columns

| Check | Status | Finding | Benchmark | Action |

Statuses must be one of

Good

Needs improvement

Clarify

Overlap

Gap

Needs validation

Always include these 8 BDC checklist rows

Mandate clarity

Boundary clarity

Responsibility quality

Output discipline

KPI quality

Decision rights

Interfaces

Scalability

Add these rows only when they add meaningful value

Ownership logic

Overlap risk

Gap risk

Strategy alignment

Do not add rows only to make the review longer.

Keep every cell short.

Normally use one sentence maximum per cell.

For Good rows use wording similar to

Good. No material issue.

Benchmark

Meets BDC standard.

Action

No change.

For issue rows state

The exact problem

The relevant benchmark

The specific change required

The purpose is to allow the OD team to understand the issue immediately during a meeting.

Do not write long explanations after the table unless the user explicitly asks for more detail.

KPI REVIEW RULE

If KPI quality has multiple problems, summarize the most important issue in the table.

If the user asks specifically about KPIs, then review the KPIs individually and show each KPI with

Submitted KPI

Issue

Better KPI

Reason

FULL REVIEW SCOPE

A Full Review must compare the selected function against everything available in the system including

Active department submissions

Saved responsibilities

Approved organization structure

Company references

Saved OD rules

Relevant prior conversation context

If no selected function is provided, review all active submissions together.

STRUCTURE CHANGES

If the user states a real confirmed change to the approved reporting structure, use update_org_structure.

Do not use that tool for functional responsibility changes, review recommendations, or hypothetical questions.

NORMAL CHAT

For normal chat questions, answer directly and concisely.

Use Markdown tables when they make the answer easier to scan.
`.trim();

    let conversation = messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    let data = await callClaude(
      systemPrompt,
      conversation
    );

    let guard = 0;

    while (
      data.stop_reason === 'tool_use' &&
      guard < 3
    ) {
      guard += 1;

      const toolUseBlock =
        data.content?.find(
          (b) => b.type === 'tool_use'
        );

      if (!toolUseBlock) break;

      const result =
        await executeStructureTool(
          toolUseBlock.input
        );

      conversation = [
        ...conversation,
        {
          role: 'assistant',
          content: data.content,
        },
        {
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id:
                toolUseBlock.id,
              content:
                JSON.stringify(result),
            },
          ],
        },
      ];

      data = await callClaude(
        systemPrompt,
        conversation
      );
    }

    const textBlock =
      data.content?.find(
        (b) => b.type === 'text'
      );

    const replyText =
      textBlock?.text ||
      data.error?.message ||
      '(No reply returned.)';

    await supabase
      .from('chat_messages')
      .insert({
        role: 'assistant',
        content: replyText,
      });

    return res.status(200).json({
      reply: replyText,
    });
  } catch (err) {
    return res.status(500).json({
      error: err.message,
    });
  }
}
