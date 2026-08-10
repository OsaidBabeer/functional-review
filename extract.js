// pages/api/extract.js
//
// WHAT THIS ENDPOINT DOES
// You POST it the raw text of one filled-in function template (one slide's
// worth of content — Marketing, Legal, HSSE, whatever). It asks Claude to
// pull that mess into a clean, consistent JSON shape, and saves it to
// Supabase. Nothing here compares anything to anything else yet —
// that's the review agent, which we build next.
//
// WHY WE FORCE A STRICT JSON SHAPE
// People fill these templates inconsistently — some write paragraphs,
// some write bullets, some skip sections. If we let the comparison agent
// later read 40 differently-shaped submissions, it'll waste effort just
// figuring out formatting instead of finding real overlaps. Forcing every
// submission through the same JSON shape now means the review agent later
// gets to focus 100% on substance.

import { supabase } from '../../lib/supabase';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Use POST' });
  }

  const { raw_text, source_filename } = req.body;

  if (!raw_text || raw_text.trim().length < 20) {
    return res.status(400).json({ error: 'raw_text is missing or too short' });
  }

  const extractionPrompt = `
You are extracting structured data from ONE filled-in "BDC Functional Review
Template" slide. The template has these sections: Function Information
(Division, Department, Prepared by, Date), Functional Statement / Mandate,
Core Responsibilities, Owns / Does Not Own, Key Outputs, Key Interfaces,
KPIs. People fill these inconsistently — some skip sections, some merge
them, some use different labels. Do your best to map their content to the
correct field below even if their formatting is messy.

Return ONLY valid JSON, no preamble, no markdown fences, matching exactly
this shape:

{
  "division": string,
  "department_function": string,
  "prepared_by": string or null,
  "submission_date": string or null,
  "functional_statement": string,
  "core_responsibilities": string[],
  "owns": string[],
  "does_not_own": string[],
  "key_outputs": string[],
  "interfaces": string[],
  "kpis": string[]
}

Rules:
- Split combined sentences into separate array items where it's a clear list.
- If a section is genuinely missing from the source, return an empty array
  (or null for prepared_by/submission_date) — do NOT invent content.
- Keep the person's own wording; don't paraphrase or improve it.

SOURCE TEXT:
"""
${raw_text}
"""
`.trim();

  try {
    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 2000,
        messages: [{ role: 'user', content: extractionPrompt }],
      }),
    });

    const data = await claudeRes.json();
    const textBlock = data.content?.find((b) => b.type === 'text');

    if (!textBlock) {
      return res.status(500).json({ error: 'No text response from Claude', raw: data });
    }

    const cleaned = textBlock.text.replace(/```json|```/g, '').trim();
    let extracted;
    try {
      extracted = JSON.parse(cleaned);
    } catch (parseErr) {
      return res.status(500).json({
        error: 'Claude did not return valid JSON',
        raw_response: textBlock.text,
      });
    }

    // If a submission for this division/function already exists, mark old ones
    // superseded rather than deleting — keeps history.
    await supabase
      .from('function_submissions')
      .update({ status: 'superseded' })
      .eq('division', extracted.division)
      .eq('department_function', extracted.department_function)
      .eq('status', 'active');

    const { data: inserted, error } = await supabase
      .from('function_submissions')
      .insert({
        division: extracted.division,
        department_function: extracted.department_function,
        prepared_by: extracted.prepared_by,
        submission_date: extracted.submission_date,
        functional_statement: extracted.functional_statement,
        core_responsibilities: extracted.core_responsibilities,
        owns: extracted.owns,
        does_not_own: extracted.does_not_own,
        key_outputs: extracted.key_outputs,
        interfaces: extracted.interfaces,
        kpis: extracted.kpis,
        raw_source_text: raw_text,
        source_filename: source_filename || null,
        status: 'active',
      })
      .select()
      .single();

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    return res.status(200).json({ success: true, submission: inserted });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
