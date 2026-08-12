import { useEffect, useRef, useState } from 'react';
import Head from 'next/head';
import JSZip from 'jszip';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

const APP_NAME = 'BDC Functional Review';
const APP_SUBTITLE = 'Organizational Design Review Agent';

const ink = '#2B2416';
const olive = '#6E6B47';
const brick = '#7A3B2E';
const parch = '#F7F3EA';
const line = '#E4DCC8';
const muted = '#857D68';

const WELCOME = {
  role: 'assistant',
  content:
    'Upload a functional review or enter responsibilities manually. I can check ownership, real overlaps, gaps, and structure alignment.',
};

const EMPTY_SUBMISSION = {
  division: '',
  department_function: '',
  prepared_by: null,
  submission_date: null,
  functional_statement: '',
  core_responsibilities: [],
  owns: [],
  does_not_own: [],
  key_outputs: [],
  interfaces: [],
  kpis: [],
  decision_authorities: [],
  success_factors_challenges: [],
  extracted_items: [],
};

export default function Home() {
  const [tab, setTab] = useState('review');

  return (
    <>
      <Head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,600&family=Inter:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </Head>

      <style>{`
        html, body, #__next {
          height: 100%;
          margin: 0;
          padding: 0;
        }

        * {
          box-sizing: border-box;
        }

        button,
        input,
        textarea,
        select {
          font: inherit;
        }

        textarea {
          resize: vertical;
        }
      `}</style>

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
            <TabButton
              active={tab === 'help'}
              onClick={() => setTab('help')}
            >
              How It Works
            </TabButton>

            <TabButton
              active={tab === 'review'}
              onClick={() => setTab('review')}
            >
              Function Review
            </TabButton>

            <TabButton
              active={tab === 'references'}
              onClick={() => setTab('references')}
            >
              Company References
            </TabButton>

            <TabButton
              active={tab === 'structure'}
              onClick={() => setTab('structure')}
            >
              Structure
            </TabButton>
          </nav>
        </header>

        {tab === 'help' && <HelpTab />}
        {tab === 'review' && <ReviewTab />}
        {tab === 'references' && <ReferencesTab />}
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
        borderBottom: active
          ? `2px solid ${brick}`
          : '2px solid transparent',
        fontWeight: active ? 600 : 500,
      }}
    >
      {children}
    </button>
  );
}

