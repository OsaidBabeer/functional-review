// pages/api/structure-from-pdf.js
import { extractStructureFromPdf } from '../../lib/structureFromDocument';
import { rebuildStructure } from '../../lib/rebuildStructure';
import { getStructureTree, structureToText } from '../../lib/structure';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST' });

  const { pdf_base64, filename } = req.body;
  if (!pdf_base64) return res.status(400).json({ error: 'pdf_base64 is required' });

  try {
    const currentTree = await getStructureTree();
    const currentText = structureToText(currentTree);

    const { tree, change_summary } = await extractStructureFromPdf(pdf_base64, currentText);
    await rebuildStructure(tree, change_summary, filename || 'uploaded PDF');

    return res.status(200).json({ success: true, change_summary, divisionCount: tree.length });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
