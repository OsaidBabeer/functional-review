// pages/api/structure.js
import { getStructureTree } from '../../lib/structure';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Use GET' });
  try {
    const tree = await getStructureTree();
    res.status(200).json({ tree });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
