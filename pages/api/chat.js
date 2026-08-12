import { supabase } from '../../lib/supabase';
import { COMPANY_CONTEXT } from '../../lib/companyContext';

import {
  getStructureTree,
  structureToText,
} from '../../lib/structure';

import {
  executeStructureTool,
  STRUCTURE_TOOL_DEFINITION,
} from '../../lib/structureTools';

const REVIEW_MODEL = 'claude-sonnet-4-6';
const CHAT_MODEL = 'claude-haiku-4-5';

function list(value) {
  return Array.isArray(value) && value.length
    ? value.join('; ')
    : '—';
}

function clean(value) {
  return String(value || '').trim();
}

function sameText(a, b) {
  return clean(a).toLowerCase() === clean(b).toLowerCase();
}

function formatFullSubmission(s) {
  return `
### ${s.department_function || 'Unnamed Function'} (${s.division || 'Unknown Division'})

Mandate
${s.functional_statement || '—'}

Core responsibilities
${list(s.core_responsibilities)}

Owns
${list(s.owns)}

Does not own
${list(s.does_not_own)}

Outputs
${list(s.key_outputs)}

Interfaces
${list(s.interfaces)}

KPIs
${list(s.kpis)}

Decision authorities
${list(s.decision_authorities)}

Success factors and challenges
${list(s.success_factors_challenges)}

User comments
${s.user_comments || '—'}

Source
${s.source_filename || 'Manual entry'}
`.trim();
}

function formatCompactSubmission(s) {
  return `
${s.department_function || 'Unnamed Function'} (${s.division || 'Unknown Division'})

Mandate
${String(s.functional_statement || '—').slice(0, 700)}

Owns
${list(s.owns).slice(0, 1800)}

Main responsibilities
${list(s.core_responsibilities).slice(0, 1800)}

Does not own
${list(s.does_not_own).slice(0, 1200)}
`.trim();
}

function buildSubmissionContext({
  submissions,
  mode,
  targetFunction,
}) {
  if (!submissions?.length) {
    return '(No active submissions saved yet.)';
  }

  if (mode === 'full_review') {
    return submissions
      .map(formatFullSubmission)
      .join('\n\n');
  }

  const selected = targetFunction
    ? submissions.find((s) =>
        sameText(
          s.department_function,
          targetFunction
        )
      )
    : null;

  if (mode === 'chat') {
    if (selected) {
      return formatFullSubmission(selected);
    }

    return '(No specific function selected.)';
  }

  if (mode === 'review') {
    const sections = [];

    if (selected) {
      sections.push(`
## SELECTED FUNCTION

${formatFullSubmission(selected)}
`.trim());
    }

    const others = submissions.filter(
      (s) =>
        !selected ||
        String(s.id) !== String(selected.id)
    );

    if (others.length) {
      sections.push(`
## OTHER ACTIVE FUNCTIONS

Use this compact ownership index only to identify meaningful ownership conflicts, overlaps, gaps, or handoffs.

Do not assume anything beyond the text provided.

${others
  .map(formatCompactSubmission)
  .join('\n\n')}
`.trim());
    }

    return sections.join('\n\n');
  }

  return selected
    ? formatFullSubmission(selected)
    : '(No specific function selected.)';
}

function buildReferenceContext(
  references,
  mode
) {
  if (!references?.length) {
    return '(No company reference documents saved yet.)';
  }

  if (mode === 'chat') {
    return references
      .slice(0, 5)
      .map(
        (r) =>
          `${r.title} | ${r.reference_type}`
      )
      .join('\n');
  }

  const totalBudget =
    mode === 'full_review'
      ? 30000
      : 12000;

  let used = 0;
  const output = [];

  const priority = {
    company_goals: 1,
    strategy: 2,
    business_plan: 3,
    operating_model: 4,
    functional_mandate: 5,
    company_reference: 6,
  };

  const sorted = [
    ...references,
  ].sort(
    (a, b) =>
      (priority[a.reference_type] ||
        99) -
      (priority[b.reference_type] ||
        99)
  );

  for (const r of sorted) {
    if (used >= totalBudget) {
      break;
    }

    const remaining =
      totalBudget - used;

    const content = String(
      r.content || ''
    ).slice(
      0,
      Math.min(
        remaining,
        mode === 'full_review'
          ? 10000
          : 5000
      )
    );

    const block = `
### ${r.title}

Type
${r.reference_type || 'Reference'}

Notes
${r.notes || '—'}

Content
${content}
`.trim();

    output.push(block);
    used += block.length;
  }

  return output.join('\n\n');
}