async function extractSlidesFromPptx(file) {
  const zip = await JSZip.loadAsync(file);

  const slideFiles = Object.keys(zip.files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
    .sort(
      (a, b) =>
        parseInt(a.match(/\d+/)[0], 10) -
        parseInt(b.match(/\d+/)[0], 10)
    );

  const texts = [];

  for (const name of slideFiles) {
    const xml = await zip.files[name].async('string');
    const matches = [...xml.matchAll(/<a:t>(.*?)<\/a:t>/gs)];

    texts.push(
      matches.map((m) => decodeXml(m[1])).join(' ')
    );
  }

  return texts
    .map((t, i) => `--- Slide ${i + 1} ---\n${t}`)
    .join('\n\n');
}

function decodeXml(value) {
  return String(value || '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

async function readReferenceFile(file) {
  const lower = file.name.toLowerCase();

  if (lower.endsWith('.pptx')) {
    return extractSlidesFromPptx(file);
  }

  if (
    lower.endsWith('.txt') ||
    lower.endsWith('.md') ||
    lower.endsWith('.csv')
  ) {
    return file.text();
  }

  throw new Error(
    'For reference uploads, use PPTX, TXT, MD, or CSV. You can also paste the content directly.'
  );
}

function ReviewTab() {
  const [messages, setMessages] = useState([WELCOME]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState('');
  const [file, setFile] = useState(null);
  const [rawText, setRawText] = useState('');
  const [userComment, setUserComment] = useState('');
  const [drafts, setDrafts] = useState([]);
  const [draftIndex, setDraftIndex] = useState(0);
  const [manualMode, setManualMode] = useState(false);
  const [savedSubmissions, setSavedSubmissions] = useState([]);
  const [selectedTarget, setSelectedTarget] = useState('');

  const fileRef = useRef(null);
  const scrollRef = useRef(null);

  const draft = drafts[draftIndex] || null;

  useEffect(() => {
    fetch('/api/chat-history')
      .then((r) => r.json())
      .then((data) => {
        if (data.messages?.length) {
          setMessages(data.messages);
        }
      })
      .catch(() => {});

    refreshSubmissions();
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: 'smooth',
    });
  }, [messages, sending]);

  async function refreshSubmissions() {
    try {
      const res = await fetch('/api/submissions');
      const data = await res.json();
      setSavedSubmissions(data.submissions || []);
    } catch (_) {}
  }

  function selectedSubmission() {
    return savedSubmissions.find(
      (x) => String(x.id) === String(selectedTarget)
    );
  }

  async function sendMessage(
    text,
    mode = 'chat',
    overrideTarget = null
  ) {
    if (!text.trim() || sending) return;

    const newMessages = [
      ...messages,
      {
        role: 'user',
        content: text,
      },
    ];

    setMessages(newMessages);
    setInput('');
    setSending(true);

    const target =
      overrideTarget || selectedSubmission();

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: newMessages,
          review_context: {
            mode,
            target_department_function:
              target?.department_function || null,
            target_division:
              target?.division || null,
            user_comment:
              userComment ||
              target?.user_comments ||
              '',
          },
        }),
      });

      const data = await res.json();

      setMessages([
        ...newMessages,
        {
          role: 'assistant',
          content:
            data.reply ||
            data.error ||
            'No response returned.',
        },
      ]);
    } catch (err) {
      setMessages([
        ...newMessages,
        {
          role: 'assistant',
          content: `Error: ${err.message}`,
        },
      ]);
    }

    setSending(false);
  }

  function handleFileChosen(e) {
    const chosen = e.target.files?.[0];

    if (!chosen) return;

    setFile(chosen);
    setRawText('');
    setDrafts([]);
    setDraftIndex(0);
    setManualMode(false);

    setStatus(
      'File attached. Add an optional comment, then extract the submission.'
    );

    e.target.value = '';
  }

  async function extractDocument() {
    if (!file) return;

    setStatus(`Reading ${file.name}…`);

    try {
      const text = await extractSlidesFromPptx(file);

      setRawText(text);

      setStatus(
        `Extracting responsibilities from ${file.name}…`
      );

      const res = await fetch('/api/extract', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          raw_text: text,
          source_filename: file.name,
          user_comment: userComment,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(
          data.error || 'Extraction failed'
        );
      }

      if (!data.submissions?.length) {
        throw new Error(
          'No completed department submission was found in this file.'
        );
      }

      setDrafts(data.submissions);
      setDraftIndex(0);

      setStatus(
        `Extracted ${data.submissions.length} submission${
          data.submissions.length === 1 ? '' : 's'
        }. Review the statements before saving.`
      );
    } catch (err) {
      setStatus(`Error. ${err.message}`);
    }
  }

  function startManual() {
    setFile(null);
    setRawText('');
    setManualMode(true);

    setDrafts([
      {
        ...EMPTY_SUBMISSION,
        extracted_items: [
          {
            type: 'responsibility',
            text: '',
          },
        ],
      },
    ]);

    setDraftIndex(0);

    setStatus(
      'Manual entry started. Add as many statements as needed.'
    );
  }

  function updateDraft(patch) {
    setDrafts((prev) =>
      prev.map((d, i) =>
        i === draftIndex
          ? {
              ...d,
              ...patch,
            }
          : d
      )
    );
  }

  function updateItem(index, patch) {
    const items = [
      ...(draft?.extracted_items || []),
    ];

    items[index] = {
      ...items[index],
      ...patch,
    };

    updateDraft({
      extracted_items: items,
    });
  }

  function removeItem(index) {
    updateDraft({
      extracted_items:
        (draft?.extracted_items || []).filter(
          (_, i) => i !== index
        ),
    });
  }

  function addItem() {
    updateDraft({
      extracted_items: [
        ...(draft?.extracted_items || []),
        {
          type: 'responsibility',
          text: '',
        },
      ],
    });
  }

  function normalizeDraftForSave(d) {
    const cleanItems = (d.extracted_items || [])
      .filter((x) => x.text?.trim())
      .map((x) => ({
        type: x.type || 'responsibility',
        text: x.text.trim(),
      }));

    const byType = (types) =>
      cleanItems
        .filter((x) => types.includes(x.type))
        .map((x) => x.text);

    const mandates = byType(['mandate']);

    return {
      ...d,

      functional_statement:
        mandates[0] ||
        d.functional_statement ||
        '',

      core_responsibilities: byType([
        'responsibility',
        'activity',
        'task',
        'function',
        'accountability',
      ]),

      owns: byType(['ownership']),

      does_not_own: byType(['boundary']),

      key_outputs: byType(['output']),

      interfaces: byType(['interface']),

      kpis: byType(['kpi']),

      decision_authorities: byType([
        'decision_authority',
      ]),

      extracted_items: cleanItems,
    };
  }

  async function saveDraft(
    runAfter = false,
    full = false
  ) {
    if (!draft) return;

    const normalized =
      normalizeDraftForSave(draft);

    if (
      !normalized.division.trim() ||
      !normalized.department_function.trim()
    ) {
      setStatus(
        'Division and department or function are required before saving.'
      );
      return;
    }

    setStatus('Saving submission…');

    try {
      const res = await fetch(
        '/api/submissions',
        {
          method: 'POST',
          headers: {
            'Content-Type':
              'application/json',
          },
          body: JSON.stringify({
            submission: normalized,
            raw_text: rawText,
            source_filename:
              file?.name || null,
            user_comments:
              userComment,
          }),
        }
      );

      const data = await res.json();

      if (!res.ok) {
        throw new Error(
          data.error || 'Save failed'
        );
      }

      setStatus('Submission saved.');

      await refreshSubmissions();

      setSelectedTarget(
        String(data.submission.id)
      );

      if (runAfter) {
        await sendMessage(
          full
            ? `Run a full OD review for ${normalized.department_function}. Compare it against everything available in the system.`
            : `Review ${normalized.department_function}. Show only meaningful findings that need OD attention.`,
          full
            ? 'full_review'
            : 'review',
          data.submission
        );
      }
    } catch (err) {
      setStatus(`Error. ${err.message}`);
    }
  }

  function runFullReview() {
    const target =
      selectedSubmission();

    sendMessage(
      target
        ? `Run a full OD review for ${target.department_function}. Compare it against everything available in the system.`
        : 'Run a full OD review across all active functions and everything available in the system.',
      'full_review'
    );
  }

  return (
    <div style={s.reviewLayout}>
      <div style={s.workspace}>
        <div style={s.workspaceHeader}>
          <div>
            <div style={s.sectionEyebrow}>
              WORKSPACE
            </div>

            <div style={s.workspaceTitle}>
              Prepare the function before review
            </div>
          </div>

          <div style={s.workspaceActions}>
            <input
              type="file"
              accept=".pptx"
              ref={fileRef}
              onChange={handleFileChosen}
              style={{
                display: 'none',
              }}
            />

            <button
              style={s.secondaryBtn}
              onClick={() =>
                fileRef.current?.click()
              }
            >
              Attach PPTX
            </button>

            <button
              style={s.secondaryBtn}
              onClick={startManual}
            >
              Manual Entry
            </button>
          </div>
        </div>

        {(file || manualMode || draft) && (
          <div style={s.prepareCard}>
            {file && (
              <div style={s.fileChipRow}>
                <div style={s.fileChip}>
                  📄 {file.name}
                </div>

                <button
                  style={s.textBtn}
                  onClick={() => {
                    setFile(null);
                    setDrafts([]);
                    setRawText('');
                    setStatus('');
                  }}
                >
                  Remove
                </button>
              </div>
            )}

            <label style={s.label}>
              Comments or instructions
            </label>

            <textarea
              style={s.commentBox}
              value={userComment}
              onChange={(e) =>
                setUserComment(
                  e.target.value
                )
              }
              placeholder={
                'Optional. Example: “This responsibility was requested by the CEO” or “Focus on the boundary with Commercial”.'
              }
            />

            {file && !draft && (
              <button
                style={s.primaryBtn}
                onClick={extractDocument}
              >
                Extract Responsibilities
              </button>
            )}

            {status && (
              <div style={s.status}>
                {status}
              </div>
            )}
          </div>
        )}

        {draft && (
          <SubmissionEditor
            draft={draft}
            updateDraft={updateDraft}
            updateItem={updateItem}
            removeItem={removeItem}
            addItem={addItem}
            drafts={drafts}
            draftIndex={draftIndex}
            setDraftIndex={
              setDraftIndex
            }
            onSave={() =>
              saveDraft(false, false)
            }
            onReview={() =>
              saveDraft(true, false)
            }
            onFullReview={() =>
              saveDraft(true, true)
            }
          />
        )}
      </div>

      <div style={s.reviewToolbar}>
        <select
          style={s.targetSelect}
          value={selectedTarget}
          onChange={(e) =>
            setSelectedTarget(
              e.target.value
            )
          }
        >
          <option value="">
            All active functions
          </option>

          {savedSubmissions.map(
            (x) => (
              <option
                key={x.id}
                value={x.id}
              >
                {x.department_function}{' '}
                · {x.division}
              </option>
            )
          )}
        </select>

        <button
          style={s.fullReviewBtn}
          onClick={runFullReview}
          disabled={sending}
        >
          Run Full Review
        </button>
      </div>

      <div
        style={s.chatArea}
        ref={scrollRef}
      >
        {messages.map((m, i) => (
          <div
            key={i}
            style={{
              ...s.bubbleRow,
              justifyContent:
                m.role === 'user'
                  ? 'flex-end'
                  : 'flex-start',
            }}
          >
            {m.role ===
              'assistant' && (
              <div style={s.avatar}>
                OD
              </div>
            )}

            <div
              style={
                m.role === 'user'
                  ? s.userBubble
                  : s.assistantBubble
              }
            >
              {m.role ===
              'assistant' ? (
                <ReactMarkdown
                  remarkPlugins={[
                    remarkGfm,
                  ]}
                  components={{
                    table: ({
                      children,
                    }) => (
                      <div
                        style={
                          s.tableScroll
                        }
                      >
                        <table
                          style={
                            s.markdownTable
                          }
                        >
                          {children}
                        </table>
                      </div>
                    ),

                    th: ({
                      children,
                    }) => (
                      <th
                        style={
                          s.markdownTh
                        }
                      >
                        {children}
                      </th>
                    ),

                    td: ({
                      children,
                    }) => (
                      <td
                        style={
                          s.markdownTd
                        }
                      >
                        {children}
                      </td>
                    ),

                    p: ({
                      children,
                    }) => (
                      <p
                        style={
                          s.markdownP
                        }
                      >
                        {children}
                      </p>
                    ),

                    ul: ({
                      children,
                    }) => (
                      <ul
                        style={
                          s.markdownList
                        }
                      >
                        {children}
                      </ul>
                    ),

                    ol: ({
                      children,
                    }) => (
                      <ol
                        style={
                          s.markdownList
                        }
                      >
                        {children}
                      </ol>
                    ),

                    li: ({
                      children,
                    }) => (
                      <li
                        style={
                          s.markdownLi
                        }
                      >
                        {children}
                      </li>
                    ),

                    h1: ({
                      children,
                    }) => (
                      <h1
                        style={
                          s.markdownH1
                        }
                      >
                        {children}
                      </h1>
                    ),

                    h2: ({
                      children,
                    }) => (
                      <h2
                        style={
                          s.markdownH2
                        }
                      >
                        {children}
                      </h2>
                    ),

                    h3: ({
                      children,
                    }) => (
                      <h3
                        style={
                          s.markdownH3
                        }
                      >
                        {children}
                      </h3>
                    ),

                    blockquote: ({
                      children,
                    }) => (
                      <blockquote
                        style={
                          s.markdownQuote
                        }
                      >
                        {children}
                      </blockquote>
                    ),

                    hr: () => (
                      <hr
                        style={
                          s.markdownHr
                        }
                      />
                    ),
                  }}
                >
                  {m.content}
                </ReactMarkdown>
              ) : (
                m.content
              )}
            </div>
          </div>
        ))}

        {sending && (
          <div style={s.bubbleRow}>
            <div style={s.avatar}>
              OD
            </div>

            <div
              style={
                s.assistantBubble
              }
            >
              <span
                style={s.thinking}
              >
                reviewing…
              </span>
            </div>
          </div>
        )}
      </div>

      <div style={s.composerWrap}>
        {file && (
          <div
            style={
              s.composerFileChip
            }
          >
            📄 {file.name}
          </div>
        )}

        <div style={s.inputRow}>
          <button
            style={s.attachBtn}
            onClick={() =>
              fileRef.current?.click()
            }
            title="Attach submission"
          >
            ＋
          </button>

          <textarea
            style={s.input}
            value={input}
            rows={1}
            placeholder="Ask about ownership, overlaps, gaps, or add context…"
            onChange={(e) =>
              setInput(e.target.value)
            }
            onKeyDown={(e) => {
              if (
                e.key === 'Enter' &&
                !e.shiftKey
              ) {
                e.preventDefault();
                sendMessage(input);
              }
            }}
          />

          <button
            style={s.sendBtn}
            onClick={() =>
              sendMessage(input)
            }
            disabled={sending}
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}

