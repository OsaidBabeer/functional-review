// pages/api/submissions.js
import { supabase } from '../../lib/supabase';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Use GET' });

  const { data, error } = await supabase
    .from('function_submissions')
    .select('*')
    .eq('status', 'active')
    .order('division');

  if (error) return res.status(500).json({ error: error.message });
  return res.status(200).json({ submissions: data });
}
