import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { suggestTransactionTags, updateTransaction } from "../../api";

/**
 * Best-effort AI tag suggestion shown right after a transaction is created.
 * Silently renders nothing if AI isn't configured or the suggestion call
 * fails — this is a nice-to-have, never blocks the transaction itself.
 */
export default function TagSuggestionCard({ transactionId, holdingId, onDismiss }) {
  const queryClient = useQueryClient();
  const [suggestion, setSuggestion] = useState(null);
  const [loading, setLoading] = useState(true);
  const [accepted, setAccepted] = useState(false);

  useEffect(() => {
    let cancelled = false;
    suggestTransactionTags(transactionId)
      .then((res) => {
        if (!cancelled && res?.configured && res.suggestion) {
          setSuggestion(res.suggestion);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [transactionId]);

  const acceptMutation = useMutation({
    mutationFn: () => updateTransaction(transactionId, { tags: suggestion.tags, notes: suggestion.note || undefined }),
    onSuccess: () => {
      setAccepted(true);
      queryClient.invalidateQueries({ queryKey: ["holding-transactions", holdingId] });
    },
  });

  if (loading) {
    return <div style={{ marginTop: "0.75rem", fontSize: "0.75rem", color: "var(--text-muted)" }}>✨ Thinking of tags…</div>;
  }
  if (!suggestion || (suggestion.tags.length === 0 && !suggestion.note)) return null;

  return (
    <div
      style={{
        marginTop: "0.75rem",
        padding: "0.75rem 1rem",
        borderRadius: "var(--radius)",
        border: "1px dashed var(--border-dark)",
        background: "var(--bg-secondary)",
        fontSize: "0.8125rem",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "0.75rem",
        flexWrap: "wrap",
      }}
    >
      <div>
        <span style={{ color: "var(--text-muted)" }}>✨ Suggested: </span>
        {suggestion.tags.map((t) => (
          <span
            key={t}
            style={{
              display: "inline-block",
              padding: "0.1rem 0.5rem",
              margin: "0 0.25rem 0.25rem 0",
              borderRadius: "999px",
              background: "var(--primary-light)",
              color: "var(--primary-dark)",
              fontSize: "0.75rem",
              fontWeight: 600,
            }}
          >
            {t}
          </span>
        ))}
        {suggestion.note && <div style={{ color: "var(--text-secondary)", marginTop: "0.15rem" }}>{suggestion.note}</div>}
      </div>
      {accepted ? (
        <span style={{ color: "var(--success)", fontSize: "0.75rem", fontWeight: 600 }}>Applied ✓</span>
      ) : (
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button
            onClick={() => acceptMutation.mutate()}
            disabled={acceptMutation.isPending}
            style={{ padding: "0.3rem 0.7rem", borderRadius: "var(--radius-sm)", border: "none", background: "var(--primary)", color: "var(--text-inverse)", fontSize: "0.75rem", fontWeight: 600, cursor: "pointer" }}
          >
            Accept
          </button>
          <button
            onClick={onDismiss}
            style={{ padding: "0.3rem 0.7rem", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)", background: "transparent", color: "var(--text-secondary)", fontSize: "0.75rem", cursor: "pointer" }}
          >
            Dismiss
          </button>
        </div>
      )}
    </div>
  );
}
