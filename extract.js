// pages/api/extract.js
// Text-paste path — kept for quick manual testing. Real usage goes through
// /api/upload-pptx now.
import { extractOneFunction } from '../../lib/extractFunction';
import { saveSubmission } from '../../lib/saveSubmission';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST' });

  const { raw_text, source_filename } = req.body;
  if (!raw_text || raw_text.trim().length < 20) {
    return res.status(400).json({ error: 'raw_text is missing or too short' });
  }

  try {
    const extracted = await extractOneFunction(raw_text);
    if (extracted.skip) {
      return res.status(200).json({ skipped: true, reason: 'Not a function submission' });
    }
    const saved = await saveSubmission(extracted, raw_text, source_filename);
    return res.status(200).json({ success: true, submission: saved });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
