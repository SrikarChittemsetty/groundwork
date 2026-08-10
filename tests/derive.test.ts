import { describe, it, expect } from "vitest";
import {
  lastMoved,
  shiftsUnder,
  isInQuestion,
  describeShifts,
  unfinishedLeaves,
  deepestChain,
  type AxiomState,
} from "../src/lib/derive";

// The propagation rule is the one thing here a paper notebook can't do, so it
// gets pinned down precisely. Everything is pure — no database, no clock.

const T = (iso: string) => new Date(iso);

const axiom = (over: Partial<AxiomState> = {}): AxiomState => ({
  id: "a1",
  statement: "a life should be mine to steer",
  createdAt: T("2026-01-01T00:00:00Z"),
  revisedAt: null,
  retiredAt: null,
  ...over,
});

describe("when an axiom last moved", () => {
  it("is nothing at all for one that has never changed", () => {
    expect(lastMoved(axiom())).toBeNull();
  });

  it("is the revision for a reworded axiom", () => {
    const at = T("2026-03-01T00:00:00Z");
    expect(lastMoved(axiom({ revisedAt: at }))).toEqual({ at, kind: "revised" });
  });

  it("reports retirement rather than the reword when both happened", () => {
    // Saying "reworded" about something you no longer hold would be a lie of
    // emphasis, even though both are true.
    const revised = T("2026-03-01T00:00:00Z");
    const retired = T("2026-04-01T00:00:00Z");
    expect(lastMoved(axiom({ revisedAt: revised, retiredAt: retired }))).toEqual({
      at: retired,
      kind: "retired",
    });
  });

  it("still reports retirement when it was reworded on the way out", () => {
    const same = T("2026-03-01T00:00:00Z");
    expect(lastMoved(axiom({ revisedAt: same, retiredAt: same }))?.kind).toBe(
      "retired"
    );
  });
});

describe("what a settled position is left standing on", () => {
  const settled = { id: "p1", settledAt: T("2026-02-01T00:00:00Z") };

  it("says nothing when the ground hasn't moved", () => {
    expect(shiftsUnder(settled, [axiom()])).toEqual([]);
    expect(isInQuestion(settled, [axiom()])).toBe(false);
  });

  it("flags a position whose axiom was reworded afterwards", () => {
    const shifts = shiftsUnder(settled, [
      axiom({ revisedAt: T("2026-03-01T00:00:00Z") }),
    ]);
    expect(shifts).toHaveLength(1);
    expect(shifts[0].kind).toBe("revised");
    expect(isInQuestion(settled, [axiom({ revisedAt: T("2026-03-01T00:00:00Z") })])).toBe(true);
  });

  it("flags a position resting on something you no longer hold", () => {
    const shifts = shiftsUnder(settled, [
      axiom({ retiredAt: T("2026-05-01T00:00:00Z") }),
    ]);
    expect(shifts[0].kind).toBe("retired");
  });

  // The rule that stops this becoming a nag: settling AFTER the change means
  // you already took it into account.
  it("says nothing when you settled after the change", () => {
    const later = { id: "p2", settledAt: T("2026-06-01T00:00:00Z") };
    expect(
      shiftsUnder(later, [axiom({ revisedAt: T("2026-03-01T00:00:00Z") })])
    ).toEqual([]);
  });

  it("treats settling at the same instant as knowing", () => {
    const at = T("2026-03-01T00:00:00Z");
    expect(shiftsUnder({ id: "p3", settledAt: at }, [axiom({ revisedAt: at })])).toEqual([]);
  });

  // An open position is already open. Telling someone their unfinished
  // argument is unfinished is noise, not insight.
  it("never flags a position you haven't settled", () => {
    const open = { id: "p4", settledAt: null };
    expect(
      shiftsUnder(open, [axiom({ retiredAt: T("2026-05-01T00:00:00Z") })])
    ).toEqual([]);
    expect(isInQuestion(open, [axiom({ retiredAt: T("2026-05-01T00:00:00Z") })])).toBe(false);
  });

  it("reports every axiom that moved, not just the first", () => {
    const shifts = shiftsUnder(settled, [
      axiom({ id: "a1", revisedAt: T("2026-03-01T00:00:00Z") }),
      axiom({ id: "a2" }),
      axiom({ id: "a3", retiredAt: T("2026-04-01T00:00:00Z") }),
    ]);
    expect(shifts.map((s) => s.axiomId)).toEqual(["a1", "a3"]);
  });

  it("says nothing for a position resting on no axioms yet", () => {
    expect(shiftsUnder(settled, [])).toEqual([]);
  });
});

describe("the shape of a why-chain", () => {
  // a → b → c, plus a second branch off a that was called bedrock.
  const tree = [
    { id: "a", parentId: null, isBedrock: false },
    { id: "b", parentId: "a", isBedrock: false },
    { id: "c", parentId: "b", isBedrock: false },
    { id: "d", parentId: "a", isBedrock: true },
  ];

  it("finds the branch you stopped answering", () => {
    // c has nothing under it and wasn't called bedrock — you were asked why
    // and walked away. d ended honestly and doesn't count.
    expect(unfinishedLeaves(tree).map((n) => n.id)).toEqual(["c"]);
  });

  it("treats a bedrock leaf as finished, not abandoned", () => {
    expect(
      unfinishedLeaves([{ id: "x", parentId: null, isBedrock: true }])
    ).toEqual([]);
  });

  it("treats an untouched position as having nothing unfinished", () => {
    expect(unfinishedLeaves([])).toEqual([]);
  });

  it("measures the longest branch, not the node count", () => {
    // Four nodes, but the deepest chain is a → b → c.
    expect(deepestChain(tree)).toBe(3);
  });

  it("is zero for a position nobody has answered yet", () => {
    expect(deepestChain([])).toBe(0);
  });

  it("terminates on a cycle rather than hanging", () => {
    // Unreachable through the UI, but a hang here would take the page down.
    const cyclic = [
      { id: "p", parentId: "q", isBedrock: false },
      { id: "q", parentId: "p", isBedrock: false },
    ];
    expect(deepestChain(cyclic)).toBe(2);
  });
});

describe("how it's put to the reader", () => {
  it("says nothing when there's nothing to say", () => {
    expect(describeShifts([])).toBe("");
  });

  it("counts what you no longer hold separately from what was reworded", () => {
    const line = describeShifts([
      { axiomId: "a", statement: "s", kind: "retired", at: T("2026-05-01T00:00:00Z") },
      { axiomId: "b", statement: "s", kind: "revised", at: T("2026-05-01T00:00:00Z") },
    ]);
    expect(line).toContain("1 you no longer hold");
    expect(line).toContain("1 reworded");
  });

  // It reports that the ground moved. It does not say you were wrong.
  it("never renders a verdict", () => {
    const line = describeShifts([
      { axiomId: "a", statement: "s", kind: "retired", at: T("2026-05-01T00:00:00Z") },
    ]);
    for (const word of ["wrong", "inconsistent", "contradic", "should", "hypocri"]) {
      expect(line.toLowerCase()).not.toContain(word);
    }
  });
});
