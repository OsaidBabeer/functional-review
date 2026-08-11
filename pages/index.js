import { useState, useRef } from 'react';

export default function Home() {
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content:
        "I'm your OD reviewer for BDC. Upload a functional review submission (.pptx) and ask me anything — overlaps, gaps, ownership conflicts, or a full review.",
    },
  ]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState('');
  const fileRef = useRef(null);

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
    setUploadStatus('Uploading and extracting...');

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch('/api/upload-pptx', { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok) {
        setUploadStatus('Error: ' + data.error);
      } else {
        const saved = data.results.filter((r) => r.saved).length;
        const skipped = data.results.filter((r) => r.skipped).length;
        setUploadStatus(`Done — ${saved} function(s) saved, ${skipped} slide(s) skipped.`);
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: `I've read ${saved} function submission(s) from "${file.name}". Ask me to review them whenever you're ready.`,
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
    <div style={styles.page}>
      <div style={styles.header}>
        <div>
          <div style={styles.title}>Hudood</div>
          <div style={styles.subtitle}>BDC Functional Review — OD Agent</div>
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
            style={styles.uploadBtn}
            onClick={() => fileRef.current.click()}
            disabled={uploading}
          >
            {uploading ? 'Processing...' : '+ Upload Submission'}
          </button>
        </div>
      </div>

      {uploadStatus && <div style={styles.uploadStatus}>{uploadStatus}</div>}

      <div style={styles.chatArea}>
        {messages.map((m, i) => (
          <div
            key={i}
            style={{
              ...styles.bubbleRow,
              justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start',
            }}
          >
            <div style={m.role === 'user' ? styles.userBubble : styles.assistantBubble}>
              {m.content}
            </div>
          </div>
        ))}
        {sending && (
          <div style={styles.bubbleRow}>
            <div style={styles.assistantBubble}>Thinking...</div>
          </div>
        )}
      </div>

      <div style={styles.inputRow}>
        <input
          style={styles.input}
          value={input}
          placeholder="Ask about overlaps, gaps, or a specific function..."
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSend()}
        />
        <button style={styles.sendBtn} onClick={handleSend} disabled={sending}>
          Send
        </button>
      </div>
    </div>
  );
}

const styles = {
  page: {
    maxWidth: 820,
    margin: '0 auto',
    height: '100vh',
    display: 'flex',
    flexDirection: 'column',
    fontFamily: '-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif',
    background: '#fafafa',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '20px 24px',
    borderBottom: '1px solid #e5e5e5',
    background: '#fff',
  },
  title: { fontSize: 20, fontWeight: 700, color: '#2b2416' },
  subtitle: { fontSize: 13, color: '#888' },
  uploadBtn: {
    background: '#4a3f2f',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    padding: '10px 16px',
    fontSize: 14,
    cursor: 'pointer',
  },
  uploadStatus: {
    padding: '8px 24px',
    fontSize: 13,
    color: '#555',
    background: '#f0ece2',
  },
  chatArea: {
    flex: 1,
    overflowY: 'auto',
    padding: '20px 24px',
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  bubbleRow: { display: 'flex' },
  userBubble: {
    background: '#4a3f2f',
    color: '#fff',
    padding: '10px 16px',
    borderRadius: '14px 14px 2px 14px',
    maxWidth: '75%',
    whiteSpace: 'pre-wrap',
    fontSize: 14.5,
    lineHeight: 1.5,
  },
  assistantBubble: {
    background: '#fff',
    border: '1px solid #e5e5e5',
    color: '#2b2416',
    padding: '10px 16px',
    borderRadius: '14px 14px 14px 2px',
    maxWidth: '80%',
    whiteSpace: 'pre-wrap',
    fontSize: 14.5,
    lineHeight: 1.5,
  },
  inputRow: {
    display: 'flex',
    gap: 8,
    padding: '16px 24px',
    borderTop: '1px solid #e5e5e5',
    background: '#fff',
  },
  input: {
    flex: 1,
    padding: '12px 14px',
    borderRadius: 8,
    border: '1px solid #ddd',
    fontSize: 14.5,
    outline: 'none',
  },
  sendBtn: {
    background: '#4a3f2f',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    padding: '0 22px',
    fontSize: 14.5,
    cursor: 'pointer',
  },
};
