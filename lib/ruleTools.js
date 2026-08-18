// lib/ruleTools.js
//
// Mirrors structureTools.js: Claude decides WHAT to remember, this file
// actually writes it. Without this, "teach the agent a rule" was only ever
// happening inside one conversation's memory, never persisted — the Help
// tab's promise wasn't backed by real code until this file existed.

import { supabase } from './supabase';

export async function executeRuleTool(input) {
  const { action, rule_text, category } = input;

  if (action === 'add') {
    await supabase.from('review_rules').insert({
      rule_text,
      category: category || 'general',
      active: true,
    });
    return { ok: true, message: `Saved rule: "${rule_text}"` };
  }

  if (action === 'remove') {
    const { data } = await supabase
      .from('review_rules')
      .select('id')
      .ilike('rule_text', `%${rule_text}%`)
      .eq('active', true)
      .limit(1)
      .maybeSingle();

    if (!data) return { ok: false, message: `Couldn't find an active rule matching "${rule_text}".` };

    await supabase.from('review_rules').update({ active: false }).eq('id', data.id);
    return { ok: true, message: `Removed rule matching "${rule_text}".` };
  }

  return { ok: false, message: `Unknown action "${action}".` };
}

export const RULE_TOOL_DEFINITION = {
  name: 'manage_review_rule',
  description:
    "Call this when Osaid or Ezwah explicitly ask you to remember, save, or stop applying a review rule — a standing instruction that should apply to every future review (e.g. 'remember that GRC always owns Risk Management' or 'stop flagging the Marketing/Communications social media split'). Do NOT call this for one-off comments or hypothetical discussion — only when they clearly want something remembered going forward.",
  input_schema: {
    type: 'object',
    properties: {
      action: { type: 'string', enum: ['add', 'remove'] },
      rule_text: { type: 'string', description: 'The rule itself, in plain English, as it should be applied in future reviews.' },
      category: { type: 'string', enum: ['ownership', 'boundary', 'exception', 'general'] },
    },
    required: ['action', 'rule_text'],
  },
};
