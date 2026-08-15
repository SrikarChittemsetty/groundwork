import Link from "next/link";
import { aiEnabled } from "@/lib/features";

export const metadata = {
  title: "How your data is handled — Groundwork",
};

// A plain-English, honest description of what actually happens to a user's
// data. Deliberately includes the unflattering parts (the server can decrypt;
// reflection text leaves the server when you use the AI features). Given that
// values and beliefs may be "special category data" under GDPR, this page is a
// starting point for an honest disclosure — NOT a reviewed legal policy.
export default function PrivacyPage() {
  const ai = aiEnabled();
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
          Your email address and a hashed version of your password. Then
          everything you write: your values and their earlier wordings, the
          decisions you log, the positions you take and every &quot;why?&quot;
          you answer underneath them, the axioms those chains bottom out in,
          the tensions you mark between them, reflections and guidance
          (whether you wrote them or generated them), and anything you shared
          — the circles you&apos;re in, what you put in them, and the replies.
        </p>
        <p className="footnote">
          If that list ever stops matching what the app does, the list is the
          thing that&apos;s wrong. Every kind of entry named here also appears
          in your export and is removed when you delete your account; both are
          checked by tests rather than by memory.
        </p>
      </div>

      <h2>Who can see it</h2>
      <div className="card">
        <p>
          By default, nobody but you. There is no feed, no public profile, and
          no way for another person to browse you or search your entries.
        </p>
        <p>
          <strong>Unless you share something.</strong> You can hand a specific
          value or decision to a circle you created, or to someone holding a
          link you made. They see only that one item, only the parts you chose
          to include, and only until you hide or revoke it. Your other entries
          — and your private reflections — are never part of it.
        </p>
        <p>
          There are no analytics, no advertising, and no third-party trackers
          in this app.
        </p>
      </div>

      <h2>How it&apos;s protected</h2>
      <div className="card">
        <p>
          Everything you write is encrypted (AES-256-GCM) before it is written
          to the database — values, decisions, positions, reasons, axioms,
          tensions, reflections, shares, and replies alike. Your password is
          stored as a bcrypt hash, never in plain text. Invite and share links
          are stored hashed as well, so a copy of the database doesn&apos;t
          hand someone a working way into a circle. Sessions use a signed,
          httpOnly cookie. When deployed, all traffic runs over HTTPS.
        </p>
        <p>
          <strong>What isn&apos;t encrypted:</strong> your email address, since
          it&apos;s how you sign in, and the timestamps and shape of your
          entries — how many there are, when you wrote them, which value a
          decision was filed under. Someone holding the database file
          couldn&apos;t read a word you wrote, but could see that you wrote.
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
        {ai ? (
          <p>
            <strong>The AI features send your data to Anthropic.</strong> When
            you press &quot;Or have AI draft one&quot; or &quot;Reason it
            through,&quot; your stated values and logged decisions are sent to
            Anthropic&apos;s API to produce the response. Those two buttons are
            the only things that transmit anything. Everything else — writing
            values, logging decisions, the timeline, patterns, and reflections
            you write yourself — never leaves this server.
          </p>
        ) : (
          <p>
            <strong>Nothing here is sent anywhere.</strong> The AI features are
            turned off on this installation, so no part of what you write is
            transmitted to Anthropic or anyone else. Your entries exist only in
            this app&apos;s database.
          </p>
        )}
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
          Data is kept until you delete it. Nothing is retained after deletion
          — not the rows keyed to your account, and not the ones keyed only to
          your email address, like sign-in attempt records or an invitation
          someone else sent you. Anything you shared into a circle leaves it
          when you go.
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
