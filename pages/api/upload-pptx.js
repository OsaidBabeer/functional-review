// pages/api/upload-pptx.js
//
// You upload the actual .pptx file (the one with all the sectors' filled-in
// slides). This route: unzips it (a .pptx IS a zip file), pulls the text out
// of every slide, and runs each slide through the extraction agent
// separately — because each slide is usually one function/department.
// Cover slides and instruction slides get auto-skipped (see the "skip" flag
// in extractFunction.js).

import formidable from 'formidable';
import AdmZip from 'adm-zip';
import fs from 'fs';
import { extractOneFunction } from '../../lib/extractFunction';
import { saveSubmission } from '../../lib/saveSubmission';

export const config = {
  api: { bodyParser: false }, // required — we're handling a raw file upload
};

function parseForm(req) {
  return new Promise((resolve, reject) => {
    const form = formidable({ maxFileSize: 25 * 1024 * 1024 }); // 25MB cap
    form.parse(req, (err, fields, files) => {
      if (err) reject(err);
      else resolve({ fields, files });
    });
  });
}

// Pulls slide text out of a .pptx buffer, in slide order.
function extractSlidesFromPptx(buffer) {
  const zip = new AdmZip(buffer);
  const entries = zip
    .getEntries()
    .filter((e) => /^ppt\/slides\/slide\d+\.xml$/.test(e.entryName))
    .sort((a, b) => {
      const numA = parseInt(a.entryName.match(/\d+/)[0], 10);
      const numB = parseInt(b.entryName.match(/\d+/)[0], 10);
      return numA - numB;
    });

  return entries.map((entry) => {
    const xml = entry.getData().toString('utf8');
    // Pull every <a:t>...</a:t> text run out of the slide XML.
    const matches = [...xml.matchAll(/<a:t>(.*?)<\/a:t>/gs)];
    const text = matches.map((m) => m[1]).join(' ');
    return text;
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST' });

  try {
    const { files } = await parseForm(req);
    const file = files.file?.[0] || files.file;
    if (!file) return res.status(400).json({ error: 'No file uploaded' });

    const buffer = fs.readFileSync(file.filepath);
    const slideTexts = extractSlidesFromPptx(buffer);

    const results = [];
    for (let i = 0; i < slideTexts.length; i++) {
      const text = slideTexts[i];
      if (!text || text.trim().length < 30) continue; // skip near-empty slides

      try {
        const extracted = await extractOneFunction(text);
        if (extracted.skip) {
          results.push({ slide: i + 1, skipped: true });
          continue;
        }
        const saved = await saveSubmission(extracted, text, file.originalFilename);
        results.push({
          slide: i + 1,
          saved: true,
          division: saved.division,
          department_function: saved.department_function,
        });
      } catch (err) {
        results.push({ slide: i + 1, error: err.message });
      }
    }

    return res.status(200).json({ success: true, slideCount: slideTexts.length, results });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
