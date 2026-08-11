// pages/api/chat-history.js
// Called once when the page loads, to restore the conversation.
import { supabase } from '../../lib/supabase';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Use GET' });

  const { data, error } = await supabase
    .from('chat_messages')
    .select('role, content, created_at')
    .order('created_at', { ascending: true });

  if (error) return res.status(500).json({ error: error.message });
  return res.status(200).json({ messages: data });
}