function SubmissionEditor({
  draft,
  updateDraft,
  updateItem,
  removeItem,
  addItem,
  drafts,
  draftIndex,
  setDraftIndex,
  onSave,
  onReview,
  onFullReview,
}) {
  return (
    <div style={s.editorCard}>
      <div style={s.editorHeader}>
        <div>
          <div
            style={s.sectionEyebrow}
          >
            EXTRACTED SUBMISSION
          </div>

          <div style={s.editorTitle}>
            Check what the AI
            captured
          </div>
        </div>

        {drafts.length > 1 && (
          <select
            style={s.smallSelect}
            value={draftIndex}
            onChange={(e) =>
              setDraftIndex(
                Number(
                  e.target.value
                )
              )
            }
          >
            {drafts.map((d, i) => (
              <option
                key={i}
                value={i}
              >
                {d.department_function ||
                  `Submission ${
                    i + 1
                  }`}
              </option>
            ))}
          </select>
        )}
      </div>

      <div style={s.twoCol}>
        <Field
          label="Division"
          value={
            draft.division || ''
          }
          onChange={(v) =>
            updateDraft({
              division: v,
            })
          }
        />

        <Field
          label="Department or function"
          value={
            draft.department_function ||
            ''
          }
          onChange={(v) =>
            updateDraft({
              department_function:
                v,
            })
          }
        />
      </div>

      <label style={s.label}>
        Functional statement or
        mandate
      </label>

      <textarea
        style={s.longField}
        value={
          draft.functional_statement ||
          ''
        }
        onChange={(e) =>
          updateDraft({
            functional_statement:
              e.target.value,
          })
        }
      />

      <div style={s.itemsHeader}>
        <div>
          <div style={s.label}>
            Extracted statements
          </div>

          <div
            style={s.helperText}
          >
            Edit, remove, or add
            anything before the
            review. This is the audit
            list the agent will use.
          </div>
        </div>

        <button
          style={s.textBtn}
          onClick={addItem}
        >
          ＋ Add item
        </button>
      </div>

      <div style={s.itemList}>
        {(draft.extracted_items ||
          []).map((item, i) => (
          <div
            key={i}
            style={s.itemRow}
          >
            <select
              style={s.typeSelect}
              value={
                item.type ||
                'responsibility'
              }
              onChange={(e) =>
                updateItem(i, {
                  type: e.target
                    .value,
                })
              }
            >
              {ITEM_TYPES.map(
                (t) => (
                  <option
                    key={t.value}
                    value={t.value}
                  >
                    {t.label}
                  </option>
                )
              )}
            </select>

            <textarea
              style={s.itemText}
              rows={2}
              value={item.text || ''}
              onChange={(e) =>
                updateItem(i, {
                  text: e.target
                    .value,
                })
              }
            />

            <button
              style={s.removeBtn}
              onClick={() =>
                removeItem(i)
              }
              aria-label="Remove item"
            >
              ×
            </button>
          </div>
        ))}
      </div>

      <div style={s.editorFooter}>
        <button
          style={s.secondaryBtn}
          onClick={onSave}
        >
          Save Submission
        </button>

        <button
          style={s.secondaryBtn}
          onClick={onReview}
        >
          Save and Run Review
        </button>

        <button
          style={s.primaryBtn}
          onClick={onFullReview}
        >
          Save and Run Full Review
        </button>
      </div>
    </div>
  );
}

