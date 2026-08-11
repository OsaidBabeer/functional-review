import { useState, useRef, useEffect } from 'react';
import Head from 'next/head';

const APP_NAME = 'BDC Functional Review';
const APP_SUBTITLE = 'Organizational Design Review Agent';

const ink = '#2B2416';
const olive = '#6E6B47';
const brick = '#7A3B2E';
const parch = '#F7F3EA';
const line = '#E4DCC8';

const WELCOME = {
  role: 'assistant',
  content:
    "I've reviewed org designs for a long time. Upload a functional review submission and I'll read every function — then ask me about overlaps, gaps, ownership conflicts, or ask for a full review.",
};

export default function Home() {
  const [tab, setTab] = useState('review'); // 'review' | 'structure' | 'help'

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
          </div>
          <nav style={s.tabRow}>
            <TabButton active={tab === 'review'} onClick={() => setTab('review')}>Function Review</TabButton>
            <TabButton active={tab === 'structure'} onClick={() => setTab('structure')}>Structure</TabButton>
            <TabButton active={tab === 'help'} onClick={() => setTab('help')}>How It Works</TabButton>
          </nav>
        </header>

        {tab === 'review' && <ReviewTab />}
        {tab === 'structure' && <StructureTab />}
        {tab === 'help' && <HelpTab />}
      </div>
    </>
  );
}

function TabButton({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      style={{
        ...s.tabBtn,
        color: active ? brick : '#8a8266',
        borderBottom: active ? `2px solid ${brick}` : '2px solid transparent',
        fontWeight: active ? 600 : 500,
      }}
    >
      {children}
    </button>
  );
}

