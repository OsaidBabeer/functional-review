import { supabase } from '../../lib/supabase';

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const { data, error } = await supabase
        .from('reference_documents')
        .select('*')
        .eq('active', true)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return res.status(200).json({ references: data || [] });
    }

    if (req.method === 'POST') {
      const { title, reference_type, content, source_filename, notes } = req.body;
      if (!title?.trim() || !content?.trim()) {
        return res.status(400).json({ error: 'Title and content are required' });
      }
      const { data, error } = await supabase
        .from('reference_documents')
        .insert({
          title: title.trim(),
          reference_type: reference_type || 'company_reference',
          content,
          source_filename: source_filename || null,
          notes: notes || '',
          active: true,
        })
        .select()
        .single();
      if (error) throw error;
      return res.status(200).json({ success: true, reference: data });
    }

    return res.status(405).json({ error: 'Use GET or POST' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
