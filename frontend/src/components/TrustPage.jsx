import { Link } from "react-router-dom";
import LegalLayout, { Contact, Section } from "./LegalLayout";

export default function TrustPage() {
  return (
    <LegalLayout title="Is my data safe?" updated="November 17, 2026">
      <p>
        You are trusting this app with your money details, so here is a plain answer, written from what the code actually does. For the full
        legal wording see the <Link to="/privacy">privacy policy</Link>.
      </p>

      <Section title="What we never do">
        <ul>
          <li>We never sell your data and we never show ads.</li>
          <li>We never see or store your bank password or your broker password. You can use the app without connecting any account.</li>
          <li>Price and exchange rate providers only receive ticker symbols and currencies, never your name or your amounts.</li>
        </ul>
      </Section>

      <Section title="Who can see your data">
        <ul>
          <li>You, and anyone you invite to your household. Household members are owners, editors or viewers.</li>
          <li>Holdings you mark private are hidden from the shared household view.</li>
          <li>
            Every request is checked against your signed-in account, and the tests try to reach one person's data from another account.
          </li>
        </ul>
      </Section>

      <Section title="How it is protected">
        <ul>
          <li>Sign-in is handled by Supabase, with optional two-step sign-in. Turn it on in Settings.</li>
          <li>Data travels over encrypted connections.</li>
          <li>If you connect a bank, the access token is encrypted before it is stored.</li>
          <li>Deleting your data or your account needs a recent sign-in, so a borrowed session cannot wipe you out.</li>
          <li>Settings shows a security log of sensitive actions on your account, such as exports and household changes.</li>
          <li>Daily database backups are encrypted and kept for 14 days.</li>
        </ul>
      </Section>

      <Section title="You stay in control">
        <ul>
          <li>Download everything you stored as JSON or CSV at any time (Settings, Data export).</li>
          <li>Delete all your financial data, or your whole account, from Settings. It is removed from the live service right away.</li>
          <li>
            AI features are optional. When you use one, a summary of your totals is sent to the AI provider, not your full transaction list.
          </li>
        </ul>
      </Section>

      <Section title="What we cannot promise yet">
        <ul>
          <li>No independent security audit or penetration test has been done.</li>
          <li>
            This is a small app built and run by one person on free hosting tiers. It can be slow to wake up after a quiet period, and there
            is no uptime guarantee.
          </li>
          <li>Because of that, keep your own copy: use the export from time to time.</li>
        </ul>
      </Section>

      <Section title="A safe way to start">
        <p>
          Start with a few holdings, or import a file from your broker, and see if the app is useful before you add more. You can export or
          delete everything whenever you like.
        </p>
        <Contact />
      </Section>
    </LegalLayout>
  );
}
