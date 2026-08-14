import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { streamAiChat, fetchHouseholds } from "../../api";

const SUGGESTIONS = [
  "What's my net worth right now?",
  "How diversified is my portfolio?",
  "What are my biggest gainers and losers?",
  "How am I doing vs the S&P 500?",
];

function Message({ role, content, pending }) {
  const isUser = role === "user";
  return (
    <div style={{ display: "flex", justifyContent: isUser ? "flex-end" : "flex-start" }}>
      <div
        style={{
          maxWidth: "85%",
          padding: "0.625rem 0.875rem",
          borderRadius: isUser ? "12px 12px 2px 12px" : "12px 12px 12px 2px",
          background: isUser ? "var(--primary)" : "var(--bg-secondary)",
          color: isUser ? "var(--text-inverse)" : "var(--text)",
          fontSize: "0.875rem",
          lineHeight: 1.5,
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
        }}
      >
        {content || (pending ? <TypingDots /> : "")}
      </div>
    </div>
  );
}

function TypingDots() {
  return (
    <span style={{ display: "inline-flex", gap: "3px", alignItems: "center", padding: "0.15rem 0" }}>
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          animate={{ opacity: [0.3, 1, 0.3] }}
          transition={{ duration: 1, repeat: Infinity, delay: i * 0.15 }}
          style={{ width: 5, height: 5, borderRadius: "50%", background: "var(--text-muted)", display: "inline-block" }}
        />
      ))}
    </span>
  );
}

