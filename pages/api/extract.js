import { extractFunctionsFromDocument } from '../../lib/extractFunction';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST' });

  const { raw_text, source_filename, user_comment } = req.body;
  if (!raw_text || raw_text.trim().length < 20) {
    return res.status(400).json({ error: 'Document text is missing or too short' });
  }

  try {
    const extractedList = await extractFunctionsFromDocument(raw_text, user_comment || '');
    return res.status(200).json({
      success: true,
      count: extractedList.length,
      submissions: extractedList,
      source_filename: source_filename || null,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
