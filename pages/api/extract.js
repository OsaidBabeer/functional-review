// pages/api/extract.js
export const config = {
  maxDuration: 300,
};

// Now takes the FULL document text (all slides joined) and can return
// multiple saved submissions from one call, since one file might contain
// one function (spread across slides) or several.
import { extractFunctionsFromDocument } from '../../lib/extractFunction';
import { saveSubmission } from '../../lib/saveSubmission';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST' });

  const { raw_text, source_filename } = req.body;
  if (!raw_text || raw_text.trim().length < 20) {
    return res.status(400).json({ error: 'raw_text is missing or too short' });
  }

  try {
    const extractedList = await extractFunctionsFromDocument(raw_text);
    const saved = [];
    for (const extracted of extractedList) {
      const result = await saveSubmission(extracted, raw_text, source_filename);
      saved.push(result);
    }
    return res.status(200).json({ success: true, count: saved.length, submissions: saved });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
