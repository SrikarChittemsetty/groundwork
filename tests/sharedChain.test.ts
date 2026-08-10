import { describe, it, expect, beforeAll } from "vitest";
import { buildTree, bottomsOutIn, type SharedNode } from "../src/lib/sharedChain";

// A fixed test key, so these never depend on the developer's real .env.
process.env.APP_ENCRYPTION_KEY = "a".repeat(64);

let parseChain: typeof import("@/lib/sharedChain.server").parseChain;
let encrypt: typeof import("@/lib/crypto").encrypt;

beforeAll(async () => {
  ({ parseChain } = await import("@/lib/sharedChain.server"));
  ({ encrypt } = await import("@/lib/crypto"));
});

// A shared argument is the only thing in this app rendered from JSON rather
// than from columns, and it's rendered for someone who isn't the author. Both
// facts argue for being strict about what comes back out: a malformed node
// should cost you that node, not the page.

const node = (over: Partial<SharedNode> = {}): SharedNode => ({
  claim: "because it wouldn't be mine to shape",
  parent: null,
  isBedrock: false,
  axiom: null,
  ...over,
});

const packed = (value: unknown) => encrypt(JSON.stringify(value));

describe("reading a shared argument back", () => {
  it("round-trips an argument the sharer sent", () => {
    const nodes = [node(), node({ claim: "and that costs more", parent: 0 })];
    expect(parseChain(packed(nodes))).toEqual(nodes);
  });

  it("is empty when nothing was shared", () => {
    expect(parseChain(null)).toEqual([]);
  });

  // Declining to share your axioms means they were never written down, but the
  // reader shouldn't depend on that having worked.
  it("treats a missing axiom as absent rather than undefined", () => {
    const [only] = parseChain(packed([{ claim: "x", parent: null, isBedrock: true }]));
    expect(only.axiom).toBeNull();
    expect(only.isBedrock).toBe(true);
  });

  it("survives ciphertext it can't decrypt", () => {
    expect(parseChain("v1:not:real:ciphertext")).toEqual([]);
  });

  it("survives something that isn't JSON at all", () => {
    expect(parseChain(encrypt("not json"))).toEqual([]);
  });

  it("survives JSON that isn't a list of nodes", () => {
    expect(parseChain(packed({ nope: true }))).toEqual([]);
  });

  it("drops a node with no claim and keeps the rest", () => {
    const parsed = parseChain(
      packed([{ parent: null }, { claim: "kept", parent: null }])
    );
    expect(parsed.map((n) => n.claim)).toEqual(["kept"]);
  });

  it("treats a parent index pointing nowhere as a root", () => {
    const parsed = parseChain(packed([{ claim: "a", parent: 99 }]));
    expect(parsed[0].parent).toBeNull();
  });

  it("treats a node claiming to be its own parent as a root", () => {
    const parsed = parseChain(packed([{ claim: "a", parent: 0 }]));
    expect(parsed[0].parent).toBeNull();
  });
});

// The point of comparing two shared arguments: agreeing on what to do while
// bottoming out in different commitments is a different situation from
// agreeing all the way down, and only this makes it visible.
describe("where an argument ends up", () => {
  it("reports the axiom when the sharer named it", () => {
    expect(
      bottomsOutIn([
        node({ claim: "because it costs more" }),
        node({ claim: "and that is why", isBedrock: true, axiom: "a life should be mine to steer" }),
      ])
    ).toEqual(["a life should be mine to steer"]);
  });

  // Declining to name your axioms shouldn't make your argument's ending vanish.
  it("falls back to the bedrock claim when they didn't", () => {
    expect(
      bottomsOutIn([node({ claim: "this is just where I stop", isBedrock: true })])
    ).toEqual(["this is just where I stop"]);
  });

  it("ignores steps that aren't endings", () => {
    expect(bottomsOutIn([node({ claim: "a step" })])).toEqual([]);
  });

  it("reports every ending when the argument branched", () => {
    expect(
      bottomsOutIn([
        node({ claim: "x", isBedrock: true, axiom: "first" }),
        node({ claim: "y", isBedrock: true, axiom: "second" }),
      ])
    ).toEqual(["first", "second"]);
  });

  it("counts two branches reaching the same place once", () => {
    expect(
      bottomsOutIn([
        node({ claim: "x", isBedrock: true, axiom: "same" }),
        node({ claim: "y", isBedrock: true, axiom: "same" }),
      ])
    ).toEqual(["same"]);
  });

  it("has nothing to report for an argument still in progress", () => {
    expect(bottomsOutIn([])).toEqual([]);
  });
});

describe("rebuilding the shape for the reader", () => {
  it("nests each answer under what it answers", () => {
    const tree = buildTree([
      node({ claim: "a" }),
      node({ claim: "b", parent: 0 }),
      node({ claim: "c", parent: 1 }),
    ]);
    expect(tree).toHaveLength(1);
    expect(tree[0].node.claim).toBe("a");
    expect(tree[0].children[0].node.claim).toBe("b");
    expect(tree[0].children[0].children[0].node.claim).toBe("c");
  });

  it("keeps sibling branches side by side", () => {
    const tree = buildTree([
      node({ claim: "root" }),
      node({ claim: "left", parent: 0 }),
      node({ claim: "right", parent: 0 }),
    ]);
    expect(tree[0].children.map((c) => c.node.claim)).toEqual(["left", "right"]);
  });

  // Only reachable from tampered data, but losing someone's claim silently is
  // worse than showing it at the top level.
  it("shows a cycle's nodes rather than dropping them", () => {
    const tree = buildTree([
      node({ claim: "p", parent: 1 }),
      node({ claim: "q", parent: 0 }),
    ]);
    const shown = tree.flatMap(function walk(e): string[] {
      return [e.node.claim, ...e.children.flatMap(walk)];
    });
    expect(shown.sort()).toEqual(["p", "q"]);
  });

  it("has nothing to show for an empty argument", () => {
    expect(buildTree([])).toEqual([]);
  });
});
