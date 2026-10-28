import { Link } from "react-router-dom";

/** Shared page frame for the privacy policy and terms: readable column, works signed in or out. */
export default function LegalLayout({ title, updated, children }) {
  return (
    <main style={{ maxWidth: "46rem", margin: "0 auto", padding: "2rem 1.25rem 4rem" }}>
      <p style={{ margin: "0 0 1.5rem" }}>
        <Link to="/">← Back to the app</Link>
      </p>
      <article
        style={{
          background: "var(--card)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-md)",
          boxShadow: "var(--shadow)",
          padding: "1.75rem",
          lineHeight: 1.65,
          color: "var(--text)",
        }}
      >
        <h1 style={{ marginTop: 0 }}>{title}</h1>
        <p style={{ color: "var(--text-secondary)", marginTop: "-0.5rem" }}>Last updated {updated}</p>
        {children}
      </article>
    </main>
  );
}

export function Section({ title, children }) {
  return (
    <section style={{ marginTop: "1.5rem" }}>
      <h2 style={{ fontSize: "1.2rem", marginBottom: "0.5rem" }}>{title}</h2>
      {children}
    </section>
  );
}

export const SUPPORT_EMAIL = import.meta.env.VITE_SUPPORT_EMAIL || "";

export function Contact() {
  return SUPPORT_EMAIL ? (
    <p>
      Questions or requests: <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.
    </p>
  ) : (
    <p>For questions or requests, use the contact details on the page where you downloaded or opened this app.</p>
  );
}
