import Link from "next/link";

export const metadata = {
  title: "How your data is handled — Values Mirror",
};

// A plain-English, honest description of what actually happens to a user's
// data. Deliberately includes the unflattering parts (the server can decrypt;
// reflection text leaves the server when you use the AI features). Given that
// values and beliefs may be "special category data" under GDPR, this page is a
// starting point for an honest disclosure — NOT a reviewed legal policy.
export default function PrivacyPage() {
  return (
    <main className="shell">
      <h1>How your data is handled</h1>
      <p className="subtitle">
        Written in plain English, including the parts that aren&apos;t
        flattering. This tool only works if you&apos;re honest in it, which
        means it owes you honesty about itself.
      </p>

      <h2>What this tool stores</h2>
      <div className="card">
        <p>
          Your email address, a hashed version of your password, the values you
          write down, the decisions you log, and any reflections or guidance you
          generate. That&apos;s all of it.
        </p>
      </div>

      <h2>Who can see it</h2>
      <div className="card">
        <p>
          Nobody but you. There is no sharing feature, no social feed, no
          public profile, and no other user can query your data. This is not
          social media and there is no audience.
        </p>
        <p>
          There are no analytics, no advertising, and no third-party trackers
          in this app.
        </p>
      </div>

      <h2>How it&apos;s protected</h2>
      <div className="card">
        <p>
          Every value, decision, and reflection is encrypted (AES-256-GCM)
          before it is written to the database, so a stolen database file
          contains only ciphertext. Your password is stored as a bcrypt hash,
          never in plain text. Sessions use a signed, httpOnly cookie. When
          deployed, all traffic runs over HTTPS.
        </p>
      </div>

      <h2>The honest limits</h2>
      <div className="card">
        <p>
          <strong>This is not end-to-end encrypted.</strong> The server holds
          the encryption key, because it needs to read your values to generate
          a reflection. That means whoever operates this server could
          technically decrypt your entries. Encryption here protects against a
          stolen database, not against the operator.
        </p>
        <p>
          <strong>The AI features send your data to Anthropic.</strong> When
          you press &quot;Generate a reflection&quot; or &quot;Reason it
          through,&quot; your stated values and logged decisions are sent to
          Anthropic&apos;s API to produce the response. If you never use those
          two features, your entries never leave this server. Everything else —
          writing values, logging decisions, the timeline — works without any
          data leaving.
        </p>
      </div>

      <h2>Your control</h2>
      <div className="card">
        <p>
          You can download a complete copy of everything, in readable JSON, at
          any time. You can permanently delete your account and all associated
          data at any time, which removes it outright rather than flagging it
          as hidden. Both are in{" "}
          <Link href="/settings">Settings</Link>.
        </p>
        <p>
          Data is kept until you delete it. Nothing is retained after deletion.
        </p>
      </div>

      <h2>What this page is not</h2>
      <div className="card">
        <p className="notice">
          This is an honest description of current behavior, not a reviewed
          legal document. Values and beliefs may count as special category
          data under GDPR, which carries stricter obligations than ordinary
          personal data. Before this tool is offered to anyone else, this needs
          a proper privacy policy and terms reviewed by a lawyer.
        </p>
      </div>

      <hr />
      <p className="footnote">
        <Link href="/values">Back to the app</Link>
      </p>
    </main>
  );
}
