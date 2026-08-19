// lib/slideTools.js
//
// buildPptx() now understands three slide types instead of one:
//   'bullets' — the original text-bullet slide, for deep-dives
//   'table'   — a real PowerPoint table (pptxgenjs addTable), with severity
//               words auto-colored, for summary/overview content
//   'chart'   — a real bar/pie chart (pptxgenjs addChart), for the
//               executive summary counts
// This is what actually makes the deck look designed instead of like a
// wall of bullet points on every slide.

import PptxGenJS from 'pptxgenjs';

const olive = '6E6B47';
const brick = '7A3B2E';
const parch = 'F7F3EA';
const ink = '2B2416';
const white = 'FFFFFF';

function severityFill(text) {
  const t = (text || '').toLowerCase();
  if (t.includes('critical') || t.includes('🔴')) return 'F1948A';
  if (t.includes('high') || t.includes('🟠')) return 'FAD7A0';
  if (t.includes('medium') || t.includes('🟡')) return 'F9E79F';
  if (t.includes('low') || t.includes('resolved') || t.includes('🟢') || t.includes('✅')) return 'A9DFBF';
  return null;
}

function addHeaderBar(pptx, s, heading) {
  s.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 13.33, h: 0.9, fill: { color: olive } });
  s.addText(heading || '', {
    x: 0.5, y: 0.15, w: 12.3, h: 0.6, fontFace: 'Georgia', fontSize: 24, bold: true, color: white,
  });
  s.addShape(pptx.ShapeType.rect, { x: 0, y: 7.15, w: 13.33, h: 0.35, fill: { color: brick } });
}

function addBulletsSlide(pptx, slide) {
  const s = pptx.addSlide();
  s.background = { color: 'FFFFFF' };
  addHeaderBar(pptx, s, slide.heading);

  const bulletRuns = (slide.bullets || []).map((b) => ({
    text: b,
    options: { bullet: { code: '2022' }, breakLine: true, paraSpaceAfter: 10 },
  }));

  s.addText(bulletRuns, {
    x: 0.6, y: 1.15, w: 12.1, h: 5.8, fontFace: 'Calibri', fontSize: 15, color: ink,
    valign: 'top', lineSpacingMultiple: 1.2, fit: 'shrink',
  });
}

function addTableSlide(pptx, slide) {
  const s = pptx.addSlide();
  s.background = { color: 'FFFFFF' };
  addHeaderBar(pptx, s, slide.heading);

  const columns = slide.columns || [];
  const rows = slide.rows || [];

  const headerRow = columns.map((c) => ({
    text: c,
    options: { bold: true, fill: { color: olive }, color: white, fontSize: 12, align: 'left' },
  }));

  const bodyRows = rows.map((row) =>
    row.map((cellText) => {
      const fill = severityFill(cellText);
      return {
        text: String(cellText),
        options: fill
          ? { fill: { color: fill }, color: ink, fontSize: 11 }
          : { fontSize: 11, color: ink },
      };
    })
  );

  s.addTable([headerRow, ...bodyRows], {
    x: 0.5, y: 1.15, w: 12.3, h: 5.8,
    fontFace: 'Calibri', border: { type: 'solid', color: 'E4DCC8', pt: 0.5 },
    autoPage: false, valign: 'middle',
  });
}

function addChartSlide(pptx, slide) {
  const s = pptx.addSlide();
  s.background = { color: 'FFFFFF' };
  addHeaderBar(pptx, s, slide.heading);

  const chartData = [
    {
      name: slide.seriesName || 'Count',
      labels: slide.labels || [],
      values: slide.values || [],
    },
  ];

  const chartType = slide.chartType === 'pie' ? pptx.ChartType.pie : pptx.ChartType.bar;

  s.addChart(chartType, chartData, {
    x: 1.2, y: 1.3, w: 10.9, h: 5.3,
    chartColors: [brick, olive, 'C9A66B', '8A9A5B'],
    showLegend: slide.chartType === 'pie',
    showValue: true,
    dataLabelColor: ink,
    catAxisLabelColor: ink,
    valAxisLabelColor: ink,
  });
}

export async function buildPptx({ deck_title, subtitle, slides }) {
  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: 'BDC', width: 13.33, height: 7.5 });
  pptx.layout = 'BDC';

  // Title slide
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
    if (slide.type === 'table') addTableSlide(pptx, slide);
    else if (slide.type === 'chart') addChartSlide(pptx, slide);
    else addBulletsSlide(pptx, slide);
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
    "Call this when the user asks you to prepare, create, or generate a slide deck, presentation, or PowerPoint. Call this EXACTLY ONCE per request. Use 'table' type slides for any list of multiple findings (overlaps, gaps, etc.) and 'bullets' type only for a small number of deep-dive slides on the most critical items — never one slide per single item. Write the actual real content yourself based on everything you know.",
  input_schema: {
    type: 'object',
    properties: {
      deck_title: { type: 'string' },
      subtitle: { type: 'string' },
      slides: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            type: { type: 'string', enum: ['bullets', 'table', 'chart'] },
            heading: { type: 'string' },
            bullets: { type: 'array', items: { type: 'string' } },
            columns: { type: 'array', items: { type: 'string' } },
            rows: { type: 'array', items: { type: 'array', items: { type: 'string' } } },
          },
          required: ['type', 'heading'],
        },
      },
    },
    required: ['deck_title', 'slides'],
  },
};
