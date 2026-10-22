import { useId, useState } from "react";
import { GLOSSARY } from "../utils/glossary";

/** A small "?" button that opens a plain-language explanation of a finance term, right where it is used. */
export default function InfoTip({ term }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const entry = GLOSSARY[term];
  if (!entry) return null;

  return (
    <span>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        aria-label={`What is ${entry.name}?`}
        onClick={() => setOpen((o) => !o)}
        style={{
          marginLeft: "0.4rem",
          width: "1.15rem",
          height: "1.15rem",
          borderRadius: "50%",
          border: "1px solid var(--border-dark)",
          background: "transparent",
          color: "var(--text-secondary)",
          fontSize: "0.7rem",
          lineHeight: 1,
          cursor: "pointer",
          padding: 0,
          verticalAlign: "middle",
        }}
      >
        ?
      </button>
      {open && (
        <span
          id={id}
          role="note"
          style={{
            display: "block",
            marginTop: "0.4rem",
            padding: "0.5rem 0.75rem",
            background: "var(--bg-secondary)",
            borderRadius: "var(--radius-sm)",
            color: "var(--text)",
            fontSize: "0.8125rem",
            fontWeight: 400,
            lineHeight: 1.5,
          }}
        >
          {entry.text}
        </span>
      )}
    </span>
  );
}