function getTools(mode) {
  const tools = [
    STRUCTURE_TOOL_DEFINITION,
  ];

  if (
    mode === 'review' ||
    mode === 'full_review'
  ) {
    tools.push({
      type: 'web_search_20260318',
      name: 'web_search',

      max_uses:
        mode === 'full_review'
          ? 4
          : 2,

      allowed_callers: [
        'direct',
      ],

      user_location: {
        type: 'approximate',
        city: 'Jeddah',
        region: 'Makkah',
        country: 'SA',
        timezone: 'Asia/Riyadh',
      },
    });
  }

  return tools;
}

const STATIC_OD_PROMPT = `
You are the Organizational Development review specialist for Al Balad Development Company, BDC.

Your purpose is to save the OD team time before calibration meetings.

You are reviewing functional architecture.

Do not behave like a general consultant.

Do not produce long reports.

Your job is to identify the few issues that actually require OD attention.

BDC OD REVIEW PRINCIPLES

1. Review meaning, not keyword matches.

2. Do not invent responsibilities.

3. Do not infer ownership from department names or job titles.

4. Respect responsibilities explicitly excluded through Does Not Own.

5. Do not flag theoretical or weak overlaps.

6. Do not create generic best practice gaps.

7. Distinguish confirmed issues from matters that only need clarification.

8. Keep recommendations practical enough to discuss directly with a department head.

9. User comments provide important context but do not automatically override approved governance or structure.

10. The approved organization structure is evidence of reporting relationships and organizational placement. A department name alone does not prove functional ownership.

BDC OD REVIEW CHECKLIST

MANDATE CLARITY

Ask whether a new executive could understand why the function exists.

A strong mandate should explain purpose, value delivered, scope, and operating model role.

It should be written at function level and should not simply list activities or services.

BOUNDARY CLARITY

Review Owns and Does Not Own.

Check whether accountability boundaries are specific enough to prevent confusion.

Compare against other active BDC functions when evidence exists.

A confirmed overlap requires meaningful evidence that two functions explicitly claim materially the same accountability.

Do not call something an overlap because another function has a similar name.

If evidence is incomplete, use Clarify or Needs validation.

RESPONSIBILITY QUALITY

Review the major responsibilities.

A strong responsibility should be written at department or function level, describe an accountable outcome, support the mandate, make ownership understandable, and avoid individual job duties.

Avoid weak wording such as support, assist, follow up, attend meetings, or coordinate unless the actual accountability is clear.

OUTPUT DISCIPLINE

Outputs should be tangible products or deliverables such as plans, policies, reports, standards, registers, models, dashboards, frameworks, roadmaps, approvals, specifications, and packs.

Do not treat generic support or coordination as a strong output unless a tangible result is identified.

KPI QUALITY

This is a real quality assessment.

Do not only check whether KPIs exist.

Check whether each KPI is clearly written, measurable, owned by the function, connected to a responsibility, connected to an output or expected result, and focused on outcome, quality, timeliness, service level, efficiency, cost, compliance, risk, or governance.

Do not accept KPIs that merely count activity such as meetings, emails, reports, follow ups, or actions unless the count itself is a meaningful business outcome.

If a KPI is weak, explain the actual problem and recommend a better KPI that fits the function.

DECISION RIGHTS

Review Recommend, Endorse or sign off, Approve, and Escalate.

Check whether decision authority is clear and logically belongs to the function.

Do not claim an approval is incorrectly placed unless available evidence supports that conclusion.

INTERFACES

Check whether major internal customers, dependencies, and handoffs are clear.

A strong interface should make clear who interacts, why they interact, what is provided or received, and where accountability transfers.

A list of department names without the nature of the relationship is not sufficient.

SCALABILITY

Check whether internal accountability is separated from external execution.

External parties may include consultants, contractors, PMCs, operators, service providers, vendors, and suppliers.

The external party may execute the work while BDC retains accountability.

ADDITIONAL OD CHECKS

OWNERSHIP LOGIC

Determine whether responsibilities logically belong in the function using approved organization structure, function mandate, other active BDC submissions, company references, business context, and market evidence when relevant.

Do not rely on keyword similarity.

OVERLAP RISK

Flag only meaningful duplication.

Use Overlap only when there is strong evidence that two functions claim materially the same accountability.

If both functions are involved but their roles may reasonably differ, use Clarify.

Do not say another department likely owns something and then call it an overlap.

GAP RISK

Flag only meaningful responsibilities that BDC appears to require but that have no clear owner.

Before calling something a Gap, check other active functions, company references, approved structure, and relevant market evidence.

Do not introduce a generic best practice responsibility and immediately label it a gap.

STRATEGY ALIGNMENT

When company goals, strategy, business plan, operating model, or mandates are available, determine whether the function supports those requirements.

Do not invent BDC strategic priorities.

MARKET BENCHMARKING

For Review and Full Review, use live web search when useful.

The purpose of the benchmark is not to find identical wording.

The purpose is to understand how credible comparable organizations handle the same type of accountability.

PEER SELECTION

Choose peers based on the function being reviewed.

Relevant peer categories may include Saudi real estate developers, master developers, destination developers, heritage destination developers, mixed use developers, tourism destination developers, large PIF portfolio companies where relevant, and property or asset management organizations where relevant.

Potential peers may include Diriyah Company, Red Sea Global, ROSHN Group, Qiddiya, New Murabba, Rua Al Madinah, and Jeddah Central Development Company.

Do not force these organizations into every review.

SOURCE QUALITY

Prefer official company websites, official annual reports, official governance documents, official organizational information, government sources, regulators, PIF sources, professional bodies, credible research organizations, and major consulting firms when directly relevant.

Avoid weak blogs, generic SEO content, and unattributed claims.

MARKET EVIDENCE RULES

Never invent market practice.

Do not say Best practice says, Leading organizations do, or Market benchmark is unless the evidence actually supports the statement.

If evidence is limited, say Market evidence limited.

Do not copy another company's structure blindly.

SEARCH EFFICIENCY

Do not search separately for every checklist row.

Use a small number of focused searches.

For a normal Review, normally use one or two searches.

For a Full Review, use broader research only where it adds value.

Do not spend searches proving obvious points.

OUTPUT FORMAT

For review or full_review return only

## OD Review Checklist

Then one Markdown table.

Use exactly these columns

| Check | Status | Finding | Market Benchmark | Action |

Always include

Mandate clarity

Boundary clarity

Responsibility quality

Output discipline

KPI quality

Decision rights

Interfaces

Scalability

Only add these when meaningful

Ownership logic

Overlap risk

Gap risk

Strategy alignment

Allowed statuses

Good

Needs improvement

Clarify

Overlap

Gap

Needs validation

KEEP THE OUTPUT SHORT

One short sentence per cell whenever possible.

Do not write paragraphs inside table cells.

Do not explain obvious Good findings.

For a Good row use

Finding

Good. No material issue.

Market Benchmark

Consistent with observed practice.

Action

No change.

When there is an issue, state exactly what is wrong, what credible comparable practice suggests, and exactly what should change.

MARKET SOURCES

When a market benchmark affects a finding, include one strong source link inside the Market Benchmark cell.

Do not create a separate long source list.

If market research did not materially affect a Good finding, do not waste tokens adding unnecessary citations.

NORMAL CHAT

For normal chat, answer directly and briefly.

Do not automatically run the checklist.

Do not perform web searches unless the request is sent as Review or Full Review.
`.trim();

