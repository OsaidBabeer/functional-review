// lib/reviewContext.js
//
// Both the chat agent and the direct "Download Slides" button need the
// exact same picture of BDC — company context, structure, rules, and every
// loaded function. Pulling that into one shared function means both stay
// in sync automatically instead of drifting apart if one gets edited later.

import { supabase } from './supabase';
import { COMPANY_CONTEXT } from './companyContext';
import { getStructureTree, structureToText } from './structure';

function truncateList(arr, max = 5) {
  if (!arr || arr.length === 0) return '—';
  const shown = arr.slice(0, max).join('; ');
  const remaining = arr.length - max;
  return remaining > 0 ? `${shown} (+${remaining} more)` : shown;
}

function formatSubmissions(subs) {
  if (!subs.length) return '(No function submissions uploaded yet.)';
  return subs
    .map(
      (s) => `
### ${s.department_function} (${s.division})
Mandate: ${s.functional_statement || '—'}
Core responsibilities: ${truncateList(s.core_responsibilities)}
Owns: ${truncateList(s.owns)}
Does not own: ${truncateList(s.does_not_own)}
Key outputs: ${truncateList(s.key_outputs, 4)}
Interfaces: ${truncateList(s.interfaces, 4)}
KPIs: ${truncateList(s.kpis, 4)}
`.trim()
    )
    .join('\n\n');
}

export async function getReviewContext() {
  const [{ data: submissions }, { data: rules }, structureTree] = await Promise.all([
    supabase.from('function_submissions').select('*').eq('status', 'active').order('division'),
    supabase.from('review_rules').select('rule_text').eq('active', true),
    getStructureTree(),
  ]);

  return {
    companyContext: COMPANY_CONTEXT,
    structureText: structureToText(structureTree),
    rulesBlock: rules && rules.length ? rules.map((r) => `- ${r.rule_text}`).join('\n') : '(No rules taught yet.)',
    submissionsText: formatSubmissions(submissions || []),
    submissionCount: submissions?.length || 0,
  };
}
