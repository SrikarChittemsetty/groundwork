import Link from "next/link";

export const metadata = {
  title: "A worked example — Groundwork",
  description:
    "One position taken apart to bedrock, and what happens when the axiom underneath it moves.",
};

// A complete worked example, public and signup-free.
//
// The tool is only legible once you've seen a chain reach bedrock and an axiom
// turn out to carry more than one argument, and nobody is going to type their
// actual beliefs into a stranger's website to find that out. An empty app
// demonstrates nothing about what makes this different from a notes file.
//
// Deliberately static: no database, no session, no AI. It uses the same
// classes as the real interrogation so what you see here is what the thing
// actually looks like, not a marketing mock of it.

const CHAIN = [
  {
    claim: "The work there would be assigned to me, not chosen by me.",
    children: [
      {
        claim:
          "Doing work I didn't choose the shape of costs me more than the extra money is worth.",
        bedrock: true,
        axiom: "A life should be mine to steer.",
      },
    ],
  },
  {
    claim: "I'd be taking it mostly to stop feeling behind other people.",
    children: [
      {
        claim:
          "Deciding by comparison means the decision isn't really mine either.",
        bedrock: true,
        axiom: "A life should be mine to steer.",
      },
    ],
  },
];

type Node = (typeof CHAIN)[number] | (typeof CHAIN)[number]["children"][number];

function Branch({ node, depth }: { node: Node; depth: number }) {
  const bedrock = "bedrock" in node && node.bedrock;
  const children = "children" in node ? node.children : [];

  return (
    <div className="why-node" style={{ marginLeft: depth ? 20 : 0 }}>
      <div className={`why-claim${bedrock ? " bedrock" : ""}`}>
        <div className="body-text">{node.claim}</div>
        {bedrock && (
          <div className="card-actions">
            <span className="meta">
              Bedrock — nothing underneath it · counted as an axiom
            </span>
          </div>
        )}
      </div>
      {children.map((c, i) => (
        <Branch key={i} node={c} depth={depth + 1} />
      ))}
    </div>
  );
}

export default function ExamplePage() {
  return (
    <main className="shell">
      <p className="footnote" style={{ marginTop: 32 }}>
        A worked example. Nothing here is yours, and nothing is saved.
      </p>

      <h1>&ldquo;I should turn down the higher-paying role.&rdquo;</h1>
      <p className="subtitle">
        This is what one position looks like after it&apos;s been taken apart.
        You state something you hold; the tool asks why; it asks why of the
        answer, and keeps asking until you reach something with no reason
        underneath it.
      </p>

      <h2>The argument</h2>
      <div className="why-tree">
        {CHAIN.map((n, i) => (
          <Branch key={i} node={n} depth={0} />
        ))}
      </div>

      <h2>What it bottoms out in</h2>
      <div className="card">
        <div className="title">A life should be mine to steer.</div>
        <div className="footnote" style={{ marginTop: 10 }}>
          Everything below bottoms out here — 2 branches:
        </div>
        <ul className="facts">
          <li>The work would be assigned to me, not chosen by me.</li>
          <li>I&apos;d be taking it to stop feeling behind other people.</li>
        </ul>
        <p className="body-text" style={{ marginTop: 12 }}>
          Two different objections, and they turn out to be the same objection.
          That is the thing worth finding: not that you have reasons, but that
          ten arguments across months keep landing on the same three
          commitments.
        </p>
      </div>

      <h2>Then the ground moves</h2>
      <div className="card notice-card">
        <div className="title">This was settled against different ground</div>
        <div className="body-text">
          Rests on something that has since changed — 1 reworded. Suppose that
          months later you rewrite the axiom as{" "}
          <em>&ldquo;a life should be </em>mostly<em> mine to steer&rdquo;</em>{" "}
          — a small hedge, honestly made. The argument above was settled
          against the older, absolute version. It may still hold. It may not.
        </div>
        <ul className="plain-list">
          <li>
            &ldquo;A life should be mine to steer.&rdquo;{" "}
            <span className="meta">(reworded)</span>
          </li>
        </ul>
      </div>

      <p className="body-text" style={{ marginTop: 18 }}>
        Nothing is un-settled for you. The tool reports that what you were
        standing on moved; whether the conclusion still stands is the one
        judgment it refuses to make on your behalf. Reading it again is the
        only way to know — and if it does still hold, settling it again says so.
      </p>

      <p className="body-text">
        That is the whole idea. A journal lets you quietly rewrite a premise and
        leaves every conclusion sitting there looking just as settled as before.
      </p>

      <hr />

      <h2>What this is not</h2>
      <div className="card">
        <p className="body-text">
          There is no score, no streak, and no progress bar — a number you could
          be good or bad at turns an honesty tool into something to perform for.
          Nothing here tells you what to do, ranks your reasoning, or calls you
          inconsistent. The interrogation needs no AI at all; the optional model
          features have to cite the entries of yours they rest on, and any step
          that can&apos;t is marked as the model&apos;s own import rather than
          passed off as yours.
        </p>
      </div>

      <div className="row" style={{ marginTop: 26 }}>
        <Link href="/signup">
          <button>Take a position apart</button>
        </Link>
        <Link href="/privacy">
          <button className="ghost">How your data is handled</button>
        </Link>
        <span className="spacer" />
        <Link href="/login">
          <button className="ghost">Sign in</button>
        </Link>
      </div>

      <hr />
      <p className="footnote">
        <Link href="https://github.com/SrikarChittemsetty/groundwork">
          Source on GitHub
        </Link>
      </p>
    </main>
  );
}