async function callClaude({
  dynamicContext,
  messages,
  mode,
}) {
  const isReview =
    mode === 'review';

  const isFullReview =
    mode === 'full_review';

  const model =
    isReview || isFullReview
      ? REVIEW_MODEL
      : CHAT_MODEL;

  const maxTokens =
    isFullReview
      ? 1800
      : isReview
      ? 1400
      : 650;

  const effort =
    isFullReview
      ? 'medium'
      : 'low';

  const response = await fetch(
    'https://api.anthropic.com/v1/messages',
    {
      method: 'POST',

      headers: {
        'x-api-key':
          process.env.ANTHROPIC_API_KEY,

        'anthropic-version':
          '2023-06-01',

        'content-type':
          'application/json',
      },

      body: JSON.stringify({
        model,

        max_tokens: maxTokens,

        output_config: {
          effort,
        },

        cache_control: {
          type: 'ephemeral',
        },

        system: [
          {
            type: 'text',
            text: STATIC_OD_PROMPT,

            cache_control: {
              type: 'ephemeral',
            },
          },

          {
            type: 'text',
            text: dynamicContext,
          },
        ],

        tools: getTools(mode),

        messages,
      }),
    }
  );

  const data =
    await response.json();

  if (!response.ok) {
    throw new Error(
      data?.error?.message ||
        'Anthropic request failed'
    );
  }

  return data;
}

