// lib/reviewCache.js
//
// "Has anything changed since the last full review?" — checked by comparing
// the newest timestamp across the three things a review depends on
// (submissions, structure changes, rules) against when the cached review
// was saved. If nothing's newer than the cache, there's genuinely no reason
// to burn time and API cost re-running the exact same analysis.

import { supabase } from './supabase';

export async function getLatestChangeTimestamp() {
  const [subs, structureLog, rules] = await Promise.all([
    supabase.from('function_submissions').select('created_at').eq('status', 'active').order('created_at', { ascending: false }).limit(1),
    supabase.from('org_structure_log').select('created_at').order('created_at', { ascending: false }).limit(1),
    supabase.from('review_rules').select('created_at').eq('active', true).order('created_at', { ascending: false }).limit(1),
  ]);

  const dates = [subs.data?.[0]?.created_at, structureLog.data?.[0]?.created_at, rules.data?.[0]?.created_at]
    .filter(Boolean)
    .map((d) => new Date(d).getTime());

  return dates.length ? Math.max(...dates) : 0;
}

export async function getCachedReview() {
  const { data } = await supabase
    .from('review_runs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data;
}

export async function saveReview(findingsText) {
  await supabase.from('review_runs').insert({ findings: { text: findingsText } });
}
