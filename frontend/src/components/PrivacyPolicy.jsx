import LegalLayout, { Contact, Section } from "./LegalLayout";

export default function PrivacyPolicy() {
  return (
    <LegalLayout title="Privacy policy" updated="October 27, 2026">
      <p>
        Net Worth Tracker helps you keep track of your investments, spending, debts and goals. It is run by Nish Methuku. This page explains
        what the app stores, who helps run it, and the choices you have. We do not sell your data and we do not show ads.
      </p>

      <Section title="What we store">
        <ul>
          <li>
            Your sign-in details: your email address, and your password in scrambled form (handled by Supabase). If you use Google sign-in,
            we receive your email address from Google.
          </li>
          <li>
            The financial information you add or import: holdings, transactions, balances, expenses and income, spending limits, debts,
            goals and notes.
          </li>
          <li>Settings such as your display currency, language and email preferences.</li>
          <li>If you turn on notifications, the device address needed to send them.</li>
          <li>
            If you connect a bank, the connection details and the transactions it provides. The bank access token is stored encrypted. We
            never see your bank password.
          </li>
        </ul>
      </Section>

      <Section title="How we use it">
        <p>
          Only to run the app for you: showing your net worth and reports, importing your files, sending the emails you choose (weekly
          summary, price alerts and milestones), and keeping the service secure and working.
        </p>
      </Section>

      <Section title="AI features">
        <p>
          When you use an AI feature (the copilot chat, search, the allocation advisor, or smart import), the text you type and a summary of
          the data needed to answer are sent to an AI provider (Google Gemini or OpenAI, depending on how the service is set up). The
          summary contains totals and key figures for each holding, not your full transaction list. A spreadsheet or statement you choose to
          import with AI is sent so it can be read. AI answers can be wrong and are not financial advice.
        </p>
      </Section>

      <Section title="Who helps run the service">
        <ul>
          <li>Supabase: sign-in and the database.</li>
          <li>Render and Vercel: hosting.</li>
          <li>Resend: sending the emails you opt into.</li>
          <li>Price and exchange rate providers: receive ticker symbols and currencies only, never your name or amounts.</li>
          <li>Google or OpenAI: AI features, as described above.</li>
          <li>Plaid: only if you connect a bank. Plaid has its own privacy policy.</li>
          <li>Sentry: error reports, when switched on. They are meant to contain technical details, not your financial data.</li>
        </ul>
      </Section>

      <Section title="Security">
        <p>
          Data travels over encrypted connections. Every request is checked against your signed-in account, and you can only reach your own
          data and any household you were invited to. Bank access tokens are encrypted before they are stored. No system is perfectly safe,
          so please use a strong password and turn on two-step sign-in in Settings.
        </p>
      </Section>

      <Section title="Your choices">
        <ul>
          <li>Download everything you stored (Settings, Data export).</li>
          <li>Delete all your financial data, or delete your whole account including your login (Settings, Danger zone).</li>
          <li>Disconnect a bank at any time (Settings, Connected banks).</li>
          <li>Turn off emails with the unsubscribe link in any email or in Settings.</li>
        </ul>
        <p>
          When you delete your data or account it is removed from the live service right away. Backups made for recovery may keep a copy for
          a limited time before they are overwritten.
        </p>
      </Section>

      <Section title="Children">
        <p>The app is not meant for children under 13, and we do not knowingly collect their information.</p>
      </Section>

      <Section title="Changes and contact">
        <p>If this policy changes in a meaningful way, we will update the date above and tell you in the app.</p>
        <Contact />
      </Section>
    </LegalLayout>
  );
}