function escapeMarkdownLabel(
  value
) {
  return String(value || '')
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]');
}

function renderClaudeContent(
  content
) {
  if (!Array.isArray(content)) {
    return '';
  }

  const output = [];

  for (const block of content) {
    if (
      block.type !== 'text' ||
      !block.text
    ) {
      continue;
    }

    let text = block.text;

    if (
      Array.isArray(
        block.citations
      ) &&
      block.citations.length
    ) {
      const uniqueSources = [];

      for (
        const citation
        of block.citations
      ) {
        if (
          citation.type !==
            'web_search_result_location' ||
          !citation.url
        ) {
          continue;
        }

        const alreadyAdded =
          uniqueSources.some(
            (source) =>
              source.url ===
              citation.url
          );

        if (!alreadyAdded) {
          uniqueSources.push({
            title:
              citation.title ||
              'Source',

            url:
              citation.url,
          });
        }
      }

      if (
        uniqueSources.length
      ) {
        const links =
          uniqueSources
            .slice(0, 2)
            .map(
              (source) =>
                `[${escapeMarkdownLabel(
                  source.title
                )}](${source.url})`
            )
            .join(' · ');

        text += ` ${links}`;
      }
    }

    output.push(text);
  }

  return output.join('');
}

export default async function handler(
  req,
  res
) {
  if (req.method !== 'POST') {
    return res
      .status(405)
      .json({
        error: 'Use POST',
      });
  }

  const {
    messages,
    author,
    review_context,
  } = req.body;

  if (
    !Array.isArray(messages) ||
    !messages.length
  ) {
    return res
      .status(400)
      .json({
        error:
          'messages array required',
      });
  }

  const mode =
    review_context?.mode ||
    'chat';

  const targetFunction =
    review_context
      ?.target_department_function ||
    '';

  const targetDivision =
    review_context
      ?.target_division ||
    '';

  const userContext =
    review_context
      ?.user_comment ||
    '';

  const latestUserMessage =
    messages[
      messages.length - 1
    ];

  try {
    await supabase
      .from('chat_messages')
      .insert({
        role: 'user',

        content:
          latestUserMessage.content,

        author:
          author || null,
      });

    const [
      submissionsResult,
      rulesResult,
      referencesResult,
    ] = await Promise.all([
      supabase
        .from(
          'function_submissions'
        )
        .select('*')
        .order('division'),

      supabase
        .from('review_rules')
        .select('rule_text')
        .eq('active', true),

      supabase
        .from(
          'reference_documents'
        )
        .select('*')
        .eq('active', true)
        .order('created_at', {
          ascending: false,
        }),
    ]);

    const submissions =
      submissionsResult.data ||
      [];

    const rules =
      rulesResult.data ||
      [];

    const references =
      referencesResult.data ||
      [];

    const structureTree =
      await getStructureTree();

    const structureText =
      structureToText(
        structureTree
      );

    const submissionContext =
      buildSubmissionContext({
        submissions,
        mode,
        targetFunction,
      });

    const referenceContext =
      buildReferenceContext(
        references,
        mode
      );

    const rulesBlock =
      rules.length
        ? rules
            .map(
              (r) =>
                `• ${r.rule_text}`
            )
            .join('\n')
        : '(No saved OD rules.)';

    const dynamicContext = `
BDC BUSINESS CONTEXT

${COMPANY_CONTEXT}

APPROVED BDC ORGANIZATION STRUCTURE

${structureText}

CURRENT REQUEST

Mode
${mode}

Selected function
${targetFunction || 'Not specified'}

Selected division
${targetDivision || 'Not specified'}

User comment or context
${userContext || '—'}

SAVED OD RULES

${rulesBlock}

COMPANY REFERENCES

${referenceContext}

FUNCTION SUBMISSION CONTEXT

${submissionContext}
`.trim();

    const historyLimit =
      mode === 'chat'
        ? 6
        : 2;

    const recentMessages =
      messages.slice(
        -historyLimit
      );

    let conversation =
      recentMessages.map(
        (m) => ({
          role: m.role,
          content: m.content,
        })
      );

    let data =
      await callClaude({
        dynamicContext,
        messages:
          conversation,
        mode,
      });

    let guard = 0;

    while (
      guard < 5 &&
      (
        data.stop_reason ===
          'tool_use' ||
        data.stop_reason ===
          'pause_turn'
      )
    ) {
      guard += 1;

      if (
        data.stop_reason ===
        'pause_turn'
      ) {
        conversation = [
          ...conversation,

          {
            role:
              'assistant',

            content:
              data.content,
          },
        ];

        data =
          await callClaude({
            dynamicContext,

            messages:
              conversation,

            mode,
          });

        continue;
      }

      const customToolBlocks =
        data.content?.filter(
          (block) =>
            block.type ===
              'tool_use' &&
            block.name !==
              'web_search'
        ) || [];

      if (
        !customToolBlocks.length
      ) {
        break;
      }

      const toolResults = [];

      for (
        const toolBlock
        of customToolBlocks
      ) {
        try {
          const result =
            await executeStructureTool(
              toolBlock.input
            );

          toolResults.push({
            type:
              'tool_result',

            tool_use_id:
              toolBlock.id,

            content:
              JSON.stringify(
                result
              ),
          });
        } catch (error) {
          toolResults.push({
            type:
              'tool_result',

            tool_use_id:
              toolBlock.id,

            is_error:
              true,

            content:
              error.message,
          });
        }
      }

      conversation = [
        ...conversation,

        {
          role:
            'assistant',

          content:
            data.content,
        },

        {
          role:
            'user',

          content:
            toolResults,
        },
      ];

      data =
        await callClaude({
          dynamicContext,

          messages:
            conversation,

          mode,
        });
    }

    let replyText =
      renderClaudeContent(
        data.content
      );

    if (!replyText.trim()) {
      replyText =
        data.error?.message ||
        'No response returned.';
    }

    await supabase
      .from('chat_messages')
      .insert({
        role:
          'assistant',

        content:
          replyText,
      });

    return res
      .status(200)
      .json({
        reply:
          replyText,

        usage: {
          model:
            data.model ||
            null,

          input_tokens:
            data.usage
              ?.input_tokens ||
            0,

          output_tokens:
            data.usage
              ?.output_tokens ||
            0,

          cache_creation_input_tokens:
            data.usage
              ?.cache_creation_input_tokens ||
            0,

          cache_read_input_tokens:
            data.usage
              ?.cache_read_input_tokens ||
            0,

          web_searches:
            data.usage
              ?.server_tool_use
              ?.web_search_requests ||
            0,
        },
      });
  } catch (error) {
    console.error(
      'CHAT API ERROR',
      error
    );

    return res
      .status(500)
      .json({
        error:
          error.message ||
          'Review failed',
      });
  }
}
