// pages/function/[id].js
import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';

const ink = '#2B2416';
const olive = '#6E6B47';
const brick = '#7A3B2E';
const line = '#E4DCC8';

function List({ title, items }) {
  if (!items || items.length === 0) return null;
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={s.sectionLabel}>{title}</div>
      <ul style={s.list}>
        {items.map((item, i) => (
          <li key={i} style={s.listItem}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

export default function FunctionPrintView() {
  const router = useRouter();
  const { id } = router.query;
  const [sub, setSub] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    fetch(`/api/submissions/${id}`)
      .then((r) => r.json())
      .then((data) => {
        setSub(data.submission || null);
        setLoading(false);
      });
  }, [id]);

  if (loading) return <div style={{ padding: 40, fontFamily: 'sans-serif' }}>Loading…</div>;
  if (!sub) return <div style={{ padding: 40, fontFamily: 'sans-serif' }}>Not found.</div>;

  return (
    <>
      <Head>
        <title>{sub.department_function} — BDC Functional Review</title>
      </Head>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { margin: 0; }
        }
      `}</style>

      <div className="no-print" style={s.toolbar}>
        <button style={s.downloadBtn} onClick={() => window.print()}>Download as PDF</button>
        <span style={s.toolbarHint}>Uses your browser's print dialog — choose "Save as PDF" as the destination.</span>
      </div>

      <div style={s.page}>
        <div style={s.header}>
          <div style={s.eyebrow}>BDC Functional Review</div>
          <div style={s.title}>{sub.department_function}</div>
          <div style={s.subtitle}>{sub.division}</div>
          <div style={s.meta}>
            {sub.prepared_by && <span>Prepared by {sub.prepared_by}</span>}
            {sub.submission_date && <span>{sub.prepared_by ? ' · ' : ''}{sub.submission_date}</span>}
          </div>
        </div>

        {sub.functional_statement && (
          <div style={{ marginBottom: 20 }}>
            <div style={s.sectionLabel}>Mandate</div>
            <p style={s.paragraph}>{sub.functional_statement}</p>
          </div>
        )}

        <List title="Core Responsibilities" items={sub.core_responsibilities} />
        <List title="Owns" items={sub.owns} />
        <List title="Does Not Own" items={sub.does_not_own} />
        <List title="Key Outputs" items={sub.key_outputs} />
        <List title="Interfaces" items={sub.interfaces} />
        <List title="KPIs" items={sub.kpis} />

        <div style={s.footer}>Exported from BDC Functional Review — {new Date().toLocaleDateString()}</div>
      </div>
    </>
  );
}

const s = {
  toolbar: { display: 'flex', alignItems: 'center', gap: 14, padding: '16px 24px', background: '#fff', borderBottom: `1px solid ${line}`, fontFamily: "-apple-system, sans-serif" },
  downloadBtn: { background: brick, color: '#fff', border: 'none', borderRadius: 6, padding: '10px 18px', fontSize: 14, fontWeight: 500, cursor: 'pointer' },
  toolbarHint: { fontSize: 12.5, color: '#888' },

  page: { maxWidth: 720, margin: '0 auto', padding: '40px 32px', fontFamily: "Georgia, 'Times New Roman', serif", color: ink },
  header: { borderBottom: `2px solid ${brick}`, paddingBottom: 16, marginBottom: 24 },
  eyebrow: { fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: olive, marginBottom: 6 },
  title: { fontSize: 26, fontWeight: 700 },
  subtitle: { fontSize: 15, color: olive, marginTop: 2 },
  meta: { fontSize: 12, color: '#888', marginTop: 8 },

  sectionLabel: { fontSize: 12, letterSpacing: '0.06em', textTransform: 'uppercase', color: brick, fontWeight: 700, marginBottom: 6, borderBottom: `1px solid ${line}`, paddingBottom: 4 },
  paragraph: { fontSize: 14, lineHeight: 1.6, margin: 0 },
  list: { margin: 0, paddingLeft: 20 },
  listItem: { fontSize: 14, lineHeight: 1.7 },
  footer: { marginTop: 32, paddingTop: 12, borderTop: `1px solid ${line}`, fontSize: 10.5, color: '#999' },
};
