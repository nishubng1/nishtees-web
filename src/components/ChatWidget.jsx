import { useState, useRef, useEffect } from 'react';

const OPENERS = [
  'Do these shrink?',
  'What size should I take?',
  'When will you restock?',
  'How do returns work?',
];

export default function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [threadId, setThreadId] = useState(null);
  const [offerHandoff, setOfferHandoff] = useState(false);
  const [contact, setContact] = useState('');
  const [handedOff, setHandedOff] = useState(false);
  const endRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, busy]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  // Escape closes, which people expect and screen-reader users rely on
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && open) setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  async function send(text) {
    const question = (text ?? input).trim();
    if (!question || busy) return;

    setMessages((m) => [...m, { role: 'user', text: question }]);
    setInput('');
    setBusy(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message: question, thread_id: threadId }),
      });
      const data = await res.json();
      if (data.thread_id) setThreadId(data.thread_id);
      // Offer a person only when the bot admitted it couldn't help, and only
      // once per conversation — repeatedly asking for an email is nagging.
      if (data.offer_handoff && !handedOff) setOfferHandoff(true);
      setMessages((m) => [...m, {
        role: 'bot',
        text: data.reply ?? "Something went wrong on our side. Email support@nishtees.in and we'll sort it out.",
      }]);
    } catch {
      setMessages((m) => [...m, {
        role: 'bot',
        text: "I can't reach our system right now. Email support@nishtees.in and someone will help.",
      }]);
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  }

  async function requestHuman() {
    const value = contact.trim();
    if (!value || busy) return;
    setBusy(true);
    try {
      const isPhone = /^[6-9]\d{9}$/.test(value.replace(/\D/g, ''));
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          thread_id: threadId,
          contact: isPhone ? { phone: value } : { email: value },
        }),
      });
      const data = await res.json();
      setMessages((m) => [...m, { role: 'bot', text: data.reply }]);
      if (data.handed_off) { setHandedOff(true); setOfferHandoff(false); setContact(''); }
    } catch {
      setMessages((m) => [...m, {
        role: 'bot',
        text: "I couldn't save that. Email support@nishtees.in and we'll pick it up there.",
      }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {/* Launcher */}
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? 'Close chat' : 'Chat with us'}
        aria-expanded={open}
        className="fixed bottom-5 right-5 z-50 flex h-14 w-14 items-center justify-center
                   rounded-full bg-ink text-paper shadow-lg transition hover:bg-accent
                   focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2
                   focus-visible:outline-accent"
      >
        {open ? (
          <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.75">
            <path d="M21 12a8 8 0 01-8 8H4l2-3a8 8 0 1115-5z" strokeLinejoin="round" />
          </svg>
        )}
      </button>

      {/* Panel */}
      {open && (
        <div
          role="dialog"
          aria-label="Customer support chat"
          className="fixed bottom-24 right-5 z-50 flex h-[30rem] w-[calc(100vw-2.5rem)] max-w-sm
                     flex-col border border-ink/15 bg-paper shadow-2xl"
        >
          <header className="border-b border-ink/10 bg-ink px-4 py-3 text-paper">
            <p className="font-display text-lg leading-none tracking-tight">nishTees</p>
            <p className="mt-1 text-xs text-paper/60">
              Ask about sizing, shipping or your order
            </p>
          </header>

          <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
            {messages.length === 0 && (
              <div>
                <p className="text-sm text-ink/70">
                  Hi — ask me anything about the tees or your order. If I don't
                  know, I'll say so rather than guess.
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {OPENERS.map((q) => (
                    <button
                      key={q}
                      onClick={() => send(q)}
                      className="border border-ink/20 px-3 py-1.5 text-xs text-ink/80
                                 transition hover:border-ink hover:text-ink"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((m, i) => (
              <div key={i} className={m.role === 'user' ? 'flex justify-end' : ''}>
                <p
                  className={
                    m.role === 'user'
                      ? 'max-w-[85%] whitespace-pre-line bg-ink px-3 py-2 text-sm text-paper'
                      : 'max-w-[90%] whitespace-pre-line border-l-2 border-accent bg-ink/[0.03] px-3 py-2 text-sm text-ink'
                  }
                >
                  {m.text}
                </p>
              </div>
            ))}

            {offerHandoff && !handedOff && (
              <div className="border border-ink/15 bg-ink/[0.03] p-3">
                <p className="text-sm text-ink/80">
                  Want a person to answer this? Leave your email or mobile and
                  we'll get back to you within one working day.
                </p>
                <div className="mt-2 flex gap-2">
                  <label htmlFor="nt-chat-contact" className="sr-only">Email or mobile</label>
                  <input
                    id="nt-chat-contact"
                    value={contact}
                    onChange={(e) => setContact(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && requestHuman()}
                    placeholder="you@email.com or 98765 43210"
                    className="min-w-0 flex-1 border border-ink/20 bg-paper px-2 py-1.5 text-sm
                               text-ink placeholder:text-ink/40 focus:border-ink focus:outline-none"
                  />
                  <button
                    onClick={requestHuman}
                    disabled={busy || !contact.trim()}
                    className="bg-accent px-3 py-1.5 text-sm font-semibold text-white
                               disabled:cursor-not-allowed disabled:bg-ink/25"
                  >
                    Send
                  </button>
                </div>
                <button
                  onClick={() => setOfferHandoff(false)}
                  className="mt-2 text-xs text-ink/50 underline underline-offset-2"
                >
                  No thanks
                </button>
              </div>
            )}

            {busy && (
              <p className="text-sm text-ink/40" aria-live="polite">Typing…</p>
            )}
            <div ref={endRef} />
          </div>

          <div className="border-t border-ink/10 p-3">
            <div className="flex gap-2">
              <label htmlFor="nt-chat-input" className="sr-only">Your message</label>
              <input
                id="nt-chat-input"
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && send()}
                placeholder="Type your question…"
                maxLength={500}
                className="min-w-0 flex-1 border border-ink/20 bg-paper px-3 py-2 text-sm
                           text-ink placeholder:text-ink/40 focus:border-ink focus:outline-none"
              />
              <button
                onClick={() => send()}
                disabled={busy || !input.trim()}
                className="bg-ink px-4 py-2 text-sm font-semibold text-paper transition
                           hover:bg-accent disabled:cursor-not-allowed disabled:bg-ink/25"
              >
                Send
              </button>
            </div>
            <p className="mt-2 text-[11px] text-ink/45">
              Automated replies. For anything urgent, email support@nishtees.in
            </p>
          </div>
        </div>
      )}
    </>
  );
}
