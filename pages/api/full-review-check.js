// pages/api/full-review-check.js
import { getLatestChangeTimestamp, getCachedReview } from '../../lib/reviewCache';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Use GET' });

  try {
    const [latestChange, cached] = await Promise.all([getLatestChangeTimestamp(), getCachedReview()]);

    const isFresh = cached && new Date(cached.created_at).getTime() > latestChange;

    return res.status(200).json({
      fresh: !!isFresh,
      cachedText: isFresh ? cached.findings?.text : null,
      cachedAt: cached?.created_at || null,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
