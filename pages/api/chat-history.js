// pages/api/chat-history.js
// GET restores the conversation on page load.
// DELETE wipes it — an escape hatch for when a conversation gets tangled
// (e.g. an old unresolved request confusing later replies) rather than
// needing a code fix every time that happens.
import { supabase } from '../../lib/supabase';

export default async function handler(req, res) {
  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('chat_messages')
      .select('role, content, created_at')
      .order('created_at', { ascending: true });

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ messages: data });
  }

  if (req.method === 'DELETE') {
    const { error } = await supabase
      .from('chat_messages')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000');

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ error: 'Use GET or DELETE' });
}