const ITEM_TYPES = [
  {
    value: 'mandate',
    label: 'Mandate',
  },
  {
    value: 'responsibility',
    label: 'Responsibility',
  },
  {
    value: 'accountability',
    label: 'Accountability',
  },
  {
    value: 'ownership',
    label: 'Owns',
  },
  {
    value: 'boundary',
    label: 'Does Not Own',
  },
  {
    value: 'activity',
    label: 'Activity',
  },
  {
    value: 'task',
    label: 'Task',
  },
  {
    value: 'function',
    label: 'Function',
  },
  {
    value: 'output',
    label: 'Output',
  },
  {
    value: 'interface',
    label: 'Interface',
  },
  {
    value: 'kpi',
    label: 'KPI',
  },
  {
    value: 'decision_authority',
    label: 'Decision Right',
  },
  {
    value: 'other',
    label: 'Other',
  },
];

function Field({
  label,
  value,
  onChange,
}) {
  return (
    <div>
      <label style={s.label}>
        {label}
      </label>

      <input
        style={s.field}
        value={value}
        onChange={(e) =>
          onChange(e.target.value)
        }
      />
    </div>
  );
}

function ReferencesTab() {
  const [refs, setRefs] =
    useState([]);
  const [file, setFile] =
    useState(null);
  const [title, setTitle] =
    useState('');
  const [type, setType] =
    useState('company_goals');
  const [notes, setNotes] =
    useState('');
  const [content, setContent] =
    useState('');
  const [status, setStatus] =
    useState('');

  const fileRef = useRef(null);

  useEffect(() => {
    loadRefs();
  }, []);

  async function loadRefs() {
    try {
      const res = await fetch(
        '/api/references'
      );

      const data =
        await res.json();

      setRefs(
        data.references || []
      );
    } catch (_) {}
  }

  async function chooseReference(
    e
  ) {
    const chosen =
      e.target.files?.[0];

    if (!chosen) return;

    setFile(chosen);

    if (!title) {
      setTitle(
        chosen.name.replace(
          /\.[^.]+$/,
          ''
        )
      );
    }

    setStatus(
      `Reading ${chosen.name}…`
    );

    try {
      const text =
        await readReferenceFile(
          chosen
        );

      setContent(text);

      setStatus(
        'Reference extracted. Review the text or save it as is.'
      );
    } catch (err) {
      setStatus(
        `Error. ${err.message}`
      );
    }

    e.target.value = '';
  }

  async function saveReference() {
    if (
      !title.trim() ||
      !content.trim()
    ) {
      setStatus(
        'Title and reference content are required.'
      );
      return;
    }

    setStatus(
      'Saving reference…'
    );

    try {
      const res = await fetch(
        '/api/references',
        {
          method: 'POST',
          headers: {
            'Content-Type':
              'application/json',
          },
          body: JSON.stringify({
            title,
            reference_type: type,
            content,
            source_filename:
              file?.name || null,
            notes,
          }),
        }
      );

      const data =
        await res.json();

      if (!res.ok) {
        throw new Error(
          data.error ||
            'Save failed'
        );
      }

      setStatus(
        'Reference saved. It will now be used in Full Review.'
      );

      setFile(null);
      setTitle('');
      setNotes('');
      setContent('');

      loadRefs();
    } catch (err) {
      setStatus(
        `Error. ${err.message}`
      );
    }
  }

  return (
    <div
      style={s.referencesArea}
    >
      <div
        style={
          s.referencesIntro
        }
      >
        <div
          style={s.sectionEyebrow}
        >
          COMPANY KNOWLEDGE
        </div>

        <h2
          style={s.referenceH2}
        >
          Goals, strategy,
          business plans and
          mandates
        </h2>

        <p
          style={
            s.referenceLead
          }
        >
          Save the company
          references the OD agent
          should use when deciding
          whether responsibilities
          make sense for BDC.
        </p>
      </div>

      <div
        style={s.referenceForm}
      >
        <div style={s.twoCol}>
          <Field
            label="Reference title"
            value={title}
            onChange={setTitle}
          />

          <div>
            <label
              style={s.label}
            >
              Reference type
            </label>

            <select
              style={s.field}
              value={type}
              onChange={(e) =>
                setType(
                  e.target.value
                )
              }
            >
              <option value="company_goals">
                Company Goals
              </option>

              <option value="strategy">
                Strategic Priorities
              </option>

              <option value="business_plan">
                Business Plan
              </option>

              <option value="functional_mandate">
                Functional Mandate
              </option>

              <option value="operating_model">
                Operating Model
              </option>

              <option value="company_reference">
                Other Reference
              </option>
            </select>
          </div>
        </div>

        <label style={s.label}>
          Notes for the agent
        </label>

        <textarea
          style={s.commentBox}
          value={notes}
          onChange={(e) =>
            setNotes(
              e.target.value
            )
          }
          placeholder="Optional context about this reference"
        />

        <div
          style={s.fileChipRow}
        >
          <input
            type="file"
            accept=".pptx,.txt,.md,.csv"
            ref={fileRef}
            onChange={
              chooseReference
            }
            style={{
              display: 'none',
            }}
          />

          <button
            style={s.secondaryBtn}
            onClick={() =>
              fileRef.current?.click()
            }
          >
            Upload Reference
          </button>

          {file && (
            <div
              style={s.fileChip}
            >
              📄 {file.name}
            </div>
          )}
        </div>

        <label style={s.label}>
          Reference content
        </label>

        <textarea
          style={
            s.referenceContent
          }
          value={content}
          onChange={(e) =>
            setContent(
              e.target.value
            )
          }
          placeholder="Upload a file or paste company goals, strategy, business plan, mandate, or other reference text here."
        />

        <button
          style={s.primaryBtn}
          onClick={saveReference}
        >
          Save to Agent Knowledge
        </button>

        {status && (
          <div style={s.status}>
            {status}
          </div>
        )}
      </div>

      <div style={s.savedRefs}>
        <div
          style={s.editorTitle}
        >
          Saved references
        </div>

        {refs.length === 0 && (
          <div
            style={s.emptyText}
          >
            No company references
            saved yet.
          </div>
        )}

        {refs.map((r) => (
          <div
            key={r.id}
            style={s.refCard}
          >
            <div
              style={s.refType}
            >
              {String(
                r.reference_type ||
                  ''
              ).replace(
                /_/g,
                ' '
              )}
            </div>

            <div
              style={s.refTitle}
            >
              {r.title}
            </div>

            {r.notes && (
              <div
                style={
                  s.refNotes
                }
              >
                {r.notes}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function StructureTab() {
  const [tree, setTree] =
    useState(null);

  const [loading, setLoading] =
    useState(true);

  useEffect(() => {
    fetch('/api/structure')
      .then((r) => r.json())
      .then((data) => {
        setTree(
          data.tree || []
        );
        setLoading(false);
      });
  }, []);

  return (
    <div
      style={s.structureArea}
    >
      <div
        style={
          s.structureIntro
        }
      >
        Approved organization
        structure used by the OD
        agent. Confirmed reporting
        changes made through the
        review agent update this
        live structure.
      </div>

      {loading && (
        <div
          style={{
            color: olive,
            padding: 20,
          }}
        >
          Loading…
        </div>
      )}

      <div style={s.orgChart}>
        <div style={s.ceoNode}>
          CEO
        </div>

        <div
          style={s.stemDown}
        />

        <div
          style={
            s.divisionsRow
          }
        >
          {(tree || []).map(
            (division) => (
              <div
                key={
                  division.id
                }
                style={
                  s.divisionCol
                }
              >
                <div
                  style={
                    s.stemSmall
                  }
                />

                <div
                  style={
                    s.divisionBox
                  }
                >
                  {division.name}
                </div>

                {division.children
                  .length > 0 && (
                  <>
                    <div
                      style={
                        s.stemSmall
                      }
                    />

                    <div
                      style={
                        s.deptStack
                      }
                    >
                      {division.children.map(
                        (d) => (
                          <div
                            key={
                              d.id
                            }
                            style={
                              s.deptBox
                            }
                          >
                            {
                              d.name
                            }
                          </div>
                        )
                      )}
                    </div>
                  </>
                )}
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
}

function HelpTab() {
  const steps = [
    [
      'Add the function',
      'Upload the completed PPTX or enter responsibilities manually. Add any context before extraction.',
    ],
    [
      'Check the extraction',
      'The agent shows every relevant submitted statement first. Edit, remove, or add items before saving.',
    ],
    [
      'Run the review',
      'Run a focused review or a Full Review against all saved functions, the approved structure, company references, and OD rules.',
    ],
    [
      'Calibrate and update',
      'Use the concise findings in the department meeting, then update the final responsibilities and save the agreed version.',
    ],
  ];

  return (
    <div style={s.helpArea}>
      <h2 style={s.helpH2}>
        OD review workflow
      </h2>

      <p style={s.helpLead}>
        This is a working tool for
        building BDC's functional
        responsibility model, not
        only a document chatbot.
        The review should help OD
        confirm who owns what,
        remove real duplication,
        and identify important
        missing ownership.
      </p>

      {steps.map(
        (step, i) => (
          <div
            style={s.helpStep}
            key={step[0]}
          >
            <div
              style={
                s.helpStepNum
              }
            >
              0{i + 1}
            </div>

            <div>
              <div
                style={
                  s.helpStepTitle
                }
              >
                {step[0]}
              </div>

              <div
                style={
                  s.helpStepBody
                }
              >
                {step[1]}
              </div>
            </div>
          </div>
        )
      )}
    </div>
  );
}

const s = {
  page: {
    width: '100%',
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column',
    fontFamily:
      "'Inter', -apple-system, sans-serif",
    background: parch,
    color: ink,
  },

  header: {
    position: 'relative',
    background: '#fff',
    borderBottom: `1px solid ${line}`,
    flexShrink: 0,
  },

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
    padding:
      'clamp(14px, 4vw, 20px) clamp(14px, 4vw, 28px) 12px',
  },

  title: {
    fontFamily:
      "'Fraunces', serif",
    fontSize:
      'clamp(22px, 5vw, 28px)',
    fontWeight: 600,
    color: ink,
  },

  subtitle: {
    fontSize: 12.5,
    color: olive,
    marginTop: 2,
  },

  tabRow: {
    position: 'relative',
    display: 'flex',
    gap: 4,
    overflowX: 'auto',
    whiteSpace: 'nowrap',
    padding:
      '0 clamp(10px, 4vw, 24px)',
  },

  tabBtn: {
    background: 'none',
    border: 'none',
    padding: '10px 12px',
    fontSize: 13.5,
    cursor: 'pointer',
    flexShrink: 0,
  },

  reviewLayout: {
    flex: 1,
    minHeight: 0,
    display: 'flex',
    flexDirection: 'column',
  },

  workspace: {
    background: '#fff',
    borderBottom: `1px solid ${line}`,
    padding:
      '14px clamp(14px, 4vw, 28px)',
  },

  workspaceHeader: {
    display: 'flex',
    gap: 12,
    justifyContent:
      'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
  },

  workspaceTitle: {
    fontFamily:
      "'Fraunces', serif",
    fontSize: 18,
    fontWeight: 600,
  },

  sectionEyebrow: {
    fontSize: 10.5,
    letterSpacing: '0.12em',
    color: olive,
    fontWeight: 600,
    marginBottom: 3,
  },

  workspaceActions: {
    display: 'flex',
    gap: 8,
    flexWrap: 'wrap',
  },

  prepareCard: {
    marginTop: 12,
    padding: 12,
    border: `1px solid ${line}`,
    borderRadius: 10,
    background: parch,
  },

  fileChipRow: {
    display: 'flex',
    gap: 8,
    alignItems: 'center',
    flexWrap: 'wrap',
    marginBottom: 10,
  },

  fileChip: {
    display: 'inline-flex',
    maxWidth: '100%',
    padding: '7px 10px',
    borderRadius: 7,
    background: '#fff',
    border: `1px solid ${line}`,
    fontSize: 12.5,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },

  composerFileChip: {
    alignSelf: 'flex-start',
    margin: '0 0 6px 44px',
    padding: '5px 9px',
    borderRadius: 6,
    background: parch,
    border: `1px solid ${line}`,
    fontSize: 11.5,
    maxWidth:
      'calc(100% - 60px)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },

  label: {
    display: 'block',
    fontSize: 11.5,
    color: olive,
    fontWeight: 600,
    marginBottom: 5,
  },

  helperText: {
    color: muted,
    fontSize: 11.5,
    lineHeight: 1.45,
    marginTop: 2,
  },

  commentBox: {
    width: '100%',
    minHeight: 70,
    border: `1px solid ${line}`,
    borderRadius: 8,
    padding: 10,
    outline: 'none',
    background: '#fff',
    color: ink,
    fontSize: 13,
    marginBottom: 10,
  },

  status: {
    fontSize: 12,
    color: olive,
    marginTop: 9,
    lineHeight: 1.45,
  },

  editorCard: {
    marginTop: 14,
    padding: 14,
    border: `1px solid ${line}`,
    borderRadius: 10,
    background: '#fff',
  },

  editorHeader: {
    display: 'flex',
    justifyContent:
      'space-between',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },

  editorTitle: {
    fontFamily:
      "'Fraunces', serif",
    fontSize: 17,
    fontWeight: 600,
  },

  twoCol: {
    display: 'grid',
    gridTemplateColumns:
      'repeat(auto-fit, minmax(200px, 1fr))',
    gap: 10,
    marginBottom: 10,
  },

  field: {
    width: '100%',
    minHeight: 38,
    border: `1px solid ${line}`,
    borderRadius: 7,
    padding: '8px 10px',
    background: parch,
    outline: 'none',
    color: ink,
    fontSize: 13,
  },

  longField: {
    width: '100%',
    minHeight: 72,
    border: `1px solid ${line}`,
    borderRadius: 7,
    padding: '9px 10px',
    background: parch,
    outline: 'none',
    color: ink,
    fontSize: 13,
    marginBottom: 12,
  },

  itemsHeader: {
    display: 'flex',
    alignItems:
      'flex-start',
    justifyContent:
      'space-between',
    gap: 10,
    marginBottom: 8,
  },

  itemList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 7,
  },

  itemRow: {
    display: 'grid',
    gridTemplateColumns:
      '130px minmax(0, 1fr) 32px',
    gap: 7,
    alignItems: 'start',
  },

  typeSelect: {
    minHeight: 42,
    border: `1px solid ${line}`,
    borderRadius: 7,
    padding: '7px',
    background: '#fff',
    color: ink,
    fontSize: 11.5,
  },

  itemText: {
    width: '100%',
    minHeight: 42,
    border: `1px solid ${line}`,
    borderRadius: 7,
    padding: '8px 9px',
    background: parch,
    color: ink,
    fontSize: 12.5,
    outline: 'none',
  },

  removeBtn: {
    width: 32,
    height: 32,
    borderRadius: 7,
    border: `1px solid ${line}`,
    background: '#fff',
    color: brick,
    cursor: 'pointer',
    fontSize: 18,
  },

  editorFooter: {
    display: 'flex',
    gap: 8,
    flexWrap: 'wrap',
    marginTop: 12,
  },

  primaryBtn: {
    background: brick,
    color: '#fff',
    border: 'none',
    borderRadius: 7,
    padding: '9px 14px',
    fontSize: 12.5,
    fontWeight: 600,
    cursor: 'pointer',
  },

  secondaryBtn: {
    background: '#fff',
    color: olive,
    border: `1px solid ${olive}`,
    borderRadius: 7,
    padding: '8px 12px',
    fontSize: 12.5,
    fontWeight: 500,
    cursor: 'pointer',
  },

  textBtn: {
    border: 'none',
    background:
      'transparent',
    color: brick,
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
    padding: 4,
  },

  smallSelect: {
    border: `1px solid ${line}`,
    borderRadius: 7,
    padding: '7px 9px',
    background: parch,
    fontSize: 12,
  },

  reviewToolbar: {
    padding:
      '10px clamp(14px, 4vw, 28px)',
    background: '#fff',
    display: 'flex',
    gap: 8,
    borderBottom: `1px solid ${line}`,
    alignItems: 'center',
  },

  targetSelect: {
    minWidth: 0,
    flex: 1,
    maxWidth: 420,
    border: `1px solid ${line}`,
    borderRadius: 7,
    padding: '8px 10px',
    background: parch,
    color: ink,
    fontSize: 12.5,
  },

  fullReviewBtn: {
    background: olive,
    color: '#fff',
    border: 'none',
    borderRadius: 7,
    padding: '9px 13px',
    fontSize: 12.5,
    fontWeight: 600,
    cursor: 'pointer',
    flexShrink: 0,
  },

  chatArea: {
    flex: 1,
    minHeight: 240,
    overflowY: 'auto',
    padding:
      '16px clamp(14px, 4vw, 28px)',
    display: 'flex',
    flexDirection: 'column',
    gap: 13,
  },

  bubbleRow: {
    display: 'flex',
    alignItems:
      'flex-start',
    gap: 9,
  },

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
    justifyContent:
      'center',
    flexShrink: 0,
    marginTop: 2,
  },

  userBubble: {
    background: brick,
    color: '#fff',
    padding: '10px 13px',
    borderRadius:
      '14px 14px 3px 14px',
    maxWidth: '82%',
    whiteSpace:
      'pre-wrap',
    fontSize: 13.5,
    lineHeight: 1.5,
  },

  assistantBubble: {
    background: '#fff',
    border: `1px solid ${line}`,
    color: ink,
    padding: '10px 13px',
    borderRadius:
      '3px 14px 14px 14px',
    maxWidth: '88%',
    whiteSpace: 'normal',
    fontSize: 13.5,
    lineHeight: 1.52,
    overflow: 'hidden',
  },

  tableScroll: {
    width: '100%',
    overflowX: 'auto',
    WebkitOverflowScrolling:
      'touch',
    margin: '10px 0 12px',
  },

  markdownTable: {
    width: '100%',
    minWidth: 460,
    borderCollapse:
      'collapse',
    tableLayout: 'auto',
    background: '#fff',
    fontSize: 12.5,
    lineHeight: 1.45,
  },

  markdownTh: {
    border: `1px solid ${line}`,
    padding: '9px 10px',
    textAlign: 'left',
    verticalAlign: 'top',
    background: parch,
    color: ink,
    fontWeight: 600,
    whiteSpace: 'normal',
  },

  markdownTd: {
    border: `1px solid ${line}`,
    padding: '9px 10px',
    textAlign: 'left',
    verticalAlign: 'top',
    background: '#fff',
    color: ink,
    whiteSpace: 'normal',
  },

  markdownP: {
    margin: '0 0 9px',
    lineHeight: 1.55,
  },

  markdownList: {
    margin: '6px 0 10px',
    paddingLeft: 22,
  },

  markdownLi: {
    marginBottom: 4,
  },

  markdownH1: {
    fontFamily:
      "'Fraunces', serif",
    fontSize: 20,
    margin: '4px 0 10px',
    color: ink,
  },

  markdownH2: {
    fontFamily:
      "'Fraunces', serif",
    fontSize: 18,
    margin: '10px 0 8px',
    color: ink,
  },

  markdownH3: {
    fontSize: 14.5,
    margin: '10px 0 6px',
    color: brick,
    fontWeight: 600,
  },

  markdownQuote: {
    margin: '8px 0 10px',
    padding: '8px 10px',
    borderLeft:
      `3px solid ${olive}`,
    background: parch,
    color: ink,
  },

  markdownHr: {
    border: 'none',
    borderTop:
      `1px solid ${line}`,
    margin: '12px 0',
  },

  thinking: {
    color: olive,
    fontStyle: 'italic',
    fontFamily:
      "'Fraunces', serif",
  },

  composerWrap: {
    position: 'sticky',
    bottom: 0,
    background: '#fff',
    borderTop: `1px solid ${line}`,
    padding:
      '9px clamp(10px, 3vw, 20px) 12px',
    zIndex: 4,
  },

  inputRow: {
    display: 'flex',
    gap: 8,
    alignItems: 'stretch',
  },

  attachBtn: {
    width: 38,
    minWidth: 38,
    borderRadius: 9,
    border: `1px solid ${line}`,
    background: parch,
    color: brick,
    fontSize: 22,
    cursor: 'pointer',
  },

  input: {
    flex: 1,
    minWidth: 0,
    maxHeight: 110,
    padding: '11px 12px',
    borderRadius: 9,
    border: `1px solid ${line}`,
    fontSize: 13.5,
    outline: 'none',
    background: parch,
    color: ink,
  },

  sendBtn: {
    background: ink,
    color: '#fff',
    border: 'none',
    borderRadius: 9,
    padding: '0 20px',
    fontSize: 13.5,
    fontWeight: 500,
    cursor: 'pointer',
  },

  referencesArea: {
    flex: 1,
    overflowY: 'auto',
    padding:
      '20px clamp(14px, 4vw, 28px)',
    maxWidth: 900,
  },

  referencesIntro: {
    marginBottom: 16,
  },

  referenceH2: {
    fontFamily:
      "'Fraunces', serif",
    fontSize: 23,
    margin: '2px 0 6px',
  },

  referenceLead: {
    margin: 0,
    color: muted,
    lineHeight: 1.55,
    fontSize: 13.5,
  },

  referenceForm: {
    background: '#fff',
    border: `1px solid ${line}`,
    borderRadius: 10,
    padding: 14,
  },

  referenceContent: {
    width: '100%',
    minHeight: 190,
    border: `1px solid ${line}`,
    borderRadius: 8,
    padding: 10,
    outline: 'none',
    background: parch,
    color: ink,
    fontSize: 12.5,
    marginBottom: 10,
  },

  savedRefs: {
    marginTop: 18,
  },

  refCard: {
    background: '#fff',
    border: `1px solid ${line}`,
    borderRadius: 9,
    padding: 11,
    marginTop: 8,
  },

  refType: {
    fontSize: 9.5,
    letterSpacing:
      '0.08em',
    textTransform:
      'uppercase',
    color: olive,
    fontWeight: 600,
  },

  refTitle: {
    fontSize: 13.5,
    fontWeight: 600,
    marginTop: 3,
  },

  refNotes: {
    fontSize: 12,
    color: muted,
    marginTop: 4,
    lineHeight: 1.45,
  },

  emptyText: {
    color: muted,
    fontSize: 12.5,
    marginTop: 8,
  },

  structureArea: {
    flex: 1,
    overflow: 'auto',
    padding:
      'clamp(16px, 5vw, 28px)',
  },

  structureIntro: {
    fontSize: 13,
    color: olive,
    marginBottom: 24,
    maxWidth: 620,
    lineHeight: 1.5,
  },

  orgChart: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    minWidth: 'fit-content',
  },

  ceoNode: {
    background: brick,
    color: '#fff',
    fontFamily:
      "'Fraunces', serif",
    fontWeight: 600,
    padding: '10px 26px',
    borderRadius: 6,
    fontSize: 15,
  },

  stemDown: {
    width: 2,
    height: 22,
    background: line,
  },

  divisionsRow: {
    display: 'flex',
    gap: 22,
    borderTop:
      `2px solid ${line}`,
    width: 'fit-content',
  },

  divisionCol: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
  },

  divisionBox: {
    background: olive,
    color: '#fff',
    fontSize: 13,
    fontWeight: 600,
    padding: '9px 14px',
    borderRadius: 6,
    whiteSpace: 'nowrap',
  },

  stemSmall: {
    width: 2,
    height: 16,
    background: line,
  },

  deptStack: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },

  deptBox: {
    background: '#fff',
    border: `1px solid ${line}`,
    borderRadius: 5,
    padding: '6px 12px',
    fontSize: 12,
    whiteSpace: 'nowrap',
    textAlign: 'center',
  },

  helpArea: {
    flex: 1,
    overflowY: 'auto',
    padding:
      '22px clamp(14px, 4vw, 28px)',
    maxWidth: 700,
  },

  helpH2: {
    fontFamily:
      "'Fraunces', serif",
    fontSize: 24,
    marginBottom: 10,
  },

  helpLead: {
    fontSize: 14.5,
    lineHeight: 1.65,
    marginBottom: 24,
  },

  helpStep: {
    display: 'flex',
    gap: 16,
    marginBottom: 20,
  },

  helpStepNum: {
    fontFamily:
      "'Fraunces', serif",
    fontSize: 21,
    color: line,
    fontWeight: 600,
    width: 32,
  },

  helpStepTitle: {
    fontSize: 14.5,
    fontWeight: 600,
    marginBottom: 4,
    color: brick,
  },

  helpStepBody: {
    fontSize: 13.5,
    lineHeight: 1.6,
  },
};
