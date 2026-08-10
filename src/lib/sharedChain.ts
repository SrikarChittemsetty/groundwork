import { safeDecrypt } from "@/lib/crypto";

// Reading back a shared argument.
//
// The snapshot is written at share time (see the Share model) and is the only
// thing the recipient ever sees — the sharer's live position can move
// afterwards without changing what someone was handed.
//
// Parsing is deliberately forgiving. This JSON came out of the database and
// through decryption, and a shared page failing to render because one node is
// malformed would be worse than showing the rest of the argument.

export type SharedNode = {
  claim: string;
  parent: number | null;
  isBedrock: boolean;
  axiom: string | null;
};

export function parseChain(encrypted: string | null): SharedNode[] {
  if (!encrypted) return [];
  let raw: unknown;
  try {
    raw = JSON.parse(safeDecrypt(encrypted));
  } catch {
    return [];
  }
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
