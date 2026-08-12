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

function list(value) {
  return Array.isArray(value) && value.length
    ? value.join('; ')
    : '—';
}

function formatSubmissions(submissions) {
  if (!submissions?.length) {
    return '(No active submissions saved yet.)';
  }

  return submissions
    .map(
      (s) => `
### ${s.department_function} (${s.division})

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
`.trim()
    )
    .join('\n\n');
}

function formatReferences(references) {
  if (!references?.length) {
    return '(No company reference documents saved yet.)';
  }

  return references
    .map(
      (r) => `
### ${r.title}

Type
${r.reference_type || 'Reference'}

Notes
${r.notes || '—'}

Content
${String(r.content || '').slice(0, 14000)}
`.trim()
    )
    .join('\n\n');
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
          ? 8
          : 5,

      allowed_callers: [
        'direct',
      ],

      user_location: {
        type: 'approximate',
        city: 'Jeddah',
        region: 'Makkah',
        country: 'SA',
        timezone:
          'Asia/Riyadh',
      },
    });
  }

  return tools;
}

async function callClaude(
  systemPrompt,
  messages,
  mode
) {
  const response = await fetch(
    'https://api.anthropic.com/v1/messages',
    {
      method: 'POST',

      headers: {
        'x-api-key':
          process.env
            .ANTHROPIC_API_KEY,

        'anthropic-version':
          '2023-06-01',

        'content-type':
          'application/json',
      },

      body: JSON.stringify({
        model:
          'claude-sonnet-4-6',

        max_tokens: 2600,

        system: systemPrompt,

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

/*
  Claude web search returns citations as metadata
  attached to text blocks.

  This converts those citations into normal
  Markdown links so react-markdown in index.js
  can display clickable sources.
*/
function renderClaudeContent(content) {
  if (!Array.isArray(content)) {
    return '';
  }

  const parts = [];

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
      const unique = [];

      for (const citation of block.citations) {
        if (
          citation.type !==
            'web_search_result_location' ||
          !citation.url
        ) {
          continue;
        }

        const exists =
          unique.some(
            (x) =>
              x.url ===
              citation.url
          );

        if (!exists) {
          unique.push({
            title:
              citation.title ||
              'Source',

            url: citation.url,
          });
        }
      }

      if (unique.length) {
        const sourceLinks =
          unique
            .map(
              (source) =>
                `[${escapeMarkdownLabel(
                  source.title
                )}](${source.url})`
            )
            .join(' · ');

        /*
          No forced newline here because the text
          may be inside a Markdown table cell.
        */
        text += ` ${sourceLinks}`;
      }
    }

    parts.push(text);
  }

  return parts.join('');
}

function escapeMarkdownLabel(value) {
  return String(value || '')
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]');
}

function hasWebSearchError(
  content
) {
  if (!Array.isArray(content)) {
    return false;
  }

  return content.some(
    (block) =>
      block.type ===
        'web_search_tool_result' &&
      block.content &&
      !Array.isArray(
        block.content
      ) &&
      block.content.type ===
        'web_search_tool_result_error'
  );
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

  const latestUserMessage =
    messages[
      messages.length - 1
    ];

  const mode =
    review_context?.mode ||
    'chat';

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
      submissionsResult.data || [];

    const rules =
      rulesResult.data || [];

    const references =
      referencesResult.data ||
      [];

    const structureTree =
      await getStructureTree();

    const structureText =
      structureToText(
        structureTree
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

    const target =
      review_context
        ?.target_department_function
        ? `${
            review_context
              .target_department_function
          }${
            review_context
              ?.target_division
              ? ` (${review_context.target_division})`
              : ''
          }`
        : 'Not specified';

    const userContext =
      review_context
        ?.user_comment || '—';

    const systemPrompt = `
You are the Organizational Development review specialist for Al Balad Development Company, BDC.

Your job is to save the OD team time before meetings with departments.

You review submitted functional architecture and identify only issues that matter.

Do not behave like a general chatbot.

Do not produce long consulting reports.

${COMPANY_CONTEXT}

APPROVED BDC ORGANIZATION STRUCTURE

${structureText}

SAVED BDC COMPANY REFERENCES

${formatReferences(
  references
)}

SAVED OD RULES

${rulesBlock}

ACTIVE FUNCTION SUBMISSIONS

${formatSubmissions(
  submissions
)}

CURRENT REQUEST

Review mode
${mode}

Selected function
${target}

User comment or context
${userContext}


BDC OD REVIEW CHECKLIST


1. MANDATE CLARITY

Ask

Would a new executive understand why this function exists?

Check whether the mandate explains

Purpose

Value delivered

Scope

Operating model role

Check whether it is written at function level.

Do not accept a list of services or activities as a strong mandate.

If the mandate is unclear, explain exactly what is missing.


2. BOUNDARY CLARITY

Check whether Owns and Does Not Own clearly separate the function from other departments.

Use actual BDC submissions and approved structure.

Do not infer an overlap from similar department names.

Do not assume what another department owns.

A real overlap requires meaningful evidence that both functions claim materially the same accountability.

If there is a possible issue but evidence is incomplete, use Clarify or Needs validation.


3. RESPONSIBILITY QUALITY

Check the major responsibilities individually in your reasoning.

A good responsibility should

Be at department or function level

Describe an accountable outcome

Be understandable

Support the mandate

Make ownership reasonably clear

Avoid routine job tasks

Avoid empty wording such as

Support

Assist

Follow up

Attend meetings

Coordinate

unless the real accountability is also stated.


4. OUTPUT DISCIPLINE

Check whether outputs are tangible.

Examples include

Plans

Policies

Reports

Standards

Registers

Models

Dashboards

Frameworks

Roadmaps

Approvals

Packs

Specifications

Do not accept vague concepts such as support or coordination as strong outputs by themselves.


5. KPI QUALITY

This is a quality review, not a presence check.

Review whether KPIs are

Written properly

Measurable

Owned by the function

Related to a responsibility

Related to an expected result or output

Focused on outcome, quality, timeliness, service, cost, risk, compliance, efficiency or governance

Not simply activity counts

Weak examples include

Number of meetings

Number of reports

Number of emails

Number of follow ups

Number of actions

unless the number itself represents a meaningful business outcome.

When a KPI is weak, explain what is wrong and recommend a better KPI relevant to the function.


6. DECISION RIGHTS

Check

Recommend

Endorse or sign off

Approve

Escalate

Assess whether the authority is clear and logically belongs to the function.

Do not claim an approval is wrong without supporting evidence.


7. INTERFACES

Check whether the important internal customers and handoffs are identified.

A strong interface explains

Who

Why they interact

What is provided

What is received

Where the handoff occurs

Do not accept only a list of department names as a complete interface description.


8. SCALABILITY

Check whether the submission separates internal ownership from external execution.

This includes

Consultants

Contractors

PMCs

Service providers

Vendors

Operators

Suppliers

The function may remain accountable even when external parties execute the work.


ADDITIONAL OD TESTS


9. OWNERSHIP LOGIC

Ask whether the responsibility logically belongs in this function.

Use

Approved BDC structure

Mandate

Other BDC submissions

Company references

Market evidence

Nature of BDC's business

Do not use keyword matching alone.


10. OVERLAP RISK

Flag only meaningful duplication.

Confirmed overlap means two functions explicitly claim materially the same accountability.

If evidence is weaker, use Clarify.

Never say a department "likely owns" something and call that a confirmed overlap.


11. GAP RISK

Flag only meaningful responsibilities required by BDC that appear to have no clear owner.

Before calling something a Gap

Check other submissions

Check approved structure

Check BDC references

Check relevant market evidence

Do not invent generic theoretical gaps.


12. STRATEGY ALIGNMENT

When BDC strategy, business plan, goals or operating model information is available, check whether the function supports those needs.

Do not invent company strategy.


MARKET BENCHMARKING

This is important.

For Review and Full Review, use live web search to benchmark the function against relevant market practice.

Do not benchmark only against the BDC template.

Your objective is to answer

How do credible comparable organizations structure or manage this type of responsibility?

What does strong market practice look like?

Is BDC's submitted ownership materially different?

Would the market evidence suggest a clearer or stronger way to write the responsibility, mandate, KPI, interface, output or boundary?


PEER SELECTION

Choose peers based on the function being reviewed.

Prioritize organizations that are reasonably comparable to BDC such as

Saudi real estate developers

Master developers

Destination developers

Heritage and cultural destination developers

Mixed use developers

Large PIF portfolio companies where relevant

Property and asset management organizations where relevant

Tourism destination developers where relevant

For some reviews, relevant peers may include organizations such as

Diriyah Company

Red Sea Global

ROSHN Group

New Murabba

Qiddiya

Rua Al Madinah

Jeddah Central Development Company

Other credible comparable developers

Do not force these companies into every benchmark.

Choose sources relevant to the responsibility being reviewed.


MARKET SOURCES

Prefer

Official company websites

Official annual reports

Governance documents

Published organizational material

Official job or function descriptions when they provide useful evidence

Government or regulator sources

PIF portfolio information

Recognized professional bodies

Credible research organizations

Major consulting firms where relevant

Avoid weak blogs, SEO websites and unattributed content.


BENCHMARK EVIDENCE RULES

Never invent a market practice.

Never claim

Best practice says

Leading companies do

Market benchmark is

unless web evidence actually supports it.

If market evidence is weak or unavailable, say

Market evidence limited

Do not create a fake benchmark.

Benchmark actual practices and operating models, not just wording.

Do not copy another company's structure blindly.

Use market information as evidence to judge what makes sense for BDC.


WEB SEARCH BEHAVIOR

For a normal Review

Search only enough to establish useful market evidence.

Normally use 2 to 4 focused searches.

Do not research every checklist row separately.

For a Full Review

Perform broader market research when useful.

Compare multiple credible peers.

Look for functional ownership, responsibilities, operating model practices, boundaries and KPI approaches relevant to the selected function.

Do not waste searches on facts that do not affect the OD conclusion.


OUTPUT FORMAT

For review or full_review, return only

## OD Review Checklist

Then one Markdown table.

Use exactly these columns

| Check | Status | Finding | Market Benchmark | Action |

Always show these rows

Mandate clarity

Boundary clarity

Responsibility quality

Output discipline

KPI quality

Decision rights

Interfaces

Scalability

Add these only when they contain a meaningful issue or insight

Ownership logic

Overlap risk

Gap risk

Strategy alignment


ALLOWED STATUS

Good

Needs improvement

Clarify

Overlap

Gap

Needs validation


KEEP IT SHORT

This is critical.

Each cell should normally contain one short sentence.

Do not write paragraphs inside table cells.

Good rows should be very short.

Example

Finding
Good. No material issue.

Market Benchmark
Consistent with observed peer practice.

Action
No change.


FOR A PROBLEM

Finding

State exactly what is wrong.

Market Benchmark

State briefly what credible peers or market sources do differently.

Include the source link where market research supports the finding.

Action

State exactly what should change.


SOURCE RULE

For market benchmark claims, include the relevant clickable source in the Market Benchmark cell.

Do not add a long sources section after the table.

One or two strong sources are better than many weak sources.


FULL REVIEW

A Full Review must consider

Selected submission

All active BDC submissions

Approved organization structure

Saved company references

Saved OD rules

Relevant previous review information

Live market benchmark research


NORMAL CHAT

For ordinary questions, answer concisely.

Do not automatically run a full checklist unless asked.
`.trim();

    let conversation =
      messages.map((m) => ({
        role: m.role,
        content: m.content,
      }));

    let data =
      await callClaude(
        systemPrompt,
        conversation,
        mode
      );

    /*
      Handle both

      1. Our custom org structure tool
      2. Anthropic pause_turn from longer web searches
    */
    let guard = 0;

    while (
      guard < 6 &&
      (data.stop_reason ===
        'tool_use' ||
        data.stop_reason ===
          'pause_turn')
    ) {
      guard += 1;

      if (
        data.stop_reason ===
        'pause_turn'
      ) {
        /*
          Anthropic requires the paused
          assistant content to be passed back
          unchanged.
        */
        conversation = [
          ...conversation,
          {
            role: 'assistant',
            content:
              data.content,
          },
        ];

        data =
          await callClaude(
            systemPrompt,
            conversation,
            mode
          );

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

      for (const toolBlock of customToolBlocks) {
        try {
          const result =
            await executeStructureTool(
              toolBlock.input
            );

          toolResults.push({
            type: 'tool_result',
            tool_use_id:
              toolBlock.id,
            content:
              JSON.stringify(
                result
              ),
          });
        } catch (error) {
          toolResults.push({
            type: 'tool_result',
            tool_use_id:
              toolBlock.id,
            is_error: true,
            content:
              error.message,
          });
        }
      }

      conversation = [
        ...conversation,

        {
          role: 'assistant',
          content:
            data.content,
        },

        {
          role: 'user',
          content:
            toolResults,
        },
      ];

      data =
        await callClaude(
          systemPrompt,
          conversation,
          mode
        );
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

    /*
      If web search failed, do not let the
      answer pretend it completed a live benchmark.
    */
    if (
      hasWebSearchError(
        data.content
      ) &&
      (mode === 'review' ||
        mode ===
          'full_review')
    ) {
      replyText +=
        '\n\nMarket benchmark search was unavailable for this run.';
    }

    await supabase
      .from('chat_messages')
      .insert({
        role: 'assistant',
        content: replyText,
      });

    return res
      .status(200)
      .json({
        reply: replyText,

        web_searches:
          data.usage
            ?.server_tool_use
            ?.web_search_requests ||
          0,
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
