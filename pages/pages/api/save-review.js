// pages/api/save-review.js
import { saveReview } from '../../lib/reviewCache';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST' });
  const { findings } = req.body;
  if (!findings) return res.status(400).json({ error: 'findings is required' });

  try {
    await saveReview(findings);
    return res.status(200).json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
