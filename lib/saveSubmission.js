import { supabase } from './supabase';

export async function saveSubmission(extracted, raw_text = '', source_filename = null, user_comments = '') {
  if (!extracted?.division || !extracted?.department_function) {
    throw new Error('Division and department/function are required');
  }

  await supabase
    .from('function_submissions')
    .update({ status: 'superseded' })
    .eq('division', extracted.division)
    .eq('department_function', extracted.department_function)
    .eq('status', 'active');

  const payload = {
    division: extracted.division,
    department_function: extracted.department_function,
    prepared_by: extracted.prepared_by || null,
    submission_date: extracted.submission_date || null,
    functional_statement: extracted.functional_statement || '',
    core_responsibilities: extracted.core_responsibilities || [],
    owns: extracted.owns || [],
    does_not_own: extracted.does_not_own || [],
    key_outputs: extracted.key_outputs || [],
    interfaces: extracted.interfaces || [],
    kpis: extracted.kpis || [],
    decision_authorities: extracted.decision_authorities || [],
    success_factors_challenges: extracted.success_factors_challenges || [],
    extracted_items: extracted.extracted_items || [],
    user_comments: user_comments || '',
    raw_source_text: raw_text || '',
    source_filename: source_filename || null,
    status: 'active',
  };

  const { data, error } = await supabase
    .from('function_submissions')
    .insert(payload)
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}
