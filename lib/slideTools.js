// lib/slideTools.js
//
// buildPptx() is the actual file-building logic, kept separate from the
// chat tool wrapper below it. This lets a direct "Download Slides" button
// call buildPptx() straight away (no chat round-trip, no tool-use loop),
// while the chat agent can still trigger the exact same builder through
// executeSlideTool() when someone asks for slides in conversation instead.

import PptxGenJS from 'pptxgenjs';

const olive = '6E6B47';
const brick = '7A3B2E';
const parch = 'F7F3EA';
const ink = '2B2416';

export async function buildPptx({ deck_title, subtitle, slides }) {
  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: 'BDC', width: 13.33, height: 7.5 });
  pptx.layout = 'BDC';

  const title = pptx.addSlide();
  title.background = { color: parch };
  title.addText(deck_title || 'BDC Functional Review', {
    x: 0.7, y: 2.5, w: 11.9, h: 1.3, fontFace: 'Georgia', fontSize: 36, bold: true, color: ink,
  });
  if (subtitle) {
    title.addText(subtitle, {
      x: 0.7, y: 3.7, w: 11.9, h: 0.6, fontFace: 'Calibri', fontSize: 18, color: olive,
    });
  }
  title.addText(new Date().toLocaleDateString('en-GB', { year: 'numeric', month: 'long', day: 'numeric' }), {
    x: 0.7, y: 6.5, w: 6, h: 0.4, fontFace: 'Calibri', fontSize: 12, color: olive,
  });
  title.addShape(pptx.ShapeType.rect, { x: 0, y: 7.15, w: 13.33, h: 0.35, fill: { color: brick } });

  for (const slide of slides || []) {
    const s = pptx.addSlide();
    s.background = { color: 'FFFFFF' };
    s.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 13.33, h: 0.9, fill: { color: olive } });
    s.addText(slide.heading || '', {
      x: 0.5, y: 0.15, w: 12.3, h: 0.6, fontFace: 'Georgia', fontSize: 24, bold: true, color: 'FFFFFF',
    });

    const bulletRuns = (slide.bullets || []).map((b) => ({
      text: b,
      options: { bullet: { code: '2022' }, breakLine: true, paraSpaceAfter: 10 },
    }));

    s.addText(bulletRuns, {
      x: 0.6, y: 1.15, w: 12.1, h: 5.8, fontFace: 'Calibri', fontSize: 15, color: ink,
      valign: 'top', lineSpacingMultiple: 1.2, autoFit: true,
    });

    s.addShape(pptx.ShapeType.rect, { x: 0, y: 7.15, w: 13.33, h: 0.35, fill: { color: brick } });
  }

  const base64 = await pptx.write({ outputType: 'base64' });
  return {
    base64,
    filename: `BDC-Functional-Review-${new Date().toISOString().slice(0, 10)}.pptx`,
    mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  };
}

// ============= Chat tool wrapper (used only when asked for slides in chat) =============

export async function executeSlideTool(input) {
  try {
    const { base64, filename, mimeType } = await buildPptx(input);
    return {
      forClaude: { ok: true, message: `Generated a ${(input.slides || []).length + 1}-slide deck: "${input.deck_title}".` },
      attachment: { base64, filename, mimeType },
    };
  } catch (err) {
    return { forClaude: { ok: false, message: 'Failed to generate slides: ' + err.message } };
  }
}

export const SLIDE_TOOL_DEFINITION = {
  name: 'generate_slides',
  description:
    "Call this when the user asks you to prepare, create, or generate a slide deck, presentation, or PowerPoint. Call this EXACTLY ONCE per request and put EVERYTHING the user asked for into that single call — every section (e.g. gaps, overlaps, ambiguities, recommendations) and every division goes into ONE slides array in ONE call, producing ONE complete deck. Never split the content across multiple calls or produce more than one deck for a single request. Write the actual real content yourself — a deck title and an array of content slides, each with a heading and specific bullet points — based on everything you actually know about the loaded functions, their overlaps, gaps, ambiguities, and structure issues. Do not use placeholder text; write the real findings as if this deck will be presented as-is. If the content is extensive, use MORE slides within the same single call rather than making a second call.",
  input_schema: {
    type: 'object',
    properties: {
      deck_title: { type: 'string', description: 'Main title for the deck, shown on the title slide.' },
      subtitle: { type: 'string', description: 'Optional subtitle, e.g. "Functional Review Summary".' },
      slides: {
        type: 'array',
        description: 'One entry per content slide, in the order they should appear.',
        items: {
          type: 'object',
          properties: {
            heading: { type: 'string' },
            bullets: { type: 'array', items: { type: 'string' } },
          },
          required: ['heading', 'bullets'],
        },
      },
    },
    required: ['deck_title', 'slides'],
  },
};
