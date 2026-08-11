import { useState, useRef, useEffect } from 'react';
import Head from 'next/head';

// ---- Rename the product here in one place ----
const APP_NAME = 'BDC Functional Review';
const APP_SUBTITLE = 'Organizational Design Review Agent';

export default function Home() {
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content:
        "I've reviewed org designs for a long time. Upload a functional review submission and I'll read every function — then ask me about overlaps, gaps, ownership conflicts, or ask for a full review.",
    },
  ]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState('');
  const fileRef = useRef(null);
  const scrollRef = useRef(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, sending]);

  async function handleSend() {
    if (!input.trim() || sending) return;
    const newMessages = [...messages, { role: 'user', content: input }];
    setMessages(newMessages);
    setInput('');
    setSending(true);
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: newMessages }),
      });
      const data = await res.json();
      setMessages([...newMessages, { role: 'assistant', content: data.reply || data.error }]);
    } catch (err) {
      setMessages([...newMessages, { role: 'assistant', content: 'Error: ' + err.message }]);
    }
    setSending(false);
  }

  async function handleUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    setUploadStatus(`Reading ${file.name}...`);
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await fetch('/api/upload-pptx', { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok) {
        setUploadStatus('Error: ' + data.error);
      } else {
        const saved = data.results.filter((r) => r.saved).length;
        setUploadStatus(`${saved} function(s) loaded from ${file.name}`);
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: `I've read ${saved} function submission${saved === 1 ? '' : 's'} from "${file.name}". Ask me to review them whenever you're ready.`,
          },
        ]);
      }
    } catch (err) {
      setUploadStatus('Error: ' + err.message);
    }
    setUploading(false);
    e.target.value = '';
  }

  return (
    <>
      <Head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,600;1,9..144,500&family=Inter:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </Head>
      <div style={s.page}>
        <header style={s.header}>
          <div style={s.pattern} aria-hidden="true" />
          <div style={s.headerInner}>
            <div>
              <div style={s.title}>{APP_NAME}</div>
              <div style={s.subtitle}>{APP_SUBTITLE}</div>
            </div>
            <div>
              <input
                type="file"
                accept=".pptx"
                ref={fileRef}
                onChange={handleUpload}
                style={{ display: 'none' }}
              />
              <button
                style={{ ...s.uploadBtn, opacity: uploading ? 0.6 : 1 }}
                onClick={() => fileRef.current.click()}
                disabled={uploading}
              >
                {uploading ? 'Reading…' : '+ Upload Submission'}
              </button>
            </div>
          </div>
        </header>

        {uploadStatus && <div style={s.uploadStatus}>{uploadStatus}</div>}

        <div style={s.chatArea} ref={scrollRef}>
          {messages.map((m, i) => (
            <div
              key={i}
              style={{ ...s.bubbleRow, justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}
            >
              {m.role === 'assistant' && <div style={s.avatar}>OD</div>}
              <div style={m.role === 'user' ? s.userBubble : s.assistantBubble}>{m.content}</div>
            </div>
          ))}
          {sending && (
            <div style={s.bubbleRow}>
              <div style={s.avatar}>OD</div>
              <div style={s.assistantBubble}>
                <span style={s.thinking}>reviewing…</span>
              </div>
            </div>
          )}
        </div>

        <div style={s.inputRow}>
          <input
            style={s.input}
            value={input}
            placeholder="Ask about overlaps, gaps, or a specific function…"
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
          />
          <button style={s.sendBtn} onClick={handleSend} disabled={sending}>
            Send
          </button>
        </div>
      </div>
    </>
  );
}

// ---- Design tokens ----
// Ink:    #2B2416  (deep umber — body text)
// Olive:  #6E6B47  (division-bar olive from the org chart deck)
// Brick:  #7A3B2E  (executive-box maroon from the org chart deck)
// Parch:  #F7F3EA  (parchment background)
// Line:   #E4DCC8  (hairline borders)
const ink = '#2B2416';
const olive = '#6E6B47';
const brick = '#7A3B2E';
const parch = '#F7F3EA';
const line = '#E4DCC8';

const s = {
  page: {
    maxWidth: 860,
    margin: '0 auto',
    height: '100vh',
    display: 'flex',
    flexDirection: 'column',
    fontFamily: "'Inter', -apple-system, sans-serif",
    background: parch,
    color: ink,
  },
  header: { position: 'relative', background: '#fff', borderBottom: `1px solid ${line}` },
  pattern: {
    position: 'absolute',
    inset: 0,
    backgroundImage:
      'radial-gradient(circle at 1px 1px, rgba(110,107,71,0.15) 1px, transparent 0)',
    backgroundSize: '14px 14px',
    opacity: 0.5,
  },
  headerInner: {
    position: 'relative',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '22px 28px',
  },
  title: {
    fontFamily: "'Fraunces', serif",
    fontSize: 26,
    fontWeight: 600,
    letterSpacing: '-0.01em',
    color: ink,
  },
  subtitle: { fontSize: 12.5, color: olive, marginTop: 2, letterSpacing: '0.02em' },
  uploadBtn: {
    background: brick,
    color: '#fff',
    border: 'none',
    borderRadius: 6,
    padding: '10px 18px',
    fontSize: 13.5,
    fontWeight: 500,
    cursor: 'pointer',
    fontFamily: "'Inter', sans-serif",
  },
  uploadStatus: {
    padding: '9px 28px',
    fontSize: 12.5,
    color: olive,
    background: '#EFE9D6',
    borderBottom: `1px solid ${line}`,
  },
  chatArea: {
    flex: 1,
    overflowY: 'auto',
    padding: '24px 28px',
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
  },
  bubbleRow: { display: 'flex', alignItems: 'flex-start', gap: 10 },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: '50%',
    background: olive,
    color: '#fff',
    fontSize: 10.5,
    fontWeight: 600,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    marginTop: 2,
  },
  userBubble: {
    background: brick,
    color: '#fff',
    padding: '11px 16px',
    borderRadius: '14px 14px 3px 14px',
    maxWidth: '72%',
    whiteSpace: 'pre-wrap',
    fontSize: 14.5,
    lineHeight: 1.55,
  },
  assistantBubble: {
    background: '#fff',
    border: `1px solid ${line}`,
    color: ink,
    padding: '11px 16px',
    borderRadius: '3px 14px 14px 14px',
    maxWidth: '78%',
    whiteSpace: 'pre-wrap',
    fontSize: 14.5,
    lineHeight: 1.6,
  },
  thinking: { color: olive, fontStyle: 'italic', fontFamily: "'Fraunces', serif" },
  inputRow: {
    display: 'flex',
    gap: 10,
    padding: '18px 28px',
    borderTop: `1px solid ${line}`,
    background: '#fff',
  },
  input: {
    flex: 1,
    padding: '13px 16px',
    borderRadius: 7,
    border: `1px solid ${line}`,
    fontSize: 14.5,
    outline: 'none',
    fontFamily: "'Inter', sans-serif",
    background: parch,
  },
  sendBtn: {
    background: ink,
    color: '#fff',
    border: 'none',
    borderRadius: 7,
    padding: '0 26px',
    fontSize: 14.5,
    fontWeight: 500,
    cursor: 'pointer',
    fontFamily: "'Inter', sans-serif",
  },
};
