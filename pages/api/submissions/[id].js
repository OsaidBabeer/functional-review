// pages/api/submissions/[id].js
import { supabase } from '../../../lib/supabase';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Use GET' });

  const { id } = req.query;
  const { data, error } = await supabase
    .from('function_submissions')
    .select('*')
    .eq('id', id)
    .single();

  if (error) return res.status(404).json({ error: 'Not found' });
  return res.status(200).json({ submission: data });
}
