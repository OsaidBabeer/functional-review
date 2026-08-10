import { useState } from 'react';

export default function Home() {
  const [text, setText] = useState('');
  const [filename, setFilename] = useState('');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit() {
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const res = await fetch('/api/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ raw_text: text, source_filename: filename }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Something went wrong');
      } else {
        setResult(data.submission);
      }
    } catch (err) {
      setError(err.message);
    }
    setLoading(false);
  }

  return (
    <div style={{ maxWidth: 700, margin: '40px auto', fontFamily: 'sans-serif', padding: '0 16px' }}>
      <h1>Hudood — Test Extraction</h1>
      <p style={{ color: '#555' }}>
        Paste the text of ONE filled-in function slide below (e.g. Marketing, HSSE, Legal)
        and submit — this tests Phase 1 (extraction) before we build the review agent.
      </p>

      <input
        placeholder="Source filename (optional)"
        value={filename}
        onChange={(e) => setFilename(e.target.value)}
        style={{ width: '100%', padding: 8, marginBottom: 8 }}
      />

      <textarea
        placeholder="Paste one function's slide text here..."
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={12}
        style={{ width: '100%', padding: 8, fontFamily: 'monospace', fontSize: 13 }}
      />

      <button
        onClick={handleSubmit}
        disabled={loading || !text}
        style={{ marginTop: 12, padding: '10px 20px', fontSize: 15, cursor: 'pointer' }}
      >
        {loading ? 'Extracting...' : 'Extract & Save'}
      </button>

      {error && (
        <div style={{ marginTop: 16, padding: 12, background: '#fee', color: '#900' }}>
          Error: {error}
        </div>
      )}

      {result && (
        <div style={{ marginTop: 16, padding: 12, background: '#f0f7f0' }}>
          <strong>Saved successfully.</strong>
          <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12 }}>
            {JSON.stringify(result, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}
