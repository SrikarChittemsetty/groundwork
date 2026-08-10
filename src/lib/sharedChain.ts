// Shared arguments — the browser-safe half.
//
// Everything here is pure: shape validation, tree building, and reading off
// where an argument ends. It deliberately imports nothing from crypto, because
// the circle page is a client component and pulling `node:crypto` into the
// browser bundle fails the build outright. Decryption lives in
// sharedChain.server.ts, which is only ever imported from server code.
//
// The split is load-bearing rather than tidy: a client component importing one
// helper from here would otherwise drag the whole crypto module with it.

export type SharedNode = {
  claim: string;
  parent: number | null;
  isBedrock: boolean;
  axiom: string | null;
};

// Validation is deliberately forgiving. This JSON came out of a database and
// through decryption, and a shared page failing to render because one node is
// malformed would be worse than showing the rest of the argument.
export function normalizeNodes(raw: unknown): SharedNode[] {
  if (!Array.isArray(raw)) return [];

  const nodes: SharedNode[] = [];
  for (const item of raw) {
    if (typeof item !== "object" || item === null) continue;
    const n = item as Record<string, unknown>;
    if (typeof n.claim !== "string") continue;
    nodes.push({
      claim: n.claim,
      parent: typeof n.parent === "number" ? n.parent : null,
      isBedrock: n.isBedrock === true,
      axiom: typeof n.axiom === "string" ? n.axiom : null,
    });
  }

  // A parent index pointing outside the array, or at itself, would render as a
  // broken tree; treat those as roots rather than dropping the claim.
  return nodes.map((n, i) => ({
    ...n,
    parent:
      n.parent !== null && n.parent >= 0 && n.parent < nodes.length && n.parent !== i
        ? n.parent
        : null,
  }));
}

// Where an argument ends up. For comparing two people who reached the same
// conclusion, this is the interesting part: agreeing on what to do while
// bottoming out in different commitments is a completely different situation
// from agreeing all the way down, and it's invisible unless you look here.
//
// Prefers the named axiom when the sharer included it, and falls back to the
// bedrock claim itself when they didn't — declining to name your axioms
// shouldn't make your argument's ending disappear.
export function bottomsOutIn(nodes: SharedNode[]): string[] {
  const ends = nodes
    .filter((n) => n.isBedrock)
    .map((n) => n.axiom ?? n.claim)
    .map((s) => s.trim())
    .filter(Boolean);
  return [...new Set(ends)];
}

export type ChainTree = { node: SharedNode; index: number; children: ChainTree[] };

// Rebuild the tree for rendering. Any node whose parent chain doesn't reach a
// root — only possible from a cycle in tampered data — is shown at the top
// level rather than silently disappearing.
export function buildTree(nodes: SharedNode[]): ChainTree[] {
  const entries: ChainTree[] = nodes.map((node, index) => ({
    node,
    index,
    children: [],
  }));
  const roots: ChainTree[] = [];

  const reachesRoot = (start: number): boolean => {
    const seen = new Set<number>();
    let cursor: number | null = start;
    while (cursor !== null) {
      if (seen.has(cursor)) return false;
      seen.add(cursor);
      cursor = nodes[cursor].parent;
    }
    return true;
  };

  entries.forEach((entry, i) => {
    const parent = entry.node.parent;
    if (parent === null || !reachesRoot(i)) roots.push(entry);
    else entries[parent].children.push(entry);
  });

  return roots;
}
