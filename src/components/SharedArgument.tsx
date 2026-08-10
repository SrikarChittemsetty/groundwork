import { buildTree, type ChainTree, type SharedNode } from "@/lib/sharedChain";

// A shared argument, rendered the same way wherever it appears — inside a
// circle and behind a one-off link. One component because two renderers would
// eventually disagree about what a recipient is shown, and "what they see" is
// exactly the thing the sharer made a decision about.

function Branch({ entry, depth }: { entry: ChainTree; depth: number }) {
  return (
    <li>
      <div className="shared-claim">{entry.node.claim}</div>
      {entry.node.isBedrock && (
        <div className="footnote shared-bedrock">
          {entry.node.axiom
            ? `Bedrock — ${entry.node.axiom}`
            : "Bedrock — nothing underneath it"}
        </div>
      )}
      {entry.children.length > 0 && (
        <ul className="shared-chain">
          {entry.children.map((child) => (
            <Branch key={child.index} entry={child} depth={depth + 1} />
          ))}
        </ul>
      )}
    </li>
  );
}

export default function SharedArgument({ nodes }: { nodes: SharedNode[] }) {
  if (nodes.length === 0) return null;
  const roots = buildTree(nodes);

  return (
    <>
      <div className="footnote" style={{ marginTop: 14 }}>
        Because…
      </div>
      <ul className="shared-chain">
        {roots.map((entry) => (
          <Branch key={entry.index} entry={entry} depth={0} />
        ))}
      </ul>
    </>
  );
}