// ============================= REVIEW TAB =============================
function ReviewTab() {
  const [messages, setMessages] = useState([WELCOME]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState('');
  const fileRef = useRef(null);
  const scrollRef = useRef(null);

  useEffect(() => {
    fetch('/api/chat-history')
      .then((r) => r.json())
      .then((data) => {
        if (data.messages && data.messages.length > 0) setMessages(data.messages);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, sending]);

  async function sendMessage(text) {
    if (!text.trim() || sending) return;
    const newMessages = [...messages, { role: 'user', content: text }];
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

  function handleSend() {
    sendMessage(input);
  }

  function runFullReview() {
    sendMessage(
      'Give me a full review of every function currently loaded: overlaps, gaps, ownership ambiguities, and structure issues.'
    );
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
      <div style={s.uploadRow}>
        <input type="file" accept=".pptx" ref={fileRef} onChange={handleUpload} style={{ display: 'none' }} />
        <button style={{ ...s.uploadBtn, opacity: uploading ? 0.6 : 1 }} onClick={() => fileRef.current.click()} disabled={uploading}>
          {uploading ? 'Reading…' : '+ Upload Submission'}
        </button>
        {uploadStatus && <span style={s.uploadStatusInline}>{uploadStatus}</span>}
      </div>

      <div style={s.chatArea} ref={scrollRef}>
        {messages.map((m, i) => (
          <div key={i} style={{ ...s.bubbleRow, justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
            {m.role === 'assistant' && <div style={s.avatar}>OD</div>}
            <div style={m.role === 'user' ? s.userBubble : s.assistantBubble}>{m.content}</div>
          </div>
        ))}
        {sending && (
          <div style={s.bubbleRow}>
            <div style={s.avatar}>OD</div>
            <div style={s.assistantBubble}><span style={s.thinking}>reviewing…</span></div>
          </div>
        )}
      </div>

      <div style={s.quickRow}>
        <button style={s.quickBtn} onClick={runFullReview} disabled={sending}>Run Full Review</button>
      </div>

      <div style={s.inputRow}>
        <input
          style={s.input}
          value={input}
          placeholder="Ask about overlaps, gaps, or tell me about a structure change…"
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSend()}
        />
        <button style={s.sendBtn} onClick={handleSend} disabled={sending}>Send</button>
      </div>
    </>
  );
}

// ============================= STRUCTURE TAB =============================
function StructureTab() {
  const [tree, setTree] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/structure')
      .then((r) => r.json())
      .then((data) => {
        setTree(data.tree || []);
        setLoading(false);
      });
  }, []);

  return (
    <div style={s.structureArea}>
      <div style={s.structureIntro}>
        Approved structure — CEO at the top, each division below with its departments.
        Tell the agent about a real change in the Function Review tab and it updates here automatically.
      </div>
      {loading && <div style={{ color: olive, padding: 20 }}>Loading…</div>}
      <div style={s.ceoNode}>CEO</div>
      <div style={s.divisionGrid}>
        {(tree || []).map((division) => (
          <div key={division.id} style={s.divisionCard}>
            <div style={s.divisionHeader}>{division.name}</div>
            <div style={s.deptList}>
              {division.children.length === 0 && <div style={s.deptEmpty}>—</div>}
              {division.children.map((d) => (
                <div key={d.id} style={s.deptChip}>{d.name}</div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================= HELP TAB =============================
function HelpTab() {
  return (
    <div style={s.helpArea}>
      <h2 style={s.helpH2}>How this works</h2>
      <ol style={s.helpList}>
        <li><strong>Upload a submission.</strong> Drop in the filled-out functional review pptx — one slide per function/department. Every slide gets read and turned into structured data automatically.</li>
        <li><strong>It cross-checks everything.</strong> Every time you ask a question, the agent re-reads all uploaded functions together, plus BDC's approved structure and its heritage/contractor-managed operating model, plus any rules you or Ezwah have taught it.</li>
        <li><strong>Ask anything.</strong> "Where are the overlaps?", "compare Marketing and Communications", or click Run Full Review for the complete report — overlaps, gaps, ownership ambiguity, and structure mismatches.</li>
        <li><strong>Tell it about real changes.</strong> Say something like "HR moved from Shared Services to a new COO division" and it updates the Structure tab for real — not just in the chat.</li>
        <li><strong>Nothing is forgotten.</strong> The conversation is saved — closing the tab and coming back later picks up right where you left off.</li>
      </ol>
      <p style={s.helpNote}>
        Built by Osaid and Ezwah. The agent's judgment gets sharper the more you correct it in
        conversation — tell it when something it flagged is actually fine, or when a rule should
        always apply, and it factors that into every future review.
      </p>
    </div>
  );
}

const s = {
  page: { maxWidth: 900, margin: '0 auto', height: '100vh', display: 'flex', flexDirection: 'column', fontFamily: "'Inter', -apple-system, sans-serif", background: parch, color: ink },
  header: { position: 'relative', background: '#fff', borderBottom: `1px solid ${line}` },
  pattern: { position: 'absolute', inset: 0, backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(110,107,71,0.15) 1px, transparent 0)', backgroundSize: '14px 14px', opacity: 0.5 },
  headerInner: { position: 'relative', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px 28px 12px' },
  title: { fontFamily: "'Fraunces', serif", fontSize: 26, fontWeight: 600, letterSpacing: '-0.01em', color: ink },
  subtitle: { fontSize: 12.5, color: olive, marginTop: 2, letterSpacing: '0.02em' },
  tabRow: { position: 'relative', display: 'flex', gap: 4, padding: '0 24px' },
  tabBtn: { background: 'none', border: 'none', padding: '10px 12px', fontSize: 13.5, cursor: 'pointer', fontFamily: "'Inter', sans-serif" },

  uploadRow: { display: 'flex', alignItems: 'center', gap: 12, padding: '12px 28px', background: '#fff', borderBottom: `1px solid ${line}` },
  uploadBtn: { background: brick, color: '#fff', border: 'none', borderRadius: 6, padding: '9px 16px', fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: "'Inter', sans-serif" },
  uploadStatusInline: { fontSize: 12.5, color: olive },

  chatArea: { flex: 1, overflowY: 'auto', padding: '20px 28px', display: 'flex', flexDirection: 'column', gap: 16 },
  bubbleRow: { display: 'flex', alignItems: 'flex-start', gap: 10 },
  avatar: { width: 28, height: 28, borderRadius: '50%', background: olive, color: '#fff', fontSize: 10.5, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2 },
  userBubble: { background: brick, color: '#fff', padding: '11px 16px', borderRadius: '14px 14px 3px 14px', maxWidth: '72%', whiteSpace: 'pre-wrap', fontSize: 14.5, lineHeight: 1.55 },
  assistantBubble: { background: '#fff', border: `1px solid ${line}`, color: ink, padding: '11px 16px', borderRadius: '3px 14px 14px 14px', maxWidth: '78%', whiteSpace: 'pre-wrap', fontSize: 14.5, lineHeight: 1.6 },
  thinking: { color: olive, fontStyle: 'italic', fontFamily: "'Fraunces', serif" },

  quickRow: { padding: '10px 28px 0', background: '#fff' },
  quickBtn: { background: 'transparent', color: olive, border: `1px solid ${olive}`, borderRadius: 6, padding: '7px 14px', fontSize: 12.5, fontWeight: 500, cursor: 'pointer', fontFamily: "'Inter', sans-serif" },

  inputRow: { display: 'flex', gap: 10, padding: '18px 28px', borderTop: `1px solid ${line}`, background: '#fff' },
  input: { flex: 1, padding: '13px 16px', borderRadius: 7, border: `1px solid ${line}`, fontSize: 14.5, outline: 'none', fontFamily: "'Inter', sans-serif", background: parch },
  sendBtn: { background: ink, color: '#fff', border: 'none', borderRadius: 7, padding: '0 26px', fontSize: 14.5, fontWeight: 500, cursor: 'pointer', fontFamily: "'Inter', sans-serif" },

  structureArea: { flex: 1, overflowY: 'auto', padding: '24px 28px' },
  structureIntro: { fontSize: 13, color: olive, marginBottom: 20, maxWidth: 560, lineHeight: 1.5 },
  ceoNode: { width: 120, margin: '0 auto 20px', textAlign: 'center', background: brick, color: '#fff', fontFamily: "'Fraunces', serif", fontWeight: 600, padding: '10px 0', borderRadius: 6, fontSize: 15 },
  divisionGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 14 },
  divisionCard: { background: '#fff', border: `1px solid ${line}`, borderRadius: 8, overflow: 'hidden' },
  divisionHeader: { background: olive, color: '#fff', padding: '9px 12px', fontSize: 13.5, fontWeight: 600 },
  deptList: { padding: 10, display: 'flex', flexWrap: 'wrap', gap: 6 },
  deptChip: { background: parch, border: `1px solid ${line}`, borderRadius: 5, padding: '4px 9px', fontSize: 12 },
  deptEmpty: { color: '#bbb', fontSize: 12 },

  helpArea: { flex: 1, overflowY: 'auto', padding: '28px', maxWidth: 640 },
  helpH2: { fontFamily: "'Fraunces', serif", fontSize: 21, marginBottom: 14 },
  helpList: { paddingLeft: 20, lineHeight: 1.8, fontSize: 14.5 },
  helpNote: { marginTop: 20, fontSize: 13, color: olive, lineHeight: 1.6 },
};