export default function CopilotChat() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState(null);
  const [notConfigured, setNotConfigured] = useState(false);
  const [householdId, setHouseholdId] = useState("");
  const abortRef = useRef(null);
  const scrollRef = useRef(null);

  const { data: households = [] } = useQuery({
    queryKey: ["households"],
    queryFn: fetchHouseholds,
    enabled: open,
    staleTime: 1000 * 60 * 5,
  });

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, open]);

  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  useEffect(() => {
    if (!open) return;
    function handleKeyDown(e) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  async function sendMessage(text) {
    const trimmed = text.trim();
    if (!trimmed || streaming) return;

    setError(null);
    const nextMessages = [...messages, { role: "user", content: trimmed }];
    setMessages([...nextMessages, { role: "assistant", content: "" }]);
    setInput("");
    setStreaming(true);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      let assistantText = "";
      for await (const chunk of streamAiChat(
        { messages: nextMessages, householdId: householdId || null },
        controller.signal
      )) {
        assistantText += chunk;
        setMessages((prev) => {
          const copy = [...prev];
          copy[copy.length - 1] = { role: "assistant", content: assistantText };
          return copy;
        });
      }
    } catch (err) {
      if (err.name === "AbortError") return;
      if (err.code === "ai_not_configured" || err.status === 503) {
        setNotConfigured(true);
        setMessages((prev) => prev.slice(0, -1));
      } else {
        setError(err.message || "Something went wrong. Please try again.");
        setMessages((prev) => prev.slice(0, -1));
      }
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  }

  return (
    <>
      <motion.button
        onClick={() => setOpen(true)}
        whileHover={{ scale: 1.06 }}
        whileTap={{ scale: 0.94 }}
        aria-label="Open financial copilot"
        style={{
          position: "fixed",
          right: "1.25rem",
          bottom: "5.5rem",
          zIndex: 101,
          width: 52,
          height: 52,
          borderRadius: "50%",
          border: "none",
          background: "var(--primary)",
          color: "var(--text-inverse)",
          fontSize: "1.375rem",
          boxShadow: "var(--shadow-lg)",
          cursor: "pointer",
          display: open ? "none" : "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        ✨
      </motion.button>

      <AnimatePresence>
        {open && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setOpen(false)}
              style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.35)", zIndex: 149 }}
            />
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 28, stiffness: 260 }}
              className="copilot-drawer"
              style={{
                position: "fixed",
                top: 0,
                right: 0,
                bottom: 0,
                width: "min(420px, 100vw)",
                background: "var(--card)",
                borderLeft: "1px solid var(--border)",
                zIndex: 150,
                display: "flex",
                flexDirection: "column",
                boxShadow: "var(--shadow-lg)",
              }}
            >
              <div
                style={{
                  padding: "1rem 1.25rem",
                  borderBottom: "1px solid var(--border)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "0.75rem",
                }}
              >
                <div>
                  <div style={{ fontWeight: 600, color: "var(--text)", fontSize: "0.9375rem" }}>
                    ✨ Portfolio Copilot
                  </div>
                  {households.length > 0 && (
                    <select
                      value={householdId}
                      onChange={(e) => setHouseholdId(e.target.value)}
                      style={{
                        marginTop: "0.35rem",
                        fontSize: "0.75rem",
                        color: "var(--text-secondary)",
                        background: "var(--bg-secondary)",
                        border: "1px solid var(--border)",
                        borderRadius: "var(--radius-sm)",
                        padding: "0.15rem 0.4rem",
                      }}
                    >
                      <option value="">My data</option>
                      {households.map((h) => (
                        <option key={h.id} value={h.id}>{h.name}</option>
                      ))}
                    </select>
                  )}
                </div>
                <button
                  onClick={() => setOpen(false)}
                  aria-label="Close"
                  style={{
                    background: "none",
                    border: "none",
                    fontSize: "1.25rem",
                    color: "var(--text-muted)",
                    cursor: "pointer",
                    lineHeight: 1,
                  }}
                >
                  ×
                </button>
              </div>

              <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: "1rem", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                {notConfigured ? (
                  <div style={{ color: "var(--text-muted)", fontSize: "0.875rem", textAlign: "center", marginTop: "2rem" }}>
                    The AI copilot isn't set up yet — a Gemini API key needs to be added on the backend first.
                  </div>
                ) : messages.length === 0 ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", marginTop: "0.5rem" }}>
                    <div style={{ color: "var(--text-muted)", fontSize: "0.8125rem" }}>
                      Ask me anything about your portfolio — I can see your real holdings and numbers.
                    </div>
                    {SUGGESTIONS.map((s) => (
                      <button
                        key={s}
                        onClick={() => sendMessage(s)}
                        style={{
                          textAlign: "left",
                          padding: "0.625rem 0.875rem",
                          borderRadius: "var(--radius)",
                          border: "1px solid var(--border)",
                          background: "var(--bg-secondary)",
                          color: "var(--text)",
                          fontSize: "0.8125rem",
                          cursor: "pointer",
                        }}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                ) : (
                  messages.map((m, i) => (
                    <Message
                      key={i}
                      role={m.role}
                      content={m.content}
                      pending={streaming && i === messages.length - 1 && m.role === "assistant"}
                    />
                  ))
                )}
                {error && (
                  <div style={{ color: "var(--danger)", fontSize: "0.8125rem", textAlign: "center" }}>{error}</div>
                )}
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  sendMessage(input);
                }}
                style={{ padding: "0.875rem", borderTop: "1px solid var(--border)", display: "flex", gap: "0.5rem" }}
              >
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder={notConfigured ? "AI not configured yet" : "Ask about your portfolio…"}
                  disabled={notConfigured || streaming}
                  style={{
                    flex: 1,
                    padding: "0.625rem 0.75rem",
                    borderRadius: "var(--radius)",
                    border: "1px solid var(--border)",
                    background: "var(--bg-secondary)",
                    color: "var(--text)",
                    fontSize: "0.875rem",
                  }}
                />
                <button
                  type="submit"
                  disabled={notConfigured || streaming || !input.trim()}
                  style={{
                    padding: "0.625rem 1rem",
                    borderRadius: "var(--radius)",
                    border: "none",
                    background: "var(--primary)",
                    color: "var(--text-inverse)",
                    fontWeight: 600,
                    fontSize: "0.875rem",
                    cursor: notConfigured || streaming || !input.trim() ? "default" : "pointer",
                    opacity: notConfigured || streaming || !input.trim() ? 0.6 : 1,
                  }}
                >
                  Send
                </button>
              </form>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
