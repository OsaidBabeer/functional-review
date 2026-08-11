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
  const [tab, setTab] = useState('help'); // 'help' | 'review' | 'structure'

  return (
    <>
      <Head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,600;1,9..144,500&family=Inter:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </Head>
      <style>{`html, body, #__next { height: 100%; margin: 0; padding: 0; }`}</style>
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
            <TabButton active={tab === 'help'} onClick={() => setTab('help')}>How It Works</TabButton>
            <TabButton active={tab === 'review'} onClick={() => setTab('review')}>Function Review</TabButton>
            <TabButton active={tab === 'structure'} onClick={() => setTab('structure')}>Structure</TabButton>
          </nav>
        </header>

        {tab === 'help' && <HelpTab />}
        {tab === 'review' && <ReviewTab />}
        {tab === 'structure' && <StructureTab />}
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
        Approved structure, live. Tell the agent about a real change in the Function Review tab
        and this chart updates automatically — no manual redraw.
      </div>
      {loading && <div style={{ color: olive, padding: 20 }}>Loading…</div>}

      <div style={s.orgChart}>
        <div style={s.ceoNode}>CEO</div>
        <div style={s.stemDown} />
        <div style={s.divisionsRow}>
          {(tree || []).map((division) => (
            <div key={division.id} style={s.divisionCol}>
              <div style={s.stemSmall} />
              <div style={s.divisionBox}>{division.name}</div>
              {division.children.length > 0 && (
                <>
                  <div style={s.stemSmall} />
                  <div style={s.deptStack}>
                    {division.children.map((d) => (
                      <div key={d.id} style={s.deptBox}>{d.name}</div>
                    ))}
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ============================= HELP TAB =============================
function HelpTab() {
  return (
    <div style={s.helpArea}>
      <h2 style={s.helpH2}>What this does</h2>
      <p style={s.helpLead}>
        You upload what every sector submitted. It reads all of it at once, against BDC's actual
        structure and how BDC actually operates, and tells you where two functions are fighting
        over the same ground — or where something has no owner at all.
      </p>

      <div style={s.helpStep}>
        <div style={s.helpStepNum}>01</div>
        <div>
          <div style={s.helpStepTitle}>Upload the submission</div>
          <div style={s.helpStepBody}>
            Drop in the pptx as-is — one slide per sector. It splits every slide apart and reads
            each one on its own, so a 20-slide file becomes 20 separate function records, not one
            blur of text.
          </div>
        </div>
      </div>

      <div style={s.helpStep}>
        <div style={s.helpStepNum}>02</div>
        <div>
          <div style={s.helpStepTitle}>Ask it to find the real problems</div>
          <div style={s.helpStepBody}>
            Example that actually happened in your data: Operations Excellence listed "Risk
            Management" and "Audit engagement" as things it owns — but the approved structure
            already places Risk Management under GRC and Audit under Internal Audit. Ask
            <em> "where are the overlaps?"</em> and it catches exactly that, names both functions,
            and quotes the colliding line from each.
          </div>
        </div>
      </div>

      <div style={s.helpStep}>
        <div style={s.helpStepNum}>03</div>
        <div>
          <div style={s.helpStepTitle}>Tell it what actually changed</div>
          <div style={s.helpStepBody}>
            Say <em>"HR is moving from Shared Services to a new COO division reporting directly
            to CEO"</em> — it doesn't just acknowledge that in the chat, it writes the change to
            the real structure. Switch to the Structure tab and HR is already gone from Shared
            Services and sitting under COO.
          </div>
        </div>
      </div>

      <div style={s.helpStep}>
        <div style={s.helpStepNum}>04</div>
        <div>
          <div style={s.helpStepTitle}>Correct it, and it stays corrected</div>
          <div style={s.helpStepBody}>
            If it flags something that's actually fine — say Marketing owning project-level
            social media while Communications owns corporate channels is an intentional split —
            tell it that. It won't just drop it for this conversation; ask it to remember the
            rule and every future review respects that boundary automatically.
          </div>
        </div>
      </div>

      <p style={s.helpNote}>
        Nothing here is forgotten between visits — close the tab, come back next week, the
        conversation and everything you've taught it is still there.
      </p>
    </div>
  );
}

const s = {
  page: { width: '100%', height: '100vh', display: 'flex', flexDirection: 'column', fontFamily: "'Inter', -apple-system, sans-serif", background: parch, color: ink },
  header: { position: 'relative', background: '#fff', borderBottom: `1px solid ${line}` },
  pattern: { position: 'absolute', inset: 0, backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(110,107,71,0.15) 1px, transparent 0)', backgroundSize: '14px 14px', opacity: 0.5 },
  headerInner: { position: 'relative', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 'clamp(14px, 4vw, 20px) clamp(14px, 4vw, 28px) 12px' },
  title: { fontFamily: "'Fraunces', serif", fontSize: 'clamp(20px, 5vw, 26px)', fontWeight: 600, letterSpacing: '-0.01em', color: ink },
  subtitle: { fontSize: 12.5, color: olive, marginTop: 2, letterSpacing: '0.02em' },
  tabRow: { position: 'relative', display: 'flex', gap: 4, overflowX: 'auto', whiteSpace: 'nowrap', padding: '0 clamp(14px, 4vw, 24px)' },
  tabBtn: { background: 'none', border: 'none', padding: '10px 12px', fontSize: 13.5, cursor: 'pointer', fontFamily: "'Inter', sans-serif", flexShrink: 0 },

  uploadRow: { display: 'flex', alignItems: 'center', gap: 12, padding: '12px clamp(14px, 4vw, 28px)', background: '#fff', borderBottom: `1px solid ${line}` },
  uploadBtn: { background: brick, color: '#fff', border: 'none', borderRadius: 6, padding: '9px 16px', fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: "'Inter', sans-serif" },
  uploadStatusInline: { fontSize: 12.5, color: olive },

  chatArea: { flex: 1, overflowY: 'auto', padding: 'clamp(14px, 4vw, 20px) clamp(14px, 4vw, 28px)', display: 'flex', flexDirection: 'column', gap: 16 },
  bubbleRow: { display: 'flex', alignItems: 'flex-start', gap: 10 },
  avatar: { width: 28, height: 28, borderRadius: '50%', background: olive, color: '#fff', fontSize: 10.5, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2 },
  userBubble: { background: brick, color: '#fff', padding: '11px 16px', borderRadius: '14px 14px 3px 14px', maxWidth: '72%', whiteSpace: 'pre-wrap', fontSize: 14.5, lineHeight: 1.55 },
  assistantBubble: { background: '#fff', border: `1px solid ${line}`, color: ink, padding: '11px 16px', borderRadius: '3px 14px 14px 14px', maxWidth: '78%', whiteSpace: 'pre-wrap', fontSize: 14.5, lineHeight: 1.6 },
  thinking: { color: olive, fontStyle: 'italic', fontFamily: "'Fraunces', serif" },

  quickRow: { padding: '10px clamp(14px, 4vw, 28px) 0', background: '#fff' },
  quickBtn: { background: 'transparent', color: olive, border: `1px solid ${olive}`, borderRadius: 6, padding: '7px 14px', fontSize: 12.5, fontWeight: 500, cursor: 'pointer', fontFamily: "'Inter', sans-serif" },

  inputRow: { display: 'flex', gap: 10, padding: 'clamp(12px, 4vw, 18px) clamp(14px, 4vw, 28px)', borderTop: `1px solid ${line}`, background: '#fff' },
  input: { flex: 1, padding: '13px 16px', borderRadius: 7, border: `1px solid ${line}`, fontSize: 14.5, outline: 'none', fontFamily: "'Inter', sans-serif", background: parch },
  sendBtn: { background: ink, color: '#fff', border: 'none', borderRadius: 7, padding: '0 26px', fontSize: 14.5, fontWeight: 500, cursor: 'pointer', fontFamily: "'Inter', sans-serif" },

  structureArea: { flex: 1, overflowY: 'auto', overflowX: 'auto', padding: 'clamp(16px, 5vw, 28px)' },
  structureIntro: { fontSize: 13, color: olive, marginBottom: 28, maxWidth: 560, lineHeight: 1.5 },

  orgChart: { display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 'fit-content' },
  ceoNode: { background: brick, color: '#fff', fontFamily: "'Fraunces', serif", fontWeight: 600, padding: '10px 26px', borderRadius: 6, fontSize: 15 },
  stemDown: { width: 2, height: 22, background: line },
  divisionsRow: { display: 'flex', gap: 22, borderTop: `2px solid ${line}`, paddingTop: 0, width: 'fit-content' },
  divisionCol: { display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative' },
  divisionBox: { background: olive, color: '#fff', fontSize: 13, fontWeight: 600, padding: '9px 14px', borderRadius: 6, whiteSpace: 'nowrap' },
  stemSmall: { width: 2, height: 16, background: line },
  deptStack: { display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'stretch' },
  deptBox: { background: '#fff', border: `1px solid ${line}`, borderRadius: 5, padding: '6px 12px', fontSize: 12, whiteSpace: 'nowrap', textAlign: 'center' },

  helpArea: { flex: 1, overflowY: 'auto', padding: 'clamp(18px, 5vw, 32px) clamp(14px, 4vw, 28px)', maxWidth: 660 },
  helpH2: { fontFamily: "'Fraunces', serif", fontSize: 24, marginBottom: 10 },
  helpLead: { fontSize: 15, lineHeight: 1.65, color: ink, marginBottom: 28 },
  helpStep: { display: 'flex', gap: 16, marginBottom: 22 },
  helpStepNum: { fontFamily: "'Fraunces', serif", fontSize: 22, color: line, fontWeight: 600, flexShrink: 0, width: 32 },
  helpStepTitle: { fontSize: 15, fontWeight: 600, marginBottom: 5, color: brick },
  helpStepBody: { fontSize: 13.5, lineHeight: 1.65, color: ink },
  helpNote: { marginTop: 26, fontSize: 13, color: olive, lineHeight: 1.6, borderTop: `1px solid ${line}`, paddingTop: 16 },
};
