import { supabase } from '../../lib/supabase';
import { saveSubmission } from '../../lib/saveSubmission';

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const { data, error } = await supabase
        .from('function_submissions')
        .select('*')
        .eq('status', 'active')
        .order('division');
      if (error) throw error;
      return res.status(200).json({ submissions: data || [] });
    }

    if (req.method === 'POST') {
      const { submission, raw_text, source_filename, user_comments } = req.body;
      const saved = await saveSubmission(submission, raw_text, source_filename, user_comments);
      return res.status(200).json({ success: true, submission: saved });
    }

    return res.status(405).json({ error: 'Use GET or POST' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
