import LegalLayout, { Contact, Section } from "./LegalLayout";

export default function TermsOfUse() {
  return (
    <LegalLayout title="Terms of use" updated="October 27, 2026">
      <p>By using Net Worth Tracker you agree to these terms. They are written to be read.</p>

      <Section title="Not financial advice">
        <p>
          The app shows numbers and tools to help you understand your money. It is not a bank, a broker, or a financial, tax or legal
          advisor. Reports, projections, tax summaries and AI answers can contain mistakes. Check anything important with a qualified
          professional before you act on it.
        </p>
      </Section>

      <Section title="Data accuracy">
        <p>
          Prices, exchange rates and bank transactions come from third parties and can be late, missing or wrong. Figures that you type in
          are only as accurate as what you enter. We make no promise that any number is correct or up to date.
        </p>
      </Section>

      <Section title="Your account">
        <p>
          Keep your sign-in details private and tell us if you think someone else has access. You are responsible for what happens under
          your account. Only add data you have the right to use, and only invite people to a household whom you trust.
        </p>
      </Section>

      <Section title="Acceptable use">
        <p>
          Do not attack or overload the service, try to reach other people&apos;s data, use it to break the law, or resell it without
          asking. We may limit or suspend accounts that do.
        </p>
      </Section>

      <Section title="Availability and changes">
        <p>
          The service is provided as it is, may be down sometimes, and may change. We may add, change or remove features. You can download
          your data at any time.
        </p>
      </Section>

      <Section title="Liability">
        <p>
          To the fullest extent the law allows, we are not responsible for losses that come from using the app or relying on what it shows,
          including investment decisions. Nothing here limits rights you cannot give up by law.
        </p>
      </Section>

      <Section title="Ending your use">
        <p>You can delete your account in Settings whenever you like. We may end access for serious or repeated misuse.</p>
      </Section>

      <Section title="Privacy and contact">
        <p>
          How we handle your data is described in the <a href="/privacy">privacy policy</a>.
        </p>
        <Contact />
      </Section>
    </LegalLayout>
  );
}
