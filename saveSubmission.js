// lib/saveSubmission.js
import { supabase } from './supabase';

export async function saveSubmission(extracted, raw_text, source_filename) {
  // Mark any previous version of this same function as superseded, not deleted.
  await supabase
    .from('function_submissions')
    .update({ status: 'superseded' })
    .eq('division', extracted.division)
    .eq('department_function', extracted.department_function)
    .eq('status', 'active');

  const { data, error } = await supabase
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

  if (error) throw new Error(error.message);
  return data;
}
